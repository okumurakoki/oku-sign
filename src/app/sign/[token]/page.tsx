import { getDb } from '@/server/db'
import { contractSigners, contracts, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
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

  // Record view if first time
  if (signer.status === 'pending' && !signer.viewedAt) {
    await db
      .update(contractSigners)
      .set({ status: 'viewed', viewedAt: new Date() })
      .where(eq(contractSigners.id, signer.id))
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

  // Get sender info
  const [sender] = await db
    .select({ name: users.name, companyName: users.companyName })
    .from(users)
    .where(eq(users.id, contract.createdBy))
    .limit(1)

  return (
    <SigningView
      token={token}
      signerName={signer.name}
      contractTitle={contract.title}
      pdfUrl={contract.pdfUrl}
      senderName={sender?.name ?? null}
      senderCompany={sender?.companyName ?? null}
      message={contract.message}
      expiresAt={contract.expiresAt?.toISOString() ?? null}
    />
  )
}
