import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { contracts, contractSigners, auditLogs, signatureFields, templates } from '@/server/db/schema'
import { eq, desc, and, like, count, inArray, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { signingRequestEmail, reminderEmail } from '@/server/email/templates'
import { getSignedUrl, downloadPdf, uploadPdfToPath } from '@/server/storage'
import { hasActiveSubscription } from './billing'
import { renderAndStoreSignedPdf } from '@/server/pdf/store-signed-pdf'
import { reportError } from '@/server/report-error'
import type { Context } from '@/server/trpc/context'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

// 契約が呼び出しユーザーの所有物であることを保証（無ければNOT_FOUND）
async function assertContractOwner(
  db: Context['db'],
  contractId: string,
  userId: string,
) {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.createdBy, userId)))
    .limit(1)
  if (!contract) {
    throw new TRPCError({ code: 'NOT_FOUND', message: '書類が見つかりません' })
  }
  return contract
}

export const contractsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['draft', 'sent', 'signing', 'completed', 'cancelled', 'expired']).optional(),
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
      perPage: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1
      const perPage = input?.perPage ?? 20
      const offset = (page - 1) * perPage

      const conditions = [eq(contracts.createdBy, ctx.user.id)]
      if (input?.status) conditions.push(eq(contracts.status, input.status))
      if (input?.search) conditions.push(like(contracts.title, `%${input.search}%`))

      const where = and(...conditions)

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(contracts)
        .where(where)

      const items = await ctx.db
        .select()
        .from(contracts)
        .where(where)
        .orderBy(desc(contracts.updatedAt))
        .limit(perPage)
        .offset(offset)

      // Get signer counts for each contract
      const contractIds = items.map((c) => c.id)
      let signerCounts: Record<string, { total: number; signed: number }> = {}

      if (contractIds.length > 0) {
        const signerStats = await ctx.db
          .select({
            contractId: contractSigners.contractId,
            total: count(),
            signed: sql<number>`count(case when ${contractSigners.status} = 'signed' then 1 end)`,
          })
          .from(contractSigners)
          .where(inArray(contractSigners.contractId, contractIds))
          .groupBy(contractSigners.contractId)

        signerCounts = Object.fromEntries(
          signerStats.map((s) => [s.contractId, { total: s.total, signed: Number(s.signed) }]),
        )
      }

      return {
        items: items.map((c) => ({
          ...c,
          signerCount: signerCounts[c.id] ?? { total: 0, signed: 0 },
        })),
        total: totalResult.count,
        page,
        perPage,
        totalPages: Math.ceil(totalResult.count / perPage),
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [contract] = await ctx.db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.createdBy, ctx.user.id)))
        .limit(1)
      if (!contract) return null

      const signerList = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, input.id))
        .orderBy(contractSigners.signOrder)

      const logs = await ctx.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.contractId, input.id))
        .orderBy(desc(auditLogs.createdAt))

      const fields = await ctx.db
        .select()
        .from(signatureFields)
        .where(eq(signatureFields.contractId, input.id))
        .orderBy(signatureFields.page)

      // PDFの署名付きURL（privateバケット・有効期限付き）を生成。
      // 締結済みは署名証明ページ付きの signed.pdf を優先。
      let pdfSignedUrl: string | null = null
      let signedPdfUrl: string | null = null
      if (contract.pdfUrl) {
        try {
          pdfSignedUrl = await getSignedUrl(contract.pdfUrl)
        } catch (err) {
          console.error('[contracts.getById] 原本PDF署名URL生成失敗:', err)
        }
      }
      if (contract.status === 'completed') {
        try {
          signedPdfUrl = await getSignedUrl(`contracts/${contract.id}/signed.pdf`)
        } catch (err) {
          console.error('[contracts.getById] 署名済みPDF署名URL生成失敗:', err)
        }
      }

      return { ...contract, signers: signerList, auditLogs: logs, fields, pdfSignedUrl, signedPdfUrl }
    }),

  // 締結時にsigned.pdf生成が失敗した契約の再生成（オーナーのみ・completedのみ）
  regenerateSignedPdf: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwner(ctx.db, input.id, ctx.user.id)
      if (contract.status !== 'completed') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '締結済みの書類のみ再生成できます' })
      }
      try {
        await renderAndStoreSignedPdf(ctx.db, input.id)
      } catch (err) {
        reportError(err, { scope: 'contracts.regenerateSignedPdf', contractId: input.id })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '署名済みPDFの再生成に失敗しました' })
      }
      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.id,
        action: 'signed_pdf_regenerated',
        actorEmail: ctx.user.email,
        detail: '署名済みPDFを再生成しました',
      })
      return { ok: true }
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(300),
      // pdfUrl/pdfName/pdfSize はクライアントから受け取らない（uploadルートがサーバー派生で設定）
      message: z.string().max(5000).optional(),
      expiresAt: z.string().optional(),
      templateId: z.string().optional(),
      signers: z.array(z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
        signOrder: z.number().int().min(1),
        accessCode: z.string().max(50).optional(),
      })).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // サブスクゲート: active/trialing（またはowner）でなければ作成不可
      const allowed = await hasActiveSubscription(ctx.db, ctx.user)
      if (!allowed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'パートナープランへの登録が必要です',
          cause: 'SUBSCRIPTION_REQUIRED',
        })
      }

      const contractId = ulid()
      await ctx.db.insert(contracts).values({
        id: contractId,
        title: input.title,
        message: input.message,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: ctx.user.id,
      })

      if (input.signers?.length) {
        await ctx.db.insert(contractSigners).values(
          input.signers.map((s) => ({
            id: ulid(),
            contractId,
            email: s.email,
            name: s.name,
            signOrder: s.signOrder,
            role: 'signer' as const,
            token: ulid(),
            accessCode: s.accessCode || null,
          })),
        )
      }

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId,
        action: 'created',
        actorEmail: ctx.user.email,
        detail: `書類「${input.title}」を作成しました`,
      })

      return { id: contractId }
    }),

  // テンプレートから契約を作成（PDF・署名欄をコピー）
  createFromTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      title: z.string().min(1).optional(),
      expiresAt: z.string().optional(),
      signers: z.array(z.object({
        email: z.string().email(),
        name: z.string().min(1),
        signOrder: z.number().int().min(1),
        accessCode: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const allowed = await hasActiveSubscription(ctx.db, ctx.user)
      if (!allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'パートナープランへの登録が必要です', cause: 'SUBSCRIPTION_REQUIRED' })
      }

      const [tpl] = await ctx.db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.templateId), eq(templates.createdBy, ctx.user.id)))
        .limit(1)
      if (!tpl) throw new TRPCError({ code: 'NOT_FOUND', message: 'テンプレートが見つかりません' })

      const contractId = ulid()
      let pdfUrl: string | null = null
      // テンプレPDFを新契約のストレージにコピー
      if (tpl.pdfUrl) {
        try {
          const buf = await downloadPdf(tpl.pdfUrl)
          pdfUrl = await uploadPdfToPath(buf, `contracts/${contractId}/original.pdf`)
        } catch (err) {
          console.error('[createFromTemplate] PDFコピー失敗:', err)
        }
      }

      await ctx.db.insert(contracts).values({
        id: contractId,
        title: input.title ?? tpl.title,
        pdfUrl,
        pdfName: tpl.pdfName,
        pdfSize: tpl.pdfSize,
        message: tpl.defaultMessage,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: ctx.user.id,
      })

      // 署名者を作成し、signOrder → signerId のマップを作る
      const signerRows = input.signers.map((s) => ({
        id: ulid(),
        contractId,
        email: s.email,
        name: s.name,
        signOrder: s.signOrder,
        role: 'signer' as const,
        token: ulid(),
        accessCode: s.accessCode || null,
      }))
      await ctx.db.insert(contractSigners).values(signerRows)
      const orderToSigner = new Map(signerRows.map((s) => [s.signOrder, s.id]))

      // テンプレの署名欄をコピー（signerOrderスロット → 実signer）
      const tplFields = await ctx.db
        .select()
        .from(signatureFields)
        .where(eq(signatureFields.templateId, tpl.id))
      if (tplFields.length > 0) {
        await ctx.db.insert(signatureFields).values(
          tplFields.map((f) => ({
            id: ulid(),
            contractId,
            signerId: orderToSigner.get(f.signerOrder) ?? null,
            signerOrder: f.signerOrder,
            fieldType: f.fieldType,
            label: f.label,
            page: f.page,
            x: f.x, y: f.y, width: f.width, height: f.height,
            required: f.required,
          })),
        )
      }

      await ctx.db
        .update(templates)
        .set({ usageCount: sql`${templates.usageCount} + 1` })
        .where(eq(templates.id, tpl.id))

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId,
        action: 'created',
        actorEmail: ctx.user.email,
        detail: `テンプレート「${tpl.title}」から書類を作成しました`,
      })

      return { id: contractId }
    }),

  // 契約を複製して新しい下書きを作成（PDF・署名欄・署名者を引き継ぐ）。
  // 「送信済みを訂正して送り直す」= 元を取り消し → 複製 → 該当箇所だけ修正 → 再送、の中核。
  // 新契約は必ず draft。送信/署名/締結の状態・署名データ・署名日時は一切引き継がない。
  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const allowed = await hasActiveSubscription(ctx.db, ctx.user)
      if (!allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'パートナープランへの登録が必要です', cause: 'SUBSCRIPTION_REQUIRED' })
      }
      const src = await assertContractOwner(ctx.db, input.id, ctx.user.id)

      const newId = ulid()
      // 元PDFを新契約のストレージにコピー（元の原本を共有せず独立させる）
      let pdfUrl: string | null = null
      if (src.pdfUrl) {
        try {
          const buf = await downloadPdf(src.pdfUrl)
          pdfUrl = await uploadPdfToPath(buf, `contracts/${newId}/original.pdf`)
        } catch (err) {
          console.error('[duplicate] PDFコピー失敗:', err)
        }
      }

      await ctx.db.insert(contracts).values({
        id: newId,
        title: `${src.title}のコピー`,
        pdfUrl,
        pdfName: src.pdfName,
        pdfSize: src.pdfSize,
        message: src.message,
        expiresAt: null, // 期限は再設定させる
        createdBy: ctx.user.id,
      })

      // 署名者をコピー（宛先・氏名・順番・アクセスコードは引き継ぎ、状態/署名日時/トークンはリセット）。
      // 旧signerId → 新signerId のマップを作り、署名欄の紐付けに使う。
      const srcSigners = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, src.id))
        .orderBy(contractSigners.signOrder)
      const idMap = new Map<string, string>()
      if (srcSigners.length > 0) {
        const rows = srcSigners.map((s) => {
          const nid = ulid()
          idMap.set(s.id, nid)
          return {
            id: nid,
            contractId: newId,
            email: s.email,
            name: s.name,
            role: s.role,
            signOrder: s.signOrder,
            token: ulid(),
            accessCode: s.accessCode,
            // status/signedAt/declineReason/viewedAt/accessAttempts/lockedUntil はデフォルトで初期化
          }
        })
        await ctx.db.insert(contractSigners).values(rows)
      }

      // 署名欄（座標配置）をコピー。signature_fields に署名データ列は無いため座標のみ引き継ぐ。
      const srcFields = await ctx.db
        .select()
        .from(signatureFields)
        .where(eq(signatureFields.contractId, src.id))
      if (srcFields.length > 0) {
        await ctx.db.insert(signatureFields).values(
          srcFields.map((f) => ({
            id: ulid(),
            contractId: newId,
            signerId: f.signerId ? idMap.get(f.signerId) ?? null : null,
            signerOrder: f.signerOrder,
            fieldType: f.fieldType,
            label: f.label,
            page: f.page,
            x: f.x, y: f.y, width: f.width, height: f.height,
            required: f.required,
          })),
        )
      }

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: newId,
        action: 'created',
        actorEmail: ctx.user.email,
        detail: `書類「${src.title}」を複製して作成しました`,
      })

      return { id: newId }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(300).optional(),
      // pdfUrl等はクライアントから変更させない（uploadルート経由のみ）
      message: z.string().max(5000).optional(),
      expiresAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 下書きのみ編集可（送信後の内容改変=監査の毀損を防ぐ）
      const contract = await assertContractOwner(ctx.db, input.id, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '下書き状態の書類のみ編集できます' })
      }

      const { id, ...data } = input
      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.title !== undefined) updateData.title = data.title
      if (data.message !== undefined) updateData.message = data.message
      if (data.expiresAt !== undefined) updateData.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null

      await ctx.db
        .update(contracts)
        .set(updateData)
        .where(and(eq(contracts.id, id), eq(contracts.createdBy, ctx.user.id)))
    }),

  send: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [contract] = await ctx.db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.createdBy, ctx.user.id)))
        .limit(1)

      if (!contract || contract.status !== 'draft') {
        throw new Error('書類が見つからないか、送信できない状態です')
      }

      // 送信は課金商品の中心機能。作成時だけでなく送信時にもゲートする
      // （有効期間中に量産したdraftを解約後に送る回避を塞ぐ）
      const allowed = await hasActiveSubscription(ctx.db, ctx.user)
      if (!allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'パートナープランへの登録が必要です', cause: 'SUBSCRIPTION_REQUIRED' })
      }

      // 署名対象の文書が無い契約は送信させない（API直叩き対策）
      if (!contract.pdfUrl) {
        throw new Error('PDFがアップロードされていません')
      }

      const signerList = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, input.id))
        .orderBy(contractSigners.signOrder)

      if (signerList.length === 0) {
        throw new Error('署名者が設定されていません')
      }

      // atomic claim: 二重クリック/並行呼び出しで依頼メールが重複しないよう、
      // 先にdraft→sentへ遷移させ、claimが取れた呼び出しだけがメールを送る
      const now = new Date()
      const claimed = await ctx.db
        .update(contracts)
        .set({ status: 'sent', sentAt: now, updatedAt: now })
        .where(and(
          eq(contracts.id, input.id),
          eq(contracts.createdBy, ctx.user.id),
          eq(contracts.status, 'draft'),
        ))
        .returning({ id: contracts.id })
      if (claimed.length === 0) {
        throw new Error('書類が見つからないか、送信できない状態です')
      }

      // 順次署名: 最初の順序の署名者のみに通知する（完了時に次の署名者へ自動通知）
      const firstSigner = signerList[0]
      const signUrl = `${BASE_URL}/sign/${firstSigner.token}`
      const emailData = signingRequestEmail({
        signerName: firstSigner.name,
        senderName: ctx.user.name,
        senderCompany: ctx.user.companyName,
        contractTitle: contract.title,
        signUrl,
        message: contract.message,
        expiresAt: contract.expiresAt,
      })
      try {
        await sendEmail({ to: firstSigner.email, ...emailData })
      } catch (err) {
        // 依頼メールが届いていないのにsentのままだと誰も署名できず放置される。
        // draftへ戻して送信者に失敗を見せ、再送信で回復できるようにする。
        await ctx.db
          .update(contracts)
          .set({ status: 'draft', sentAt: null, updatedAt: new Date() })
          .where(eq(contracts.id, input.id))
        throw new Error(`署名依頼メールの送信に失敗しました。時間をおいて再度お試しください`, { cause: err })
      }

      await ctx.db
        .update(contractSigners)
        .set({ status: 'notified' })
        .where(eq(contractSigners.id, firstSigner.id))

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.id,
        action: 'sent',
        actorEmail: ctx.user.email,
        detail: `${firstSigner.name}に署名依頼を送信しました（署名者${signerList.length}名・順次）`,
      })
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 送信中（sent/signing）のみ取消可。締結済み・下書き・取消済み・期限切れは不可。
      // UIの canCancel と同じ不変条件をサーバーでも保証する（API直叩き対策）。
      const contract = await assertContractOwner(ctx.db, input.id, ctx.user.id)
      if (contract.status !== 'sent' && contract.status !== 'signing') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '送信中の書類のみ取り消せます' })
      }
      const now = new Date()
      // atomic claim: 並行実行や署名者側の辞退cancelとの競合でaudit重複を防ぐ
      const claimed = await ctx.db
        .update(contracts)
        .set({ status: 'cancelled', updatedAt: now })
        .where(and(
          eq(contracts.id, input.id),
          eq(contracts.createdBy, ctx.user.id),
          inArray(contracts.status, ['sent', 'signing']),
        ))
        .returning({ id: contracts.id })
      if (claimed.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '送信中の書類のみ取り消せます' })
      }

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.id,
        action: 'cancelled',
        actorEmail: ctx.user.email,
        detail: '書類の送信を取り消しました',
      })
    }),

  // 削除は下書きのみ許可。送信以降（sent/signing/completed/cancelled/expired）は
  // 法的な監査証跡・署名証拠を保持する必要があるため削除不可（電子帳簿/契約の保存要件）。
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwner(ctx.db, input.id, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '送信済みの書類は削除できません（記録保持のため）' })
      }
      await ctx.db
        .delete(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.createdBy, ctx.user.id)))
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return
      // 下書きのみ削除（送信以降は保持）。対象外は黙ってスキップする。
      await ctx.db
        .delete(contracts)
        .where(and(
          inArray(contracts.id, input.ids),
          eq(contracts.createdBy, ctx.user.id),
          eq(contracts.status, 'draft'),
        ))
    }),

  addSigner: protectedProcedure
    .input(z.object({
      contractId: z.string(),
      email: z.string().email(),
      name: z.string().min(1),
      signOrder: z.number().int().min(1),
      accessCode: z.string().max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwner(ctx.db, input.contractId, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '下書き状態の書類のみ署名者を追加できます' })
      }

      const id = ulid()
      await ctx.db.insert(contractSigners).values({
        id,
        contractId: input.contractId,
        email: input.email,
        name: input.name,
        signOrder: input.signOrder,
        role: 'signer',
        token: ulid(),
        accessCode: input.accessCode || null,
      })

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.contractId,
        action: 'signer_added',
        actorEmail: ctx.user.email,
        detail: `署名者「${input.name}（${input.email}）」を追加しました`,
      })

      return { id }
    }),

  removeSigner: protectedProcedure
    .input(z.object({ signerId: z.string(), contractId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwner(ctx.db, input.contractId, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '下書き状態の書類のみ署名者を削除できます' })
      }

      const [signer] = await ctx.db
        .select()
        .from(contractSigners)
        .where(and(
          eq(contractSigners.id, input.signerId),
          eq(contractSigners.contractId, input.contractId),
        ))
        .limit(1)
      if (!signer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '署名者が見つかりません' })
      }

      await ctx.db
        .delete(contractSigners)
        .where(eq(contractSigners.id, input.signerId))

      if (signer) {
        await ctx.db.insert(auditLogs).values({
          id: ulid(),
          contractId: input.contractId,
          action: 'signer_removed',
          actorEmail: ctx.user.email,
          detail: `署名者「${signer.name}」を削除しました`,
        })
      }
    }),

  sendReminder: protectedProcedure
    .input(z.object({ contractId: z.string(), signerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwner(ctx.db, input.contractId, ctx.user.id)

      const [signer] = await ctx.db
        .select()
        .from(contractSigners)
        .where(and(
          eq(contractSigners.id, input.signerId),
          eq(contractSigners.contractId, input.contractId),
        ))
        .limit(1)

      // 未署名（notified/viewed）のみリマインド可
      if (!signer || (signer.status !== 'notified' && signer.status !== 'viewed')) return

      const signUrl = `${BASE_URL}/sign/${signer.token}`
      const emailData = reminderEmail({
        signerName: signer.name,
        senderName: ctx.user.name,
        senderCompany: ctx.user.companyName,
        contractTitle: contract.title,
        signUrl,
        expiresAt: contract.expiresAt,
      })
      await sendEmail({ to: signer.email, ...emailData })

      await ctx.db
        .update(contractSigners)
        .set({ lastReminderAt: new Date() })
        .where(eq(contractSigners.id, input.signerId))

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.contractId,
        action: 'reminder_sent',
        actorEmail: ctx.user.email,
        detail: `${signer.name}にリマインダーを送信しました`,
      })
    }),
})
