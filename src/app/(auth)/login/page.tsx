'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CALLBACK_ERRORS: Record<string, string> = {
  callback: '認証処理に失敗しました。もう一度ログインしてください',
  expired: '確認リンクの有効期限が切れています。再度ログインまたは登録してください',
  missing_params: '認証リンクが不正です。もう一度お試しください',
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackError = searchParams.get('error')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    callbackError ? (CALLBACK_ERRORS[callbackError] ?? CALLBACK_ERRORS.callback) : null,
  )
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'メールアドレスまたはパスワードが正しくありません'
          : error.message === 'Email not confirmed'
            ? 'メールアドレスが未確認です。確認メールのリンクを開いてください'
            : 'ログインに失敗しました。時間をおいて再度お試しください',
      )
      setLoading(false)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#3d4f5f] flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-sm font-bold">oku</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">okuサイン</h1>
          <p className="text-sm text-gray-500 mt-1">アカウントにログイン</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-lg border p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">メールアドレス</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">パスワード</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-[#3d4f5f] font-medium hover:underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
