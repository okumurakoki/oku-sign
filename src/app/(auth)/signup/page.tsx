'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createSupabaseBrowser()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, company_name: companyName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(
        error.message.includes('already registered')
          ? 'このメールアドレスは既に登録されています'
          : error.message.includes('Password')
            ? 'パスワードは8文字以上で設定してください'
            : '登録に失敗しました。時間をおいて再度お試しください',
      )
      setLoading(false)
      return
    }
    if (data.session) {
      router.replace('/dashboard')
      router.refresh()
      return
    }
    setConfirmationSent(true)
    setLoading(false)
  }

  if (confirmationSent) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-lg border p-6 text-center space-y-3">
            <h1 className="text-base font-semibold text-gray-900">確認メールを送信しました</h1>
            <p className="text-sm text-gray-500">
              {email} 宛に確認メールをお送りしました。メール内のリンクを開くと登録が完了します。
            </p>
            <Link href="/login" className="inline-block text-sm text-[#3d4f5f] font-medium hover:underline">
              ログイン画面へ
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg bg-[#3d4f5f] flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-sm font-bold">oku</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900">okuサイン</h1>
          <p className="text-sm text-gray-500 mt-1">新規アカウント登録</p>
        </div>

        <form onSubmit={handleSignup} className="bg-white rounded-lg border p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">お名前</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              autoComplete="name"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company" className="text-xs">会社名（任意）</Label>
            <Input
              id="company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="株式会社サンプル"
              autoComplete="organization"
            />
          </div>
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
            <Label htmlFor="password" className="text-xs">パスワード（8文字以上）</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? '登録中...' : '登録する'}
          </Button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          既にアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-[#3d4f5f] font-medium hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
