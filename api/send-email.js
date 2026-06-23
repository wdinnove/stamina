export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey   = process.env.MAILERSEND_API_KEY
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL
  const fromName  = process.env.MAILERSEND_FROM_NAME ?? 'Player App'

  if (!apiKey || !fromEmail) {
    return res.status(500).json({ error: 'Missing MailerSend configuration' })
  }

  const payload = req.body
  const body = {
    from: { email: fromEmail, name: fromName },
    to: payload.to,
  }

  if (payload.subject) body.subject = payload.subject

  if (payload.template_id) {
    body.template_id = payload.template_id
    if (payload.personalization) body.personalization = payload.personalization
  } else {
    if (payload.html) body.html = payload.html
    if (payload.text) body.text = payload.text
  }

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    return res.status(response.status).json({ error: 'MailerSend error', details: error })
  }

  return res.status(200).json({ success: true })
}
