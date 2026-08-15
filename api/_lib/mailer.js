/**
 * Envoi d'email via MailerSend — le provider du projet. Utilisable directement par
 * les fonctions serverless (cron) sans passer par un aller-retour HTTP interne.
 *
 * Le domaine expéditeur n'a besoin que des enregistrements d'ENVOI (SPF, DKIM,
 * return-path) : aucun MX, donc aucune boîte à relever. Une réponse à cette adresse
 * n'irait donc nulle part — d'où `MAIL_REPLY_TO`, appliqué ici à tous les messages
 * plutôt qu'à chaque appelant, pour qu'aucun email ne puisse partir sans issue de
 * retour. Non configuré, le comportement reste celui d'avant.
 */
export async function sendMail(payload) {
  const apiKey    = process.env.MAILERSEND_API_KEY
  const fromEmail = process.env.MAILERSEND_FROM_EMAIL
  const fromName  = process.env.MAILERSEND_FROM_NAME ?? 'Player App'
  const replyTo   = payload.reply_to ?? (process.env.MAIL_REPLY_TO
    ? { email: process.env.MAIL_REPLY_TO }
    : null)

  if (!apiKey || !fromEmail) throw new Error('Missing MailerSend configuration')

  const body = {
    from: { email: fromEmail, name: fromName },
    to: payload.to,
  }

  if (replyTo) body.reply_to = replyTo
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
