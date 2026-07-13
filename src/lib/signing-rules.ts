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

// アクセスコード失敗時のロック判定
export function nextLockState(
  currentAttempts: number,
  maxAttempts: number,
): { attempts: number; locked: boolean } {
  const attempts = currentAttempts + 1
  const locked = attempts >= maxAttempts
  return { attempts: locked ? 0 : attempts, locked }
}
