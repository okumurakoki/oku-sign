'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  sent: { label: '確認待ち', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  signing: { label: '署名中', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: '締結済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '却下', className: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: '期限切れ', className: 'bg-red-50 text-red-600 border-red-200' },
  pending: { label: '未送信', className: 'bg-gray-100 text-gray-500 border-gray-200' },
  notified: { label: '送信済み', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  viewed: { label: '閲覧済み', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  signed: { label: '署名済み', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  declined: { label: '辞退', className: 'bg-red-50 text-red-600 border-red-200' },
}

const actionLabels: Record<string, string> = {
  created: '作成',
  sent: '送信',
  signed: '署名',
  declined: '辞退',
  cancelled: '取消',
  completed: '締結',
  reminder_sent: 'リマインダー',
  signer_added: '署名者追加',
  signer_removed: '署名者削除',
  viewed: '閲覧',
  notified: '通知',
  expired: '期限切れ',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const utils = trpc.useUtils()
  const [showAddSigner, setShowAddSigner] = useState(false)
  const [newSignerName, setNewSignerName] = useState('')
  const [newSignerEmail, setNewSignerEmail] = useState('')
  const [newSignerAccessCode, setNewSignerAccessCode] = useState('')

  const contract = trpc.contracts.getById.useQuery({ id })

  const sendContract = trpc.contracts.send.useMutation({
    onSuccess: () => utils.contracts.getById.invalidate({ id }),
  })

  const cancelContract = trpc.contracts.cancel.useMutation({
    onSuccess: () => utils.contracts.getById.invalidate({ id }),
  })

  const deleteContract = trpc.contracts.delete.useMutation({
    onSuccess: () => router.push('/contracts'),
  })

  const sendReminder = trpc.contracts.sendReminder.useMutation({
    onSuccess: () => utils.contracts.getById.invalidate({ id }),
  })

  const addSigner = trpc.contracts.addSigner.useMutation({
    onSuccess: () => {
      utils.contracts.getById.invalidate({ id })
      setShowAddSigner(false)
      setNewSignerName('')
      setNewSignerEmail('')
      setNewSignerAccessCode('')
    },
  })

  const removeSigner = trpc.contracts.removeSigner.useMutation({
    onSuccess: () => utils.contracts.getById.invalidate({ id }),
  })

  if (contract.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2"><Skeleton className="h-64 w-full" /></div>
          <div><Skeleton className="h-64 w-full" /></div>
        </div>
      </div>
    )
  }

  if (!contract.data) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        書類が見つかりません
      </div>
    )
  }

  const c = contract.data
  const config = statusConfig[c.status]
  const signedCount = c.signers.filter((s) => s.status === 'signed').length
  const totalSigners = c.signers.length
  const isDraft = c.status === 'draft'

  return (
    <div className="space-y-5">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/contracts" className="hover:text-foreground transition-colors">書類管理</Link>
            <span>/</span>
            <span className="text-foreground">{c.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{c.title}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] border ${config.className}`}>
              {config.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              {c.pdfName && (
                <Link href={`/contracts/${id}/edit`}>
                  <Button variant="outline" size="sm">署名欄を配置</Button>
                </Link>
              )}
              <Button
                size="sm"
                onClick={() => sendContract.mutate({ id })}
                disabled={sendContract.isPending || c.signers.length === 0}
              >
                {sendContract.isPending ? '送信中...' : '署名依頼を送信'}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    削除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>書類を削除しますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      この操作は取り消せません。書類と関連する全てのデータが削除されます。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteContract.mutate({ id })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      削除する
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {(c.status === 'sent' || c.status === 'signing') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">操作</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => cancelContract.mutate({ id })}
                  className="text-destructive focus:text-destructive"
                >
                  送信を取り消す
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {c.status === 'completed' && (c.signedPdfUrl || c.pdfSignedUrl) && (
            <a href={c.signedPdfUrl ?? c.pdfSignedUrl ?? undefined} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                {c.signedPdfUrl ? '署名済みPDFをダウンロード' : 'PDFをダウンロード'}
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Draft warning */}
      {isDraft && c.signers.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            署名者が設定されていません。署名者を追加してから署名依頼を送信してください。
          </p>
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-3 gap-5">
        {/* Main Column (2/3) */}
        <div className="col-span-2 space-y-5">
          {/* Signers */}
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">署名者</p>
                {totalSigners > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(signedCount / totalSigners) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{signedCount}/{totalSigners}</span>
                  </div>
                )}
              </div>
              {isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowAddSigner(true)}
                >
                  署名者を追加
                </Button>
              )}
            </div>

            {c.signers.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground mb-3">署名者が設定されていません</p>
                {isDraft && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setShowAddSigner(true)}
                  >
                    署名者を追加
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] font-normal text-muted-foreground w-12">順番</TableHead>
                    <TableHead className="text-[11px] font-normal text-muted-foreground">氏名</TableHead>
                    <TableHead className="text-[11px] font-normal text-muted-foreground">メールアドレス</TableHead>
                    <TableHead className="text-[11px] font-normal text-muted-foreground w-20">ステータス</TableHead>
                    <TableHead className="text-[11px] font-normal text-muted-foreground w-40">日時</TableHead>
                    <TableHead className="text-[11px] font-normal text-muted-foreground w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.signers.map((s) => {
                    const sc = statusConfig[s.status]
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium">
                            {s.signOrder}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${sc.className}`}>
                            {sc.label}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {s.signedAt
                            ? new Date(s.signedAt).toLocaleString('ja-JP')
                            : s.viewedAt
                              ? `閲覧: ${new Date(s.viewedAt).toLocaleString('ja-JP')}`
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isDraft && (
                              <button
                                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                                onClick={() => removeSigner.mutate({ signerId: s.id, contractId: c.id })}
                              >
                                削除
                              </button>
                            )}
                            {(c.status === 'sent' || c.status === 'signing') && (s.status === 'pending' || s.status === 'viewed') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2"
                                onClick={() => sendReminder.mutate({ contractId: c.id, signerId: s.id })}
                                disabled={sendReminder.isPending}
                              >
                                リマインダー送信
                              </Button>
                            )}
                            {s.status === 'declined' && s.declineReason && (
                              <span className="text-[11px] text-red-500 truncate max-w-[100px] block" title={s.declineReason}>
                                理由: {s.declineReason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">タイムライン ({c.auditLogs.length})</p>
            </div>
            {c.auditLogs.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">履歴がありません</p>
              </div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {c.auditLogs.map((log) => {
                  const actionLabel = actionLabels[log.action] ?? log.action
                  return (
                    <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="shrink-0 mt-1.5">
                        <div className={`w-2 h-2 rounded-full ${
                          log.action === 'completed' ? 'bg-emerald-500' :
                          log.action === 'declined' ? 'bg-red-500' :
                          log.action === 'signed' ? 'bg-blue-500' :
                          log.action === 'sent' ? 'bg-amber-500' :
                          'bg-gray-300'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            log.action === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            log.action === 'declined' ? 'bg-red-50 text-red-600' :
                            log.action === 'signed' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {actionLabel}
                          </span>
                          <span className="text-sm">{log.detail}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString('ja-JP')}
                          </span>
                          {log.actorEmail && (
                            <span className="text-[10px] text-muted-foreground">{log.actorEmail}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          {/* Document Info */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">書類情報</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">書類ID</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{c.id}</p>
              </div>
              <Separator />
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">添付ファイル</p>
                {c.pdfName ? (
                  <div>
                    <p className="text-sm">{c.pdfName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {c.pdfSize && (
                        <span className="text-[11px] text-muted-foreground">{formatBytes(c.pdfSize)}</span>
                      )}
                      {c.pdfSignedUrl && (
                        <a
                          href={c.pdfSignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                        >
                          表示
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">未アップロード</p>
                )}
              </div>
              {c.message && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">メッセージ</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{c.message}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">日時情報</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">作成日</span>
                <span className="font-mono text-xs">{new Date(c.createdAt).toLocaleString('ja-JP')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">最終更新</span>
                <span className="font-mono text-xs">{new Date(c.updatedAt).toLocaleString('ja-JP')}</span>
              </div>
              {c.sentAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">送信日時</span>
                  <span className="font-mono text-xs">{new Date(c.sentAt).toLocaleString('ja-JP')}</span>
                </div>
              )}
              {c.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">締結日時</span>
                  <span className="font-mono text-xs text-emerald-700">{new Date(c.completedAt).toLocaleString('ja-JP')}</span>
                </div>
              )}
              {c.expiresAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">署名期限</span>
                  <span className="font-mono text-xs text-amber-600">{new Date(c.expiresAt).toLocaleDateString('ja-JP')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Signing Progress */}
          {totalSigners > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="px-5 py-3 border-b">
                <p className="text-sm font-medium">署名進捗</p>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${(signedCount / totalSigners) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono font-medium">
                    {signedCount}/{totalSigners}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {c.signers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className={
                        s.status === 'signed' ? 'text-emerald-600' :
                        s.status === 'declined' ? 'text-red-500' :
                        s.status === 'viewed' ? 'text-sky-600' :
                        'text-muted-foreground'
                      }>
                        {statusConfig[s.status]?.label ?? s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Signer Dialog */}
      <Dialog open={showAddSigner} onOpenChange={setShowAddSigner}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>署名者を追加</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              addSigner.mutate({
                contractId: id,
                name: newSignerName,
                email: newSignerEmail,
                signOrder: totalSigners + 1,
              })
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">氏名</Label>
                <Input
                  value={newSignerName}
                  onChange={(e) => setNewSignerName(e.target.value)}
                  placeholder="山田 太郎"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">メールアドレス</Label>
                <Input
                  type="email"
                  value={newSignerEmail}
                  onChange={(e) => setNewSignerEmail(e.target.value)}
                  placeholder="taro@example.com"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">アクセスコード（任意）</Label>
              <Input
                value={newSignerAccessCode}
                onChange={(e) => setNewSignerAccessCode(e.target.value)}
                placeholder="設定すると署名時にコード入力が必要になります"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowAddSigner(false)}>
                キャンセル
              </Button>
              <Button type="submit" disabled={!newSignerName || !newSignerEmail || addSigner.isPending}>
                {addSigner.isPending ? '追加中...' : '追加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
