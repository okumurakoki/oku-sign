import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getDb } from '@/server/db'
import { contractSigners, signatures, signatureFields, auditLogs, contracts, users } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { signerCompletedEmail, signerDeclinedEmail, contractCompletedEmail, signingRequestEmail } from '@/server/email/templates'
import { downloadPdf, uploadSignedPdf } from '@/server/storage'
import { generateSignedPdf } from '@/server/pdf/generate-signed-pdf'
import { accessCodeMatches, isContractSignable, isExpired, isBlockedByOrder, allSignedExcept, nextLockState } from '@/lib/signing-rules'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

// アクセスコード総当たり対策: N回失敗でロック
const MAX_ACCESS_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15分

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, signatureImage, action, declineReason, accessCode, fieldValues } = body

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
  if (!isContractSignable(contract.status)) {
    return NextResponse.json({ error: 'この書類は現在署名を受け付けていません' }, { status: 409 })
  }

  // 署名期限チェック（サーバー側で強制）
  if (isExpired(contract.expiresAt)) {
    return NextResponse.json({ error: '署名期限を過ぎています' }, { status: 410 })
  }

  // アクセスコード検証（設定時のみ・タイミングセーフ比較・総当たりロックアウト付き）
  if (signer.accessCode) {
    const nowTs = new Date()
    // ロック中か
    if (signer.lockedUntil && new Date(signer.lockedUntil) > nowTs) {
      return NextResponse.json(
        { error: '試行回数が上限に達しました。しばらくしてから再度お試しください', code: 'LOCKED' },
        { status: 429 },
      )
    }
    if (typeof accessCode !== 'string' || !accessCodeMatches(accessCode, signer.accessCode)) {
      // 失敗回数を加算し、閾値超過でロック
      const { attempts, locked } = nextLockState(signer.accessAttempts ?? 0, MAX_ACCESS_ATTEMPTS)
      await db
        .update(contractSigners)
        .set({
          accessAttempts: attempts,
          lockedUntil: locked ? new Date(nowTs.getTime() + LOCK_DURATION_MS) : signer.lockedUntil,
        })
        .where(eq(contractSigners.id, signer.id))
      if (locked) {
        const ipAddr = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
        await db.insert(auditLogs).values({
          id: ulid(),
          contractId: signer.contractId,
          action: 'access_locked',
          actorEmail: signer.email,
          detail: `${signer.name}のアクセスコードが${MAX_ACCESS_ATTEMPTS}回失敗しロックされました`,
          ipAddress: ipAddr,
        })
      }
      return NextResponse.json(
        locked
          ? { error: '試行回数が上限に達しました。しばらくしてから再度お試しください', code: 'LOCKED' }
          : { error: 'アクセスコードが正しくありません', code: 'INVALID_ACCESS_CODE' },
        { status: locked ? 429 : 403 },
      )
    }
    // 成功時は失敗カウントをリセット
    if (signer.accessAttempts > 0 || signer.lockedUntil) {
      await db
        .update(contractSigners)
        .set({ accessAttempts: 0, lockedUntil: null })
        .where(eq(contractSigners.id, signer.id))
    }
  }

  // 署名順序の強制（自分より前の順序の署名者が全員署名済みであること）
  if (action !== 'decline') {
    const priorSigners = await db
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, signer.contractId))
    if (isBlockedByOrder(priorSigners, signer)) {
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
    const reason = typeof declineReason === 'string' ? declineReason.slice(0, 1000) : null
    await db
      .update(contractSigners)
      .set({ status: 'declined', declineReason: reason })
      .where(eq(contractSigners.id, signer.id))

    // 1名でも辞退したら契約を取消にして全体を終了（後続署名者のブロック/リマインド暴走を防ぐ）
    await db
      .update(contracts)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(contracts.id, signer.contractId))

    await db.insert(auditLogs).values({
      id: ulid(),
      contractId: signer.contractId,
      action: 'declined',
      actorEmail: signer.email,
      detail: `${signer.name}が署名を辞退しました${reason ? `（理由: ${reason}）` : ''}`,
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
  // 入力バリデーション（フィールド方式 or 単一署名フォールバック）
  const fieldValueSchema = z.array(z.object({
    fieldId: z.string(),
    type: z.enum(['draw', 'text', 'date', 'stamp']),
    value: z.string().max(2000).optional(),
    imageData: z.string().max(2_000_000).optional(),
  })).max(200) // 欄数の上限（書き込み増幅を防ぐ）
  const parsed = fieldValueSchema.safeParse(fieldValues)

  // 後方互換: fieldValues が無く signatureImage のみ来た場合は単一署名扱い
  let incoming = parsed.success ? parsed.data : []
  if (incoming.length === 0 && typeof signatureImage === 'string' && signatureImage) {
    incoming = [{ fieldId: '', type: 'draw', imageData: signatureImage }]
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: '署名内容がありません' }, { status: 400 })
  }

  // この署名者に割り当てられた署名欄を取得し、記入内容を検証
  const myFields = await db
    .select()
    .from(signatureFields)
    .where(and(
      eq(signatureFields.contractId, signer.contractId),
      eq(signatureFields.signerId, signer.id),
    ))

  if (myFields.length > 0) {
    const fieldMap = new Map(myFields.map((f) => [f.id, f]))
    // 送信された各値が自分の欄に属するか
    for (const v of incoming) {
      if (!fieldMap.has(v.fieldId)) {
        return NextResponse.json({ error: '不正な署名欄が含まれています', code: 'INVALID_FIELD' }, { status: 400 })
      }
      const hasContent = (v.imageData && v.imageData.length > 0) || (v.value && v.value.length > 0)
      if (!hasContent) {
        return NextResponse.json({ error: '空の署名欄が含まれています' }, { status: 400 })
      }
    }
    // 必須欄がすべて記入されているか（サーバー側で強制）
    const filledIds = new Set(incoming.map((v) => v.fieldId))
    const missingRequired = myFields.filter((f) => f.required && !filledIds.has(f.id))
    if (missingRequired.length > 0) {
      return NextResponse.json({ error: '必須の署名欄が未記入です', code: 'MISSING_REQUIRED' }, { status: 400 })
    }
  }

  // 署名レコードを欄ごとに保存
  await db.insert(signatures).values(
    incoming.map((v) => ({
      id: ulid(),
      contractId: signer.contractId,
      signerId: signer.id,
      fieldId: v.fieldId || null,
      type: v.type,
      imageUrl: v.imageData ?? null,
      value: v.value ?? null,
      ipAddress: ip,
      userAgent: ua,
      signedAt: now,
    })),
  )

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

  const allSigned = allSignedExcept(allSigners, signer.id)

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

  // 順次署名: 未完了なら次順序の署名者へ自動通知
  if (!allSigned) {
    const nextSigner = allSigners
      .filter((s) => s.status !== 'signed' && s.status !== 'declined' && s.id !== signer.id)
      .sort((a, b) => a.signOrder - b.signOrder)[0]
    if (nextSigner && nextSigner.status === 'pending') {
      const signUrl = `${BASE_URL}/sign/${nextSigner.token}`
      const emailData = signingRequestEmail({
        signerName: nextSigner.name,
        senderName: sender?.name ?? '',
        senderCompany: sender?.companyName ?? null,
        contractTitle: contract.title,
        signUrl,
        message: contract.message,
        expiresAt: contract.expiresAt,
      })
      await sendEmail({ to: nextSigner.email, ...emailData })
      await db
        .update(contractSigners)
        .set({ status: 'notified' })
        .where(eq(contractSigners.id, nextSigner.id))
      await db.insert(auditLogs).values({
        id: ulid(),
        contractId: signer.contractId,
        action: 'notified',
        actorEmail: 'system',
        detail: `${nextSigner.name}に署名依頼を送信しました（順次）`,
        createdAt: new Date(),
      })
    }
  }

  if (allSigned) {
    // 署名済みPDF（原本＋座標配置＋署名証明ページ）を生成して保存
    if (contract.pdfUrl) {
      try {
        const originalPdf = await downloadPdf(contract.pdfUrl)
        const sigRows = await db
          .select()
          .from(signatures)
          .where(eq(signatures.contractId, signer.contractId))
        const fieldRows = await db
          .select()
          .from(signatureFields)
          .where(eq(signatureFields.contractId, signer.contractId))
        const fieldMap = new Map(fieldRows.map((f) => [f.id, f]))

        // 座標配置する署名（fieldId付きのもの）
        const placedFields = sigRows
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

        const orderedSigners = [...allSigners].sort((a, b) => a.signOrder - b.signOrder)
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
      } catch (err) {
        // PDF生成失敗でも締結は成立させる（監査ログに記録し後続で再生成可能に）
        console.error(`[api/sign] 署名済みPDF生成失敗 contract=${contract.id}:`, err)
        await db.insert(auditLogs).values({
          id: ulid(),
          contractId: signer.contractId,
          action: 'signed_pdf_failed',
          actorEmail: 'system',
          detail: '署名済みPDFの生成に失敗しました（再生成が必要です）',
          createdAt: new Date(),
        })
      }
    }

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
