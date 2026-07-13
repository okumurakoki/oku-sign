import { protectedProcedure, router } from '@/server/trpc'
import { templates } from '@/server/db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'

export const templatesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(templates)
      .where(eq(templates.createdBy, ctx.user.id))
      .orderBy(desc(templates.updatedAt))
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [template] = await ctx.db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.createdBy, ctx.user.id)))
        .limit(1)
      return template ?? null
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      pdfUrl: z.string().optional(),
      pdfName: z.string().optional(),
      pdfSize: z.number().optional(),
      defaultMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = ulid()
      await ctx.db.insert(templates).values({
        id,
        title: input.title,
        description: input.description || null,
        pdfUrl: input.pdfUrl || null,
        pdfName: input.pdfName || null,
        pdfSize: input.pdfSize || null,
        defaultMessage: input.defaultMessage || null,
        createdBy: ctx.user.id,
      })
      return { id }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      pdfUrl: z.string().optional(),
      pdfName: z.string().optional(),
      pdfSize: z.number().optional(),
      defaultMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.title !== undefined) updateData.title = data.title
      if (data.description !== undefined) updateData.description = data.description || null
      if (data.pdfUrl !== undefined) updateData.pdfUrl = data.pdfUrl || null
      if (data.pdfName !== undefined) updateData.pdfName = data.pdfName || null
      if (data.pdfSize !== undefined) updateData.pdfSize = data.pdfSize || null
      if (data.defaultMessage !== undefined) updateData.defaultMessage = data.defaultMessage || null

      await ctx.db
        .update(templates)
        .set(updateData)
        .where(and(eq(templates.id, id), eq(templates.createdBy, ctx.user.id)))
    }),

  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [original] = await ctx.db
        .select()
        .from(templates)
        .where(and(eq(templates.id, input.id), eq(templates.createdBy, ctx.user.id)))
        .limit(1)

      if (!original) throw new Error('テンプレートが見つかりません')

      const id = ulid()
      await ctx.db.insert(templates).values({
        id,
        title: `${original.title}（コピー）`,
        description: original.description,
        pdfUrl: original.pdfUrl,
        pdfName: original.pdfName,
        pdfSize: original.pdfSize,
        defaultMessage: original.defaultMessage,
        createdBy: ctx.user.id,
      })
      return { id }
    }),

  incrementUsage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(templates)
        .set({ usageCount: sql`${templates.usageCount} + 1` })
        .where(and(eq(templates.id, input.id), eq(templates.createdBy, ctx.user.id)))
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(templates)
        .where(and(eq(templates.id, input.id), eq(templates.createdBy, ctx.user.id)))
    }),
})
