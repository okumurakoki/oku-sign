import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/server/db'
import { contracts, contractSigners, auditLogs, users } from '@/server/db/schema'
import { and, eq, inArray, lt, isNotNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { contractExpiredEmail } from '@/server/email/templates'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

// 署名期限を過ぎた進行中契約を expired にし、送信者へ通知する（毎日実行想定）
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/check-expiry] CRON_SECRET が未設定です')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const now = new Date()

  const expiredContracts = await db
    .select()
    .from(contracts)
    .where(and(
      inArray(contracts.status, ['sent', 'signing']),
      isNotNull(contracts.expiresAt),
      lt(contracts.expiresAt, now),
    ))

  let processed = 0

  for (const contract of expiredContracts) {
    // 状態更新と監査ログは原子的に（片方だけ成功する不整合を防ぐ）。
    // 条件付きUPDATEで処理権をclaimし、並行cronや署名との競合時は
    // claimが取れた実行だけがaudit・通知メールを行う
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx
        .update(contracts)
        .set({ status: 'expired', updatedAt: now })
        .where(and(eq(contracts.id, contract.id), inArray(contracts.status, ['sent', 'signing'])))
        .returning({ id: contracts.id })
      if (rows.length === 0) return false

      await tx.insert(auditLogs).values({
        id: ulid(),
        contractId: contract.id,
        action: 'expired',
        actorEmail: 'system',
        detail: '署名期限を過ぎたため期限切れとなりました',
        createdAt: now,
      })
      return true
    })
    if (!claimed) continue

    // 送信者へ通知
    const [sender] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, contract.createdBy))
      .limit(1)

    if (sender) {
      const pending = await db
        .select({ id: contractSigners.id })
        .from(contractSigners)
        .where(and(
          eq(contractSigners.contractId, contract.id),
          inArray(contractSigners.status, ['pending', 'viewed']),
        ))

      try {
        const emailData = contractExpiredEmail({
          senderName: sender.name,
          contractTitle: contract.title,
          contractUrl: `${BASE_URL}/contracts/${contract.id}`,
          pendingCount: pending.length,
        })
        await sendEmail({ to: sender.email, ...emailData })
      } catch (err) {
        console.error(`[cron/check-expiry] 通知メール送信失敗 contract=${contract.id}:`, err)
      }
    }

    processed++
  }

  return NextResponse.json({ ok: true, processed })
}
