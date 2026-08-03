import { authHeaders } from './client'

export interface WellnessLinksResult {
  sent: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Envoie le lien du formulaire bien-être aux joueuses sélectionnées.
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
