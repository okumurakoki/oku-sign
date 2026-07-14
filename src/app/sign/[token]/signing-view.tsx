'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PdfPageCanvas } from '@/components/pdf/pdf-page-canvas'
import { SignaturePad } from '@/components/signature-pad'
import { PenLine, Type, Calendar, Stamp, Check, Lock, Clock } from 'lucide-react'

type FieldType = 'signature' | 'text' | 'date' | 'stamp'

interface SignField {
  id: string
  fieldType: FieldType
  label: string | null
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
}

interface FieldValue {
  type: 'draw' | 'text' | 'date' | 'stamp'
  value?: string
  imageData?: string
}

interface Props {
  token: string
  signerName: string
  contractTitle: string
  pdfUrl: string | null
  senderName: string | null
  senderCompany: string | null
  message: string | null
  expiresAt: string | null
  requiresAccessCode: boolean
  fields: SignField[]
}

const FIELD_ICON: Record<FieldType, typeof PenLine> = {
  signature: PenLine, text: Type, date: Calendar, stamp: Stamp,
}

// DocuSign型のガイド付き署名:
// - 「次へ」で未記入の必須欄へ自動スクロール+ハイライト
// - 記入するたび次の欄へ自動誘導、残数を常時表示
// - 署名は一度描けば以降の署名欄はワンタップで使い回し
// - 下部固定バーからいつでも完了操作
export function SigningView(props: Props) {
  const { token, signerName, contractTitle, pdfUrl, senderName, senderCompany, message, expiresAt, requiresAccessCode, fields } = props

  const [mode, setMode] = useState<'view' | 'sign' | 'decline'>('view')
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState<'signed' | 'declined' | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // フィールド値（fieldId -> value）
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [padField, setPadField] = useState<SignField | null>(null)
  const [textField, setTextField] = useState<SignField | null>(null)
  const [textDraft, setTextDraft] = useState('')
  // 一度描いた署名を全署名欄で使い回す（DocuSignの adopt & sign）
  const [adoptedSignature, setAdoptedSignature] = useState<string | null>(null)
  // ガイド中の欄（ハイライト表示）
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)

  // 単一署名フォールバック用
  const [fallbackImage, setFallbackImage] = useState<string | null>(null)
  const [fallbackPad, setFallbackPad] = useState(false)

  const hasFields = fields.length > 0
  const sender = senderCompany ? `${senderCompany} ${senderName}` : senderName
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false
  const daysLeft = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000) : null

  // 記入順 = ページ → 上 → 左
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x),
    [fields],
  )
  const requiredTotal = fields.filter((f) => f.required).length
  const requiredUnfilled = sortedFields.filter((f) => f.required && !values[f.id])
  const canSubmitFields = requiredUnfilled.length === 0

  const focusField = useCallback((f: SignField | undefined) => {
    if (!f) return
    setActiveFieldId(f.id)
    document.getElementById(`sf-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  // 次の未記入必須欄へ誘導（filledId = いま記入し終えた欄）
  const advance = useCallback((filledId?: string) => {
    const next = sortedFields.find((f) => f.required && !values[f.id] && f.id !== filledId)
    if (next) {
      setTimeout(() => focusField(next), 120)
    } else {
      setActiveFieldId(null)
    }
  }, [sortedFields, values, focusField])

  const startSigning = () => {
    setMode('sign')
    setTimeout(() => focusField(requiredUnfilled[0] ?? sortedFields[0]), 200)
  }

  const handleFieldClick = (f: SignField) => {
    if (f.fieldType === 'signature' || f.fieldType === 'stamp') {
      // 署名欄: 一度描いた署名があれば未記入欄はワンタップで適用
      if (f.fieldType === 'signature' && adoptedSignature && !values[f.id]) {
        setValues((prev) => ({ ...prev, [f.id]: { type: 'draw', imageData: adoptedSignature } }))
        advance(f.id)
        return
      }
      setPadField(f)
    } else if (f.fieldType === 'date') {
      const today = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date())
      setValues((prev) => ({ ...prev, [f.id]: { type: 'date', value: today } }))
      advance(f.id)
    } else {
      setTextDraft(values[f.id]?.value ?? '')
      setTextField(f)
    }
  }

  const confirmPad = (dataUrl: string) => {
    if (!padField) return
    setValues((prev) => ({
      ...prev,
      [padField.id]: { type: padField.fieldType === 'stamp' ? 'stamp' : 'draw', imageData: dataUrl },
    }))
    if (padField.fieldType === 'signature') setAdoptedSignature(dataUrl)
    const justFilled = padField.id
    setPadField(null)
    advance(justFilled)
  }

  const confirmText = () => {
    if (!textField) return
    let filled = false
    if (!textDraft.trim()) {
      setValues((prev) => {
        const next = { ...prev }
        delete next[textField.id]
        return next
      })
    } else {
      setValues((prev) => ({ ...prev, [textField.id]: { type: 'text', value: textDraft.trim() } }))
      filled = true
    }
    const justFilled = textField.id
    setTextField(null)
    if (filled) advance(justFilled)
  }

  const scrollToPanel = () => {
    document.getElementById('sign-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const submitSign = async () => {
    if (requiresAccessCode && !accessCode.trim()) {
      setError('アクセスコードを入力してください')
      scrollToPanel()
      return
    }
    if (!agreed) {
      setError('同意のチェックを入れてください')
      scrollToPanel()
      return
    }
    // 記入内容の検証
    let fieldValues: { fieldId: string; type: string; value?: string; imageData?: string }[] = []
    if (hasFields) {
      if (!canSubmitFields) {
        setError('必須の署名欄がすべて記入されていません')
        focusField(requiredUnfilled[0])
        return
      }
      fieldValues = fields
        .filter((f) => values[f.id])
        .map((f) => ({ fieldId: f.id, ...values[f.id] }))
    } else {
      if (!fallbackImage) {
        setError('署名を記入してください')
        scrollToPanel()
        return
      }
      fieldValues = [{ fieldId: '', type: 'draw', imageData: fallbackImage }]
    }

    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'sign',
          accessCode: requiresAccessCode ? accessCode : undefined,
          fieldValues,
        }),
      })
      if (res.ok) { setCompleted('signed'); return }
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '署名の送信に失敗しました。時間をおいて再度お試しください')
      scrollToPanel()
    } catch {
      setError('通信エラーが発生しました。ネットワークをご確認ください')
      scrollToPanel()
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecline = async () => {
    if (requiresAccessCode && !accessCode.trim()) {
      setError('アクセスコードを入力してください')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'decline',
          declineReason: declineReason || undefined,
          accessCode: requiresAccessCode ? accessCode : undefined,
        }),
      })
      if (res.ok) { setCompleted('declined'); return }
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '辞退の送信に失敗しました。時間をおいて再度お試しください')
    } catch {
      setError('通信エラーが発生しました。ネットワークをご確認ください')
    } finally {
      setSubmitting(false)
    }
  }

  if (completed === 'signed') {
    return <ResultScreen ok title="署名が完了しました" body={<>ご署名ありがとうございます。<br />全署名者の署名完了後、締結完了のメールが届きます。</>} />
  }
  if (completed === 'declined') {
    return <ResultScreen title="署名を辞退しました" body={<>辞退の旨が送信者に通知されました。<br />ご不明な点は送信者にお問い合わせください。</>} />
  }

  const filledRequired = requiredTotal - requiredUnfilled.length

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top bar: 誰からの依頼か + 安全性 + 進捗 */}
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4 sm:px-6">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground">oku</div>
          <div className="min-w-0 leading-tight">
            <p className="text-[10.5px] text-[var(--faint)]">署名の依頼が届いています</p>
            <p className="truncate text-[13px] font-semibold">{sender ?? 'okuサイン'}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {hasFields && mode === 'sign' && (
              <span className="tnum hidden text-xs text-muted-foreground sm:inline">
                記入 {filledRequired}/{requiredTotal}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--ok)]">
              <Lock size={13} />
              <span className="hidden sm:inline">暗号化された接続</span>
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        {isExpired && (
          <div className="rounded-lg bg-[var(--alert-bg)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--alert)]">この書類の署名期限を過ぎています。送信者にお問い合わせください。</p>
          </div>
        )}

        {/* ガイド: あなたの番です */}
        {!isExpired && mode === 'sign' && hasFields && (
          <div className="flex items-center gap-3 rounded-lg border border-[#CFE1FB] bg-accent px-4 py-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {canSubmitFields ? <Check size={13} strokeWidth={3} /> : requiredUnfilled.length}
            </span>
            <p className="text-[13px]">
              {canSubmitFields
                ? <><b className="font-semibold text-[var(--brand-ink)]">記入が完了しました。</b>下部の「署名して完了」を押してください。</>
                : <><b className="font-semibold text-[var(--brand-ink)]">あなたの番です。</b>枠をタップして記入してください（残り{requiredUnfilled.length}項目）。</>}
            </p>
          </div>
        )}

        {/* 書類情報 */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="space-y-1 px-5 py-4">
            <p className="text-[11px] text-[var(--faint)]">{signerName} 様への署名依頼</p>
            <p className="text-[17px] font-bold leading-snug">{contractTitle}</p>
            {expiresAt && !isExpired && (
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-[var(--wait-bg)] px-2.5 py-1 text-xs font-medium text-[var(--wait)]">
                <Clock size={12} />
                署名期限 {new Date(expiresAt).toLocaleDateString('ja-JP')}
                {daysLeft !== null && daysLeft >= 0 && `（あと${daysLeft}日）`}
              </span>
            )}
          </div>
          {message && (
            <div className="border-t border-[var(--line-soft)] bg-[#FAFBFC] px-5 py-3">
              <p className="mb-0.5 text-[10.5px] text-[var(--faint)]">送信者からのメッセージ</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{message}</p>
            </div>
          )}
        </div>

        {/* PDF + fields */}
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex h-10 items-center border-b px-4">
            <p className="text-[13px] font-bold">書類</p>
            {hasFields && mode === 'sign' && (
              <span className="ml-2 text-[11.5px] text-muted-foreground">枠をタップして記入</span>
            )}
          </div>
          <div className="max-h-[70vh] overflow-auto bg-muted p-4">
            {pdfUrl ? (
              <PdfPageCanvas
                fileUrl={pdfUrl}
                pageWidth={640}
                renderPageOverlay={hasFields && mode === 'sign' ? (page) => (
                  <div className="absolute inset-0">
                    {fields.filter((f) => f.page === page).map((f) => {
                      const filled = values[f.id]
                      const active = activeFieldId === f.id
                      const Icon = FIELD_ICON[f.fieldType]
                      return (
                        <button
                          key={f.id}
                          id={`sf-${f.id}`}
                          onClick={() => handleFieldClick(f)}
                          className="absolute flex items-center justify-center overflow-hidden rounded transition-shadow"
                          style={{
                            left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%`,
                            border: `2px ${filled ? 'solid' : 'dashed'} ${filled ? 'var(--ok)' : 'var(--primary)'}`,
                            background: filled ? 'rgba(18,128,92,0.08)' : 'rgba(38,128,235,0.10)',
                            boxShadow: active && !filled ? '0 0 0 4px rgba(38,128,235,0.25)' : undefined,
                          }}
                        >
                          {filled?.imageData ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={filled.imageData} alt="署名" className="max-h-full max-w-full object-contain" />
                          ) : filled?.value ? (
                            <span className="truncate px-1 text-[11px] text-foreground">{filled.value}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--brand-ink)]">
                              <Icon size={11} /> {f.label || (f.required ? '必須' : '任意')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : undefined}
              />
            ) : (
              <p className="py-16 text-center text-sm text-[var(--faint)]">PDFが添付されていません</p>
            )}
          </div>
        </div>

        {/* Action area */}
        {mode === 'view' && (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">書類の内容をご確認の上、署名にお進みください。アプリのインストールや会員登録は不要です。</p>
            <div className="flex gap-3">
              <Button className="h-11 flex-1 text-[15px] font-semibold" onClick={startSigning} disabled={isExpired}>
                署名に進む
              </Button>
              <Button variant="outline" className="h-11 text-muted-foreground" onClick={() => setMode('decline')}>辞退する</Button>
            </div>
          </div>
        )}

        {mode === 'sign' && (
          <div id="sign-panel" className="space-y-4 rounded-lg border bg-card p-5">
            {!hasFields && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">署名</p>
                <div className="flex min-h-[120px] items-center justify-center rounded-lg border-2 border-dashed bg-white p-4">
                  {fallbackImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fallbackImage} alt="署名" className="max-h-24" />
                  ) : (
                    <Button variant="outline" onClick={() => setFallbackPad(true)}>署名を記入する</Button>
                  )}
                </div>
                {fallbackImage && (
                  <button onClick={() => setFallbackPad(true)} className="text-xs text-muted-foreground hover:text-foreground">署名を描き直す</button>
                )}
              </div>
            )}

            {requiresAccessCode && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">アクセスコード</label>
                <input
                  type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric" autoComplete="one-time-code"
                  className="flex w-full rounded-md border bg-white px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="送信者から伝えられたコードを入力"
                />
              </div>
            )}

            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-[var(--primary)]" />
              <span className="text-sm leading-relaxed">
                上記の書類の内容を確認し、電子署名をもって同意します。この署名が法的拘束力を持つことを理解しています。
              </span>
            </label>

            {error && <p className="text-sm font-medium text-[var(--alert)]">{error}</p>}

            <p className="text-center text-[11px] leading-relaxed text-[var(--faint)]">
              署名することで、okuサインの
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">利用規約</a>
              および
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted-foreground">プライバシーポリシー</a>
              に同意したものとみなされます。IPアドレス・タイムスタンプは監査ログに記録されます。
            </p>
            <p className="text-center text-xs text-muted-foreground">
              内容に問題がある場合は{' '}
              <button onClick={() => { setMode('decline'); setError(null) }} className="underline hover:text-foreground">
                署名を辞退
              </button>
            </p>
          </div>
        )}

        {mode === 'decline' && (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <p className="text-sm font-semibold">署名を辞退する</p>
            <p className="text-sm text-muted-foreground">辞退の旨が送信者に通知されます。辞退後は署名できなくなります。</p>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">辞退理由（任意）</label>
              <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="辞退の理由があればご記入ください" rows={3}
                className="flex w-full resize-none rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {requiresAccessCode && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">アクセスコード</label>
                <input type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric" autoComplete="one-time-code"
                  className="flex w-full rounded-md border bg-white px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="コードを入力" />
              </div>
            )}
            {error && <p className="text-sm font-medium text-[var(--alert)]">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="h-11" onClick={() => { setMode('view'); setError(null) }}>戻る</Button>
              <Button variant="outline" className="h-11 flex-1 border-[var(--alert-bg)] text-[var(--alert)] hover:bg-[var(--alert-bg)] hover:text-[var(--alert)]"
                onClick={handleDecline} disabled={submitting}>
                {submitting ? '送信中…' : '辞退する'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 下部固定バー: 次へ誘導 / 完了（署名モード時のみ） */}
      {mode === 'sign' && !isExpired && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-[68px] max-w-4xl items-center gap-3 px-4 sm:px-6">
            {hasFields ? (
              <>
                <span className="tnum text-[13px] font-medium text-muted-foreground">
                  {canSubmitFields ? (
                    <span className="flex items-center gap-1.5 text-[var(--ok)]"><Check size={15} strokeWidth={2.6} />記入完了</span>
                  ) : (
                    <>残り {requiredUnfilled.length} 項目</>
                  )}
                </span>
                {canSubmitFields ? (
                  <Button className="ml-auto h-11 px-6 text-[15px] font-semibold" onClick={submitSign} disabled={submitting}>
                    {submitting ? '署名を送信中…' : '署名して完了'}
                  </Button>
                ) : (
                  <Button className="ml-auto h-11 px-6 text-[15px] font-semibold" onClick={() => focusField(requiredUnfilled[0])}>
                    次へ
                  </Button>
                )}
              </>
            ) : (
              <Button className="ml-auto h-11 px-6 text-[15px] font-semibold" onClick={submitSign} disabled={submitting}>
                {submitting ? '署名を送信中…' : '署名して完了'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 署名パッド（フィールド用） */}
      {padField && (
        <SignaturePad
          title={padField.fieldType === 'stamp' ? '印鑑を記入' : '署名を記入'}
          onConfirm={confirmPad}
          onCancel={() => setPadField(null)}
        />
      )}
      {/* 署名パッド（フォールバック用） */}
      {fallbackPad && (
        <SignaturePad
          title="署名を記入"
          onConfirm={(d) => { setFallbackImage(d); setFallbackPad(false) }}
          onCancel={() => setFallbackPad(false)}
        />
      )}
      {/* テキスト入力モーダル */}
      {textField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setTextField(null)}>
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold">{textField.label || 'テキストを入力'}</p>
            <input
              autoFocus value={textDraft} onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmText() }}
              className="flex w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="入力してください"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTextField(null)}>キャンセル</Button>
              <Button className="flex-1" onClick={confirmText}>確定</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ResultScreen({ ok, title, body }: { ok?: boolean; title: string; body: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        {ok && (
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[var(--ok-bg)]">
            <Check className="text-[var(--ok)]" size={26} strokeWidth={2.6} />
          </div>
        )}
        <h1 className="mb-2 text-lg font-bold">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        <p className="mt-6 text-[11px] text-[var(--faint)]">この署名は 立会人型 電子署名 により記録されました</p>
      </div>
    </div>
  )
}
