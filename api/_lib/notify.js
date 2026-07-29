import { getNotificationType, urlFor } from '../../shared/notifications.js'
import { configureWebPush, sendPushToUsers } from './push.js'

/**
 * Membres ayant accès à l'équipe, avec les canaux effectifs après croisement des
 * réglages d'équipe et des préférences de chaque utilisateur. L'acteur n'est pas
 * exclu ici : dispatch le filtre lui-même, ce qui permet de réutiliser une seule
 * lecture pour le contrôle d'accès et pour la diffusion.
 */
export async function teamRecipients(admin, teamId, category) {
  const { data, error } = await admin.rpc('notification_recipients', {
    p_team_id: teamId,
    p_category: category,
    p_exclude: null,
  })
  if (error) throw error
  return data ?? []
}

/**
 * Crée une notification : insère les lignes in-app et envoie le push aux
 * destinataires qui l'acceptent. Les canaux désactivés (par l'équipe, par
 * l'utilisateur, ou par le type lui-même) sont simplement ignorés.
 *
 * - `assigneeUserIds` restreint la diffusion à ces utilisateurs (audience 'assignee').
 * - `recipients` réutilise une lecture déjà faite par l'appelant, pour éviter un
 *   second aller-retour vers la base sur chaque notification.
 */
export async function dispatch(admin, {
  teamId,
  orgId,
  type,
  title,
  body = null,
  entityType = null,
  entityId = null,
  actorId = null,
  assigneeUserIds = null,
  recipients = null,
}) {
  const def = getNotificationType(type)
  if (!def) throw new Error(`Type de notification inconnu : ${type}`)

  let targets = recipients ?? await teamRecipients(admin, teamId, def.category)

  // On ne notifie pas l'auteur de sa propre action.
  if (actorId) targets = targets.filter(r => r.user_id !== actorId)

  if (def.audience === 'assignee') {
    const allowed = new Set(assigneeUserIds ?? [])
    targets = targets.filter(r => allowed.has(r.user_id))
  }

  const inAppUsers = def.inApp ? targets.filter(r => r.in_app).map(r => r.user_id) : []
  const pushUsers  = def.push  ? targets.filter(r => r.push).map(r => r.user_id)   : []

  if (inAppUsers.length) {
    const { error } = await admin.from('notifications').insert(
      inAppUsers.map(userId => ({
        organization_id: orgId,
        team_id: teamId,
        user_id: userId,
        created_by: actorId,
        type,
        category: def.category,
        title,
        body,
        entity_type: entityType,
        entity_id: entityId,
      })),
    )
    if (error) throw error
  }

  let pushResult = { total: 0, sent: 0, removed: 0 }
  if (pushUsers.length) {
    // Un push raté ne doit pas faire échouer la notification in-app déjà enregistrée.
    try {
      configureWebPush()
      pushResult = await sendPushToUsers(admin, pushUsers, {
        title,
        body: body ?? undefined,
        url: urlFor(type, entityId),
      })
    } catch (err) {
      console.error('[notify] push non envoyé', type, err)
    }
  }

  return { inApp: inAppUsers.length, push: pushResult.sent }
}
