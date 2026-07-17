import { describe, it, expect } from 'vitest'
import {
  accessCodeMatches,
  isContractSignable,
  isExpired,
  isBlockedByOrder,
  allSignedExcept,
  isSubscriptionActive,
  pctToPdfRect,
  nextLockState,
  isValidPngDataUrl,
  validateFieldValues,
} from './signing-rules'

describe('accessCodeMatches', () => {
  it('一致で true', () => {
    expect(accessCodeMatches('1234', '1234')).toBe(true)
  })
  it('不一致で false', () => {
    expect(accessCodeMatches('1234', '9999')).toBe(false)
  })
  it('長さ違いでも false（例外を投げない）', () => {
    expect(accessCodeMatches('12', '123456')).toBe(false)
  })
  it('空文字の扱い', () => {
    expect(accessCodeMatches('', '1234')).toBe(false)
    expect(accessCodeMatches('', '')).toBe(true)
  })
})

describe('isContractSignable', () => {
  it('sent/signing は署名可', () => {
    expect(isContractSignable('sent')).toBe(true)
    expect(isContractSignable('signing')).toBe(true)
  })
  it('draft/completed/cancelled/expired は不可', () => {
    for (const s of ['draft', 'completed', 'cancelled', 'expired']) {
      expect(isContractSignable(s)).toBe(false)
    }
  })
})

describe('isExpired', () => {
  const now = new Date('2026-07-14T00:00:00Z')
  it('過去は期限切れ', () => {
    expect(isExpired('2026-07-13T00:00:00Z', now)).toBe(true)
  })
  it('未来は有効', () => {
    expect(isExpired('2026-07-15T00:00:00Z', now)).toBe(false)
  })
  it('null は期限なし=有効', () => {
    expect(isExpired(null, now)).toBe(false)
  })
})

describe('isBlockedByOrder', () => {
  const signers = [
    { id: 'a', signOrder: 1, status: 'signed' },
    { id: 'b', signOrder: 2, status: 'notified' },
    { id: 'c', signOrder: 3, status: 'pending' },
  ]
  it('前順序が署名済みならブロックしない', () => {
    expect(isBlockedByOrder(signers, { id: 'b', signOrder: 2 })).toBe(false)
  })
  it('前順序が未署名ならブロック', () => {
    expect(isBlockedByOrder(signers, { id: 'c', signOrder: 3 })).toBe(true)
  })
  it('先頭はブロックされない', () => {
    expect(isBlockedByOrder(signers, { id: 'a', signOrder: 1 })).toBe(false)
  })
})

describe('allSignedExcept', () => {
  it('自分以外全員署名済みなら true', () => {
    const signers = [
      { id: 'a', status: 'signed' },
      { id: 'b', status: 'viewed' },
    ]
    expect(allSignedExcept(signers, 'b')).toBe(true)
  })
  it('他に未署名がいれば false', () => {
    const signers = [
      { id: 'a', status: 'notified' },
      { id: 'b', status: 'viewed' },
    ]
    expect(allSignedExcept(signers, 'b')).toBe(false)
  })
})

describe('isSubscriptionActive', () => {
  it('owner は常に有効', () => {
    expect(isSubscriptionActive(true, null)).toBe(true)
    expect(isSubscriptionActive(true, 'canceled')).toBe(true)
  })
  it('非owner: active/trialing のみ有効', () => {
    expect(isSubscriptionActive(false, 'active')).toBe(true)
    expect(isSubscriptionActive(false, 'trialing')).toBe(true)
    expect(isSubscriptionActive(false, 'past_due')).toBe(false)
    expect(isSubscriptionActive(false, 'incomplete')).toBe(false)
    expect(isSubscriptionActive(false, null)).toBe(false)
  })
})

describe('pctToPdfRect', () => {
  it('上端基準%→下端基準ptへ変換', () => {
    // A4: 595 x 842。x=10%,y=10%,w=20%,h=10%
    const r = pctToPdfRect({ x: 10, y: 10, width: 20, height: 10 }, 595, 842)
    expect(r.x).toBeCloseTo(59.5)
    expect(r.width).toBeCloseTo(119)
    expect(r.height).toBeCloseTo(84.2)
    // y(下端) = 842 - 84.2 - 84.2 = 673.6
    expect(r.y).toBeCloseTo(673.6)
  })
  it('上端(y=0)は最上部に配置される', () => {
    const r = pctToPdfRect({ x: 0, y: 0, width: 10, height: 10 }, 100, 100)
    expect(r.y).toBeCloseTo(90) // 100 - 0 - 10
  })
})

describe('nextLockState', () => {
  it('閾値未満は加算のみ', () => {
    expect(nextLockState(2, 5)).toEqual({ attempts: 3, locked: false })
  })
  it('閾値到達でロック+カウントリセット', () => {
    expect(nextLockState(4, 5)).toEqual({ attempts: 0, locked: true })
  })
})

describe('isValidPngDataUrl', () => {
  // 1x1透明PNG
  const VALID = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  it('正当なPNG data URLを受理', () => {
    expect(isValidPngDataUrl(VALID)).toBe(true)
  })
  it('null/空/別MIME/偽base64を拒否', () => {
    expect(isValidPngDataUrl(null)).toBe(false)
    expect(isValidPngDataUrl('')).toBe(false)
    expect(isValidPngDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(false)
    expect(isValidPngDataUrl('data:image/png;base64,')).toBe(false)
    // prefixだけ正しくて中身がPNGでない
    expect(isValidPngDataUrl('data:image/png;base64,aGVsbG8=')).toBe(false)
  })
})

describe('validateFieldValues', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const fields = [
    { id: 'f1', fieldType: 'signature', required: true },
    { id: 'f2', fieldType: 'text', required: true },
    { id: 'f3', fieldType: 'date', required: false },
    { id: 'f4', fieldType: 'stamp', required: false },
  ]
  it('正常な記入を受理', () => {
    expect(validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', imageData: PNG },
      { fieldId: 'f2', type: 'text', value: '奥村' },
      { fieldId: 'f3', type: 'date', value: '2026/07/17' },
      { fieldId: 'f4', type: 'stamp', imageData: PNG },
    ])).toEqual({ ok: true })
  })
  it('他人の欄/存在しない欄を拒否', () => {
    const r = validateFieldValues(fields, [{ fieldId: 'zzz', type: 'draw', imageData: PNG }])
    expect(r).toMatchObject({ ok: false, code: 'INVALID_FIELD' })
  })
  it('同一欄の重複記入を拒否', () => {
    const r = validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', imageData: PNG },
      { fieldId: 'f1', type: 'draw', imageData: PNG },
      { fieldId: 'f2', type: 'text', value: 'x' },
    ])
    expect(r).toMatchObject({ ok: false, code: 'DUPLICATE_FIELD' })
  })
  it('署名欄にvalueだけ送る空振り署名を拒否(タイプ不整合)', () => {
    const r = validateFieldValues(fields, [
      { fieldId: 'f1', type: 'text', value: 'x' },
      { fieldId: 'f2', type: 'text', value: 'x' },
    ])
    expect(r).toMatchObject({ ok: false, code: 'TYPE_MISMATCH' })
  })
  it('署名欄にtype=drawで画像なし/偽画像を拒否', () => {
    expect(validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', value: 'x' },
      { fieldId: 'f2', type: 'text', value: 'x' },
    ])).toMatchObject({ ok: false, code: 'INVALID_IMAGE' })
    expect(validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', imageData: 'data:image/png;base64,aGVsbG8=' },
      { fieldId: 'f2', type: 'text', value: 'x' },
    ])).toMatchObject({ ok: false, code: 'INVALID_IMAGE' })
  })
  it('テキスト欄の空白のみを拒否', () => {
    const r = validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', imageData: PNG },
      { fieldId: 'f2', type: 'text', value: '   ' },
    ])
    expect(r).toMatchObject({ ok: false, code: 'EMPTY_VALUE' })
  })
  it('必須欄の未記入を拒否', () => {
    const r = validateFieldValues(fields, [
      { fieldId: 'f1', type: 'draw', imageData: PNG },
    ])
    expect(r).toMatchObject({ ok: false, code: 'MISSING_REQUIRED' })
  })
})
