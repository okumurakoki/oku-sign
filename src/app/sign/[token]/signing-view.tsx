'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'

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
}

export function SigningView({
  token,
  signerName,
  contractTitle,
  pdfUrl,
  senderName,
  senderCompany,
  message,
  expiresAt,
  requiresAccessCode,
}: Props) {
  const [mode, setMode] = useState<'view' | 'sign' | 'decline'>('view')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState<'signed' | 'declined' | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  const startDrawing = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    setHasDrawn(true)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
  }, [])

  const stopDrawing = useCallback(() => {
    isDrawingRef.current = false
  }, [])

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSign = async () => {
    if (!agreed || !hasDrawn) return
    if (requiresAccessCode && !accessCode.trim()) {
      setError('アクセスコードを入力してください')
      return
    }
    setError(null)
    setSubmitting(true)

    const canvas = canvasRef.current
    const signatureImage = canvas?.toDataURL('image/png') ?? ''

    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signatureImage,
          action: 'sign',
          accessCode: requiresAccessCode ? accessCode : undefined,
        }),
      })
      if (res.ok) {
        setCompleted('signed')
        return
      }
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
      if (res.ok) {
        setCompleted('declined')
        return
      }
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '辞退の送信に失敗しました。時間をおいて再度お試しください')
    } catch {
      setError('通信エラーが発生しました。ネットワークをご確認ください')
    } finally {
      setSubmitting(false)
    }
  }

  const sender = senderCompany ? `${senderCompany} ${senderName}` : senderName
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false

  // Completion screens
  if (completed === 'signed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-600 text-lg">&#10003;</span>
          </div>
          <h1 className="text-lg font-semibold mb-2">署名が完了しました</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            ご署名ありがとうございます。<br />
            署名完了の通知が送信者に送られました。<br />
            全署名者の署名完了後、締結完了のメールが届きます。
          </p>
        </div>
      </div>
    )
  }

  if (completed === 'declined') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold mb-2">署名を辞退しました</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            辞退の旨が送信者に通知されました。<br />
            ご不明な点がございましたら、送信者にお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#3d4f5f] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">oku</span>
            </div>
            <span className="text-sm font-semibold text-gray-800">okuサイン</span>
          </div>
          <span className="text-xs text-gray-400">電子署名</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Expiry warning */}
        {isExpired && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
            <p className="text-sm text-red-700">この書類の署名期限を過ぎています。送信者にお問い合わせください。</p>
          </div>
        )}

        {/* Contract Info */}
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

        {/* PDF Preview */}
        <div className="bg-white rounded-lg border">
          <div className="px-5 py-3 border-b">
            <p className="text-sm font-medium text-gray-700">書類プレビュー</p>
          </div>
          <div className="aspect-[1/1.414] bg-gray-100 flex items-center justify-center">
            {pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full" />
            ) : (
              <p className="text-sm text-gray-400">PDFが添付されていません</p>
            )}
          </div>
        </div>

        {/* Action Selection (view mode) */}
        {mode === 'view' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <p className="text-sm text-gray-700">書類の内容をご確認の上、署名または辞退を選択してください。</p>
            <div className="flex gap-3">
              <Button
                className="flex-1 h-11"
                onClick={() => setMode('sign')}
                disabled={isExpired}
              >
                署名する
              </Button>
              <Button
                variant="outline"
                className="h-11 text-muted-foreground"
                onClick={() => setMode('decline')}
              >
                辞退する
              </Button>
            </div>
          </div>
        )}

        {/* Sign Mode */}
        {mode === 'sign' && (
          <>
            {/* Signature Pad */}
            <div className="bg-white rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">署名欄</p>
                {hasDrawn && (
                  <button
                    onClick={clearCanvas}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    クリア
                  </button>
                )}
              </div>
              <div className="border-2 border-dashed border-gray-200 rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              {!hasDrawn && (
                <p className="text-xs text-gray-400 text-center">
                  上の枠内にマウスまたはタッチで署名してください
                </p>
              )}
            </div>

            {/* Agreement & Submit */}
            <div className="bg-white rounded-lg border p-6 space-y-4">
              {requiresAccessCode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">アクセスコード</label>
                  <p className="text-xs text-gray-400">送信者から別途通知されたアクセスコードを入力してください。</p>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm tracking-widest placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3d4f5f] focus:ring-offset-2"
                    placeholder="コードを入力"
                  />
                </div>
              )}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#3d4f5f] focus:ring-[#3d4f5f]"
                />
                <span className="text-sm text-gray-700 leading-relaxed">
                  上記の書類の内容を確認し、電子署名をもって同意します。
                  この署名は法的拘束力を持つことを理解しています。
                </span>
              </label>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => setMode('view')}
                >
                  戻る
                </Button>
                <Button
                  className="flex-1 h-11 text-sm"
                  onClick={handleSign}
                  disabled={!agreed || !hasDrawn || submitting}
                >
                  {submitting ? '署名を送信中...' : '署名する'}
                </Button>
              </div>

              {error && (
                <p className="text-sm text-red-600 text-center">{error}</p>
              )}

              <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                署名することで、okuサインの利用規約およびプライバシーポリシーに同意したものとみなされます。
                IPアドレス・タイムスタンプは監査ログに記録されます。
              </p>
            </div>
          </>
        )}

        {/* Decline Mode */}
        {mode === 'decline' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <p className="text-sm font-medium text-gray-700">署名を辞退する</p>
            <p className="text-sm text-gray-500">
              辞退の旨が送信者に通知されます。辞退後は署名できなくなります。
            </p>
            <div className="space-y-2">
              <label className="text-xs text-gray-500">辞退理由（任意）</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="辞退の理由があればご記入ください"
                rows={3}
                className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3d4f5f] focus:ring-offset-2 resize-none"
              />
            </div>
            {requiresAccessCode && (
              <div className="space-y-2">
                <label className="text-xs text-gray-500">アクセスコード</label>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm tracking-widest placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3d4f5f] focus:ring-offset-2"
                  placeholder="コードを入力"
                />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setMode('view')}
              >
                戻る
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={handleDecline}
                disabled={submitting}
              >
                {submitting ? '送信中...' : '辞退する'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
