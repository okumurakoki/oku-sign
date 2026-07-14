'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TemplatesPage() {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [defaultMessage, setDefaultMessage] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useUtils()

  const templates = trpc.templates.list.useQuery()

  const createTemplate = trpc.templates.create.useMutation({
    onSuccess: async (data) => {
      // Upload PDF if attached
      if (pdfFile) {
        setUploading(true)
        const formData = new FormData()
        formData.append('file', pdfFile)
        formData.append('kind', 'template')
        formData.append('targetId', data.id)
        // uploadルートが pdfUrl/pdfName/pdfSize をサーバー側で永続化する
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setUploadError(err.error ?? 'PDFのアップロードに失敗しました')
        }
        setUploading(false)
      }
      utils.templates.list.invalidate()
      setShowCreate(false)
      resetForm()
    },
  })


  const duplicateTemplate = trpc.templates.duplicate.useMutation({
    onSuccess: () => utils.templates.list.invalidate(),
  })

  const deleteTemplate = trpc.templates.delete.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate()
      setDeleteId(null)
    },
  })

  const handleUseTemplate = async (templateId: string) => {
    // Navigate to new contract with template pre-fill
    router.push(`/contracts/new?templateId=${templateId}`)
  }

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setDefaultMessage('')
    setPdfFile(null)
    setUploadError('')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">テンプレート</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true) }}>
          テンプレートを作成
        </Button>
      </div>

      {/* Template List */}
      {templates.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : templates.data?.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground mb-1">テンプレートがありません</p>
          <p className="text-xs text-muted-foreground mb-4">
            NDA・業務委託契約書などの定型書類を登録して、毎回の入力を省略できます
          </p>
          <Button variant="outline" size="sm" onClick={() => { resetForm(); setShowCreate(true) }}>
            最初のテンプレートを作成
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFBFC] hover:bg-[#FAFBFC]">
                <TableHead className="text-[11px] font-semibold text-muted-foreground">テンプレート名</TableHead>
                <TableHead className="w-40 text-[11px] font-semibold text-muted-foreground">添付ファイル</TableHead>
                <TableHead className="w-20 text-center text-[11px] font-semibold text-muted-foreground">使用回数</TableHead>
                <TableHead className="w-28 text-[11px] font-semibold text-muted-foreground">更新日</TableHead>
                <TableHead className="w-[190px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.data?.map((t) => (
                <TableRow key={t.id} className="group h-12 hover:bg-[#FAFBFC]">
                  <TableCell className="py-0">
                    <p className="text-[13px] font-medium">
                      {t.title}
                      {t.description && (
                        <span className="ml-2 text-[11px] font-normal text-[var(--faint)]">{t.description}</span>
                      )}
                    </p>
                  </TableCell>
                  <TableCell className="py-0">
                    {t.pdfName ? (
                      <span className="text-xs text-muted-foreground">
                        {t.pdfName}
                        {t.pdfSize && <span className="tnum ml-1.5 text-[10.5px] text-[var(--faint)]">{formatBytes(t.pdfSize)}</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--faint)]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-0 text-center">
                    <span className="tnum text-xs text-muted-foreground">{t.usageCount}</span>
                  </TableCell>
                  <TableCell className="tnum py-0 text-[12px] text-muted-foreground">
                    {new Date(t.updatedAt).toLocaleDateString('ja-JP')}
                  </TableCell>
                  <TableCell className="py-0">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11.5px]"
                        onClick={() => handleUseTemplate(t.id)}
                      >
                        この書類で送信
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                            ⋯
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {t.pdfName && (
                            <DropdownMenuItem asChild>
                              <Link href={`/templates/${t.id}/edit`}>署名欄を配置</Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => duplicateTemplate.mutate({ id: t.id })}>
                            複製
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteId(t.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>テンプレートを作成</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createTemplate.mutate({
                title,
                description: description || undefined,
                defaultMessage: defaultMessage || undefined,
              })
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label className="text-xs">テンプレート名</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: NDA（秘密保持契約）"
                required
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">説明（任意）</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="このテンプレートの用途を記入"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">PDFファイル（任意）</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setPdfFile(f)
                }}
              />
              {pdfFile ? (
                <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm">{pdfFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(pdfFile.size)}</p>
                  </div>
                  <button type="button" onClick={() => setPdfFile(null)} className="text-xs text-muted-foreground hover:text-destructive">削除</button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/30 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <p className="text-sm text-muted-foreground">ファイルを選択またはドロップ</p>
                  <p className="text-[11px] text-muted-foreground mt-1">PDF形式 / 最大20MB</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">デフォルトメッセージ（任意）</Label>
              <textarea
                value={defaultMessage}
                onChange={(e) => setDefaultMessage(e.target.value)}
                placeholder="署名依頼メールに含まれるデフォルトのメッセージ"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
            {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button type="submit" disabled={!title || createTemplate.isPending || uploading}>
                {createTemplate.isPending || uploading ? '作成中...' : '作成'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>テンプレートを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteTemplate.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
