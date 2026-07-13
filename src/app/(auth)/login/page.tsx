'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function LoginPage() {
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

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">メールアドレス</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">パスワード</Label>
            <Input id="password" type="password" />
          </div>
          <Button className="w-full h-10">ログイン</Button>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-xs text-gray-400">
              または
            </span>
          </div>

          <Button variant="outline" className="w-full h-10">
            Googleでログイン
          </Button>
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          Supabase Auth連携後に有効化
        </p>
      </div>
    </div>
  )
}
