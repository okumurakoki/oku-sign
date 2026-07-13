'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  const utils = trpc.useUtils()
  const profile = trpc.auth.getProfile.useQuery()
  const billing = trpc.billing.getSubscription.useQuery()
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.getProfile.invalidate()
      utils.auth.getSession.invalidate()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name)
      setCompanyName(profile.data.companyName ?? '')
    }
  }, [profile.data])

  const handleSave = () => {
    updateProfile.mutate({
      name: name || undefined,
      companyName: companyName || undefined,
    })
  }

  const hasChanges = profile.data && (
    name !== profile.data.name ||
    companyName !== (profile.data.companyName ?? '')
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">設定</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          アカウントとサービスの各種設定を管理します
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Settings Content */}
        <div className="col-span-9">
          <Tabs defaultValue="profile">
            <TabsList className="h-9">
              <TabsTrigger value="profile" className="text-xs">プロフィール</TabsTrigger>
              <TabsTrigger value="account" className="text-xs">アカウント</TabsTrigger>
              <TabsTrigger value="notification" className="text-xs">通知</TabsTrigger>
              <TabsTrigger value="security" className="text-xs">セキュリティ</TabsTrigger>
            </TabsList>

            {/* Profile */}
            <TabsContent value="profile" className="mt-4">
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4 border-b">
                  <p className="text-sm font-medium">プロフィール情報</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    署名依頼メールに表示される送信者情報です
                  </p>
                </div>
                <div className="px-6 py-5 space-y-5">
                  {profile.isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-9 w-full max-w-sm" />
                      <Skeleton className="h-9 w-full max-w-sm" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4 max-w-lg">
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-xs">氏名</Label>
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="山田 太郎"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="company" className="text-xs">会社名（任意）</Label>
                          <Input
                            id="company"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="株式会社サンプル"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        署名依頼メールの送信者名に表示されます
                      </p>
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={!hasChanges || updateProfile.isPending}
                        >
                          {updateProfile.isPending ? '保存中...' : '保存'}
                        </Button>
                        {saved && (
                          <span className="text-xs text-emerald-600">保存しました</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Account */}
            <TabsContent value="account" className="mt-4">
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4 border-b">
                  <p className="text-sm font-medium">アカウント情報</p>
                </div>
                <div className="px-6 py-5 space-y-4">
                  {profile.isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-64" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                        <Label className="text-xs text-muted-foreground">メールアドレス</Label>
                        <p className="text-sm font-mono">{profile.data?.email}</p>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                        <Label className="text-xs text-muted-foreground">ユーザーID</Label>
                        <p className="text-sm font-mono text-muted-foreground">{profile.data?.id}</p>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                        <Label className="text-xs text-muted-foreground">ロール</Label>
                        <p className="text-sm">{profile.data?.role === 'admin' ? '管理者' : 'メンバー'}</p>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-[140px_1fr] gap-2 items-baseline">
                        <Label className="text-xs text-muted-foreground">登録日</Label>
                        <p className="text-sm font-mono">
                          {profile.data?.createdAt
                            ? new Date(profile.data.createdAt).toLocaleDateString('ja-JP')
                            : '-'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-lg border border-red-200 bg-card mt-4">
                <div className="px-6 py-4 border-b border-red-200">
                  <p className="text-sm font-medium text-red-600">注意エリア</p>
                </div>
                <div className="px-6 py-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">アカウントの削除</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        アカウントと全てのデータが完全に削除されます。この操作は取り消せません。
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled>
                      アカウント削除
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Notification */}
            <TabsContent value="notification" className="mt-4">
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4 border-b">
                  <p className="text-sm font-medium">通知設定</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    メール通知の受け取り設定を管理します
                  </p>
                </div>
                <div className="px-6 py-5 space-y-5">
                  {[
                    { id: 'notify-signed', label: '署名完了の通知', desc: '署名者が署名を完了したときにメール通知を受け取ります', defaultChecked: true },
                    { id: 'notify-declined', label: '署名辞退の通知', desc: '署名者が署名を辞退したときにメール通知を受け取ります', defaultChecked: true },
                    { id: 'notify-completed', label: '書類締結の通知', desc: '全ての署名者が署名を完了し書類が締結されたときに通知を受け取ります', defaultChecked: true },
                    { id: 'notify-viewed', label: '書類閲覧の通知', desc: '署名者が書類を閲覧したときに通知を受け取ります', defaultChecked: false },
                    { id: 'notify-expiry', label: '期限通知', desc: '書類の署名期限が近づいたときに通知を受け取ります', defaultChecked: true },
                  ].map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                      <input
                        type="checkbox"
                        defaultChecked={item.defaultChecked}
                        className="w-4 h-4 rounded border-gray-300 mt-0.5"
                      />
                    </div>
                  ))}
                  <div className="pt-2">
                    <Button size="sm" disabled>保存（準備中）</Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security" className="mt-4 space-y-4">
              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4 border-b">
                  <p className="text-sm font-medium">セキュリティ設定</p>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">二要素認証</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ログイン時に認証コードの入力を必須にします
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled>設定（準備中）</Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">パスワード変更</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        アカウントのパスワードを変更します
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled>変更（準備中）</Button>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">ログインセッション</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        現在ログインしているデバイスを確認します
                      </p>
                    </div>
                    <Button variant="outline" size="sm" disabled>確認（準備中）</Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card">
                <div className="px-6 py-4 border-b">
                  <p className="text-sm font-medium">APIキー</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    外部システムとの連携に使用するAPIキーを管理します
                  </p>
                </div>
                <div className="px-6 py-5">
                  <div className="rounded-md border bg-muted/30 p-4 text-center">
                    <p className="text-sm text-muted-foreground">APIキー機能は準備中です</p>
                    <p className="text-xs text-muted-foreground mt-1">今後のアップデートで追加予定です</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="col-span-3 space-y-4">
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">プラン</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">現在のプラン</span>
                <span className="text-sm font-medium">
                  {billing.data?.isOwner
                    ? '自社利用（無料）'
                    : billing.data?.active
                      ? 'パートナープラン'
                      : '未加入'}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">書類送信数</span>
                <span className="text-sm font-mono">{billing.data?.active || billing.data?.isOwner ? '無制限' : '-'}</span>
              </div>
              <div className="pt-2">
                <Link href="/settings/billing">
                  <Button variant="outline" size="sm" className="w-full">
                    プラン・お支払いを管理
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">サポート</p>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                ご不明な点がございましたらお問い合わせください。
              </p>
              <Button variant="outline" size="sm" className="w-full" disabled>
                お問い合わせ（準備中）
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
