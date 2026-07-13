'use client'

import { use } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { FieldEditor } from './field-editor'

export default function EditFieldsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const contract = trpc.contracts.getById.useQuery({ id })

  if (contract.isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">読み込み中...</div>
  }

  const c = contract.data
  if (!c) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground mb-3">書類が見つかりません</p>
        <Link href="/contracts"><Button variant="outline" size="sm">一覧へ戻る</Button></Link>
      </div>
    )
  }

  if (c.status !== 'draft') {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground mb-3">送信済みの書類は署名欄を編集できません。</p>
        <Link href={`/contracts/${id}`}><Button variant="outline" size="sm">書類詳細へ</Button></Link>
      </div>
    )
  }

  if (!c.pdfSignedUrl) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          PDFがアップロードされていません。先にPDFを添付してください。
        </p>
        <Link href={`/contracts/${id}`}><Button variant="outline" size="sm">書類詳細へ</Button></Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/contracts/${id}`} className="text-xs text-muted-foreground hover:text-foreground">
          ← 書類詳細に戻る
        </Link>
        <h1 className="mt-1 text-lg font-semibold">署名欄の配置</h1>
        <p className="text-sm text-muted-foreground">{c.title}</p>
      </div>

      <FieldEditor
        contractId={id}
        pdfUrl={c.pdfSignedUrl}
        signers={c.signers.map((s) => ({ id: s.id, name: s.name, email: s.email, signOrder: s.signOrder }))}
        initialFields={c.fields.map((f) => ({
          key: f.id,
          id: f.id,
          signerId: f.signerId ?? '',
          fieldType: f.fieldType,
          label: f.label,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
        }))}
      />
    </div>
  )
}
