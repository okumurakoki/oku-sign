import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { signatureFields, contracts, contractSigners } from '@/server/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'
import type { Context } from '@/server/trpc/context'

const fieldInput = z.object({
  signerId: z.string().nullable().optional(),
  fieldType: z.enum(['signature', 'text', 'date', 'stamp']),
  label: z.string().optional(),
  page: z.number().int().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0.5).max(100),
  height: z.number().min(0.5).max(100),
  required: z.boolean().optional(),
})

async function assertContractOwnerDraft(
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

  // 署名欄をまとめて置き換え（draft のみ）。エディタの保存はこれ1本。
  bulkSet: protectedProcedure
    .input(z.object({
      contractId: z.string(),
      fields: z.array(fieldInput),
    }))
    .mutation(async ({ ctx, input }) => {
      const contract = await assertContractOwnerDraft(ctx.db, input.contractId, ctx.user.id)
      if (contract.status !== 'draft') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '下書き状態の書類のみ署名欄を編集できます' })
      }

      // signerId が指定されている場合、その署名者が当該契約に属することを検証
      const signerIds = [...new Set(input.fields.map((f) => f.signerId).filter((v): v is string => !!v))]
      if (signerIds.length > 0) {
        const valid = await ctx.db
          .select({ id: contractSigners.id })
          .from(contractSigners)
          .where(and(
            eq(contractSigners.contractId, input.contractId),
            inArray(contractSigners.id, signerIds),
          ))
        const validSet = new Set(valid.map((v) => v.id))
        const invalid = signerIds.filter((id) => !validSet.has(id))
        if (invalid.length > 0) {
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
              fieldType: f.fieldType,
              label: f.label ?? null,
              page: f.page,
              x: f.x,
              y: f.y,
              width: f.width,
              height: f.height,
              required: f.required ?? true,
            })),
          )
        }
      })

      return { count: input.fields.length }
    }),
})
