import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { signatureFields, contracts, contractSigners, templates } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'
import type { Context } from '@/server/trpc/context'

const fieldInput = z.object({
  signerId: z.string().nullable().optional(),
  signerOrder: z.number().int().min(1).optional(),
  fieldType: z.enum(['signature', 'text', 'date', 'stamp']),
  label: z.string().optional(),
  page: z.number().int().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0.5).max(100),
  height: z.number().min(0.5).max(100),
  required: z.boolean().optional(),
})

async function assertContractOwnerDraft(db: Context['db'], contractId: string, userId: string) {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.createdBy, userId)))
    .limit(1)
  if (!contract) throw new TRPCError({ code: 'NOT_FOUND', message: '書類が見つかりません' })
  return contract
}

async function assertTemplateOwner(db: Context['db'], templateId: string, userId: string) {
  const [tpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.createdBy, userId)))
    .limit(1)
  if (!tpl) throw new TRPCError({ code: 'NOT_FOUND', message: 'テンプレートが見つかりません' })
  return tpl
}

export const signatureFieldsRouter = router({
  // 契約の全署名欄を取得（所有者のみ）
  list: protectedProcedure
    .input(z.object({ contractId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [contract] = await ctx.db
        .select({ id: contracts.id })
        .from(contracts)
        .where(and(eq(contracts.id, input.contractId), eq(contracts.createdBy, ctx.user.id)))
        .limit(1)
      if (!contract) throw new TRPCError({ code: 'NOT_FOUND', message: '書類が見つかりません' })

      return ctx.db
        .select()
        .from(signatureFields)
        .where(eq(signatureFields.contractId, input.contractId))
        .orderBy(signatureFields.page)
    }),

  // 契約の署名欄をまとめて置き換え（draft のみ）
  bulkSet: protectedProcedure
    .input(z.object({ contractId: z.string(), fields: z.array(fieldInput) }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwnerDraft(ctx.db, input.contractId, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '下書き状態の書類のみ署名欄を編集できます' })
      }

      // 署名者を取得（signerId検証 + signerOrder導出）
      const signers = await ctx.db
        .select({ id: contractSigners.id, signOrder: contractSigners.signOrder })
        .from(contractSigners)
        .where(eq(contractSigners.contractId, input.contractId))
      const signerMap = new Map(signers.map((s) => [s.id, s.signOrder]))

      for (const f of input.fields) {
        if (f.signerId && !signerMap.has(f.signerId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '不正な署名者が指定されています' })
        }
      }

      await ctx.db.transaction(async (tx) => {
        await tx.delete(signatureFields).where(eq(signatureFields.contractId, input.contractId))
        if (input.fields.length > 0) {
          await tx.insert(signatureFields).values(
            input.fields.map((f) => ({
              id: ulid(),
              contractId: input.contractId,
              signerId: f.signerId ?? null,
              signerOrder: f.signerId ? (signerMap.get(f.signerId) ?? 1) : (f.signerOrder ?? 1),
              fieldType: f.fieldType,
              label: f.label ?? null,
              page: f.page,
              x: f.x, y: f.y, width: f.width, height: f.height,
              required: f.required ?? true,
            })),
          )
        }
      })
      return { count: input.fields.length }
    }),

  // テンプレートの署名欄を取得
  templateList: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTemplateOwner(ctx.db, input.templateId, ctx.user.id)
      return ctx.db
        .select()
        .from(signatureFields)
        .where(eq(signatureFields.templateId, input.templateId))
        .orderBy(signatureFields.page)
    }),

  // テンプレートの署名欄をまとめて置き換え（signerOrderスロットで保持）
  templateBulkSet: protectedProcedure
    .input(z.object({ templateId: z.string(), fields: z.array(fieldInput) }))
    .mutation(async ({ ctx, input }) => {
      await assertTemplateOwner(ctx.db, input.templateId, ctx.user.id)
      await ctx.db.transaction(async (tx) => {
        await tx.delete(signatureFields).where(eq(signatureFields.templateId, input.templateId))
        if (input.fields.length > 0) {
          await tx.insert(signatureFields).values(
            input.fields.map((f) => ({
              id: ulid(),
              templateId: input.templateId,
              signerId: null,
              signerOrder: f.signerOrder ?? 1,
              fieldType: f.fieldType,
              label: f.label ?? null,
              page: f.page,
              x: f.x, y: f.y, width: f.width, height: f.height,
              required: f.required ?? true,
            })),
          )
        }
      })
      return { count: input.fields.length }
    }),
})
