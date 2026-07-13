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

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      pdfUrl: z.string().optional(),
      pdfName: z.string().optional(),
      pdfSize: z.number().optional(),
      message: z.string().optional(),
      expiresAt: z.string().optional(),
      templateId: z.string().optional(),
      signers: z.array(z.object({
        email: z.string().email(),
        name: z.string().min(1),
        signOrder: z.number().int().min(1),
        accessCode: z.string().optional(),
      })).optional(),
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
        pdfUrl: input.pdfUrl,
        pdfName: input.pdfName,
        pdfSize: input.pdfSize,
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

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      pdfUrl: z.string().optional(),
      pdfName: z.string().optional(),
      pdfSize: z.number().optional(),
      message: z.string().optional(),
      expiresAt: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.title !== undefined) updateData.title = data.title
      if (data.pdfUrl !== undefined) updateData.pdfUrl = data.pdfUrl
      if (data.pdfName !== undefined) updateData.pdfName = data.pdfName
      if (data.pdfSize !== undefined) updateData.pdfSize = data.pdfSize
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

      const signerList = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, input.id))
        .orderBy(contractSigners.signOrder)

      if (signerList.length === 0) {
        throw new Error('署名者が設定されていません')
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
      await sendEmail({ to: firstSigner.email, ...emailData })

      const now = new Date()
      await ctx.db
        .update(contractSigners)
        .set({ status: 'notified' })
        .where(eq(contractSigners.id, firstSigner.id))

      await ctx.db
        .update(contracts)
        .set({ status: 'sent', sentAt: now, updatedAt: now })
        .where(eq(contracts.id, input.id))

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
      const now = new Date()
      await ctx.db
        .update(contracts)
        .set({ status: 'cancelled', updatedAt: now })
        .where(and(eq(contracts.id, input.id), eq(contracts.createdBy, ctx.user.id)))

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
