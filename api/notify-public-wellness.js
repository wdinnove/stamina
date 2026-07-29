import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { dispatch } from './_lib/notify.js'
import { isWellnessAlerting } from '../shared/notifications.js'

/**
 * POST /api/notify-public-wellness
 * Body : { playerId, date }
 *
 * Le formulaire bien-être public est anonyme (RPC submit_wellness_public, rôle `anon`),
 * donc aucune notification ne peut partir du client. Cet endpoint est volontairement
 * non authentifié, mais ne fait confiance à rien de ce que le client envoie : il relit
 * l'entrée côté serveur et recalcule lui-même le franchissement de seuil. Il est de plus
 * idempotent, donc le rejouer ne crée pas de doublon.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { playerId, date } = req.body ?? {}
  if (!playerId || !date) return res.status(400).json({ error: 'playerId et date requis' })

  const admin = getSupabaseAdmin()

  try {
    const { data: entry } = await admin
      .from('wellness_entries')
      .select('id, score, fatigue, stress, soreness')
      .eq('player_id', playerId)
      .eq('date', date)
      .single()

    if (!entry || !isWellnessAlerting(entry)) return res.status(200).json({ ok: true, skipped: true })

    // Idempotence : ne rien renvoyer si l'alerte de cette entrée a déjà été diffusée.
    const { data: existing } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'wellness_alert')
      .eq('entity_id', entry.id)
      .limit(1)
    if (existing?.length) return res.status(200).json({ ok: true, duplicate: true })

    const { data: player } = await admin
      .from('players')
      .select('first_name, last_name, organization_id')
      .eq('id', playerId)
      .single()
    if (!player) return res.status(200).json({ ok: true, skipped: true })

    const { data: teamId } = await admin.rpc('player_current_team', { p_player_id: playerId })
    if (!teamId) return res.status(200).json({ ok: true, skipped: true })

    const name = `${player.first_name} ${player.last_name}`.trim()
    const result = await dispatch(admin, {
      teamId,
      orgId: player.organization_id,
      type: 'wellness_alert',
      title: `Bien-être préoccupant — ${name}`,
      body: `Score ${entry.score}/10 le ${date}`,
      entityType: 'wellness_entry',
      entityId: entry.id,
    })

    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('[notify-public-wellness]', err)
    return res.status(500).json({ error: "Erreur lors de l'envoi de l'alerte" })
  }
}
