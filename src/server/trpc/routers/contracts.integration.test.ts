import { describe, it, expect, beforeAll } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getDb } from '@/server/db'
import { appRouter } from '@/server/trpc/router'
import { createCallerFactory } from '@/server/trpc'
import {
  users,
  contracts,
  contractSigners,
  signatureFields,
  signatures,
} from '@/server/db/schema'

// 契約の「複製」と「取消ガード」を、実装コードそのまま（tRPC caller）で実DB検証する。
// 全操作はトランザクション内で実行し最後に必ずロールバックするため、
// dev/prod どちらのDBでもコミットは一切残らない（PDFは pdfUrl 未設定で
// ストレージ書き込みも発生しない）。DATABASE_URL 未設定なら丸ごとスキップ。

type Gathered = {
  origId: string
  dupId: string
  dup: typeof contracts.$inferSelect
  dupSigners: (typeof contractSigners.$inferSelect)[]
  origSigners: (typeof contractSigners.$inferSelect)[]
  dupFields: (typeof signatureFields.$inferSelect)[]
  origFields: (typeof signatureFields.$inferSelect)[]
  dupSignatures: (typeof signatures.$inferSelect)[]
  cancelCompletedBlocked: boolean
  cancelCompletedMsg: string
  sentCancelledStatus: string | null
}

const ROLLBACK = { __rollback: true } as const

describe.skipIf(!process.env.DATABASE_URL)('contracts: 複製と取消ガード (実DB/ロールバック)', () => {
  let R: Gathered

  beforeAll(async () => {
    const db = getDb()
    try {
      await db.transaction(async (tx) => {
        // caller は tx を db として使う → 全書き込みがトランザクション内に閉じる
        const testUser = {
          id: ulid(),
          supabaseUid: `test-${ulid()}`,
          email: `e2e-${ulid()}@oku-sign.test`,
          name: 'E2E テスト',
          companyName: 'E2E Co.',
          role: 'admin' as const,
          isOwner: true, // サブスクゲート通過（課金不要）
          createdAt: new Date(),
        }
        await tx.insert(users).values(testUser)

        const ctx = { db: tx as unknown as ReturnType<typeof getDb>, user: testUser }
        const caller = createCallerFactory(appRouter)(ctx)

        // --- 元契約を作成（署名者2名・順次） ---
        const { id: origId } = await caller.contracts.create({
          title: 'E2E 元契約',
          message: '本文メッセージ',
          signers: [
            { email: 'a@example.com', name: '甲 太郎', signOrder: 1 },
            { email: 'b@example.com', name: '乙 次郎', signOrder: 2 },
          ],
        })

        const origSigners = await tx
          .select()
          .from(contractSigners)
          .where(eq(contractSigners.contractId, origId))
          .orderBy(contractSigners.signOrder)

        // --- 署名欄を2つ配置（各署名者に1つ） ---
        await tx.insert(signatureFields).values(
          origSigners.map((s, i) => ({
            id: ulid(),
            contractId: origId,
            signerId: s.id,
            signerOrder: s.signOrder,
            fieldType: 'signature' as const,
            label: `署名欄${i + 1}`,
            page: 1,
            x: 10 + i * 30,
            y: 70,
            width: 25,
            height: 8,
            required: true,
          })),
        )
        const origFields = await tx
          .select()
          .from(signatureFields)
          .where(eq(signatureFields.contractId, origId))

        // --- 「締結済み」を再現: 署名データを入れ、署名者と契約を signed/completed に ---
        await tx.insert(signatures).values({
          id: ulid(),
          contractId: origId,
          signerId: origSigners[0].id,
          fieldId: origFields[0].id,
          type: 'draw',
          imageUrl: 'data:image/png;base64,SIGNED_SECRET',
          value: null,
          ipAddress: '203.0.113.10',
        })
        const now = new Date()
        for (const s of origSigners) {
          await tx
            .update(contractSigners)
            .set({ status: 'signed', signedAt: now })
            .where(eq(contractSigners.id, s.id))
        }
        await tx
          .update(contracts)
          .set({ status: 'completed', completedAt: now })
          .where(eq(contracts.id, origId))

        // --- 複製を実行（実装コードそのまま） ---
        const { id: dupId } = await caller.contracts.duplicate({ id: origId })

        const [dup] = await tx.select().from(contracts).where(eq(contracts.id, dupId)).limit(1)
        const dupSigners = await tx
          .select()
          .from(contractSigners)
          .where(eq(contractSigners.contractId, dupId))
          .orderBy(contractSigners.signOrder)
        const dupFields = await tx
          .select()
          .from(signatureFields)
          .where(eq(signatureFields.contractId, dupId))
        const dupSignatures = await tx
          .select()
          .from(signatures)
          .where(eq(signatures.contractId, dupId))

        // --- 取消ガード: 締結済みは取消不可 ---
        let cancelCompletedBlocked = false
        let cancelCompletedMsg = ''
        try {
          await caller.contracts.cancel({ id: origId })
        } catch (e) {
          cancelCompletedBlocked = true
          cancelCompletedMsg = (e as Error).message
        }

        // --- 取消ガード: 送信中は取消可 ---
        const { id: sentId } = await caller.contracts.create({
          title: 'E2E 送信中契約',
          signers: [{ email: 'c@example.com', name: '丙 三郎', signOrder: 1 }],
        })
        await tx.update(contracts).set({ status: 'sent' }).where(eq(contracts.id, sentId))
        await caller.contracts.cancel({ id: sentId })
        const [sentAfter] = await tx
          .select()
          .from(contracts)
          .where(eq(contracts.id, sentId))
          .limit(1)

        R = {
          origId,
          dupId,
          dup,
          dupSigners,
          origSigners,
          dupFields,
          origFields,
          dupSignatures,
          cancelCompletedBlocked,
          cancelCompletedMsg,
          sentCancelledStatus: sentAfter?.status ?? null,
        }

        // 何もコミットせずロールバック
        throw ROLLBACK
      })
    } catch (e) {
      if (e !== ROLLBACK) throw e
    }
  })

  it('複製は必ず下書き(draft)になる', () => {
    expect(R.dup.status).toBe('draft')
    expect(R.dup.completedAt).toBeNull()
    expect(R.dup.title).toBe('E2E 元契約のコピー')
    expect(R.dup.message).toBe('本文メッセージ')
  })

  it('署名者はコピーされ、状態と署名日時はリセットされる', () => {
    expect(R.dupSigners).toHaveLength(2)
    for (const s of R.dupSigners) {
      expect(s.status).toBe('pending')
      expect(s.signedAt).toBeNull()
    }
    // 宛先・氏名・順番は引き継ぐ
    expect(R.dupSigners.map((s) => s.email)).toEqual(['a@example.com', 'b@example.com'])
    expect(R.dupSigners.map((s) => s.name)).toEqual(['甲 太郎', '乙 次郎'])
    // トークンは新規（元と重複しない）
    const origTokens = new Set(R.origSigners.map((s) => s.token))
    for (const s of R.dupSigners) expect(origTokens.has(s.token)).toBe(false)
  })

  it('署名欄は座標ごとコピーされ、新しい署名者に再マップされる', () => {
    expect(R.dupFields).toHaveLength(R.origFields.length)
    const dupSignerIds = new Set(R.dupSigners.map((s) => s.id))
    const origSignerIds = new Set(R.origSigners.map((s) => s.id))
    for (const f of R.dupFields) {
      // 新契約の署名者を指す（元の署名者IDではない）
      expect(f.signerId && dupSignerIds.has(f.signerId)).toBe(true)
      expect(f.signerId && origSignerIds.has(f.signerId)).toBe(false)
    }
    // 座標は保持
    const byLabel = (fs: typeof R.dupFields) =>
      [...fs].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
    const d = byLabel(R.dupFields)
    const o = byLabel(R.origFields)
    expect(d.map((f) => [f.x, f.y, f.width, f.height])).toEqual(
      o.map((f) => [f.x, f.y, f.width, f.height]),
    )
  })

  it('署名済みデータ(signatures)は複製に一切漏れない', () => {
    expect(R.dupSignatures).toHaveLength(0)
  })

  it('締結済み契約は取り消せない(サーバーガード)', () => {
    expect(R.cancelCompletedBlocked).toBe(true)
    expect(R.cancelCompletedMsg).toMatch(/送信中/)
  })

  it('送信中の契約は取り消せる', () => {
    expect(R.sentCancelledStatus).toBe('cancelled')
  })
})
