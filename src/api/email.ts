import { authHeaders } from './client'

export interface WellnessLinksResult {
  sent: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Envoie le lien du formulaire bien-être aux joueurs sélectionnés.
 *
 * Volontairement le SEUL envoi d'email pilotable depuis le client : ni le contenu ni
 * les adresses ne sont transmis, le serveur relit l'effectif de l'équipe et utilise un
 * template fixe. Il n'existe donc pas de fonction d'envoi générique — l'ancienne
 * permettait à tout utilisateur connecté d'écrire à n'importe quelle adresse depuis le
 * domaine du club.
 */
export async function sendWellnessLinks(
  teamId: string,
  playerIds: string[],
): Promise<WellnessLinksResult> {
  const res = await fetch('/api/send-wellness-links', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ teamId, playerIds }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? "Échec de l'envoi des liens")
  }
  return res.json()
}

/**
 * Envoie le lien du questionnaire de personnalité aux joueurs sélectionnés.
 *
 * Mêmes règles que ci-dessus, et pour la même raison : ni contenu ni adresses ne transitent par
 * le client. Les joueurs ayant déjà répondu reviennent dans `skipped` — leur lien n'ouvrirait
 * qu'un écran « déjà rempli ».
 */
export async function sendMbtiLinks(
  teamId: string,
  playerIds: string[],
): Promise<WellnessLinksResult> {
  const res = await fetch('/api/send-mbti-links', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ teamId, playerIds }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? "Échec de l'envoi des liens")
  }
  return res.json()
}
