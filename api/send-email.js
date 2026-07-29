import { getAuthedUser } from './_lib/supabaseAdmin.js'
import { sendMail } from './_lib/mailer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Sans cette vérification, l'endpoint est un relais d'envoi ouvert sur le compte MailerSend.
  const caller = await getAuthedUser(req)
  if (!caller) return res.status(401).json({ error: 'Non authentifié' })

  try {
    await sendMail(req.body)
  } catch (err) {
    if (err.message === 'Missing MailerSend configuration') {
      return res.status(500).json({ error: err.message })
    }
    return res.status(err.status ?? 500).json({ error: 'MailerSend error', details: err.details })
  }

  return res.status(200).json({ success: true })
}
