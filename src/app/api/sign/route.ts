import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { getDb } from '@/server/db'
import { contractSigners, signatures, auditLogs, contracts, users } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { signerCompletedEmail, signerDeclinedEmail, contractCompletedEmail } from '@/server/email/templates'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

// アクセスコードのタイミングセーフ比較（長さ差による情報漏洩を防ぐためSHA-256で固定長化）
function accessCodeMatches(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, signatureImage, action, declineReason, accessCode } = body

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const db = getDb()

  const [signer] = await db
    .select()
    .from(contractSigners)
    .where(eq(contractSigners.token, token))
    .limit(1)

  if (!signer) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  if (signer.status === 'signed' || signer.status === 'declined') {
    return NextResponse.json({ error: 'Already processed' }, { status: 400 })
  }

  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, signer.contractId))
    .limit(1)

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  // 契約が署名可能な状態か（draft/cancelled/completedは不可）
  if (contract.status !== 'sent' && contract.status !== 'signing') {
    return NextResponse.json({ error: 'この書類は現在署名を受け付けていません' }, { status: 409 })
  }

  // 署名期限チェック（サーバー側で強制）
  if (contract.expiresAt && new Date(contract.expiresAt) < new Date()) {
    return NextResponse.json({ error: '署名期限を過ぎています' }, { status: 410 })
  }

  // アクセスコード検証（設定されている場合のみ・タイミングセーフ比較）
  if (signer.accessCode) {
    if (typeof accessCode !== 'string' || !accessCodeMatches(accessCode, signer.accessCode)) {
      return NextResponse.json({ error: 'アクセスコードが正しくありません', code: 'INVALID_ACCESS_CODE' }, { status: 403 })
    }
  }

  // 署名順序の強制（自分より前の順序の署名者が全員署名済みであること）
  if (action !== 'decline') {
    const priorSigners = await db
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, signer.contractId))
    const blocked = priorSigners.some(
      (s) => s.signOrder < signer.signOrder && s.status !== 'signed',
    )
    if (blocked) {
      return NextResponse.json({ error: '前の署名者の署名が完了していません', code: 'OUT_OF_ORDER' }, { status: 409 })
    }
  }

  // Get sender info
  const [sender] = await db
    .select()
    .from(users)
    .where(eq(users.id, contract.createdBy))
    .limit(1)

  const now = new Date()
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
  const ua = request.headers.get('user-agent') ?? 'unknown'

  // --- DECLINE ---
  if (action === 'decline') {
    await db
      .update(contractSigners)
      .set({ status: 'declined', declineReason: declineReason || null })
      .where(eq(contractSigners.id, signer.id))

    await db.insert(auditLogs).values({
      id: ulid(),
      contractId: signer.contractId,
      action: 'declined',
      actorEmail: signer.email,
      detail: `${signer.name}が署名を辞退しました${declineReason ? `（理由: ${declineReason}）` : ''}`,
      ipAddress: ip,
      createdAt: now,
    })

    // Notify sender
    if (sender) {
      const emailData = signerDeclinedEmail({
        senderName: sender.name,
        signerName: signer.name,
        contractTitle: contract.title,
        contractUrl: `${BASE_URL}/contracts/${contract.id}`,
        reason: declineReason,
      })
      await sendEmail({ to: sender.email, ...emailData })
    }

    return NextResponse.json({ ok: true, action: 'declined' })
  }

  // --- SIGN ---
  if (!signatureImage) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  await db.insert(signatures).values({
    id: ulid(),
    contractId: signer.contractId,
    signerId: signer.id,
    imageUrl: signatureImage,
    ipAddress: ip,
    userAgent: ua,
    signedAt: now,
  })

  await db
    .update(contractSigners)
    .set({ status: 'signed', signedAt: now })
    .where(eq(contractSigners.id, signer.id))

  await db.insert(auditLogs).values({
    id: ulid(),
    contractId: signer.contractId,
    action: 'signed',
    actorEmail: signer.email,
    detail: `${signer.name}が署名しました`,
    ipAddress: ip,
    createdAt: now,
  })

  // Check all signed
  const allSigners = await db
    .select()
    .from(contractSigners)
    .where(eq(contractSigners.contractId, signer.contractId))

  const allSigned = allSigners.every(
    (s) => s.id === signer.id ? true : s.status === 'signed',
  )

  // Notify sender
  if (sender) {
    const emailData = signerCompletedEmail({
      senderName: sender.name,
      signerName: signer.name,
      contractTitle: contract.title,
      contractUrl: `${BASE_URL}/contracts/${contract.id}`,
      allCompleted: allSigned,
    })
    await sendEmail({ to: sender.email, ...emailData })
  }

  if (allSigned) {
    await db
      .update(contracts)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(eq(contracts.id, signer.contractId))

    await db.insert(auditLogs).values({
      id: ulid(),
      contractId: signer.contractId,
      action: 'completed',
      actorEmail: 'system',
      detail: '全署名者の署名が完了し、契約が締結されました',
      createdAt: now,
    })

    // Send completion emails to all signers
    for (const s of allSigners) {
      const emailData = contractCompletedEmail({
        recipientName: s.name,
        contractTitle: contract.title,
        contractUrl: `${BASE_URL}/sign/${s.token}`,
      })
      await sendEmail({ to: s.email, ...emailData })
    }
  }

  return NextResponse.json({ ok: true, action: 'signed', allCompleted: allSigned })
}
