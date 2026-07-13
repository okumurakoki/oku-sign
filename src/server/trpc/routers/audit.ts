import { protectedProcedure, router } from '@/server/trpc'
import { TRPCError } from '@trpc/server'
import { auditLogs, contracts } from '@/server/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod/v4'

export const auditRouter = router({
  list: protectedProcedure
    .input(z.object({
      contractId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const lim = input?.limit ?? 50

      if (input?.contractId) {
        // 対象契約の所有者のみ閲覧可
        const [contract] = await ctx.db
          .select({ id: contracts.id })
          .from(contracts)
          .where(and(eq(contracts.id, input.contractId), eq(contracts.createdBy, ctx.user.id)))
          .limit(1)
        if (!contract) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '書類が見つかりません' })
        }
        return ctx.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.contractId, input.contractId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(lim)
      }

      // 自分が所有する契約のログのみ横断表示
      const owned = await ctx.db
        .select({ id: contracts.id })
        .from(contracts)
        .where(eq(contracts.createdBy, ctx.user.id))
      const ownedIds = owned.map((c) => c.id)
      if (ownedIds.length === 0) return []

      return ctx.db
        .select()
        .from(auditLogs)
        .where(inArray(auditLogs.contractId, ownedIds))
        .orderBy(desc(auditLogs.createdAt))
        .limit(lim)
    }),
})
