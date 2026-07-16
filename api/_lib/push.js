import webpush from 'web-push'

let configured = false

/** Configure web-push avec les clés VAPID (une seule fois par instance de fonction serverless). */
export function configureWebPush() {
  if (configured) return
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject     = process.env.VAPID_SUBJECT || 'mailto:contact@example.com'
  const missing = []
  if (!publicKey) missing.push('VAPID_PUBLIC_KEY')
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY')
  if (missing.length) throw new Error(`Variable(s) manquante(s) côté serveur : ${missing.join(', ')}`)
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export { webpush }
