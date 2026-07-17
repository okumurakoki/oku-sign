import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { PDFDocument, rgb, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import subsetFont from 'subset-font'

const FONT_PATH = join(process.cwd(), 'src/server/pdf/fonts/NotoSansJP-Regular.ttf')
const BRAND = rgb(0.239, 0.31, 0.373) // #3d4f5f

let _fontBytes: Buffer | null = null
function loadFontBytes(): Buffer {
  if (!_fontBytes) _fontBytes = readFileSync(FONT_PATH)
  return _fontBytes
}

// 証明ページに描く固定文言。描画とサブセット収集の両方がここを参照する
// （文言を直書きするとサブセットに漏れて豆腐になるため、必ずここに追加する）。
export const CERT_LABELS = {
  header: 'okuサイン 電子署名証明書',
  docName: '書類名',
  docId: '書類ID',
  hash: '原本ハッシュ (SHA-256)',
  signers: (n: number) => `署名者一覧（${n}名）`,
  signedAt: (v: string) => `署名日時: ${v}`,
  none: '―',
  ip: (v: string) => `IPアドレス: ${v}`,
  imageFailed: '［署名画像を表示できませんでした］',
  footer: 'この証明書は okuサイン により生成されました。原本ハッシュにより文書の同一性を検証できます。',
} as const

const ASCII_PRINTABLE = (() => {
  let s = ''
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c)
  return s
})()

// この文書に描画される可能性のある全文字を集める（欄の値・署名者・固定文言）
export function collectDrawnText(input: SignedPdfInput): string {
  const parts: string[] = [
    ASCII_PRINTABLE,
    CERT_LABELS.header,
    CERT_LABELS.docName,
    CERT_LABELS.docId,
    CERT_LABELS.hash,
    CERT_LABELS.signers(input.signers.length),
    CERT_LABELS.signedAt(CERT_LABELS.none),
    CERT_LABELS.ip(CERT_LABELS.none),
    CERT_LABELS.imageFailed,
    CERT_LABELS.footer,
    input.contractTitle,
    input.contractId,
  ]
  for (const s of input.signers) {
    parts.push(`${s.name}${s.email}`)
    if (s.signedAt) parts.push(formatJst(s.signedAt))
    if (s.ipAddress) parts.push(s.ipAddress)
  }
  for (const f of input.placedFields ?? []) {
    if (f.value) parts.push(f.value)
  }
  return parts.join('')
}

// loclが日本語文脈の数字を代替グリフに置換すると、pdf-libのW(幅)配列に
// その幅が載らずビューアがデフォルト幅1000で描き数字の字間が倍化する（実測）。
// 代替グリフを使わないようloclを無効化する。
const LAYOUT_FEATURES = { locl: false }

// 文書に必要な文字だけをharfbuzzでサブセットして埋め込む（9.5MB→数十KB）。
// pdf-lib側のsubset:trueはグリフ破損の実測があるため使わず、事前サブセット
// したフォントを全埋め込み(subset:false)する。失敗時は従来どおり全埋め込み。
async function embedJpFont(pdfDoc: PDFDocument, input: SignedPdfInput): Promise<PDFFont> {
  const fullBytes = loadFontBytes()
  try {
    const sub = await subsetFont(fullBytes, collectDrawnText(input), {
      targetFormat: 'truetype',
      variationAxes: { wght: 400 },
    })
    return await pdfDoc.embedFont(sub, { subset: false, features: LAYOUT_FEATURES })
  } catch (err) {
    console.error('[generate-signed-pdf] フォントサブセット失敗・全埋め込みへフォールバック:', err)
    return await pdfDoc.embedFont(fullBytes, { subset: false, features: LAYOUT_FEATURES })
  }
}

export interface SignerCertInfo {
  name: string
  email: string
  signedAt: Date | null
  ipAddress: string | null
  signatureImage: string | null // data URL (PNG)
}

// 座標配置された署名内容（%座標）。ページ上の該当位置に描画する。
export interface PlacedField {
  page: number       // 1始まり
  x: number          // 左上X（%）
  y: number          // 左上Y（%）
  width: number      // 幅（%）
  height: number     // 高さ（%）
  type: 'draw' | 'text' | 'date' | 'stamp'
  imageData?: string | null // draw/stamp: PNG dataURL
  value?: string | null     // text/date: 文字値
}

export interface SignedPdfInput {
  originalPdf: Buffer
  contractTitle: string
  contractId: string
  signers: SignerCertInfo[]
  placedFields?: PlacedField[]
}

// 元PDFに署名を座標配置し、署名証明ページを付与した署名済みPDFを生成して返す。
export async function generateSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input.originalPdf)
  pdfDoc.registerFontkit(fontkit)
  const font = await embedJpFont(pdfDoc, input)

  // 原本のSHA-256（改ざん検知用）
  const docHash = createHash('sha256').update(input.originalPdf).digest('hex')

  // 署名を本文の座標に配置
  if (input.placedFields && input.placedFields.length > 0) {
    await placeFieldsOnPages(pdfDoc, font, input.placedFields)
  }

  await appendCertificatePage(pdfDoc, font, input, docHash)

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}

// 各署名欄を該当ページの座標（%→pt、PDFは左下原点）に描画
async function placeFieldsOnPages(pdfDoc: PDFDocument, font: PDFFont, fields: PlacedField[]) {
  const pageCount = pdfDoc.getPageCount()
  for (const f of fields) {
    if (f.page < 1 || f.page > pageCount) continue
    const page = pdfDoc.getPage(f.page - 1)
    const { width: pw, height: ph } = page.getSize()

    const boxW = (f.width / 100) * pw
    const boxH = (f.height / 100) * ph
    const boxX = (f.x / 100) * pw
    // %yは上端基準・PDFは下端基準
    const boxYTop = (f.y / 100) * ph
    const boxYBottom = ph - boxYTop - boxH

    if ((f.type === 'draw' || f.type === 'stamp') && f.imageData) {
      const img = await embedSignatureImage(pdfDoc, f.imageData)
      if (img) {
        // アスペクト比を保持して枠内に収める
        const scale = Math.min(boxW / img.width, boxH / img.height)
        const w = img.width * scale
        const h = img.height * scale
        page.drawImage(img, {
          x: boxX + (boxW - w) / 2,
          y: boxYBottom + (boxH - h) / 2,
          width: w,
          height: h,
        })
      }
    } else if ((f.type === 'text' || f.type === 'date') && f.value) {
      const size = Math.min(boxH * 0.7, 14)
      page.drawText(f.value, {
        x: boxX + 2,
        y: boxYBottom + (boxH - size) / 2 + size * 0.15,
        size,
        font,
        color: rgb(0.1, 0.1, 0.1),
      })
    }
  }
}

async function appendCertificatePage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  input: SignedPdfInput,
  docHash: string,
) {
  let page = pdfDoc.addPage([595, 842]) // A4
  const margin = 50
  let y = 792

  const drawText = (text: string, x: number, size: number, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(text, { x, y, size, font, color })
  }

  // ヘッダー
  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: BRAND })
  page.drawText(CERT_LABELS.header, {
    x: margin, y: 815, size: 15, font, color: rgb(1, 1, 1),
  })
  y = 770

  drawText(CERT_LABELS.docName, margin, 10, rgb(0.5, 0.5, 0.5))
  y -= 16
  drawText(input.contractTitle, margin, 13)
  y -= 30

  drawText(CERT_LABELS.docId, margin, 10, rgb(0.5, 0.5, 0.5))
  y -= 15
  drawText(input.contractId, margin, 10, rgb(0.3, 0.3, 0.3))
  y -= 28

  drawText(CERT_LABELS.hash, margin, 10, rgb(0.5, 0.5, 0.5))
  y -= 15
  // ハッシュは長いので2行に分割
  drawText(docHash.slice(0, 32), margin, 9, rgb(0.3, 0.3, 0.3))
  y -= 12
  drawText(docHash.slice(32), margin, 9, rgb(0.3, 0.3, 0.3))
  y -= 26

  page.drawLine({
    start: { x: margin, y }, end: { x: 545, y },
    thickness: 1, color: rgb(0.9, 0.9, 0.9),
  })
  y -= 26

  drawText(CERT_LABELS.signers(input.signers.length), margin, 12, BRAND)
  y -= 24

  for (let i = 0; i < input.signers.length; i++) {
    const s = input.signers[i]

    // ページ下端に近づいたら改ページ
    if (y < 160) {
      page = pdfDoc.addPage([595, 842])
      y = 792
    }

    // 署名者カード枠
    const cardTop = y
    page.drawText(`${i + 1}. ${s.name}`, { x: margin, y, size: 12, font, color: rgb(0.1, 0.1, 0.1) })
    y -= 17
    page.drawText(s.email, { x: margin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 15
    const signedLabel = CERT_LABELS.signedAt(s.signedAt ? formatJst(s.signedAt) : CERT_LABELS.none)
    page.drawText(signedLabel, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 13
    page.drawText(CERT_LABELS.ip(s.ipAddress ?? CERT_LABELS.none), { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })

    // 署名画像（右側に配置）
    if (s.signatureImage) {
      const img = await embedSignatureImage(pdfDoc, s.signatureImage)
      if (img) {
        const maxW = 150
        const maxH = 55
        const scale = Math.min(maxW / img.width, maxH / img.height)
        const w = img.width * scale
        const h = img.height * scale
        page.drawImage(img, { x: 545 - w, y: cardTop - h + 4, width: w, height: h })
      } else {
        // 画像を復元できない場合は証明書上に明示（署名の事実は監査ログとハッシュで担保）
        page.drawText(CERT_LABELS.imageFailed, {
          x: 380, y: cardTop - 12, size: 8, font, color: rgb(0.7, 0.3, 0.3),
        })
      }
    }

    y -= 20
    page.drawLine({
      start: { x: margin, y }, end: { x: 545, y },
      thickness: 0.5, color: rgb(0.92, 0.92, 0.92),
    })
    y -= 20
  }

  // フッター注記
  const footerPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1)
  footerPage.drawText(
    CERT_LABELS.footer,
    { x: margin, y: 40, size: 8, font, color: rgb(0.6, 0.6, 0.6) },
  )
}

async function embedSignatureImage(pdfDoc: PDFDocument, dataUrl: string) {
  try {
    const base64 = dataUrl.split(',')[1]
    if (!base64) return null
    const bytes = Buffer.from(base64, 'base64')
    // 署名画像はPNG（canvas.toDataURL('image/png')）
    return await pdfDoc.embedPng(bytes)
  } catch (err) {
    // 画像1枚の埋め込み失敗で証明書全体を落とさない（署名者情報は文字で残る）
    console.error('[generate-signed-pdf] 署名画像の埋め込みに失敗:', err)
    return null
  }
}

function formatJst(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date)
}
