import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  const resend = getResend()
  const from = process.env.EMAIL_FROM ?? 'okuサイン <noreply@oku-sign.local>'

  // Dev mode: log instead of send
  if (!process.env.RESEND_API_KEY) {
    console.log('[EMAIL] Would send:', { to: params.to, subject: params.subject })
    return { id: 'dev-' + Date.now() }
  }

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  })

  if (error) throw new Error(`Email failed: ${error.message}`)
  return data
}
