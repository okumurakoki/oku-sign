'use client'

import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
  title?: string
}

// 手書き署名パッド（署名・印鑑の描画に使用）
export function SignaturePad({ onConfirm, onCancel, title = '署名' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY }
  }

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawing.current = true
    setHasDrawn(true)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }, [])

  const stop = useCallback(() => { drawing.current = false }, [])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          {hasDrawn && (
            <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600">クリア</button>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border-2 border-dashed border-gray-200 bg-white">
          <canvas
            ref={canvasRef}
            width={560}
            height={220}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={stop}
          />
        </div>
        {!hasDrawn && (
          <p className="mt-2 text-center text-xs text-gray-400">枠内にマウスまたはタッチで記入してください</p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>キャンセル</Button>
          <Button
            className="flex-1"
            disabled={!hasDrawn}
            onClick={() => onConfirm(canvasRef.current!.toDataURL('image/png'))}
          >
            確定
          </Button>
        </div>
      </div>
    </div>
  )
}
