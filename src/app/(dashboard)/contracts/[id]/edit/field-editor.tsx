'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PdfPageCanvas } from '@/components/pdf/pdf-page-canvas'
import { signerColor } from '@/lib/signer-colors'
import { Trash2, PenLine, Type, Calendar, Stamp } from 'lucide-react'

type FieldType = 'signature' | 'text' | 'date' | 'stamp'

interface EditorField {
  key: string
  id?: string
  signerId: string
  fieldType: FieldType
  label: string | null
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
}

export interface SaveField {
  signerId: string
  fieldType: FieldType
  label: string | null
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
}

// 契約=実際の署名者、テンプレ=署名者スロット。id/name/order を持つ汎用の割当先。
interface Assignee {
  id: string
  name: string
  email?: string
  signOrder: number
}

interface Props {
  pdfUrl: string
  signers: Assignee[]
  initialFields: EditorField[]
  onSave: (fields: SaveField[]) => Promise<void>
  saving: boolean
  saveError?: string | null
  backHref: string
  assigneeLabel?: string // '署名者' | '署名者スロット' など
}

const DEFAULT_SIZE: Record<FieldType, { width: number; height: number }> = {
  signature: { width: 26, height: 7 },
  stamp: { width: 12, height: 8.5 },
  text: { width: 22, height: 4.5 },
  date: { width: 16, height: 4.5 },
}

const FIELD_META: Record<FieldType, { label: string; icon: typeof PenLine }> = {
  signature: { label: '署名', icon: PenLine },
  text: { label: 'テキスト', icon: Type },
  date: { label: '日付', icon: Calendar },
  stamp: { label: '印鑑', icon: Stamp },
}

export function FieldEditor({ pdfUrl, signers, initialFields, onSave, saving, saveError, backHref, assigneeLabel = '署名者' }: Props) {
  const router = useRouter()
  const [fields, setFields] = useState<EditorField[]>(initialFields)
  const [activeSignerId, setActiveSignerId] = useState<string>(signers[0]?.id ?? '')
  const [activeType, setActiveType] = useState<FieldType>('signature')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const dragRef = useRef<null | {
    key: string
    mode: 'move' | 'resize'
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
    pageW: number
    pageH: number
  }>(null)

  const signerIndex = useCallback(
    (id: string) => signers.findIndex((s) => s.id === id),
    [signers],
  )

  const uid = () => crypto.randomUUID()

  // ドラッグ中のみ dragRef が非nullになる。リスナーはマウント時に一度だけ登録し、
  // アンマウントで解除する（自己参照や二重登録を避ける）。
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dxPct = ((e.clientX - d.startX) / d.pageW) * 100
      const dyPct = ((e.clientY - d.startY) / d.pageH) * 100
      setFields((prev) =>
        prev.map((f) => {
          if (f.key !== d.key) return f
          if (d.mode === 'move') {
            return {
              ...f,
              x: clamp(d.origX + dxPct, 0, 100 - f.width),
              y: clamp(d.origY + dyPct, 0, 100 - f.height),
            }
          }
          return {
            ...f,
            width: clamp(d.origW + dxPct, 4, 100 - f.x),
            height: clamp(d.origH + dyPct, 3, 100 - f.y),
          }
        }),
      )
    }
    const onUp = () => { dragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // ページ空白クリックで新規フィールド配置
  const handlePageClick = (page: number, dims: { width: number; height: number }, e: React.MouseEvent) => {
    if (!activeSignerId) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const px = ((e.clientX - rect.left) / dims.width) * 100
    const py = ((e.clientY - rect.top) / dims.height) * 100
    const size = DEFAULT_SIZE[activeType]
    const x = clamp(px - size.width / 2, 0, 100 - size.width)
    const y = clamp(py - size.height / 2, 0, 100 - size.height)
    const key = uid()
    setFields((prev) => [
      ...prev,
      { key, signerId: activeSignerId, fieldType: activeType, label: null, page, x, y, width: size.width, height: size.height, required: true },
    ])
    setSelectedKey(key)
  }

  const startDrag = (
    e: React.PointerEvent,
    field: EditorField,
    mode: 'move' | 'resize',
    dims: { width: number; height: number },
  ) => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedKey(field.key)
    dragRef.current = {
      key: field.key,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.width,
      origH: field.height,
      pageW: dims.width,
      pageH: dims.height,
    }
  }

  const removeField = (key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key))
    if (selectedKey === key) setSelectedKey(null)
  }

  const handleSave = async () => {
    await onSave(
      fields.map((f) => ({
        signerId: f.signerId,
        fieldType: f.fieldType,
        label: f.label,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required,
      })),
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const fieldsWithoutSigner = fields.filter((f) => !signers.some((s) => s.id === f.signerId))

  return (
    <div className="flex gap-5">
      {/* PDF + overlays */}
      <div className="flex-1 rounded-lg border bg-gray-100 p-4 overflow-auto max-h-[calc(100vh-160px)]">
        <PdfPageCanvas
          fileUrl={pdfUrl}
          pageWidth={620}
          renderPageOverlay={(page, dims) => (
            <div
              className="absolute inset-0 cursor-crosshair"
              onClick={(e) => handlePageClick(page, dims, e)}
            >
              {fields
                .filter((f) => f.page === page)
                .map((f) => {
                  const idx = signerIndex(f.signerId)
                  const color = signerColor(idx < 0 ? 0 : idx)
                  const selected = f.key === selectedKey
                  const Icon = FIELD_META[f.fieldType].icon
                  return (
                    <div
                      key={f.key}
                      onPointerDown={(e) => startDrag(e, f, 'move', dims)}
                      onClick={(e) => { e.stopPropagation(); setSelectedKey(f.key) }}
                      className="absolute flex items-center justify-center rounded touch-none select-none"
                      style={{
                        left: `${f.x}%`,
                        top: `${f.y}%`,
                        width: `${f.width}%`,
                        height: `${f.height}%`,
                        border: `2px ${selected ? 'solid' : 'dashed'} ${color.border}`,
                        background: color.bg,
                        cursor: 'move',
                      }}
                    >
                      <div className="flex items-center gap-1 pointer-events-none" style={{ color: color.text }}>
                        <Icon size={12} />
                        <span className="text-[10px] font-medium truncate">
                          {FIELD_META[f.fieldType].label}
                        </span>
                      </div>
                      {selected && (
                        <>
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); removeField(f.key) }}
                            className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow border text-red-500"
                          >
                            <Trash2 size={11} />
                          </button>
                          <div
                            onPointerDown={(e) => startDrag(e, f, 'resize', dims)}
                            className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm bg-white shadow border cursor-nwse-resize"
                            style={{ borderColor: color.border }}
                          />
                        </>
                      )}
                    </div>
                  )
                })}
            </div>
          )}
        />
      </div>

      {/* Sidebar */}
      <div className="w-72 shrink-0 space-y-5">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">{assigneeLabel}を選択</p>
          <div className="space-y-1.5">
            {signers.map((s, i) => {
              const color = signerColor(i)
              const active = s.id === activeSignerId
              const count = fields.filter((f) => f.signerId === s.id).length
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSignerId(s.id)}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${active ? 'border-foreground/30 bg-muted' : 'border-transparent hover:bg-muted/50'}`}
                >
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ background: color.dot }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{s.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{s.email}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{count}</span>
                </button>
              )
            })}
          </div>
          {signers.length === 0 && (
            <p className="text-xs text-muted-foreground">署名者が未設定です。先に署名者を追加してください。</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">配置する項目</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FIELD_META) as FieldType[]).map((t) => {
              const Icon = FIELD_META[t].icon
              const active = t === activeType
              return (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${active ? 'border-foreground/30 bg-muted' : 'hover:bg-muted/50'}`}
                >
                  <Icon size={14} />
                  {FIELD_META[t].label}
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            PDF上の配置したい位置をクリックすると、選択中の署名者・項目の欄が追加されます。ドラッグで移動、右下でサイズ変更できます。
          </p>
        </div>

        {fieldsWithoutSigner.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              署名者が割り当てられていない欄が{fieldsWithoutSigner.length}個あります。
            </p>
          </div>
        )}

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">配置済みの欄</span>
            <span className="font-medium">{fields.length}</span>
          </div>
          {saveError && (
            <p className="text-xs text-red-600">{saveError}</p>
          )}
          {saved && <p className="text-xs text-emerald-600">保存しました</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => router.push(backHref)}>
              戻る
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
