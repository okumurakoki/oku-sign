const BRAND_COLOR = '#3d4f5f'

function layout(content: string) {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${BRAND_COLOR};padding:20px 32px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td><span style="color:#fff;font-size:16px;font-weight:600;letter-spacing:.5px;">okuサイン</span></td>
<td align="right"><span style="color:rgba(255,255,255,.6);font-size:11px;">電子契約サービス</span></td></tr>
</table></td></tr>
<tr><td style="padding:32px;">${content}</td></tr>
<tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;">
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;line-height:1.6;">
このメールは okuサイン（電子契約サービス）から自動送信されています。<br/>&copy; ${new Date().getFullYear()} okuサイン
</p></td></tr>
</table></td></tr></table></body></html>`
}

function btn(url: string, label: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 24px;">
<a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 40px;border-radius:6px;font-size:14px;font-weight:500;letter-spacing:.3px;">${label}</a>
</td></tr></table>`
}

function infoBox(label: string, value: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;border-radius:6px;margin-bottom:20px;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 4px;font-size:11px;color:#888;letter-spacing:.5px;">${label}</p>
<p style="margin:0;font-size:15px;color:#333;font-weight:500;">${value}</p>
</td></tr></table>`
}

function fallbackUrl(url: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;">
<tr><td style="padding-top:20px;">
<p style="margin:0 0 4px;font-size:12px;color:#999;">ボタンが動作しない場合：</p>
<p style="margin:0;font-size:11px;color:#aaa;word-break:break-all;">${url}</p>
</td></tr></table>`
}

// --- 署名依頼 ---
export function signingRequestEmail(p: {
  signerName: string
  senderName: string
  senderCompany?: string | null
  contractTitle: string
  signUrl: string
  message?: string | null
  expiresAt?: Date | null
}) {
  const sender = p.senderCompany ? `${p.senderCompany} ${p.senderName}` : p.senderName
  const expiry = p.expiresAt
    ? `<p style="margin:0 0 16px;font-size:13px;color:#c53030;">署名期限: ${new Date(p.expiresAt).toLocaleDateString('ja-JP')}</p>`
    : ''
  const msg = p.message
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #ddd;margin-bottom:20px;">
       <tr><td style="padding:8px 16px;"><p style="margin:0;font-size:13px;color:#666;line-height:1.6;">${p.message}</p></td></tr></table>`
    : ''

  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.signerName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#333;line-height:1.7;">${sender} 様より、書類への署名依頼が届いています。</p>
${infoBox('書類名', p.contractTitle)}
${msg}${expiry}
<p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.7;">以下のボタンから書類を確認し、署名をお願いいたします。</p>
${btn(p.signUrl, '書類を確認して署名する')}
${fallbackUrl(p.signUrl)}`)

  return {
    subject: `【署名依頼】${p.contractTitle} - ${sender}様より`,
    html,
    text: `${p.signerName} 様\n\n${sender} 様より、書類「${p.contractTitle}」への署名依頼が届いています。\n\n${p.signUrl}\n\nokuサイン`,
  }
}

// --- 署名完了通知（送信者向け） ---
export function signerCompletedEmail(p: {
  senderName: string
  signerName: string
  contractTitle: string
  contractUrl: string
  allCompleted: boolean
}) {
  const statusText = p.allCompleted
    ? '<p style="margin:0 0 16px;font-size:14px;color:#16a34a;font-weight:500;">全署名者の署名が完了し、契約が締結されました。</p>'
    : ''

  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.senderName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#333;line-height:1.7;">${p.signerName} 様が「${p.contractTitle}」に署名しました。</p>
${statusText}
${btn(p.contractUrl, '書類の詳細を確認')}`)

  return {
    subject: p.allCompleted
      ? `【締結完了】${p.contractTitle}`
      : `【署名通知】${p.signerName}様が署名しました - ${p.contractTitle}`,
    html,
    text: `${p.signerName}様が「${p.contractTitle}」に署名しました。\n${p.contractUrl}\n\nokuサイン`,
  }
}

// --- 辞退通知（送信者向け） ---
export function signerDeclinedEmail(p: {
  senderName: string
  signerName: string
  contractTitle: string
  contractUrl: string
  reason?: string | null
}) {
  const reasonBlock = p.reason
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #e53e3e;margin-bottom:20px;">
       <tr><td style="padding:8px 16px;">
       <p style="margin:0 0 4px;font-size:11px;color:#888;">辞退理由</p>
       <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">${p.reason}</p></td></tr></table>`
    : ''

  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.senderName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#c53030;line-height:1.7;">${p.signerName} 様が「${p.contractTitle}」への署名を辞退しました。</p>
${reasonBlock}
${btn(p.contractUrl, '書類の詳細を確認')}`)

  return {
    subject: `【署名辞退】${p.signerName}様が辞退しました - ${p.contractTitle}`,
    html,
    text: `${p.signerName}様が「${p.contractTitle}」への署名を辞退しました。\n${p.reason ? `理由: ${p.reason}\n` : ''}${p.contractUrl}\n\nokuサイン`,
  }
}

// --- リマインダー ---
export function reminderEmail(p: {
  signerName: string
  senderName: string
  senderCompany?: string | null
  contractTitle: string
  signUrl: string
  expiresAt?: Date | null
}) {
  const sender = p.senderCompany ? `${p.senderCompany} ${p.senderName}` : p.senderName
  const expiry = p.expiresAt
    ? `<p style="margin:0 0 16px;font-size:13px;color:#c53030;">署名期限: ${new Date(p.expiresAt).toLocaleDateString('ja-JP')}</p>`
    : ''

  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.signerName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#333;line-height:1.7;">
${sender} 様より送信された書類がまだ署名されていません。<br/>お手数ですが、ご確認をお願いいたします。
</p>
${infoBox('書類名', p.contractTitle)}
${expiry}
${btn(p.signUrl, '書類を確認して署名する')}
${fallbackUrl(p.signUrl)}`)

  return {
    subject: `【リマインダー】署名のお願い - ${p.contractTitle}`,
    html,
    text: `${p.signerName} 様\n\n書類「${p.contractTitle}」がまだ署名されていません。\n${p.signUrl}\n\nokuサイン`,
  }
}

// --- 締結完了通知（全関係者向け） ---
export function contractCompletedEmail(p: {
  recipientName: string
  contractTitle: string
  contractUrl: string
}) {
  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.recipientName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#333;line-height:1.7;">
「${p.contractTitle}」の全署名が完了し、契約が締結されました。
</p>
${infoBox('書類名', p.contractTitle)}
<p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.7;">
締結済みの書類はいつでもダウンロードできます。
</p>
${btn(p.contractUrl, '書類を確認・ダウンロード')}`)

  return {
    subject: `【締結完了】${p.contractTitle}`,
    html,
    text: `「${p.contractTitle}」が締結されました。\n${p.contractUrl}\n\nokuサイン`,
  }
}

// --- 期限切れ通知（送信者向け） ---
export function contractExpiredEmail(p: {
  senderName: string
  contractTitle: string
  contractUrl: string
  pendingCount: number
}) {
  const html = layout(`
<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.7;">${p.senderName} 様</p>
<p style="margin:0 0 24px;font-size:14px;color:#333;line-height:1.7;">
「${p.contractTitle}」が署名期限を過ぎたため、期限切れとなりました。
</p>
${infoBox('未署名の署名者', `${p.pendingCount} 名`)}
<p style="margin:0 0 20px;font-size:14px;color:#333;line-height:1.7;">
引き続き署名が必要な場合は、書類を複製して再送信してください。
</p>
${btn(p.contractUrl, '書類の詳細を確認')}`)

  return {
    subject: `【期限切れ】${p.contractTitle}`,
    html,
    text: `「${p.contractTitle}」が署名期限を過ぎ、期限切れとなりました。\n${p.contractUrl}\n\nokuサイン`,
  }
}
