'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge, SignProgress } from '@/lib/contract-status'

const actionLabels: Record<string, string> = {
  created: '作成', sent: '送信', signed: '署名', declined: '辞退',
  cancelled: '取消', completed: '締結', reminder_sent: 'リマインダー',
  signer_added: '署名者追加', signer_removed: '署名者削除', viewed: '閲覧', notified: '通知', expired: '期限切れ',
}
const actionDot: Record<string, string> = {
  completed: 'var(--ok)', declined: 'var(--alert)', signed: 'var(--primary)',
  sent: 'var(--wait)', viewed: '#38BDF8',
}

function MonthDay({ iso }: { iso: string | Date }) {
  const d = new Date(iso)
  return <span className="tnum">{`${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`}</span>
}

export default function DashboardPage() {
  const stats = trpc.dashboard.getStats.useQuery()
  const recent = trpc.dashboard.getRecentContracts.useQuery()
  const activity = trpc.dashboard.getRecentActivity.useQuery()
  const session = trpc.auth.getSession.useQuery()
  const billing = trpc.billing.getSubscription.useQuery()

  // 要対応 = 相手の署名・確認を待っている書類（送信側として動きを見る対象）
  const attention = (recent.data ?? []).filter((c) => c.status === 'sent' || c.status === 'signing').slice(0, 5)

  const strip: { label: string; value: number; href: string; hot?: boolean }[] = [
    { label: '確認待ち', value: stats.data?.sentOnly ?? 0, href: '/contracts?status=sent', hot: (stats.data?.sentOnly ?? 0) > 0 },
    { label: '署名中', value: stats.data?.signing ?? 0, href: '/contracts?status=signing' },
    { label: '締結済み', value: stats.data?.completed ?? 0, href: '/contracts?status=completed' },
    { label: '今月作成', value: stats.data?.thisMonth ?? 0, href: '/contracts' },
    { label: '書類 総数', value: stats.data?.total ?? 0, href: '/contracts' },
    { label: '連絡先', value: stats.data?.contacts ?? 0, href: '/contacts' },
  ]

  return (
    <div className="space-y-4">
      {/* サブスク未加入の登録誘導 */}
      {billing.data && !billing.data.active && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-accent px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">パートナープランに登録して書類を送信しましょう</p>
            <p className="mt-0.5 text-xs text-muted-foreground">月額2,980円・送信無制限。登録すると電子契約の送信が可能になります。</p>
          </div>
          <Link href="/settings/billing"><Button size="sm" className="shrink-0">プランに登録</Button></Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">
          {session.data ? `こんにちは、${session.data.name} さん` : 'ホーム'}
        </h1>
        <Link href="/contracts/new">
          <Button size="sm">新しく送信する</Button>
        </Link>
      </div>

      {/* サマリー帯: 罫線区切りの横並び */}
      {stats.isLoading ? (
        <div className="rounded-lg border bg-card p-4"><Skeleton className="h-10 w-full" /></div>
      ) : (
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card sm:grid-cols-6">
          {strip.map((s, i) => (
            <Link
              key={s.label}
              href={s.href}
              className={`px-4 py-3 transition-colors hover:bg-[#FAFBFC] ${i > 0 ? 'border-l border-[var(--line-soft)]' : ''}`}
            >
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className={`tnum mt-0.5 text-[19px] font-bold leading-none ${s.hot ? 'text-[var(--wait)]' : ''}`}>
                {s.value}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* 要対応: 相手待ちの書類 */}
      {attention.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex h-10 items-center border-b px-4">
            <p className="text-[13px] font-bold">相手の対応を待っている書類</p>
            <Link href="/contracts?status=sent" className="ml-auto text-xs font-medium text-primary hover:underline">
              すべて見る
            </Link>
          </div>
          {attention.map((c) => (
            <div key={c.id} className="flex h-12 items-center gap-4 border-b border-[var(--line-soft)] px-4 last:border-0">
              <Link href={`/contracts/${c.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-primary">
                {c.title}
              </Link>
              <SignProgress signed={c.signerCount.signed} total={c.signerCount.total} />
              <StatusBadge status={c.status} />
              <Link href={`/contracts/${c.id}`}>
                <Button variant="outline" size="sm" className="h-7 text-xs">確認する</Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* 最近の書類（メイン） + 最近の動き（従） */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-10 items-center border-b px-4">
              <p className="text-[13px] font-bold">最近の書類</p>
              <Link href="/contracts" className="ml-auto text-xs font-medium text-primary hover:underline">すべて見る</Link>
            </div>
            {recent.isLoading ? (
              <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : recent.data?.length === 0 ? (
              <div className="py-16 text-center">
                <p className="mb-4 text-sm text-muted-foreground">まだ書類がありません</p>
                <Link href="/contracts/new"><Button variant="outline" size="sm">最初の書類を送信する</Button></Link>
              </div>
            ) : (
              <div>
                {recent.data?.map((c) => {
                  const danger = c.status === 'expired' || c.status === 'cancelled'
                  return (
                    <Link
                      key={c.id}
                      href={`/contracts/${c.id}`}
                      className="flex h-12 items-center gap-4 border-b border-[var(--line-soft)] px-4 transition-colors last:border-0 hover:bg-[#FAFBFC]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {c.title}
                        {c.pdfName && <span className="ml-2 text-[11px] font-normal text-[var(--faint)]">{c.pdfName}</span>}
                      </span>
                      <span className="hidden sm:inline-flex">
                        <SignProgress signed={c.signerCount.signed} total={c.signerCount.total} danger={danger} />
                      </span>
                      <StatusBadge status={c.status} />
                      <span className="hidden w-10 shrink-0 text-right text-[11.5px] text-muted-foreground md:inline">
                        <MonthDay iso={c.updatedAt} />
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex h-10 items-center border-b px-4">
              <p className="text-[13px] font-bold">最近の動き</p>
              <Link href="/audit" className="ml-auto text-xs font-medium text-primary hover:underline">履歴</Link>
            </div>
            {activity.isLoading ? (
              <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : activity.data?.length === 0 ? (
              <div className="py-16 text-center"><p className="text-sm text-muted-foreground">まだ動きはありません</p></div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto py-1">
                {activity.data?.slice(0, 12).map((log) => (
                  <div key={log.id} className="flex gap-3 px-4 py-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: actionDot[log.action] ?? 'var(--line-strong)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs leading-snug">
                        <span className="font-semibold">{actionLabels[log.action] ?? log.action}</span>{' '}
                        <span className="text-muted-foreground">{log.detail}</span>
                      </p>
                      <span className="tnum text-[10px] text-[var(--faint)]">
                        {new Date(log.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
