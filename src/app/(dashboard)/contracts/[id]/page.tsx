'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/lib/contract-status'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
const actionDot: Record<string, string> = {
  completed: 'var(--ok)', declined: 'var(--alert)', signed: 'var(--primary)',
  sent: 'var(--wait)', viewed: '#38BDF8',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MetaRow({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`grid grid-cols-[96px_1fr] text-[12.5px] ${last ? '' : 'border-b border-[var(--line-soft)]'}`}>
      <dt className="px-4 py-2.5 text-muted-foreground">{label}</dt>
      <dd className="px-4 py-2.5 font-medium">{children}</dd>
    </div>
  )
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

  // 複製して新しい下書きを作成 → その下書きの詳細へ遷移（取消→複製→修正→再送の動線）
  const duplicateContract = trpc.contracts.duplicate.useMutation({
    onSuccess: (res) => router.push(`/contracts/${res.id}`),
  })

  const sendReminder = trpc.contracts.sendReminder.useMutation({
    onSuccess: () => utils.contracts.getById.invalidate({ id }),
  })

  const regenerateSignedPdf = trpc.contracts.regenerateSignedPdf.useMutation({
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
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2"><Skeleton className="h-64 w-full" /></div>
          <div><Skeleton className="h-64 w-full" /></div>
        </div>
      </div>
    )
  }

  if (!contract.data) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        書類が見つかりません
      </div>
    )
  }

  const c = contract.data
  const signedCount = c.signers.filter((s) => s.status === 'signed').length
  const totalSigners = c.signers.length
  const isDraft = c.status === 'draft'

  return (
    <div className="space-y-4">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/contracts" className="transition-colors hover:text-foreground">書類</Link>
            <span className="text-[var(--faint)]">/</span>
            <span className="truncate">{c.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="truncate text-lg font-bold tracking-tight">{c.title}</h1>
            <StatusBadge status={c.status} className="shrink-0" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
                {sendContract.isPending ? '送信中…' : '署名依頼を送信'}
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
          {c.status === 'completed' && (
            c.signedPdfUrl ? (
              <a href={c.signedPdfUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm">署名済みPDFをダウンロード</Button>
              </a>
            ) : (
              // 未署名の原本を締結版と誤認させないため、原本へのフォールバックはしない
              <Button
                size="sm"
                variant="outline"
                disabled={regenerateSignedPdf.isPending}
                onClick={() => regenerateSignedPdf.mutate({ id })}
              >
                {regenerateSignedPdf.isPending ? '生成中...' : '署名済みPDFを再生成'}
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">操作</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => duplicateContract.mutate({ id })}
                disabled={duplicateContract.isPending}
              >
                {duplicateContract.isPending ? '複製しています…' : '複製して下書きを作成'}
              </DropdownMenuItem>
              {(c.status === 'sent' || c.status === 'signing') && (
                <DropdownMenuItem
                  onClick={() => cancelContract.mutate({ id })}
                  className="text-destructive focus:text-destructive"
                >
                  送信を取り消す
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Draft warning */}
      {isDraft && c.signers.length === 0 && (
        <div className="rounded-lg bg-[var(--wait-bg)] px-4 py-3">
          <p className="text-sm font-medium text-[var(--wait)]">
            署名者が設定されていません。署名者を追加してから署名依頼を送信してください。
          </p>
        </div>
      )}

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main Column (2/3) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Signers */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-10 items-center gap-3 border-b px-4">
              <p className="text-[13px] font-bold">署名者</p>
              {totalSigners > 0 && (
                <span className="tnum text-[11.5px] text-muted-foreground">
                  {signedCount}/{totalSigners} 署名済み
                </span>
              )}
              {isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={() => setShowAddSigner(true)}
                >
                  署名者を追加
                </Button>
              )}
            </div>

            {c.signers.length === 0 ? (
              <div className="py-10 text-center">
                <p className="mb-3 text-sm text-muted-foreground">署名者が設定されていません</p>
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
              <div>
                {c.signers.map((s) => {
                  const done = s.status === 'signed'
                  return (
                    <div
                      key={s.id}
                      className="flex items-start gap-3 border-b border-[var(--line-soft)] px-4 py-3 last:border-0"
                    >
                      <span
                        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          done
                            ? 'bg-[var(--ok)] text-white'
                            : 'border border-[var(--line-strong)] bg-[var(--slate-bg)] text-muted-foreground'
                        }`}
                      >
                        {done ? '✓' : s.signOrder}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold">{s.name}</p>
                        <p className="text-[11px] text-[var(--faint)]">{s.email}</p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <StatusBadge status={s.status} kind="signer" />
                          {s.status === 'declined' && s.declineReason && (
                            <span className="truncate text-[11px] text-[var(--alert)]" title={s.declineReason}>
                              理由: {s.declineReason}
                            </span>
                          )}
                          {isDraft && (
                            <button
                              className="text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                              onClick={() => removeSigner.mutate({ signerId: s.id, contractId: c.id })}
                            >
                              削除
                            </button>
                          )}
                          {(c.status === 'sent' || c.status === 'signing') && (s.status === 'pending' || s.status === 'notified' || s.status === 'viewed') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => sendReminder.mutate({ contractId: c.id, signerId: s.id })}
                              disabled={sendReminder.isPending}
                            >
                              リマインダー送信
                            </Button>
                          )}
                        </div>
                      </div>
                      <span className="tnum shrink-0 whitespace-pre text-right text-[10.5px] leading-tight text-[var(--faint)]">
                        {s.signedAt
                          ? new Date(s.signedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', '\n')
                          : s.viewedAt
                            ? `閲覧\n${new Date(s.viewedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ')}`
                            : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-10 items-center border-b px-4">
              <p className="text-[13px] font-bold">操作履歴</p>
              <span className="tnum ml-2 text-[11.5px] text-muted-foreground">{c.auditLogs.length}件</span>
            </div>
            {c.auditLogs.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">履歴がありません</p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto py-1">
                {c.auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: actionDot[log.action] ?? 'var(--line-strong)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug">
                        <span className="font-semibold">{actionLabels[log.action] ?? log.action}</span>{' '}
                        <span className="text-muted-foreground">{log.detail}</span>
                      </p>
                      <p className="tnum mt-0.5 text-[10.5px] text-[var(--faint)]">
                        {new Date(log.createdAt).toLocaleString('ja-JP')}
                        {log.actorEmail && <span className="ml-2">{log.actorEmail}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-10 items-center border-b px-4">
              <p className="text-[13px] font-bold">書類情報</p>
            </div>
            <dl>
              <MetaRow label="書類ID">
                <span className="break-all font-mono text-[11px] font-normal text-muted-foreground">{c.id}</span>
              </MetaRow>
              <MetaRow label="原本">
                {c.pdfName ? (
                  <span>
                    {c.pdfName}
                    <span className="tnum ml-1.5 text-[11px] font-normal text-[var(--faint)]">
                      {c.pdfSize ? formatBytes(c.pdfSize) : ''}
                    </span>
                    {c.pdfSignedUrl && (
                      <a
                        href={c.pdfSignedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-[11.5px] font-medium text-primary hover:underline"
                      >
                        表示
                      </a>
                    )}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">未アップロード</span>
                )}
              </MetaRow>
              <MetaRow label="作成日">
                <span className="tnum">{new Date(c.createdAt).toLocaleString('ja-JP')}</span>
              </MetaRow>
              <MetaRow label="最終更新" last={!c.sentAt && !c.completedAt && !c.expiresAt && !c.message}>
                <span className="tnum">{new Date(c.updatedAt).toLocaleString('ja-JP')}</span>
              </MetaRow>
              {c.sentAt && (
                <MetaRow label="送信日時" last={!c.completedAt && !c.expiresAt && !c.message}>
                  <span className="tnum">{new Date(c.sentAt).toLocaleString('ja-JP')}</span>
                </MetaRow>
              )}
              {c.completedAt && (
                <MetaRow label="締結日時" last={!c.expiresAt && !c.message}>
                  <span className="tnum font-semibold text-[var(--ok)]">{new Date(c.completedAt).toLocaleString('ja-JP')}</span>
                </MetaRow>
              )}
              {c.expiresAt && (
                <MetaRow label="署名期限" last={!c.message}>
                  <span className="tnum text-[var(--wait)]">{new Date(c.expiresAt).toLocaleDateString('ja-JP')}</span>
                </MetaRow>
              )}
              {c.message && (
                <MetaRow label="メッセージ" last>
                  <span className="whitespace-pre-wrap font-normal leading-relaxed">{c.message}</span>
                </MetaRow>
              )}
            </dl>
          </div>
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
                accessCode: newSignerAccessCode || undefined,
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
                {addSigner.isPending ? '追加中…' : '追加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
