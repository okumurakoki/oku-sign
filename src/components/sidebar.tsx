'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'
import { LayoutGrid, FileText, LayoutTemplate, Users, ScrollText, Settings } from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'ホーム', icon: LayoutGrid },
  { href: '/contracts', label: '書類', icon: FileText },
  { href: '/templates', label: 'テンプレート', icon: LayoutTemplate },
  { href: '/contacts', label: 'アドレス帳', icon: Users },
]

const subNav = [
  { href: '/audit', label: '操作履歴', icon: ScrollText },
  { href: '/settings', label: '設定', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const stats = trpc.dashboard.getStats.useQuery(undefined, {
    staleTime: 30_000,
  })

  const isActive = (href: string) => {
    if (href === '/contracts') {
      return pathname === '/contracts' || (pathname.startsWith('/contracts/') && !pathname.startsWith('/contracts/new'))
    }
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside className="w-[200px] border-r border-sidebar-border bg-sidebar flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-[52px] flex items-center px-4 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-[10px] font-bold">oku</span>
          </div>
          <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
            okuサイン
          </span>
        </Link>
      </div>

      {/* Send CTA */}
      <div className="px-2.5 pt-3 pb-1.5">
        <Link href="/contracts/new">
          <button className="w-full h-[34px] rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:bg-primary/90 transition-colors">
            ＋ 新しく送信
          </button>
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-2.5 pt-1.5 space-y-px">
        {mainNav.map((item) => {
          const on = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-colors',
                on
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground/80 font-medium hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60',
              )}
            >
              <item.icon size={16} strokeWidth={on ? 2.2 : 1.8} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.href === '/contracts' && stats.data && stats.data.sent > 0 && (
                <span className="tnum text-[11px] font-semibold text-muted-foreground">
                  {stats.data.sent}
                </span>
              )}
            </Link>
          )
        })}

        <div className="pt-4 pb-1">
          <p className="px-2.5 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-semibold">
            管理
          </p>
        </div>
        {subNav.map((item) => {
          const on = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] transition-colors',
                on
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                  : 'text-sidebar-foreground/80 font-medium hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/60',
              )}
            >
              <item.icon size={16} strokeWidth={on ? 2.2 : 1.8} className="shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/40 font-mono">okuサイン v0.1.0</p>
      </div>
    </aside>
  )
}
