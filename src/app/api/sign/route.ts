import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getDb } from '@/server/db'
import { contractSigners, signatures, signatureFields, auditLogs, contracts, users } from '@/server/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { sendEmail } from '@/server/email'
import { signerCompletedEmail, signerDeclinedEmail, contractCompletedEmail, signingRequestEmail } from '@/server/email/templates'
import { getSignedUrl } from '@/server/storage'
import { renderAndStoreSignedPdf } from '@/server/pdf/store-signed-pdf'
import { accessCodeMatches, isContractSignable, isExpired, isBlockedByOrder, allSignedExcept, nextLockState, validateFieldValues, isValidPngDataUrl } from '@/lib/signing-rules'
import { reportError } from '@/server/report-error'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:7583'

// アクセスコード総当たり対策: N回失敗でロック
const MAX_ACCESS_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15分

// メール送信の失敗が署名/締結のDB状態遷移を巻き添えにしないよう隔離する。
// 失敗はSentryに記録し、リマインダーcron(notified/viewed対象)が再送で救う。
async function sendEmailSafe(params: Parameters<typeof sendEmail>[0], scope: string): Promise<boolean> {
  try {
    await sendEmail(params)
    return true
  } catch (err) {
    reportError(err, { scope, to: params.to })
    return false
  }
}

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

  // --- UNLOCK ---
  // アクセスコード検証済み（上のブロックを通過）の署名者にPDF/署名欄を返す。
  // アクセスコード付き契約は、ページ初期表示ではPDF URLも署名欄も配布しない。
  if (action === 'unlock') {
    const ipAddr = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown'
    const uaStr = request.headers.get('user-agent') ?? 'unknown'
    // コード検証を伴う初回閲覧をここで記録する
    if ((signer.status === 'pending' || signer.status === 'notified') && !signer.viewedAt) {
      const viewedClaim = await db
        .update(contractSigners)
        .set({ status: 'viewed', viewedAt: new Date() })
        .where(and(
          eq(contractSigners.id, signer.id),
          inArray(contractSigners.status, ['pending', 'notified']),
          isNull(contractSigners.viewedAt),
        ))
        .returning({ id: contractSigners.id })
      if (viewedClaim.length > 0) {
        await db.insert(auditLogs).values({
          id: ulid(),
          contractId: signer.contractId,
          action: 'viewed',
          actorEmail: signer.email,
          detail: `${signer.name}が書類を閲覧しました（アクセスコード検証済み）`,
          ipAddress: ipAddr,
          userAgent: uaStr,
        })
      }
    }
    let pdfSignedUrl: string | null = null
    if (contract.pdfUrl) {
      try {
        pdfSignedUrl = await getSignedUrl(contract.pdfUrl)
      } catch (err) {
        reportError(err, { scope: 'api/sign:unlockPdfUrl', contractId: contract.id })
      }
    }
    const myFields = await db
      .select()
      .from(signatureFields)
      .where(and(
        eq(signatureFields.contractId, signer.contractId),
        eq(signatureFields.signerId, signer.id),
      ))
      .orderBy(signatureFields.page)
    return NextResponse.json({
      ok: true,
      action: 'unlocked',
      pdfUrl: pdfSignedUrl,
      fields: myFields.map((f) => ({
        id: f.id, fieldType: f.fieldType, label: f.label, page: f.page,
        x: f.x, y: f.y, width: f.width, height: f.height, required: f.required,
      })),
    })
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
    // 単一トランザクション: 契約行ロック下で状態を再検証し、claim・取消・auditを
    // 全て確定 or 全てロールバックする（部分失敗で不整合な declined を残さない）
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, signer.contractId))
        .for('update')
      if (!locked || !isContractSignable(locked.status)) return 'not_signable' as const

      // atomic claim: 二重POST/署名との競合時はどちらか一方だけが処理する
      const claimed = await tx
        .update(contractSigners)
        .set({ status: 'declined', declineReason: reason })
        .where(and(
          eq(contractSigners.id, signer.id),
          inArray(contractSigners.status, ['pending', 'notified', 'viewed']),
        ))
        .returning({ id: contractSigners.id })
      if (claimed.length === 0) return 'already' as const

      // 1名でも辞退したら契約を取消にして全体を終了（後続署名者のブロック/リマインド暴走を防ぐ）
      await tx
        .update(contracts)
        .set({ status: 'cancelled', updatedAt: now })
        .where(eq(contracts.id, signer.contractId))

      await tx.insert(auditLogs).values({
        id: ulid(),
        contractId: signer.contractId,
        action: 'declined',
        actorEmail: signer.email,
        detail: `${signer.name}が署名を辞退しました${reason ? `（理由: ${reason}）` : ''}`,
        ipAddress: ip,
        createdAt: now,
      })
      return 'declined' as const
    })
    if (outcome === 'not_signable') {
      return NextResponse.json({ error: 'この書類は現在署名を受け付けていません' }, { status: 409 })
    }
    if (outcome === 'already') {
      return NextResponse.json({ error: 'Already processed' }, { status: 400 })
    }

    // Notify sender
    if (sender) {
      const emailData = signerDeclinedEmail({
        senderName: sender.name,
        signerName: signer.name,
        contractTitle: contract.title,
        contractUrl: `${BASE_URL}/contracts/${contract.id}`,
        reason: declineReason,
      })
      await sendEmailSafe({ to: sender.email, ...emailData }, 'api/sign:declineNotify')
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
    // 欄の所有・重複・タイプ整合（署名欄にvalueだけ送る等の空振り署名を拒否）・
    // 画像のPNG実体検証・必須網羅をまとめて検証
    const check = validateFieldValues(myFields, incoming)
    if (!check.ok) {
      return NextResponse.json({ error: check.error, code: check.code }, { status: 400 })
    }
  } else {
    // フォールバック単一署名も画像の実体を検証
    if (!isValidPngDataUrl(incoming[0]?.imageData)) {
      return NextResponse.json({ error: '署名画像の形式が不正です', code: 'INVALID_IMAGE' }, { status: 400 })
    }
  }

  // 単一トランザクション: 契約行ロック下で状態・期限を再検証（送信者取消/expiry cron
  // との競合を排他）し、claim・署名行・auditを全て確定 or 全てロールバックする。
  // 契約行ロックにより同一契約の署名は直列化され、「相手の署名行が見えないまま
  // 全員署名済み判定になる」並行穴も塞がる。
  const txResult = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, signer.contractId))
      .for('update')
    if (!locked || !isContractSignable(locked.status)) return { outcome: 'not_signable' as const }
    if (isExpired(locked.expiresAt)) return { outcome: 'expired' as const }

    // atomic claim: 二重POST時は片方だけが通過する
    const claimed = await tx
      .update(contractSigners)
      .set({ status: 'signed', signedAt: now })
      .where(and(
        eq(contractSigners.id, signer.id),
        inArray(contractSigners.status, ['pending', 'notified', 'viewed']),
      ))
      .returning({ id: contractSigners.id })
    if (claimed.length === 0) return { outcome: 'already' as const }

    // 署名レコードを欄ごとに保存
    await tx.insert(signatures).values(
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

    await tx.insert(auditLogs).values({
      id: ulid(),
      contractId: signer.contractId,
      action: 'signed',
      actorEmail: signer.email,
      detail: `${signer.name}が署名しました`,
      ipAddress: ip,
      createdAt: now,
    })

    const allSigners = await tx
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, signer.contractId))

    // 締結判定とcompleted化も同一トランザクション内で確定する。
    // トランザクション外に出すと、最終署名commit〜completed更新の間に
    // contracts.cancelが挟まり「全員署名済みなのにcancelled」が成立してしまう
    const allSigned = allSignedExcept(allSigners, signer.id)
    let completedClaimed = false
    if (allSigned) {
      const completedClaim = await tx
        .update(contracts)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(and(
          eq(contracts.id, signer.contractId),
          inArray(contracts.status, ['sent', 'signing']),
        ))
        .returning({ id: contracts.id })
      completedClaimed = completedClaim.length > 0
      if (completedClaimed) {
        await tx.insert(auditLogs).values({
          id: ulid(),
          contractId: signer.contractId,
          action: 'completed',
          actorEmail: 'system',
          detail: '全署名者の署名が完了し、契約が締結されました',
          createdAt: now,
        })
      }
    }
    return { outcome: 'signed' as const, allSigners, allSigned, completedClaimed }
  })

  if (txResult.outcome === 'not_signable') {
    return NextResponse.json({ error: 'この書類は現在署名を受け付けていません' }, { status: 409 })
  }
  if (txResult.outcome === 'expired') {
    return NextResponse.json({ error: '署名期限を過ぎています' }, { status: 410 })
  }
  if (txResult.outcome === 'already') {
    return NextResponse.json({ error: 'Already processed' }, { status: 400 })
  }

  const { allSigners, allSigned, completedClaimed } = txResult

  // Notify sender
  if (sender) {
    const emailData = signerCompletedEmail({
      senderName: sender.name,
      signerName: signer.name,
      contractTitle: contract.title,
      contractUrl: `${BASE_URL}/contracts/${contract.id}`,
      allCompleted: allSigned,
    })
    await sendEmailSafe({ to: sender.email, ...emailData }, 'api/sign:senderNotify')
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
      // 先にnotifiedへ遷移させる: メール失敗時もリマインダーcron(notified対象)が
      // 3日後に再送して救えるようにする（pendingのままだとcron対象外で永久放置）
      await db
        .update(contractSigners)
        .set({ status: 'notified' })
        .where(eq(contractSigners.id, nextSigner.id))
      const sent = await sendEmailSafe({ to: nextSigner.email, ...emailData }, 'api/sign:nextSignerNotify')
      await db.insert(auditLogs).values({
        id: ulid(),
        contractId: signer.contractId,
        action: 'notified',
        actorEmail: 'system',
        detail: sent
          ? `${nextSigner.name}に署名依頼を送信しました（順次）`
          : `${nextSigner.name}への署名依頼メール送信に失敗しました（リマインダーで再送されます）`,
        createdAt: new Date(),
      })
    }
  }

  // 締結の確定（completed化+audit）はトランザクション内で済んでいる。
  // ここでは時間のかかるPDF生成と完了メールだけをcommit後に行う
  if (completedClaimed) {
    // 署名済みPDF（原本＋座標配置＋署名証明ページ）を生成して保存
    if (contract.pdfUrl) {
      try {
        await renderAndStoreSignedPdf(db, signer.contractId)
      } catch (err) {
        // PDF生成失敗でも締結は成立させる（監査ログに記録し、オーナーが契約詳細から再生成できる）
        reportError(err, { scope: 'api/sign:signedPdf', contractId: contract.id })
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

    // Send completion emails to all signers
    for (const s of allSigners) {
      const emailData = contractCompletedEmail({
        recipientName: s.name,
        contractTitle: contract.title,
        contractUrl: `${BASE_URL}/sign/${s.token}`,
      })
      await sendEmailSafe({ to: s.email, ...emailData }, 'api/sign:completedNotify')
    }
  }

  return NextResponse.json({ ok: true, action: 'signed', allCompleted: allSigned })
}
