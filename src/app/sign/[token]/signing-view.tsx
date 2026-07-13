'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PdfPageCanvas } from '@/components/pdf/pdf-page-canvas'
import { SignaturePad } from '@/components/signature-pad'
import { PenLine, Type, Calendar, Stamp, Check } from 'lucide-react'

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

  // 単一署名フォールバック用
  const [fallbackImage, setFallbackImage] = useState<string | null>(null)
  const [fallbackPad, setFallbackPad] = useState(false)

  const hasFields = fields.length > 0
  const sender = senderCompany ? `${senderCompany} ${senderName}` : senderName
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false

  const requiredUnfilled = fields.filter((f) => f.required && !values[f.id])
  const canSubmitFields = requiredUnfilled.length === 0

  const handleFieldClick = (f: SignField) => {
    if (f.fieldType === 'signature' || f.fieldType === 'stamp') {
      setPadField(f)
    } else if (f.fieldType === 'date') {
      const today = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' }).format(new Date())
      setValues((prev) => ({ ...prev, [f.id]: { type: 'date', value: today } }))
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
    setPadField(null)
  }

  const confirmText = () => {
    if (!textField) return
    if (!textDraft.trim()) {
      setValues((prev) => {
        const next = { ...prev }
        delete next[textField.id]
        return next
      })
    } else {
      setValues((prev) => ({ ...prev, [textField.id]: { type: 'text', value: textDraft.trim() } }))
    }
    setTextField(null)
  }

  const submitSign = async () => {
    if (requiresAccessCode && !accessCode.trim()) {
      setError('アクセスコードを入力してください')
      return
    }
    if (!agreed) {
      setError('同意のチェックを入れてください')
      return
    }
    // 記入内容の検証
    let fieldValues: { fieldId: string; type: string; value?: string; imageData?: string }[] = []
    if (hasFields) {
      if (!canSubmitFields) {
        setError('必須の署名欄がすべて記入されていません')
        return
      }
      fieldValues = fields
        .filter((f) => values[f.id])
        .map((f) => ({ fieldId: f.id, ...values[f.id] }))
    } else {
      if (!fallbackImage) {
        setError('署名を記入してください')
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
    } catch {
      setError('通信エラーが発生しました。ネットワークをご確認ください')
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#3d4f5f] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">oku</span>
            </div>
            <span className="text-sm font-semibold text-gray-800">okuサイン</span>
          </div>
          {hasFields && mode === 'sign' && (
            <span className="text-xs text-gray-500">
              記入 {fields.length - requiredUnfilled.length}/{fields.filter((f) => f.required).length}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
            <p className="text-sm text-red-700">この書類の署名期限を過ぎています。送信者にお問い合わせください。</p>
          </div>
        )}

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">送信者</p>
            <p className="text-sm text-gray-700">{sender ?? '---'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">書類名</p>
            <p className="text-base font-medium text-gray-900">{contractTitle}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">署名者</p>
            <p className="text-sm text-gray-700">{signerName} 様</p>
          </div>
          {expiresAt && (
            <div>
              <p className="text-xs text-gray-400 mb-1">署名期限</p>
              <p className={`text-sm ${isExpired ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                {new Date(expiresAt).toLocaleDateString('ja-JP')}
              </p>
            </div>
          )}
          {message && (
            <div className="border-l-2 border-gray-200 pl-4">
              <p className="text-xs text-gray-400 mb-1">送信者からのメッセージ</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{message}</p>
            </div>
          )}
        </div>

        {/* PDF + fields */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">書類{hasFields && mode === 'sign' ? '（署名欄をタップして記入）' : ''}</p>
          </div>
          <div className="bg-gray-100 p-4 max-h-[70vh] overflow-auto">
            {pdfUrl ? (
              <PdfPageCanvas
                fileUrl={pdfUrl}
                pageWidth={640}
                renderPageOverlay={hasFields && mode === 'sign' ? (page) => (
                  <div className="absolute inset-0">
                    {fields.filter((f) => f.page === page).map((f) => {
                      const filled = values[f.id]
                      const Icon = FIELD_ICON[f.fieldType]
                      return (
                        <button
                          key={f.id}
                          onClick={() => handleFieldClick(f)}
                          className="absolute flex items-center justify-center rounded overflow-hidden"
                          style={{
                            left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%`,
                            border: `2px ${filled ? 'solid' : 'dashed'} ${filled ? '#16a34a' : '#2563eb'}`,
                            background: filled ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.10)',
                          }}
                        >
                          {filled?.imageData ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={filled.imageData} alt="署名" className="max-h-full max-w-full object-contain" />
                          ) : filled?.value ? (
                            <span className="text-[11px] text-gray-800 px-1 truncate">{filled.value}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-blue-700">
                              <Icon size={11} /> {f.required ? '必須' : '任意'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : undefined}
              />
            ) : (
              <p className="py-16 text-center text-sm text-gray-400">PDFが添付されていません</p>
            )}
          </div>
        </div>

        {/* Action area */}
        {mode === 'view' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <p className="text-sm text-gray-700">書類の内容をご確認の上、署名または辞退を選択してください。</p>
            <div className="flex gap-3">
              <Button className="flex-1 h-11" onClick={() => setMode('sign')} disabled={isExpired}>署名する</Button>
              <Button variant="outline" className="h-11 text-muted-foreground" onClick={() => setMode('decline')}>辞退する</Button>
            </div>
          </div>
        )}

        {mode === 'sign' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            {hasFields ? (
              <div className="rounded-md bg-gray-50 px-4 py-3">
                <p className="text-sm text-gray-700">
                  {canSubmitFields ? 'すべての必須欄が記入されました。' : `未記入の必須欄が${requiredUnfilled.length}個あります。`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">署名</p>
                <div className="rounded-lg border-2 border-dashed border-gray-200 bg-white p-4 flex items-center justify-center min-h-[120px]">
                  {fallbackImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fallbackImage} alt="署名" className="max-h-24" />
                  ) : (
                    <Button variant="outline" onClick={() => setFallbackPad(true)}>署名を記入する</Button>
                  )}
                </div>
                {fallbackImage && (
                  <button onClick={() => setFallbackPad(true)} className="text-xs text-gray-500 hover:text-gray-700">署名を描き直す</button>
                )}
              </div>
            )}

            {requiresAccessCode && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">アクセスコード</label>
                <input
                  type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric" autoComplete="one-time-code"
                  className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#3d4f5f]"
                  placeholder="コードを入力"
                />
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#3d4f5f] focus:ring-[#3d4f5f]" />
              <span className="text-sm text-gray-700 leading-relaxed">
                上記の書類の内容を確認し、電子署名をもって同意します。この署名が法的拘束力を持つことを理解しています。
              </span>
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex gap-3">
              <Button variant="outline" className="h-11" onClick={() => setMode('view')}>戻る</Button>
              <Button className="flex-1 h-11" onClick={submitSign} disabled={submitting}>
                {submitting ? '署名を送信中...' : '署名を確定する'}
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              署名することで、okuサインの利用規約およびプライバシーポリシーに同意したものとみなされます。IPアドレス・タイムスタンプは監査ログに記録されます。
            </p>
          </div>
        )}

        {mode === 'decline' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <p className="text-sm font-medium text-gray-700">署名を辞退する</p>
            <p className="text-sm text-gray-500">辞退の旨が送信者に通知されます。辞退後は署名できなくなります。</p>
            <div className="space-y-2">
              <label className="text-xs text-gray-500">辞退理由（任意）</label>
              <textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="辞退の理由があればご記入ください" rows={3}
                className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3d4f5f] resize-none" />
            </div>
            {requiresAccessCode && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500">アクセスコード</label>
                <input type="text" value={accessCode} onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric" autoComplete="one-time-code"
                  className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#3d4f5f]"
                  placeholder="コードを入力" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button variant="outline" className="h-11" onClick={() => setMode('view')}>戻る</Button>
              <Button variant="outline" className="flex-1 h-11 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={handleDecline} disabled={submitting}>
                {submitting ? '送信中...' : '辞退する'}
              </Button>
            </div>
          </div>
        )}
      </div>

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
            <p className="mb-3 text-sm font-medium text-gray-800">{textField.label || 'テキストを入力'}</p>
            <input
              autoFocus value={textDraft} onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmText() }}
              className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3d4f5f]"
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
        {ok && (
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <Check className="text-emerald-600" size={22} />
          </div>
        )}
        <h1 className="text-lg font-semibold mb-2">{title}</h1>
        <p className="text-sm text-gray-500 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
