import { getAuthedUser, getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

/**
 * POST /api/push/subscribe
 * Enregistre (ou met à jour) la Push Subscription de l'utilisateur authentifié pour l'appareil
 * courant. Body: { subscription: PushSubscriptionJSON }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getAuthedUser(req)
  if (!user) return res.status(401).json({ error: 'Non authentifié' })

  const subscription = req.body?.subscription
  const endpoint = subscription?.endpoint
  const p256dh   = subscription?.keys?.p256dh
  const auth     = subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Subscription invalide' })
  }

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint, p256dh, auth, updated_at: new Date().toISOString() },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe]', err)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de l'abonnement" })
  }
}
