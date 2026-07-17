import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'fs'
import { join } from 'path'
import subsetFont from 'subset-font'
import {
  generateSignedPdf,
  collectDrawnText,
  CERT_LABELS,
  type SignedPdfInput,
} from './generate-signed-pdf'

// 1x1 透明PNG（署名画像の代役）
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function makeOriginalPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([595, 842])
  doc.addPage([595, 842])
  return Buffer.from(await doc.save())
}

// 人名によくある字＋JIS第2水準相当の低頻度字を混ぜた入力
function sampleInput(originalPdf: Buffer): SignedPdfInput {
  return {
    originalPdf,
    contractTitle: '業務委託契約書（テスト株式会社・髙﨑彌太郎氏）',
    contractId: '01JTESTULIDXXXXXXXXXXXXXXX',
    signers: [
      {
        name: '髙﨑 彌太郎',
        email: 'yataro@example.co.jp',
        signedAt: new Date('2026-07-17T03:00:00Z'),
        ipAddress: '203.0.113.10',
        signatureImage: TINY_PNG,
      },
      {
        name: '奥村 航希',
        email: 'kohki@example.co.jp',
        signedAt: new Date('2026-07-17T04:00:00Z'),
        ipAddress: null,
        signatureImage: null,
      },
    ],
    placedFields: [
      { page: 1, x: 10, y: 10, width: 30, height: 8, type: 'draw', imageData: TINY_PNG },
      { page: 1, x: 10, y: 30, width: 30, height: 6, type: 'text', value: '取締役 髙﨑彌太郎 之印' },
      { page: 2, x: 10, y: 10, width: 30, height: 6, type: 'date', value: '2026年07月17日' },
    ],
  }
}

describe('collectDrawnText', () => {
  it('固定文言・動的値・欄の値をすべて含む', async () => {
    const input = sampleInput(await makeOriginalPdf())
    const text = collectDrawnText(input)
    for (const label of [
      CERT_LABELS.header,
      CERT_LABELS.docName,
      CERT_LABELS.docId,
      CERT_LABELS.hash,
      CERT_LABELS.signers(2),
      CERT_LABELS.imageFailed,
      CERT_LABELS.footer,
    ]) {
      for (const ch of label) expect(text).toContain(ch)
    }
    for (const ch of '髙﨑彌太郎奥村航希業務委託契約書之印年月日―') expect(text).toContain(ch)
    // ASCII（メール・ハッシュ・ID・IP・日時の全構成文字）
    for (const ch of '@.0123456789abcdefXZ:/-') expect(text).toContain(ch)
  })

  it('サブセットフォントが収集した全文字のグリフを持つ', async () => {
    const input = sampleInput(await makeOriginalPdf())
    const text = collectDrawnText(input)
    const full = readFileSync(join(process.cwd(), 'src/server/pdf/fonts/NotoSansJP-Regular.ttf'))
    const sub = await subsetFont(full, text, {
      targetFormat: 'truetype',
      variationAxes: { wght: 400 },
    })
    const font = fontkit.create(new Uint8Array(sub))
    const missing: string[] = []
    for (const ch of new Set(text)) {
      if (!font.hasGlyphForCodePoint(ch.codePointAt(0)!)) missing.push(ch)
    }
    expect(missing).toEqual([])
  })
})

describe('generateSignedPdf（サブセット埋め込み）', () => {
  it('署名済みPDFが小さく生成され、pdf-libで再ロードできる', async () => {
    const original = await makeOriginalPdf()
    const out = await generateSignedPdf(sampleInput(original))
    // 従来は約5.9MB（フォント全埋め込み）。サブセット化で数十KB台になる
    expect(out.length).toBeLessThan(300_000)
    const reloaded = await PDFDocument.load(out)
    // 原本2ページ＋証明ページ
    expect(reloaded.getPageCount()).toBe(3)
  })
})
