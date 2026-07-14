'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, SignProgress } from '@/lib/contract-status'
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

type StatusFilter = 'all' | 'draft' | 'sent' | 'signing' | 'completed' | 'cancelled' | 'expired'

function UpdatedAt({ iso }: { iso: string | Date }) {
  const d = new Date(iso)
  return (
    <span className="tnum">
      {d.getMonth() + 1}/{String(d.getDate()).padStart(2, '0')}{' '}
      {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}
    </span>
  )
}

const FILTERS: StatusFilter[] = ['all', 'draft', 'sent', 'signing', 'completed', 'cancelled', 'expired']

export default function ContractsPage() {
  const [filter, setFilter] = useState<StatusFilter>('all')

  // ダッシュボード等からの ?status= をマウント後に反映
  // （SSRと初期描画を'all'で一致させ、ハイドレーション不一致を避ける）
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status')
    if (s && FILTERS.includes(s as StatusFilter)) setFilter(s as StatusFilter)
  }, [])
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

  const selectTab = (key: StatusFilter) => {
    setFilter(key)
    setPage(1)
    setSelected(new Set())
  }

  // タブ: 主要状態は常設、取消/期限切れは存在する時だけ出す
  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'すべて', count: stats.data?.total ?? 0 },
    { key: 'draft', label: '下書き', count: stats.data?.draft ?? 0 },
    { key: 'sent', label: '確認待ち', count: stats.data?.sentOnly ?? 0 },
    { key: 'signing', label: '署名中', count: stats.data?.signing ?? 0 },
    { key: 'completed', label: '締結済み', count: stats.data?.completed ?? 0 },
    ...(stats.data && stats.data.cancelled > 0
      ? [{ key: 'cancelled' as StatusFilter, label: '取消', count: stats.data.cancelled }]
      : []),
    ...(stats.data && stats.data.expired > 0
      ? [{ key: 'expired' as StatusFilter, label: '期限切れ', count: stats.data.expired }]
      : []),
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">書類</h1>
        <Link href="/contracts/new">
          <Button size="sm">新しく送信する</Button>
        </Link>
      </div>

      {/* Toolbar: 状態タブ + 検索 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-lg bg-[var(--slate-bg)] p-[3px]">
          {tabs.map((t) => {
            const on = filter === t.key
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${
                  on
                    ? 'bg-white font-semibold text-foreground shadow-sm'
                    : 'font-medium text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                <span className={`tnum ml-1.5 text-[10.5px] ${on ? 'text-[var(--brand-ink)]' : 'text-[var(--faint)]'}`}>
                  {t.count}
                </span>
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size}件選択中</span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                一括削除
              </Button>
            </>
          )}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <Input
              placeholder="書類を検索"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-[200px] text-[13px]"
            />
            {search && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
                className="h-8 text-xs text-muted-foreground"
              >
                クリア
              </Button>
            )}
          </form>
        </div>
      </div>

      {/* Table */}
      {contracts.isLoading ? (
        <div className="overflow-hidden rounded-lg border bg-card p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
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
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FAFBFC] hover:bg-[#FAFBFC]">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === (contracts.data?.items.length ?? 0) && selected.size > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-[var(--line-strong)] accent-[var(--primary)]"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">書類名</TableHead>
                  <TableHead className="w-[130px] text-[11px] font-semibold text-muted-foreground">署名</TableHead>
                  <TableHead className="w-[100px] text-[11px] font-semibold text-muted-foreground">状態</TableHead>
                  <TableHead className="w-[110px] text-[11px] font-semibold text-muted-foreground">更新</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.data?.items.map((c) => {
                  const sc = c.signerCount
                  const danger = c.status === 'expired' || c.status === 'cancelled'
                  return (
                    <TableRow key={c.id} className="group h-12 hover:bg-[#FAFBFC]">
                      <TableCell className="py-0">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-3.5 w-3.5 rounded border-[var(--line-strong)] accent-[var(--primary)]"
                        />
                      </TableCell>
                      <TableCell className="py-0">
                        <Link
                          href={`/contracts/${c.id}`}
                          className="text-[13px] font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {c.title}
                          {c.pdfName && (
                            <span className="ml-2 text-[11px] font-normal text-[var(--faint)]">{c.pdfName}</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="py-0">
                        <SignProgress signed={sc.signed} total={sc.total} danger={danger} />
                      </TableCell>
                      <TableCell className="py-0">
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="py-0 text-[12px] text-muted-foreground">
                        <UpdatedAt iso={c.updatedAt} />
                      </TableCell>
                      <TableCell className="py-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              ⋯
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
              <p className="tnum text-xs text-muted-foreground">
                {contracts.data.total}件中 {(page - 1) * 20 + 1}–{Math.min(page * 20, contracts.data.total)}件
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
                        <span className="px-1 text-xs text-muted-foreground">…</span>
                      )}
                      <Button
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        className="tnum h-8 w-8 p-0 text-xs"
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
              （下書き以外は記録保持のため削除されません）
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDelete.mutate({ ids: Array.from(selected) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? '削除中…' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
