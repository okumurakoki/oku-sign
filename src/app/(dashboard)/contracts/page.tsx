'use client'

import { useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  sent: { label: '確認待ち', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  signing: { label: '署名中', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: '締結済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '却下', className: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: '期限切れ', className: 'bg-red-50 text-red-600 border-red-200' },
}

type StatusFilter = 'all' | 'draft' | 'sent' | 'signing' | 'completed' | 'cancelled'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContractsPage() {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const stats = trpc.dashboard.getStats.useQuery()
  const contracts = trpc.contracts.list.useQuery({
    status: filter === 'all' ? undefined : filter,
    search: search || undefined,
    page,
    perPage: 20,
  })

  const deleteContract = trpc.contracts.delete.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate()
      utils.dashboard.getStats.invalidate()
      setDeleteId(null)
    },
  })

  const bulkDelete = trpc.contracts.bulkDelete.useMutation({
    onSuccess: () => {
      setSelected(new Set())
      utils.contracts.list.invalidate()
      utils.dashboard.getStats.invalidate()
      setShowDeleteDialog(false)
    },
  })

  const sendContract = trpc.contracts.send.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate()
      utils.dashboard.getStats.invalidate()
    },
  })

  const cancelContract = trpc.contracts.cancel.useMutation({
    onSuccess: () => {
      utils.contracts.list.invalidate()
      utils.dashboard.getStats.invalidate()
    },
  })

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (!contracts.data) return
    if (selected.size === contracts.data.items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(contracts.data.items.map((c) => c.id)))
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">書類管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            送信した書類の管理・署名状況の確認ができます
          </p>
        </div>
        <Link href="/contracts/new">
          <Button size="sm">新しく送信する</Button>
        </Link>
      </div>

      {/* KPI Tabs */}
      <div className="grid grid-cols-5 gap-2.5">
        {stats.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <Skeleton className="h-3 w-10 mb-1.5" />
              <Skeleton className="h-6 w-7" />
            </div>
          ))
        ) : (
          <>
            {[
              { key: 'all' as StatusFilter, label: '全書類', value: stats.data?.total ?? 0, color: '' },
              { key: 'sent' as StatusFilter, label: '確認待ち', value: stats.data?.sent ?? 0, color: 'text-blue-700' },
              { key: 'draft' as StatusFilter, label: '下書き', value: stats.data?.draft ?? 0, color: '' },
              { key: 'completed' as StatusFilter, label: '締結済み', value: stats.data?.completed ?? 0, color: 'text-emerald-700' },
              { key: 'cancelled' as StatusFilter, label: 'キャンセル', value: stats.data?.cancelled ?? 0, color: 'text-red-600' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => { setFilter(item.key); setPage(1) }}
                className={`rounded-lg border p-3 text-left transition-all ${
                  filter === item.key ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'bg-card hover:border-gray-300'
                }`}
              >
                <p className="text-[11px] text-muted-foreground mb-0.5">{item.label}</p>
                <p className={`text-xl font-semibold font-mono ${item.color}`}>{item.value}</p>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Search + Bulk Actions */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <Input
            placeholder="書類名で検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-xs h-9 text-sm"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
              className="text-xs text-muted-foreground"
            >
              クリア
            </Button>
          )}
        </form>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size}件選択中</span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive text-xs h-8"
              onClick={() => setShowDeleteDialog(true)}
            >
              一括削除
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {contracts.isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : contracts.data?.items.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {search ? `「${search}」に一致する書類はありません` : '書類がまだありません'}
          </p>
          {!search && (
            <Link href="/contracts/new">
              <Button variant="outline" size="sm" className="mt-3">最初の書類を送信する</Button>
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === (contracts.data?.items.length ?? 0) && selected.size > 0}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground">タイトル</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground w-24">ステータス</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground w-24">署名者</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground w-32">添付ファイル</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground w-28">作成日</TableHead>
                  <TableHead className="text-xs font-normal text-muted-foreground w-28">最終更新</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.data?.items.map((c) => {
                  const config = statusConfig[c.status]
                  const sc = c.signerCount
                  return (
                    <TableRow key={c.id} className="group">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/contracts/${c.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {c.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${config.className}`}>
                          {config.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {sc.total > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[40px]">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${(sc.signed / sc.total) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {sc.signed}/{sc.total}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.pdfName ? (
                          <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{c.pdfName}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[11px]">
                        {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-[11px]">
                        {new Date(c.updatedAt).toLocaleDateString('ja-JP')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ...
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/contracts/${c.id}`}>詳細を表示</Link>
                            </DropdownMenuItem>
                            {c.status === 'draft' && sc.total > 0 && (
                              <DropdownMenuItem onClick={() => sendContract.mutate({ id: c.id })}>
                                署名依頼を送信
                              </DropdownMenuItem>
                            )}
                            {(c.status === 'sent' || c.status === 'signing') && (
                              <DropdownMenuItem
                                onClick={() => cancelContract.mutate({ id: c.id })}
                                className="text-destructive focus:text-destructive"
                              >
                                送信を取り消す
                              </DropdownMenuItem>
                            )}
                            {c.pdfName && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <a href={`/contracts/${c.id}`}>PDFを表示</a>
                                </DropdownMenuItem>
                              </>
                            )}
                            {c.status === 'draft' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteId(c.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  削除
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {contracts.data && contracts.data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {contracts.data.total}件中 {(page - 1) * 20 + 1}-{Math.min(page * 20, contracts.data.total)}件
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  前へ
                </Button>
                {Array.from({ length: contracts.data.totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === contracts.data!.totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-xs text-muted-foreground">...</span>
                      )}
                      <Button
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 text-xs p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    </span>
                  ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page >= (contracts.data?.totalPages ?? 1)}
                  onClick={() => setPage(page + 1)}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Single Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>書類を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。書類と関連データが全て削除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteContract.mutate({ id: deleteId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.size}件の書類を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選択した書類と関連データが全て削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDelete.mutate({ ids: Array.from(selected) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
