'use client'

import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function Header() {
  const router = useRouter()
  const session = trpc.auth.getSession.useQuery()

  const handleLogout = async () => {
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('[header] signOut failed:', error.message)
    }
    // 失敗してもローカルセッションは破棄されるためログインへ遷移
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="h-12 border-b border-border bg-card flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        {session.data && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 text-sm outline-none">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {session.data.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm text-foreground">{session.data.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{session.data.name}</p>
                <p className="text-xs text-muted-foreground">{session.data.email}</p>
                {session.data.companyName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{session.data.companyName}</p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href="/settings" className="cursor-pointer">設定</a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-muted-foreground text-xs cursor-pointer"
                onSelect={handleLogout}
              >
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
