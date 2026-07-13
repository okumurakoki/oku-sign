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

const actionConfig: Record<string, { label: string; className: string }> = {
  created: { label: '作成', className: 'bg-gray-100 text-gray-600' },
  sent: { label: '送信', className: 'bg-amber-50 text-amber-700' },
  signed: { label: '署名', className: 'bg-blue-50 text-blue-700' },
  declined: { label: '辞退', className: 'bg-red-50 text-red-600' },
  cancelled: { label: '取消', className: 'bg-red-50 text-red-600' },
  completed: { label: '締結', className: 'bg-emerald-50 text-emerald-700' },
  reminder_sent: { label: 'リマインダー', className: 'bg-purple-50 text-purple-700' },
  signer_added: { label: '署名者追加', className: 'bg-sky-50 text-sky-700' },
  signer_removed: { label: '署名者削除', className: 'bg-orange-50 text-orange-700' },
  viewed: { label: '閲覧', className: 'bg-sky-50 text-sky-600' },
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
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">操作履歴</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          書類に関する全ての操作ログを確認できます
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <Input
            placeholder="操作内容・メールアドレスで検索..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-xs h-9 text-sm"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setSearchInput('') }}
              className="text-xs text-muted-foreground"
            >
              クリア
            </Button>
          )}
        </form>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
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
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-normal text-muted-foreground w-44">日時</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground w-24">アクション</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground">操作内容</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground w-48">操作者</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground w-32">IPアドレス</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => {
                const config = actionConfig[log.action] ?? { label: log.action, className: 'bg-gray-100 text-gray-600' }
                return (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('ja-JP')}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${config.className}`}>
                        {config.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{log.detail}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[180px]">
                      {log.actorEmail ?? '-'}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground/60">
                      {log.ipAddress ?? '-'}
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
        <p className="text-xs text-muted-foreground">
          {filteredLogs.length}件の操作履歴を表示中
        </p>
      )}
    </div>
  )
}
