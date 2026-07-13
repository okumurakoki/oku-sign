'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc'

const mainNav = [
  { href: '/dashboard', label: 'ダッシュボード' },
  { href: '/contracts', label: '書類管理' },
  { href: '/templates', label: 'テンプレート' },
  { href: '/contacts', label: 'アドレス帳' },
]

const subNav = [
  { href: '/audit', label: '操作履歴' },
  { href: '/settings', label: '設定' },
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
    <aside className="w-[220px] border-r border-sidebar-border bg-sidebar flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">oku</span>
          </div>
          <span className="text-base font-semibold text-sidebar-foreground tracking-tight">
            okuサイン
          </span>
        </Link>
      </div>

      {/* Send CTA */}
      <div className="px-3 pt-4 pb-2">
        <Link href="/contracts/new">
          <button className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            新しく送信する
          </button>
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 pt-2 space-y-0.5">
        {mainNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center justify-between h-9 px-3 rounded-md text-sm transition-colors',
              isActive(item.href)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
            )}
          >
            <span>{item.label}</span>
            {/* Badge counts */}
            {item.href === '/contracts' && stats.data && stats.data.sent > 0 && (
              <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {stats.data.sent}
              </span>
            )}
          </Link>
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-medium">
            管理
          </p>
        </div>
        {subNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center h-9 px-3 rounded-md text-sm transition-colors',
              isActive(item.href)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/40 font-mono">okuサイン v0.1.0</p>
      </div>
    </aside>
  )
}
