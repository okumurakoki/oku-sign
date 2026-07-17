import { eq } from 'drizzle-orm'
import { getDb } from '@/server/db'
import { contracts, contractSigners, signatures, signatureFields } from '@/server/db/schema'
import { downloadPdf, uploadSignedPdf } from '@/server/storage'
import { generateSignedPdf, type PlacedField } from './generate-signed-pdf'

// 契約の署名データから署名済みPDF（原本＋座標配置＋証明ページ）を生成して
// Storageへ保存する。締結時(/api/sign)と再生成(tRPC)の両方から呼ばれる。
export async function renderAndStoreSignedPdf(
  db: ReturnType<typeof getDb>,
  contractId: string,
): Promise<void> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, contractId))
    .limit(1)
  if (!contract) throw new Error(`契約が見つかりません: ${contractId}`)
  if (!contract.pdfUrl) throw new Error(`契約に原本PDFがありません: ${contractId}`)

  const originalPdf = await downloadPdf(contract.pdfUrl)
  const [sigRows, fieldRows, signerRows] = await Promise.all([
    db.select().from(signatures).where(eq(signatures.contractId, contractId)),
    db.select().from(signatureFields).where(eq(signatureFields.contractId, contractId)),
    db.select().from(contractSigners).where(eq(contractSigners.contractId, contractId)),
  ])
  const fieldMap = new Map(fieldRows.map((f) => [f.id, f]))

  // 座標配置する署名（fieldId付きのもの）
  const placedFields: PlacedField[] = sigRows
    .filter((r) => r.fieldId && fieldMap.has(r.fieldId))
    .map((r) => {
      const f = fieldMap.get(r.fieldId!)!
      return {
        page: f.page,
        x: f.x, y: f.y, width: f.width, height: f.height,
        type: r.type,
        imageData: r.imageUrl,
        value: r.value,
      }
    })

  // 証明ページ用：署名者ごとの代表署名画像（drawを優先）
  const drawBySigner = new Map<string, typeof sigRows[number]>()
  for (const r of sigRows) {
    if (!drawBySigner.has(r.signerId) || (r.imageUrl && r.type === 'draw')) {
      drawBySigner.set(r.signerId, r)
    }
  }

  const orderedSigners = [...signerRows].sort((a, b) => a.signOrder - b.signOrder)
  const signedPdf = await generateSignedPdf({
    originalPdf,
    contractTitle: contract.title,
    contractId: contract.id,
    placedFields,
    signers: orderedSigners.map((s) => {
      const sig = drawBySigner.get(s.id)
      return {
        name: s.name,
        email: s.email,
        signedAt: s.signedAt ?? sig?.signedAt ?? null,
        ipAddress: sig?.ipAddress ?? null,
        signatureImage: sig?.imageUrl ?? null,
      }
    }),
  })
  await uploadSignedPdf(signedPdf, contract.id)
}
