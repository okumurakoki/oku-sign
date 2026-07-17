import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/server/db'
import { contracts, contractSigners, auditLogs, users } from '@/server/db/schema'
import { and, eq, inArray, or, isNull, lt, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { reminderEmail } from '@/server/email/templates'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'
const REMIND_AFTER_DAYS = 3
const MAX_REMINDERS = 3

// 送信済み契約の「現在の順序」の未署名者に、3日おきに最大3回リマインドする（毎日実行想定）。
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/send-reminders] CRON_SECRET が未設定です')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const now = new Date()
  const threshold = new Date(now.getTime() - REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000)

  // 進行中の契約
  const activeContracts = await db
    .select()
    .from(contracts)
    .where(inArray(contracts.status, ['sent', 'signing']))

  let remindersSent = 0

  for (const contract of activeContracts) {
    if (contract.expiresAt && new Date(contract.expiresAt) < now) continue // 期限切れはexpiry cronが処理

    const signerList = await db
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, contract.id))
      .orderBy(contractSigners.signOrder)

    // 現在署名を待っている先頭の未署名者（順次署名のため1名のみ対象）
    const current = signerList.find((s) => s.status === 'notified' || s.status === 'viewed')
    if (!current) continue

    // 最後のリマインド（or 通知）から3日経過しているか
    const lastAt = current.lastReminderAt ?? contract.sentAt
    if (lastAt && new Date(lastAt) > threshold) continue

    // これまでのリマインド回数（audit_logsのreminder_sent件数）
    const priorReminders = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(and(
        eq(auditLogs.contractId, contract.id),
        eq(auditLogs.action, 'reminder_sent'),
        eq(auditLogs.actorEmail, current.email),
      ))
    if (priorReminders.length >= MAX_REMINDERS) continue

    const [sender] = await db
      .select({ name: users.name, companyName: users.companyName })
      .from(users)
      .where(eq(users.id, contract.createdBy))
      .limit(1)

    // 送信前に lastReminderAt を条件付きUPDATEでclaimする。並行cronの両方が
    // 同じ判定を通ってもUPDATEの再評価でどちらか一方だけが送信権を得る。
    // 選択後に署名/辞退/取消が起きた競合も、status条件と契約状態のEXISTSで弾く
    const claimed = await db
      .update(contractSigners)
      .set({ lastReminderAt: now })
      .where(and(
        eq(contractSigners.id, current.id),
        inArray(contractSigners.status, ['notified', 'viewed']),
        or(isNull(contractSigners.lastReminderAt), lt(contractSigners.lastReminderAt, threshold)),
        sql`EXISTS (SELECT 1 FROM ${contracts} WHERE ${contracts.id} = ${contract.id} AND ${contracts.status} IN ('sent', 'signing'))`,
      ))
      .returning({ id: contractSigners.id })
    if (claimed.length === 0) continue

    try {
      const emailData = reminderEmail({
        signerName: current.name,
        senderName: sender?.name ?? '',
        senderCompany: sender?.companyName ?? null,
        contractTitle: contract.title,
        signUrl: `${BASE_URL}/sign/${current.token}`,
        expiresAt: contract.expiresAt,
      })
      await sendEmail({ to: current.email, ...emailData })

      await db.insert(auditLogs).values({
        id: ulid(),
        contractId: contract.id,
        action: 'reminder_sent',
        actorEmail: current.email,
        detail: `${current.name}にリマインダーを送信しました（${priorReminders.length + 1}/${MAX_REMINDERS}回目）`,
        createdAt: now,
      })
      remindersSent++
    } catch (err) {
      console.error(`[cron/send-reminders] 送信失敗 contract=${contract.id}:`, err)
      // 送信できていないのにclaimだけ進むと次回が3日後になる。claimを戻して翌日再試行させる
      // （自分のclaim値のままの場合だけ戻し、後続の更新を上書きしない）
      await db
        .update(contractSigners)
        .set({ lastReminderAt: current.lastReminderAt })
        .where(and(
          eq(contractSigners.id, current.id),
          eq(contractSigners.lastReminderAt, now),
        ))
        .catch((rollbackErr) => {
          // 戻せなかった場合、このリマインドは最大3日遅延する（メール自体は再送される）
          console.error(`[cron/send-reminders] claim戻し失敗 signer=${current.id}:`, rollbackErr)
        })
    }
  }

  return NextResponse.json({ ok: true, remindersSent })
}
