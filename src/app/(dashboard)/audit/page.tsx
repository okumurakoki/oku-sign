'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// 意味色に統一: 進行=青 / 待ち=琥珀 / 完了=緑 / 中立=スレート / 異常=赤（他画面のStatusBadgeと同じ体系）
const actionConfig: Record<string, { label: string; className: string }> = {
  created: { label: '作成', className: 'text-[var(--slate)] bg-[var(--slate-bg)]' },
  sent: { label: '送信', className: 'text-[var(--wait)] bg-[var(--wait-bg)]' },
  signed: { label: '署名', className: 'text-[var(--brand-ink)] bg-[var(--accent)]' },
  declined: { label: '辞退', className: 'text-[var(--alert)] bg-[var(--alert-bg)]' },
  cancelled: { label: '取消', className: 'text-[var(--slate)] bg-[var(--slate-bg)]' },
  completed: { label: '締結', className: 'text-[var(--ok)] bg-[var(--ok-bg)]' },
  reminder_sent: { label: 'リマインダー', className: 'text-[var(--wait)] bg-[var(--wait-bg)]' },
  signer_added: { label: '署名者追加', className: 'text-[var(--brand-ink)] bg-[var(--accent)]' },
  signer_removed: { label: '署名者削除', className: 'text-[var(--slate)] bg-[var(--slate-bg)]' },
  viewed: { label: '閲覧', className: 'text-[var(--brand-ink)] bg-[var(--accent)]' },
  expired: { label: '期限切れ', className: 'text-[var(--alert)] bg-[var(--alert-bg)]' },
}

export default function AuditPage() {
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const logs = trpc.audit.list.useQuery({
    limit: 100,
  })

  const filteredLogs = logs.data?.filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        log.detail?.toLowerCase().includes(s) ||
        log.actorEmail?.toLowerCase().includes(s) ||
        log.action.toLowerCase().includes(s)
      )
    }
    return true
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h1 className="text-lg font-bold tracking-tight">操作履歴</h1>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-8 w-[160px] text-[13px]">
            <SelectValue placeholder="アクションで絞込" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全てのアクション</SelectItem>
            <SelectItem value="created">作成</SelectItem>
            <SelectItem value="sent">送信</SelectItem>
            <SelectItem value="signed">署名</SelectItem>
            <SelectItem value="declined">辞退</SelectItem>
            <SelectItem value="completed">締結</SelectItem>
            <SelectItem value="cancelled">取消</SelectItem>
            <SelectItem value="viewed">閲覧</SelectItem>
            <SelectItem value="reminder_sent">リマインダー</SelectItem>
          </SelectContent>
        </Select>
        <form onSubmit={handleSearch} className="ml-auto flex items-center gap-2">
          <Input
            placeholder="操作内容・操作者で検索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-[220px] text-[13px]"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setSearchInput('') }}
              className="h-8 text-xs text-muted-foreground"
            >
              クリア
            </Button>
          )}
        </form>
      </div>

      {/* Table */}
      {logs.isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : !filteredLogs || filteredLogs.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {search || actionFilter !== 'all' ? '条件に一致する操作履歴はありません' : '操作履歴がありません'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#FAFBFC] hover:bg-[#FAFBFC]">
                <TableHead className="w-40 text-[11px] font-semibold text-muted-foreground">日時</TableHead>
                <TableHead className="w-28 text-[11px] font-semibold text-muted-foreground">アクション</TableHead>
                <TableHead className="text-[11px] font-semibold text-muted-foreground">操作内容</TableHead>
                <TableHead className="w-48 text-[11px] font-semibold text-muted-foreground">操作者</TableHead>
                <TableHead className="w-32 text-[11px] font-semibold text-muted-foreground">IPアドレス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => {
                const config = actionConfig[log.action] ?? { label: log.action, className: 'text-[var(--slate)] bg-[var(--slate-bg)]' }
                return (
                  <TableRow key={log.id} className="h-11 hover:bg-[#FAFBFC]">
                    <TableCell className="tnum py-0 text-[12px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </TableCell>
                    <TableCell className="py-0">
                      <span className={`inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${config.className}`}>
                        {config.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-0 text-[13px]">{log.detail}</TableCell>
                    <TableCell className="max-w-[180px] truncate py-0 text-[12.5px] text-muted-foreground">
                      {log.actorEmail ?? <span className="text-[var(--faint)]">—</span>}
                    </TableCell>
                    <TableCell className="tnum py-0 text-[11.5px] text-[var(--faint)]">
                      {log.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary */}
      {filteredLogs && filteredLogs.length > 0 && (
        <p className="tnum text-xs text-muted-foreground">
          {filteredLogs.length}件の操作履歴を表示中
        </p>
      )}
    </div>
  )
}
