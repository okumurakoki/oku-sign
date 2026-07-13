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
