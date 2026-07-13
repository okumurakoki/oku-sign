'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldEditor } from '@/app/(dashboard)/contracts/[id]/edit/field-editor'

export default function TemplateEditFieldsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const template = trpc.templates.getById.useQuery({ id })
  const fieldsQuery = trpc.signatureFields.templateList.useQuery({ templateId: id })
  const bulkSet = trpc.signatureFields.templateBulkSet.useMutation()

  // 署名者スロット数（テンプレは概念的な署名者。既定2名分・最大5）
  const [slotCount, setSlotCount] = useState(2)

  if (template.isLoading || fieldsQuery.isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">読み込み中...</div>
  }

  const t = template.data
  if (!t) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground mb-3">テンプレートが見つかりません</p>
        <Link href="/templates"><Button variant="outline" size="sm">一覧へ戻る</Button></Link>
      </div>
    )
  }
  if (!t.pdfSignedUrl) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          このテンプレートにはPDFが添付されていません。署名欄を配置するにはPDF付きテンプレートが必要です。
        </p>
        <Link href="/templates"><Button variant="outline" size="sm">テンプレート一覧へ</Button></Link>
      </div>
    )
  }

  // 既存フィールドの最大スロットを反映
  const usedMax = Math.max(slotCount, ...(fieldsQuery.data ?? []).map((f) => f.signerOrder), 1)
  const slots = Array.from({ length: usedMax }, (_, i) => ({
    id: String(i + 1),
    name: `署名者${i + 1}`,
    signOrder: i + 1,
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <Link href="/templates" className="text-xs text-muted-foreground hover:text-foreground">← テンプレート一覧に戻る</Link>
          <h1 className="mt-1 text-lg font-semibold">署名欄の配置（テンプレート）</h1>
          <p className="text-sm text-muted-foreground">{t.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">署名者スロット数</span>
          <Input
            type="number" min={1} max={5} value={usedMax}
            onChange={(e) => setSlotCount(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            className="w-16 h-8"
          />
        </div>
      </div>

      <FieldEditor
        pdfUrl={t.pdfSignedUrl}
        signers={slots}
        assigneeLabel="署名者スロット"
        backHref="/templates"
        saving={bulkSet.isPending}
        saveError={bulkSet.error?.message ?? null}
        initialFields={(fieldsQuery.data ?? []).map((f) => ({
          key: f.id,
          id: f.id,
          signerId: String(f.signerOrder), // スロットIDにマップ
          fieldType: f.fieldType,
          label: f.label,
          page: f.page,
          x: f.x, y: f.y, width: f.width, height: f.height,
          required: f.required,
        }))}
        onSave={async (fields) => {
          await bulkSet.mutateAsync({
            templateId: id,
            fields: fields.map((f) => ({
              signerOrder: Number(f.signerId) || 1, // スロットID→signerOrder
              fieldType: f.fieldType,
              label: f.label ?? undefined,
              page: f.page,
              x: f.x, y: f.y, width: f.width, height: f.height,
              required: f.required,
            })),
          })
        }}
      />
    </div>
  )
}
