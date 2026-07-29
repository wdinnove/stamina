import { getAuthedUser, getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { getOrganizationId } from './_lib/org.js'
import { dispatch, teamRecipients } from './_lib/notify.js'
import { getNotificationType } from '../shared/notifications.js'

/**
 * POST /api/notify
 * Crée une notification métier (in-app + push selon les réglages équipe/utilisateur).
 * Body : { teamId, type, title, body?, entityType?, entityId?, assigneeStaffId? }
 *
 * Sécurité : l'appelant doit être authentifié et avoir accès à l'équipe visée.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getAuthedUser(req)
  if (!caller) return res.status(401).json({ error: 'Non authentifié' })

  const { teamId, type, title, body, entityType, entityId, assigneeStaffId } = req.body ?? {}
  if (!teamId || !type || !title) return res.status(400).json({ error: 'teamId, type et title requis' })

  const def = getNotificationType(type)
  if (!def) return res.status(400).json({ error: `Type de notification inconnu : ${type}` })

  const admin = getSupabaseAdmin()

  try {
    // L'appelant doit lui-même faire partie du public de cette équipe (superadmin ou team_roles).
    const recipients = await teamRecipients(admin, teamId, def.category)
    if (!recipients.some(r => r.user_id === caller.id)) {
      return res.status(403).json({ error: 'Non autorisé à notifier cette équipe' })
    }

    let assigneeUserIds = null
    if (def.audience === 'assignee') {
      // player_actions.assigned_to référence staff(id) ; un intervenant sans compte
      // app (profile_id NULL) n'est simplement pas notifiable.
      if (!assigneeStaffId) return res.status(200).json({ ok: true, inApp: 0, push: 0 })
      const { data: staff, error } = await admin
        .from('staff')
        .select('profile_id')
        .eq('id', assigneeStaffId)
        .single()
      if (error || !staff?.profile_id) return res.status(200).json({ ok: true, inApp: 0, push: 0 })
      assigneeUserIds = [staff.profile_id]
    }

    const orgId = await getOrganizationId(caller.id)
    if (!orgId) return res.status(400).json({ error: 'Organisation introuvable' })

    const result = await dispatch(admin, {
      teamId,
      orgId,
      type,
      title,
      body: body ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      actorId: caller.id,
      assigneeUserIds,
      recipients,
    })

    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error('[notify]', err)
    return res.status(500).json({ error: "Erreur lors de l'envoi de la notification" })
  }
}
