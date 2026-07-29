/**
 * Envoi d'email via MailerSend — le provider du projet. Utilisable directement par
 * les fonctions serverless (cron) sans passer par un aller-retour HTTP interne.
 */
export async function sendMail(payload) {
  const apiKey    = process.env.MAILERSEND_API_KEY
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL
  const fromName  = process.env.MAILERSEND_FROM_NAME ?? 'Player App'

  if (!apiKey || !fromEmail) throw new Error('Missing MailerSend configuration')

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
    const details = await response.text()
    const error = new Error('MailerSend error')
    error.status = response.status
    error.details = details
    throw error
  }
}
