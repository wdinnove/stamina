import { getAuthedUser, getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { configureWebPush, sendPushToUsers } from '../_lib/push.js'
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
    const detail = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: `Configuration serveur incomplète : ${detail}` })
  }

  const admin = getSupabaseAdmin()
  try {
    const { total, sent, removed } = await sendPushToUsers(admin, [userId], { title, body, url, icon, image })
    if (!total) {
      return res.status(200).json({ ok: true, sent: 0, message: 'Aucun appareil abonné' })
    }
    return res.status(200).json({ ok: true, sent, removed })
  } catch (err) {
    console.error('[push/send]', err)
    return res.status(500).json({ error: 'Erreur lors de la récupération des abonnements' })
  }
}
