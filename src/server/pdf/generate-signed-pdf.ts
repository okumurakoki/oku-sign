import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { PDFDocument, rgb, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_PATH = join(process.cwd(), 'src/server/pdf/fonts/NotoSansJP-Regular.ttf')
const BRAND = rgb(0.239, 0.31, 0.373) // #3d4f5f

let _fontBytes: Buffer | null = null
function loadFontBytes(): Buffer {
  if (!_fontBytes) _fontBytes = readFileSync(FONT_PATH)
  return _fontBytes
}

export interface SignerCertInfo {
  name: string
  email: string
  signedAt: Date | null
  ipAddress: string | null
  signatureImage: string | null // data URL (PNG)
}

export interface SignedPdfInput {
  originalPdf: Buffer
  contractTitle: string
  contractId: string
  signers: SignerCertInfo[]
}

// 元PDFに署名証明ページを付与した署名済みPDFを生成して返す（立会人型）。
export async function generateSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(input.originalPdf)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(loadFontBytes(), { subset: true })

  // 原本のSHA-256（改ざん検知用）
  const docHash = createHash('sha256').update(input.originalPdf).digest('hex')

  await appendCertificatePage(pdfDoc, font, input, docHash)

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
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
  page.drawText('okuサイン 電子署名証明書', {
    x: margin, y: 815, size: 15, font, color: rgb(1, 1, 1),
  })
  y = 770

  drawText('書類名', margin, 10, rgb(0.5, 0.5, 0.5))
  y -= 16
  drawText(input.contractTitle, margin, 13)
  y -= 30

  drawText('書類ID', margin, 10, rgb(0.5, 0.5, 0.5))
  y -= 15
  drawText(input.contractId, margin, 10, rgb(0.3, 0.3, 0.3))
  y -= 28

  drawText('原本ハッシュ (SHA-256)', margin, 10, rgb(0.5, 0.5, 0.5))
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

  drawText(`署名者一覧（${input.signers.length}名）`, margin, 12, BRAND)
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
    const signedLabel = s.signedAt
      ? `署名日時: ${formatJst(s.signedAt)}`
      : '署名日時: ―'
    page.drawText(signedLabel, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })
    y -= 13
    page.drawText(`IPアドレス: ${s.ipAddress ?? '―'}`, { x: margin, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) })

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
        page.drawText('［署名画像を表示できませんでした］', {
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
    'この証明書は okuサイン により生成されました。原本ハッシュにより文書の同一性を検証できます。',
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
