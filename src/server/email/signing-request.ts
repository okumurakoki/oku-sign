export function buildSigningRequestEmail(params: {
  signerName: string
  senderName: string
  senderCompany?: string | null
  contractTitle: string
  signUrl: string
  message?: string
}) {
  const { signerName, senderName, senderCompany, contractTitle, signUrl, message } = params

  const senderDisplay = senderCompany ? `${senderCompany} ${senderName}` : senderName

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family:'Helvetica Neue',Arial,'Hiragino Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color:#3d4f5f; padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff; font-size:16px; font-weight:600; letter-spacing:0.5px;">okuサイン</span>
                  </td>
                  <td align="right">
                    <span style="color:rgba(255,255,255,0.6); font-size:11px;">電子契約サービス</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px; font-size:14px; color:#333; line-height:1.7;">
                ${signerName} 様
              </p>
              <p style="margin:0 0 24px; font-size:14px; color:#333; line-height:1.7;">
                ${senderDisplay} 様より、書類への署名依頼が届いています。
              </p>

              <!-- Contract Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa; border-radius:6px; margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px; font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px;">書類名</p>
                    <p style="margin:0; font-size:15px; color:#333; font-weight:500;">${contractTitle}</p>
                  </td>
                </tr>
              </table>

              ${message ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid #ddd; margin-bottom:24px;">
                <tr>
                  <td style="padding:8px 16px;">
                    <p style="margin:0; font-size:13px; color:#666; line-height:1.6;">${message}</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <p style="margin:0 0 20px; font-size:14px; color:#333; line-height:1.7;">
                以下のボタンから書類を確認し、署名をお願いいたします。
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${signUrl}" style="display:inline-block; background-color:#3d4f5f; color:#ffffff; text-decoration:none; padding:12px 40px; border-radius:6px; font-size:14px; font-weight:500; letter-spacing:0.3px;">
                      書類を確認して署名する
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;">
                <tr>
                  <td style="padding-top:20px;">
                    <p style="margin:0 0 8px; font-size:12px; color:#999; line-height:1.6;">
                      このメールに心当たりがない場合は、無視していただいて問題ありません。
                    </p>
                    <p style="margin:0; font-size:12px; color:#999; line-height:1.6;">
                      ボタンが動作しない場合は、以下のURLをブラウザに貼り付けてください：
                    </p>
                    <p style="margin:4px 0 0; font-size:11px; color:#aaa; word-break:break-all;">
                      ${signUrl}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#fafafa; padding:16px 32px; border-top:1px solid #eee;">
              <p style="margin:0; font-size:11px; color:#aaa; text-align:center; line-height:1.6;">
                このメールは okuサイン（電子契約サービス）から自動送信されています。<br/>
                &copy; ${new Date().getFullYear()} okuサイン
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${signerName} 様

${senderDisplay} 様より、書類への署名依頼が届いています。

書類名: ${contractTitle}

以下のURLから書類を確認し、署名をお願いいたします。
${signUrl}

このメールに心当たりがない場合は、無視していただいて問題ありません。

---
okuサイン（電子契約サービス）`

  return {
    subject: `【署名依頼】${contractTitle} - ${senderDisplay}様より`,
    html,
    text,
  }
}
