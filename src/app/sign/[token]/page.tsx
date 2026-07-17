import { headers } from 'next/headers'
import { getDb } from '@/server/db'
import { contractSigners, contracts, users, signatureFields, auditLogs } from '@/server/db/schema'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { ulid } from 'ulid'
import { getSignedUrl } from '@/server/storage'
import { reportError } from '@/server/report-error'
import { SigningView } from './signing-view'

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const db = getDb()

  const [signer] = await db
    .select()
    .from(contractSigners)
    .where(eq(contractSigners.token, token))
    .limit(1)

  if (!signer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold mb-2">リンクが無効です</h1>
          <p className="text-sm text-gray-500">
            この署名リンクは無効か、既に使用されています。
          </p>
        </div>
      </div>
    )
  }

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, signer.contractId))
    .limit(1)

  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold mb-2">書類が見つかりません</h1>
          <p className="text-sm text-gray-500">
            この書類は削除された可能性があります。
          </p>
        </div>
      </div>
    )
  }

  // Contract cancelled
  if (contract.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold mb-2">この書類は取り消されました</h1>
          <p className="text-sm text-gray-500">
            送信者により書類が取り消されています。詳細については送信者にお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  if (signer.status === 'signed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-emerald-600 text-lg">&#10003;</span>
          </div>
          <h1 className="text-lg font-semibold mb-2">署名済みです</h1>
          <p className="text-sm text-gray-500">
            この書類は既に署名が完了しています。
          </p>
          {signer.signedAt && (
            <p className="text-xs text-gray-400 mt-2 font-mono">
              署名日時: {new Date(signer.signedAt).toLocaleString('ja-JP')}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (signer.status === 'declined') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg border p-8 text-center">
          <h1 className="text-lg font-semibold mb-2">この書類は辞退されています</h1>
          <p className="text-sm text-gray-500">
            署名が辞退されています。送信者にお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  // Record view if first time（pending/notified の初回アクセスで viewed に）。
  // 取消・処理済みの分岐より後に置く: 取消済みリンクを開いただけで
  // 「書類を閲覧しました」という監査証跡を作らない（実際は取消画面しか出ない）。
  // アクセスコード付きはコード検証後（/api/sign unlock）に記録するためここでは記録しない
  if (!signer.accessCode && (signer.status === 'pending' || signer.status === 'notified') && !signer.viewedAt) {
    const viewedClaim = await db
      .update(contractSigners)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(and(
        eq(contractSigners.id, signer.id),
        inArray(contractSigners.status, ['pending', 'notified']),
        isNull(contractSigners.viewedAt),
        // 契約SELECT後の並行取消にもclaim時点で追随する（取消済みに閲覧証跡を作らない）
        sql`EXISTS (SELECT 1 FROM ${contracts} WHERE ${contracts.id} = ${signer.contractId} AND ${contracts.status} IN ('sent', 'signing'))`,
      ))
      .returning({ id: contractSigners.id })
    if (viewedClaim.length > 0) {
      const h = await headers()
      await db.insert(auditLogs).values({
        id: ulid(),
        contractId: signer.contractId,
        action: 'viewed',
        actorEmail: signer.email,
        detail: `${signer.name}が書類を閲覧しました`,
        ipAddress: h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown',
        userAgent: h.get('user-agent') ?? 'unknown',
      })
    }
  }

  // Get sender info
  const [sender] = await db
    .select({ name: users.name, companyName: users.companyName })
    .from(users)
    .where(eq(users.id, contract.createdBy))
    .limit(1)

  // 契約PDFの署名付きURL（privateバケット・有効期限付き）を生成。
  // アクセスコード付きの署名者には初期表示で配布しない（リンク転送・漏洩時に
  // コードを知らない第三者が内容を閲覧できてしまう）。コード検証後に
  // /api/sign の unlock アクションが返す。
  const requiresAccessCode = !!signer.accessCode
  let pdfSignedUrl: string | null = null
  if (contract.pdfUrl && !requiresAccessCode) {
    try {
      pdfSignedUrl = await getSignedUrl(contract.pdfUrl)
    } catch (err) {
      // 失敗時はSigningViewが「PDFが添付されていません」を表示する（ページ全体は落とさない）
      reportError(err, { scope: 'sign/page:pdfSignedUrl', contractId: contract.id })
    }
  }

  // この署名者に割り当てられた署名欄のみ取得（他署名者の欄は返さない）
  const myFields = requiresAccessCode ? [] : await db
    .select()
    .from(signatureFields)
    .where(and(
      eq(signatureFields.contractId, contract.id),
      eq(signatureFields.signerId, signer.id),
    ))
    .orderBy(signatureFields.page)

  return (
    <SigningView
      token={token}
      signerName={signer.name}
      contractTitle={contract.title}
      pdfUrl={pdfSignedUrl}
      fields={myFields.map((f) => ({
        id: f.id,
        fieldType: f.fieldType,
        label: f.label,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: f.required,
      }))}
      senderName={sender?.name ?? null}
      senderCompany={sender?.companyName ?? null}
      message={contract.message}
      expiresAt={contract.expiresAt?.toISOString() ?? null}
      requiresAccessCode={!!signer.accessCode}
    />
  )
}
