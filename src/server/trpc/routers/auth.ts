import { protectedProcedure, publicProcedure, router } from '@/server/trpc'
import { users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

export const authRouter = router({
  getSession: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      companyName: ctx.user.companyName,
      role: ctx.user.role,
    }
  }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.user
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      companyName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const updateData: Record<string, unknown> = {}
      if (input.name !== undefined) updateData.name = input.name
      if (input.companyName !== undefined) updateData.companyName = input.companyName || null

      await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, ctx.user.id))
    }),
})
