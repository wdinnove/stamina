import { getAuthedUser, getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { configureWebPush, webpush } from '../_lib/push.js'
import { getOrganizationId } from '../_lib/org.js'

/**
 * POST /api/push/send
 * Envoie une notification push à tous les appareils d'un utilisateur. Body :
 * { userId, title, body?, url?, icon?, image? }
 *
 * Sécurité : l'appelant doit être authentifié, et ne peut cibler que lui-même ou un utilisateur
 * de sa propre organisation — jamais un utilisateur hors de son périmètre.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getAuthedUser(req)
  if (!caller) return res.status(401).json({ error: 'Non authentifié' })

  const { userId, title, body, url, icon, image } = req.body ?? {}
  if (!userId || !title) return res.status(400).json({ error: 'userId et title requis' })

  if (userId !== caller.id) {
    const [callerOrg, targetOrg] = await Promise.all([
      getOrganizationId(caller.id),
      getOrganizationId(userId),
    ])
    if (!callerOrg || callerOrg !== targetOrg) {
      return res.status(403).json({ error: 'Non autorisé à notifier cet utilisateur' })
    }
  }

  try {
    configureWebPush()
  } catch (err) {
    console.error('[push/send] configuration VAPID manquante', err)
    return res.status(500).json({ error: 'Configuration serveur incomplète' })
  }

  const admin = getSupabaseAdmin()
  const { data: subs, error } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (error) {
    console.error('[push/send]', error)
    return res.status(500).json({ error: 'Erreur lors de la récupération des abonnements' })
  }
  if (!subs?.length) {
    return res.status(200).json({ ok: true, sent: 0, message: 'Aucun appareil abonné' })
  }

  const payload = JSON.stringify({ title, body, url, icon, image })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload),
    ),
  )

  const invalidEndpoints = []
  let sent = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { sent += 1; return }
    const statusCode = r.reason?.statusCode
    console.error('[push/send] échec envoi', subs[i].endpoint, statusCode, r.reason?.body)
    // 404/410 = abonnement expiré/révoqué côté navigateur — on nettoie pour ne pas réessayer indéfiniment.
    if (statusCode === 404 || statusCode === 410) invalidEndpoints.push(subs[i].endpoint)
  })

  if (invalidEndpoints.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', invalidEndpoints)
  }

  return res.status(200).json({ ok: true, sent, removed: invalidEndpoints.length })
}
