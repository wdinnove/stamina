/** Plafond d'émission par utilisateur : large pour un usage normal, bloquant pour un abus. */
export const NOTIFY_RATE_LIMIT = 30
export const NOTIFY_RATE_WINDOW_SECONDS = 60

const TITLE_MAX = 120
const BODY_MAX = 400

/**
 * Nettoie un texte destiné à une notification. Le contenu vient du client, donc il
 * ne doit ni dépasser une taille raisonnable (une charge push trop lourde est rejetée
 * par les navigateurs) ni contenir de caractères de contrôle permettant de maquiller
 * l'affichage sur plusieurs lignes.
 */
export function sanitizeText(value, max) {
  if (value === null || value === undefined) return null
  const flat = String(value)
    .replace(/[\u0000-\u001F\u007F]+/g, ' ') // controle et sauts de ligne
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  return flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat
}

export const sanitizeTitle = value => sanitizeText(value, TITLE_MAX)
export const sanitizeBody = value => sanitizeText(value, BODY_MAX)

/** Droit d'écriture sur l'équipe : émettre une notification n'est pas une lecture. */
export async function hasTeamWriteAccess(admin, userId, teamId) {
  const { data, error } = await admin.rpc('team_write_access', {
    p_user_id: userId,
    p_team_id: teamId,
  })
  if (error) throw error
  return data === true
}

/** Renvoie false quand l'utilisateur dépasse son plafond d'émission. */
export async function withinRateLimit(admin, userId, limit = NOTIFY_RATE_LIMIT) {
  const { data, error } = await admin.rpc('notification_rate_bump', {
    p_user_id: userId,
    p_limit: limit,
    p_window_seconds: NOTIFY_RATE_WINDOW_SECONDS,
  })
  if (error) throw error
  return data === true
}
