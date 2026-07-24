import { protectedProcedure, router } from '@/server/trpc'
import { templates } from '@/server/db/schema'
import { and, eq, desc, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { ulid } from 'ulid'
import { getSignedUrl, removePdfObjects, downloadPdf, uploadPdfToPath } from '@/server/storage'
import { reportError } from '@/server/report-error'

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
      if (!template) return null

      let pdfSignedUrl: string | null = null
      if (template.pdfUrl) {
        try {
          pdfSignedUrl = await getSignedUrl(template.pdfUrl)
        } catch (err) {
          console.error('[templates.getById] PDF署名URL生成失敗:', err)
        }
      }
      return { ...template, pdfSignedUrl }
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(300),
      description: z.string().max(2000).optional(),
      // pdfUrl等はuploadルートがサーバー派生で設定
      defaultMessage: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = ulid()
      await ctx.db.insert(templates).values({
        id,
        title: input.title,
        description: input.description || null,
        defaultMessage: input.defaultMessage || null,
        createdBy: ctx.user.id,
      })
      return { id }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(2000).optional(),
      defaultMessage: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (data.title !== undefined) updateData.title = data.title
      if (data.description !== undefined) updateData.description = data.description || null
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
      // PDF実体も新パスへ独立コピーする。pdfUrlを共有すると、片方の削除で
      // Storage実体が消え、もう片方のテンプレが壊れる。
      // コピー失敗時はPDF欠けの複製を黙って作らず、複製自体を失敗させる
      let pdfUrl: string | null = null
      if (original.pdfUrl) {
        try {
          const buf = await downloadPdf(original.pdfUrl)
          pdfUrl = await uploadPdfToPath(buf, `templates/${id}/original.pdf`)
        } catch (err) {
          reportError(err, { scope: 'templates.duplicate:copyPdf', templateId: original.id })
          throw new Error('テンプレートPDFのコピーに失敗しました。時間をおいて再度お試しください')
        }
      }
      await ctx.db.insert(templates).values({
        id,
        title: `${original.title}（コピー）`,
        description: original.description,
        pdfUrl,
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
      const deleted = await ctx.db
        .delete(templates)
        .where(and(eq(templates.id, input.id), eq(templates.createdBy, ctx.user.id)))
        .returning({ id: templates.id })

      // StorageのテンプレPDF実体も削除（DB行だけ消すと文書が永続残置される）。
      // DB削除成立後のベストエフォート: 失敗してもDB削除は覆さずSentryに記録
      if (deleted.length > 0) {
        try {
          await removePdfObjects([`templates/${input.id}/original.pdf`])
        } catch (err) {
          reportError(err, { scope: 'templates.delete:storage', templateId: input.id })
        }
      }
    }),
})
