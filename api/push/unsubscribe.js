import { getAuthedUser, getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

/**
 * DELETE /api/push/unsubscribe
 * Supprime la Push Subscription de l'utilisateur authentifié. Body: { endpoint?: string }
 * Sans endpoint, supprime tous les appareils enregistrés pour cet utilisateur.
 */
export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await getAuthedUser(req)
  if (!user) return res.status(401).json({ error: 'Non authentifié' })

  const endpoint = req.body?.endpoint

  try {
    const admin = getSupabaseAdmin()
    let query = admin.from('push_subscriptions').delete().eq('user_id', user.id)
    if (endpoint) query = query.eq('endpoint', endpoint)
    const { error } = await query
    if (error) throw error
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[push/unsubscribe]', err)
    return res.status(500).json({ error: "Erreur lors de la suppression de l'abonnement" })
  }
}
