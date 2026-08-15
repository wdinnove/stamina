import { getAuthedUser, getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendMail, PLAYER_LINK_TEMPLATE_ID } from './_lib/mailer.js'
import { hasTeamWriteAccess, withinRateLimit } from './_lib/guards.js'
import { appOrigin } from './send-wellness-links.js'

/** Garde-fou de volume : un envoi manuel couvre un effectif, pas une liste de diffusion. */
const MAX_RECIPIENTS = 60

/**
 * POST /api/send-mbti-links
 * Body : { teamId, playerIds: [uuid] }
 *
 * Deuxième et dernier chemin par lequel un joueur peut recevoir un email, calqué sur
 * /api/send-wellness-links et soumis aux mêmes règles : contenu figé par un template, adresses
 * relues en base parmi les joueurs de l'équipe visée, droit d'écriture exigé sur cette équipe,
 * déclenchement manuel. Rien ici ne s'envoie tout seul.
 *
 * Le template est celui du formulaire bien-être (`PLAYER_LINK_TEMPLATE_ID`) : les deux messages
 * ont la même mise en page et ne diffèrent que par l'url passée en variable.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getAuthedUser(req)
  if (!caller) return res.status(401).json({ error: 'Non authentifié' })

  const { teamId, playerIds } = req.body ?? {}
  if (!teamId || !Array.isArray(playerIds) || !playerIds.length) {
    return res.status(400).json({ error: 'teamId et playerIds requis' })
  }
  if (playerIds.length > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `Maximum ${MAX_RECIPIENTS} destinataires par envoi` })
  }

  const origin = appOrigin()
  if (!origin) {
    // Jamais dérivé des en-têtes de la requête : un Host falsifié enverrait aux joueurs un
    // lien vers un domaine ressemblant.
    console.error('[send-mbti-links] APP_ORIGIN non configuré')
    return res.status(503).json({ error: 'APP_ORIGIN non configuré côté serveur' })
  }

  const admin = getSupabaseAdmin()

  try {
    if (!await hasTeamWriteAccess(admin, caller.id, teamId)) {
      return res.status(403).json({ error: 'Non autorisé sur cette équipe' })
    }
    if (!await withinRateLimit(admin, caller.id)) {
      return res.status(429).json({ error: 'Trop d\'envois, réessayez dans une minute' })
    }

    const { data: season } = await admin
      .from('seasons')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_current', true)
      .maybeSingle()
    if (!season) return res.status(400).json({ error: 'Aucune saison courante sur cette équipe' })

    // Les destinataires ne viennent pas du client : on ne garde que les joueurs réellement
    // inscrits à la saison courante de cette équipe.
    const { data: links, error } = await admin
      .from('player_season')
      .select('player_id, players(id, first_name, last_name, email)')
      .eq('season_id', season.id)
      .in('player_id', playerIds)
    if (error) throw error

    const roster = (links ?? []).map(l => l.players).filter(Boolean)

    // Le questionnaire ne se remplit qu'une fois : inutile d'envoyer un lien qui n'ouvrira
    // qu'un écran « déjà rempli ».
    const { data: answered } = await admin
      .from('mbti_responses')
      .select('player_id')
      .in('player_id', roster.map(p => p.id))
    const alreadyAnswered = new Set((answered ?? []).map(r => r.player_id))

    const sent = []
    const skipped = []
    const failed = []

    for (const player of roster) {
      const name = `${player.first_name} ${player.last_name}`.trim()
      if (alreadyAnswered.has(player.id)) { skipped.push(name); continue }
      if (!player.email) { skipped.push(name); continue }
      try {
        await sendMail({
          to: [{ email: player.email, name }],
          subject: 'Questionnaire de personnalité',
          template_id: PLAYER_LINK_TEMPLATE_ID,
          personalization: [{
            email: player.email,
            data: { name: player.first_name, url: `${origin}/joueur/${player.id}/mbti` },
          }],
        })
        sent.push(name)
      } catch (err) {
        // `details` porte la réponse du fournisseur, seule à dire POURQUOI l'envoi est refusé
        // (domaine non vérifié, variable de template manquante…). Côté client la réponse reste
        // muette à dessein : elle passe par le navigateur.
        console.error('[send-mbti-links] échec', player.id, err.status ?? '', err.message, err.details ?? '')
        failed.push(name)
      }
    }

    // Un id absent de l'effectif est ignoré silencieusement plutôt que signalé : cela éviterait
    // sinon de confirmer l'existence d'un joueur tiers.
    return res.status(200).json({ ok: true, sent, skipped, failed })
  } catch (err) {
    console.error('[send-mbti-links]', err)
    return res.status(500).json({ error: "Erreur lors de l'envoi des liens" })
  }
}
