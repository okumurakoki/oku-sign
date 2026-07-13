'use client'

import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: '下書き', className: 'bg-gray-100 text-gray-600' },
  sent: { label: '確認待ち', className: 'bg-blue-50 text-blue-700' },
  signing: { label: '署名中', className: 'bg-amber-50 text-amber-700' },
  completed: { label: '締結済み', className: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: '却下', className: 'bg-red-50 text-red-600' },
  expired: { label: '期限切れ', className: 'bg-red-50 text-red-600' },
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
}

export default function DashboardPage() {
  const stats = trpc.dashboard.getStats.useQuery()
  const recent = trpc.dashboard.getRecentContracts.useQuery()
  const activity = trpc.dashboard.getRecentActivity.useQuery()
  const session = trpc.auth.getSession.useQuery()

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {session.data ? `${session.data.name} さん` : 'ダッシュボード'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            書類の送信状況と最近のアクティビティ
          </p>
        </div>
        <Link href="/contracts/new">
          <Button size="sm">新しく送信する</Button>
        </Link>
      </div>

      {/* KPI Grid - 5 columns for wider layout */}
      {stats.isLoading ? (
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-7 w-10" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: '全書類', value: stats.data?.total ?? 0, color: '', href: '/contracts' },
            { label: '確認待ち', value: stats.data?.sent ?? 0, color: 'text-blue-700', href: '/contracts?status=sent' },
            { label: '下書き', value: stats.data?.draft ?? 0, color: '', href: '/contracts?status=draft' },
            { label: '締結済み', value: stats.data?.completed ?? 0, color: 'text-emerald-700', href: '/contracts?status=completed' },
            { label: '今月の送信', value: stats.data?.thisMonth ?? 0, color: 'text-primary', href: '/contracts' },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <div className="rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors">
                <p className="text-[11px] text-muted-foreground mb-1">{item.label}</p>
                <p className={`text-2xl font-semibold font-mono ${item.color}`}>{item.value}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 3-Column Layout */}
      <div className="grid grid-cols-12 gap-5">
        {/* Recent Contracts - 5 cols */}
        <div className="col-span-5">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <p className="text-sm font-medium">最近の書類</p>
              <Link href="/contracts" className="text-xs text-primary hover:text-primary/80 transition-colors">
                すべて表示
              </Link>
            </div>
            {recent.isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recent.data?.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground mb-3">まだ書類がありません</p>
                <Link href="/contracts/new">
                  <Button variant="outline" size="sm">最初の書類を送信する</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {recent.data?.map((c) => {
                  const config = statusConfig[c.status]
                  return (
                    <Link
                      key={c.id}
                      href={`/contracts/${c.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        {c.pdfName && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{c.pdfName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.signerCount.total > 0 && (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            <span className={c.signerCount.signed === c.signerCount.total ? 'text-emerald-600' : ''}>
                              {c.signerCount.signed}
                            </span>
                            /{c.signerCount.total}
                          </span>
                        )}
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${config.className}`}>
                          {config.label}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed - 4 cols */}
        <div className="col-span-4">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <p className="text-sm font-medium">アクティビティ</p>
              <Link href="/audit" className="text-xs text-primary hover:text-primary/80 transition-colors">
                すべて表示
              </Link>
            </div>
            {activity.isLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : activity.data?.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">アクティビティはありません</p>
              </div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {activity.data?.map((log) => {
                  const label = actionLabels[log.action] ?? log.action
                  return (
                    <div key={log.id} className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          log.action === 'completed' ? 'bg-emerald-500' :
                          log.action === 'declined' ? 'bg-red-500' :
                          log.action === 'signed' ? 'bg-blue-500' :
                          log.action === 'sent' ? 'bg-amber-500' :
                          'bg-gray-300'
                        }`} />
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${
                          log.action === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                          log.action === 'declined' ? 'bg-red-50 text-red-600' :
                          log.action === 'signed' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {label}
                        </span>
                      </div>
                      <p className="text-xs text-foreground mt-1 truncate">{log.detail}</p>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Stats - 3 cols */}
        <div className="col-span-3 space-y-4">
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">ステータス概要</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: '下書き', value: stats.data?.draft ?? 0, color: '' },
                { label: '確認待ち', value: stats.data?.sent ?? 0, color: 'text-blue-700' },
                { label: '締結済み', value: stats.data?.completed ?? 0, color: 'text-emerald-700' },
                { label: 'キャンセル', value: stats.data?.cancelled ?? 0, color: 'text-red-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                  <span className={`text-sm font-mono ${item.color}`}>{item.value}</span>
                </div>
              ))}
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">登録連絡先</span>
                <span className="text-sm font-mono">{stats.data?.contacts ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">クイックアクション</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <Link href="/contracts/new" className="block">
                <div className="rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors">
                  <p className="text-sm font-medium">書類を送信する</p>
                  <p className="text-[11px] text-muted-foreground">新しい書類を作成して署名を依頼</p>
                </div>
              </Link>
              <Link href="/templates" className="block">
                <div className="rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors">
                  <p className="text-sm font-medium">テンプレートから作成</p>
                  <p className="text-[11px] text-muted-foreground">定型書類のテンプレートを使用</p>
                </div>
              </Link>
              <Link href="/contacts" className="block">
                <div className="rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors">
                  <p className="text-sm font-medium">連絡先を管理</p>
                  <p className="text-[11px] text-muted-foreground">アドレス帳の整理と追加</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
