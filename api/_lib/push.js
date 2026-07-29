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

/**
 * Envoie un push à tous les appareils des utilisateurs donnés et nettoie les
 * abonnements expirés. Retourne { total, sent, removed } — `total` permet de
 * distinguer « aucun appareil abonné » de « tous les envois ont échoué ».
 */
export async function sendPushToUsers(admin, userIds, payload) {
  if (!userIds?.length) return { total: 0, sent: 0, removed: 0 }

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (error) throw error
  if (!subs?.length) return { total: 0, sent: 0, removed: 0 }

  const body = JSON.stringify(payload)
  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body),
    ),
  )

  const invalidEndpoints = []
  let sent = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { sent += 1; return }
    const statusCode = r.reason?.statusCode
    console.error('[push] échec envoi', subs[i].endpoint, statusCode, r.reason?.body)
    // 404/410 = abonnement expiré/révoqué côté navigateur — on nettoie pour ne pas réessayer indéfiniment.
    if (statusCode === 404 || statusCode === 410) invalidEndpoints.push(subs[i].endpoint)
  })

  if (invalidEndpoints.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', invalidEndpoints)
  }

  return { total: subs.length, sent, removed: invalidEndpoints.length }
}

export { webpush }
