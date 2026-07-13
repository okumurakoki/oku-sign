import { protectedProcedure, router } from '@/server/trpc'
import { contacts } from '@/server/db/schema'
import { eq, desc, like, and, count } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'

export const contactsRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      page: z.number().int().min(1).optional(),
      perPage: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1
      const perPage = input?.perPage ?? 50
      const offset = (page - 1) * perPage

      const conditions = [eq(contacts.ownerId, ctx.user.id)]
      if (input?.search) {
        conditions.push(like(contacts.name, `%${input.search}%`))
      }

      const where = and(...conditions)

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(contacts)
        .where(where)

      const items = await ctx.db
        .select()
        .from(contacts)
        .where(where)
        .orderBy(desc(contacts.createdAt))
        .limit(perPage)
        .offset(offset)

      return {
        items,
        total: totalResult.count,
        page,
        perPage,
        totalPages: Math.ceil(totalResult.count / perPage),
      }
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(contacts)
      .where(eq(contacts.ownerId, ctx.user.id))
      .orderBy(contacts.name)
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      companyName: z.string().optional(),
      department: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = ulid()
      await ctx.db.insert(contacts).values({
        id,
        ownerId: ctx.user.id,
        name: input.name,
        email: input.email,
        companyName: input.companyName || null,
        department: input.department || null,
        memo: input.memo || null,
      })
      return { id }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      companyName: z.string().optional(),
      department: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updateData: Record<string, unknown> = {}
      if (data.name !== undefined) updateData.name = data.name
      if (data.email !== undefined) updateData.email = data.email
      if (data.companyName !== undefined) updateData.companyName = data.companyName || null
      if (data.department !== undefined) updateData.department = data.department || null
      if (data.memo !== undefined) updateData.memo = data.memo || null

      await ctx.db
        .update(contacts)
        .set(updateData)
        .where(and(eq(contacts.id, id), eq(contacts.ownerId, ctx.user.id)))
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(contacts)
        .where(and(eq(contacts.id, input.id), eq(contacts.ownerId, ctx.user.id)))
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) return
      const { inArray } = await import('drizzle-orm')
      await ctx.db
        .delete(contacts)
        .where(and(
          inArray(contacts.id, input.ids),
          eq(contacts.ownerId, ctx.user.id),
        ))
    }),
})
