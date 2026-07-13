import { protectedProcedure, router } from '@/server/trpc'
import { contracts, contractSigners, auditLogs, users, signatures } from '@/server/db/schema'
import { eq, desc, and, like, count, inArray, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { signingRequestEmail, signerCompletedEmail, signerDeclinedEmail, reminderEmail } from '@/server/email/templates'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

export const contractsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.enum(['draft', 'sent', 'signing', 'completed', 'cancelled']).optional(),
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

      return { ...contract, signers: signerList, auditLogs: logs }
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

      // Send emails to signers
      for (const signer of signerList) {
        const signUrl = `${BASE_URL}/sign/${signer.token}`
        const emailData = signingRequestEmail({
          signerName: signer.name,
          senderName: ctx.user.name,
          senderCompany: ctx.user.companyName,
          contractTitle: contract.title,
          signUrl,
          message: contract.message,
          expiresAt: contract.expiresAt,
        })
        await sendEmail({ to: signer.email, ...emailData })
      }

      const now = new Date()
      await ctx.db
        .update(contracts)
        .set({ status: 'sent', sentAt: now, updatedAt: now })
        .where(eq(contracts.id, input.id))

      await ctx.db.insert(auditLogs).values({
        id: ulid(),
        contractId: input.id,
        action: 'sent',
        actorEmail: ctx.user.email,
        detail: `${signerList.length}名に署名依頼を送信しました`,
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

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(contracts)
        .where(and(eq(contracts.id, input.id), eq(contracts.createdBy, ctx.user.id)))
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return
      await ctx.db
        .delete(contracts)
        .where(and(
          inArray(contracts.id, input.ids),
          eq(contracts.createdBy, ctx.user.id),
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
      const [signer] = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.id, input.signerId))
        .limit(1)

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
      const [contract] = await ctx.db
        .select()
        .from(contracts)
        .where(eq(contracts.id, input.contractId))
        .limit(1)

      const [signer] = await ctx.db
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.id, input.signerId))
        .limit(1)

      if (!contract || !signer || signer.status !== 'pending') return

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
