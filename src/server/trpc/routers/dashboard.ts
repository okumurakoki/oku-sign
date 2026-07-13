import { protectedProcedure, router } from '@/server/trpc'
import { contracts, contractSigners, auditLogs, contacts } from '@/server/db/schema'
import { eq, desc, count, and, sql, inArray, gte } from 'drizzle-orm'

export const dashboardRouter = router({
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id

    const statusCounts = await ctx.db
      .select({
        status: contracts.status,
        count: count(),
      })
      .from(contracts)
      .where(eq(contracts.createdBy, userId))
      .groupBy(contracts.status)

    const statsMap = Object.fromEntries(
      statusCounts.map((s) => [s.status, s.count]),
    )

    const total = statusCounts.reduce((sum, s) => sum + s.count, 0)

    // Count contacts
    const [contactCount] = await ctx.db
      .select({ count: count() })
      .from(contacts)
      .where(eq(contacts.ownerId, userId))

    // Contracts this month
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [monthCount] = await ctx.db
      .select({ count: count() })
      .from(contracts)
      .where(and(
        eq(contracts.createdBy, userId),
        gte(contracts.createdAt, monthStart),
      ))

    return {
      total,
      draft: statsMap.draft ?? 0,
      sent: (statsMap.sent ?? 0) + (statsMap.signing ?? 0),
      completed: statsMap.completed ?? 0,
      cancelled: statsMap.cancelled ?? 0,
      contacts: contactCount.count,
      thisMonth: monthCount.count,
    }
  }),

  getRecentContracts: protectedProcedure.query(async ({ ctx }) => {
    const items = await ctx.db
      .select()
      .from(contracts)
      .where(eq(contracts.createdBy, ctx.user.id))
      .orderBy(desc(contracts.updatedAt))
      .limit(10)

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

    return items.map((c) => ({
      ...c,
      signerCount: signerCounts[c.id] ?? { total: 0, signed: 0 },
    }))
  }),

  getRecentActivity: protectedProcedure.query(async ({ ctx }) => {
    // Get all contract IDs owned by user
    const userContracts = await ctx.db
      .select({ id: contracts.id })
      .from(contracts)
      .where(eq(contracts.createdBy, ctx.user.id))

    const contractIds = userContracts.map((c) => c.id)
    if (contractIds.length === 0) return []

    return ctx.db
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.contractId, contractIds))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20)
  }),
})
