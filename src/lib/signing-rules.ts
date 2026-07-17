import { createHash, timingSafeEqual } from 'crypto'

// 署名フローの純粋な判定ロジック。副作用なし・テスト可能。

// アクセスコードのタイミングセーフ比較（長さ差の情報漏洩を防ぐためSHA-256で固定長化）
export function accessCodeMatches(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// 契約が署名を受け付けられる状態か
export function isContractSignable(status: string): boolean {
  return status === 'sent' || status === 'signing'
}

// 署名期限切れか
export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < now
}

// 署名順序ブロック: 自分より前の順序に未署名者がいれば true
export function isBlockedByOrder(
  signers: { signOrder: number; status: string; id: string }[],
  current: { signOrder: number; id: string },
): boolean {
  return signers.some(
    (s) => s.id !== current.id && s.signOrder < current.signOrder && s.status !== 'signed',
  )
}

// 全員署名済みか（current を signed とみなして判定）
export function allSignedExcept(
  signers: { id: string; status: string }[],
  currentId: string,
): boolean {
  return signers.every((s) => (s.id === currentId ? true : s.status === 'signed'))
}

// サブスク有効判定（active/trialing、または owner）
export const ACTIVE_SUB_STATUSES = ['active', 'trialing'] as const
export function isSubscriptionActive(
  isOwner: boolean,
  status: string | null | undefined,
): boolean {
  if (isOwner) return true
  return status ? (ACTIVE_SUB_STATUSES as readonly string[]).includes(status) : false
}

// 署名欄の%座標 → PDFの点座標（左下原点）に変換
export interface PctRect { x: number; y: number; width: number; height: number }
export interface PdfRect { x: number; y: number; width: number; height: number }
export function pctToPdfRect(field: PctRect, pageW: number, pageH: number): PdfRect {
  const width = (field.width / 100) * pageW
  const height = (field.height / 100) * pageH
  const x = (field.x / 100) * pageW
  const yTop = (field.y / 100) * pageH
  const y = pageH - yTop - height // PDFは下端原点
  return { x, y, width, height }
}

// 署名画像として受け付けるのはPNGのdata URLのみ（署名パッドのtoDataURL出力）。
// prefixだけでなくデコード後のPNGシグネチャも確認し、描画不能な偽データを弾く。
export function isValidPngDataUrl(data: string | null | undefined): boolean {
  const prefix = 'data:image/png;base64,'
  if (!data || !data.startsWith(prefix)) return false
  const b64 = data.slice(prefix.length)
  if (b64.length === 0) return false
  const buf = Buffer.from(b64, 'base64')
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < sig.length) return false
  return sig.every((b, i) => buf[i] === b)
}

// 署名欄への記入内容の検証（欄の所有・重複・タイプ整合・内容有無・必須網羅）。
// タイプ不整合（例: 署名欄にvalueだけ送る）を許すと、PDFに何も描画されないまま
// 締結が成立するため、fieldTypeと送信typeと内容の三点を厳密に対応付ける。
export interface FieldValueInput {
  fieldId: string
  type: 'draw' | 'text' | 'date' | 'stamp'
  value?: string | null
  imageData?: string | null
}
export interface FieldDef { id: string; fieldType: string; required: boolean }
export type FieldValidation = { ok: true } | { ok: false; code: string; error: string }

const EXPECTED_TYPE: Record<string, FieldValueInput['type']> = {
  signature: 'draw', stamp: 'stamp', text: 'text', date: 'date',
}

export function validateFieldValues(fields: FieldDef[], incoming: FieldValueInput[]): FieldValidation {
  const fieldMap = new Map(fields.map((f) => [f.id, f]))
  const seen = new Set<string>()
  for (const v of incoming) {
    const f = fieldMap.get(v.fieldId)
    if (!f) return { ok: false, code: 'INVALID_FIELD', error: '不正な署名欄が含まれています' }
    if (seen.has(v.fieldId)) return { ok: false, code: 'DUPLICATE_FIELD', error: '同じ署名欄への記入が重複しています' }
    seen.add(v.fieldId)
    if (v.type !== EXPECTED_TYPE[f.fieldType]) {
      return { ok: false, code: 'TYPE_MISMATCH', error: '署名欄の種類と記入内容が一致しません' }
    }
    if (f.fieldType === 'signature' || f.fieldType === 'stamp') {
      if (!isValidPngDataUrl(v.imageData)) {
        return { ok: false, code: 'INVALID_IMAGE', error: '署名画像の形式が不正です' }
      }
    } else if (!v.value || v.value.trim().length === 0) {
      return { ok: false, code: 'EMPTY_VALUE', error: '空の署名欄が含まれています' }
    }
  }
  const filledIds = new Set(incoming.map((v) => v.fieldId))
  const missingRequired = fields.filter((f) => f.required && !filledIds.has(f.id))
  if (missingRequired.length > 0) {
    return { ok: false, code: 'MISSING_REQUIRED', error: '必須の署名欄が未記入です' }
  }
  return { ok: true }
}

// アクセスコード失敗時のロック判定
export function nextLockState(
  currentAttempts: number,
  maxAttempts: number,
): { attempts: number; locked: boolean } {
  const attempts = currentAttempts + 1
  const locked = attempts >= maxAttempts
  return { attempts: locked ? 0 : attempts, locked }
}
