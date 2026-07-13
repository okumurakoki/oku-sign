import { protectedProcedure, router } from '@/server/trpc'
import { auditLogs } from '@/server/db/schema'
import { desc, eq } from 'drizzle-orm'
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
        return ctx.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.contractId, input.contractId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(lim)
      }

      return ctx.db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(lim)
    }),
})
