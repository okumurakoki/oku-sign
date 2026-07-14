'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

interface SignerInput {
  name: string
  email: string
  signOrder: number
  accessCode: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function NewContractForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateId = searchParams.get('templateId')

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [signers, setSigners] = useState<SignerInput[]>([
    { name: '', email: '', signOrder: 1, accessCode: '' },
  ])
  const [templateLoaded, setTemplateLoaded] = useState(false)

  // Load template if templateId is provided
  const template = trpc.templates.getById.useQuery(
    { id: templateId! },
    { enabled: !!templateId },
  )

  // Pre-fill from template
  useEffect(() => {
    if (template.data && !templateLoaded) {
      setTitle(template.data.title)
      if (template.data.defaultMessage) setMessage(template.data.defaultMessage)
      setTemplateLoaded(true)
    }
  }, [template.data, templateLoaded])

  const billing = trpc.billing.getSubscription.useQuery()
  const createContract = trpc.contracts.create.useMutation()
  const createFromTemplate = trpc.contracts.createFromTemplate.useMutation()

  const contacts = trpc.contacts.getAll.useQuery()

  const addSigner = () => {
    setSigners([...signers, { name: '', email: '', signOrder: signers.length + 1, accessCode: '' }])
  }

  const removeSigner = (index: number) => {
    const updated = signers.filter((_, i) => i !== index)
    setSigners(updated.map((s, i) => ({ ...s, signOrder: i + 1 })))
  }

  const updateSigner = (index: number, field: keyof SignerInput, value: string | number) => {
    setSigners(
      signers.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    )
  }

  const addFromContact = (contact: { name: string; email: string }) => {
    const emptyIdx = signers.findIndex((s) => !s.name && !s.email)
    if (emptyIdx >= 0) {
      updateSigner(emptyIdx, 'name', contact.name)
      updateSigner(emptyIdx, 'email', contact.email)
    } else {
      setSigners([...signers, { name: contact.name, email: contact.email, signOrder: signers.length + 1, accessCode: '' }])
    }
  }

  const handleFileSelect = (file: File) => {
    setUploadError('')
    if (file.type !== 'application/pdf') {
      setUploadError('PDFファイルのみアップロード可能です')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('ファイルサイズは20MB以下にしてください')
      return
    }
    setPdfFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleSubmit = async () => {
    setUploading(true)
    setUploadError('')
    try {
      const validSigners = signers.filter((s) => s.name && s.email)

      // テンプレートから作成: PDF・署名欄をサーバーでコピー
      if (templateId) {
        const result = await createFromTemplate.mutateAsync({
          templateId,
          title,
          expiresAt: expiresAt || undefined,
          signers: validSigners.map((s) => ({
            email: s.email,
            name: s.name,
            signOrder: s.signOrder,
            accessCode: s.accessCode || undefined,
          })),
        })
        router.push(`/contracts/${result.id}`)
        return
      }

      const result = await createContract.mutateAsync({
        title,
        message: message || undefined,
        expiresAt: expiresAt || undefined,
        signers: validSigners.length > 0
          ? validSigners.map((s) => ({
              email: s.email,
              name: s.name,
              signOrder: s.signOrder,
              accessCode: s.accessCode || undefined,
            }))
          : undefined,
      })

      if (pdfFile && result.id) {
        const formData = new FormData()
        formData.append('file', pdfFile)
        formData.append('contractId', result.id)

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}))
          throw new Error(err.error ?? 'PDFのアップロードに失敗しました')
        }
        // uploadルートが pdfUrl/pdfName/pdfSize をサーバー側で永続化する
      }

      router.push(`/contracts/${result.id}`)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '書類の作成に失敗しました')
      setUploading(false)
    }
  }

  const validSigners = signers.filter((s) => s.name && s.email)
  const canProceedStep1 = title.length > 0
  const canProceedStep2 = validSigners.length > 0

  // サブスク未加入なら登録を促す（契約作成はサーバーでもゲート済み）
  if (billing.data && !billing.data.active) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="rounded-xl border bg-card p-8">
          <h1 className="text-lg font-semibold">書類を送信するにはプラン登録が必要です</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            okuサインのパートナープラン（月額2,980円）にご登録いただくと、電子契約の送信が無制限でご利用いただけます。
          </p>
          <Link href="/settings/billing">
            <Button className="mt-6 w-full h-11">プランに登録する</Button>
          </Link>
          <Link href="/contracts">
            <Button variant="ghost" className="mt-2 w-full">書類一覧に戻る</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold tracking-tight">書類の送信</h1>
        {templateId && template.data && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            テンプレート「{template.data.title}」から作成
          </p>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1 as const, label: '書類情報' },
          { n: 2 as const, label: '署名者設定' },
          { n: 3 as const, label: '確認・送信' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && <div className="w-12 h-px bg-border" />}
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  step >= n
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > n ? '\u2713' : n}
              </div>
              <span className={`text-sm ${step >= n ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 2-Column for Steps */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          {/* Step 1: Document Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-card p-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="title">書類タイトル</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例: 業務委託契約書"
                  />
                </div>

                {/* PDF Upload */}
                <div className="space-y-2">
                  <Label>PDFファイル</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileSelect(file)
                    }}
                  />
                  {pdfFile ? (
                    <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{pdfFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(pdfFile.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPdfFile(null)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        削除
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                    >
                      <p className="text-sm text-muted-foreground mb-1">
                        ここにPDFファイルをドラッグ&ドロップ
                      </p>
                      <p className="text-xs text-muted-foreground mb-3">または</p>
                      <Button type="button" variant="outline" size="sm">ファイルを選択</Button>
                      <p className="text-[11px] text-muted-foreground mt-3">PDF形式 / 最大20MB</p>
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label htmlFor="message">署名者へのメッセージ（任意）</Label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="署名依頼メールに含まれるメッセージを入力できます"
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                {/* Expiry */}
                <div className="space-y-2">
                  <Label htmlFor="expires">署名期限（任意）</Label>
                  <Input
                    id="expires"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="max-w-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">期限を過ぎると署名者に警告が表示されます</p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!canProceedStep1}>次へ</Button>
              </div>
            </div>
          )}

          {/* Step 2: Signers */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  署名をお願いする相手の情報を入力してください。複数人の場合、順番に署名依頼が送られます。
                </p>
                {signers.map((signer, index) => (
                  <div key={index}>
                    {index > 0 && <Separator className="my-4" />}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium">
                            {index + 1}
                          </span>
                          <p className="text-sm font-medium">署名者 {index + 1}</p>
                        </div>
                        {signers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSigner(index)}
                            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            削除
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">氏名</Label>
                          <Input
                            value={signer.name}
                            onChange={(e) => updateSigner(index, 'name', e.target.value)}
                            placeholder="山田 太郎"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">メールアドレス</Label>
                          <Input
                            type="email"
                            value={signer.email}
                            onChange={(e) => updateSigner(index, 'email', e.target.value)}
                            placeholder="taro@example.com"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">アクセスコード（任意）</Label>
                        <Input
                          value={signer.accessCode}
                          onChange={(e) => updateSigner(index, 'accessCode', e.target.value)}
                          placeholder="設定すると署名時にコード入力が必要になります"
                          className="max-w-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSigner}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  + 署名者を追加
                </button>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>戻る</Button>
                <Button onClick={() => setStep(3)} disabled={!canProceedStep2}>次へ</Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">書類タイトル</p>
                  <p className="text-sm font-medium">{title}</p>
                </div>
                {pdfFile && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">添付ファイル</p>
                    <p className="text-sm">{pdfFile.name} <span className="text-muted-foreground text-xs">({formatBytes(pdfFile.size)})</span></p>
                  </div>
                )}
                {message && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">メッセージ</p>
                    <p className="text-sm whitespace-pre-wrap">{message}</p>
                  </div>
                )}
                {expiresAt && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">署名期限</p>
                    <p className="text-sm">{new Date(expiresAt).toLocaleDateString('ja-JP')}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-[11px] text-muted-foreground mb-2">署名者</p>
                  <div className="space-y-2">
                    {validSigners.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                          {i + 1}
                        </span>
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">{s.email}</span>
                        {s.accessCode && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">コード設定済</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <p className="text-xs text-muted-foreground leading-relaxed">
                  「保存する」をクリックすると、書類が下書きとして保存されます。
                  書類詳細ページから署名依頼を送信してください。
                </p>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>戻る</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={uploading || createContract.isPending}
                >
                  {uploading || createContract.isPending ? '保存中...' : '保存する'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Tips */}
          <div className="rounded-lg border bg-card">
            <div className="px-5 py-3 border-b">
              <p className="text-sm font-medium">送信の流れ</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { n: 1, label: '書類情報を入力' },
                { n: 2, label: '署名者を設定' },
                { n: 3, label: '内容を確認して保存' },
                { n: 4, label: '書類詳細ページから送信' },
              ].map(({ n, label }) => (
                <div key={n} className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                    step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {n}
                  </div>
                  <span className={`text-xs ${step >= n ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Address book (Step 2) */}
          {step === 2 && contacts.data && contacts.data.length > 0 && (
            <div className="rounded-lg border bg-card">
              <div className="px-5 py-3 border-b">
                <p className="text-sm font-medium">アドレス帳から追加</p>
              </div>
              <div className="max-h-[300px] overflow-y-auto divide-y">
                {contacts.data.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addFromContact(c)}
                    className="w-full text-left px-5 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.email}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NewContractPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4">
        <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 w-full bg-muted rounded animate-pulse" />
      </div>
    }>
      <NewContractForm />
    </Suspense>
  )
}
