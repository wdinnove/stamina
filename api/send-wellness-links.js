import { getAuthedUser, getSupabaseAdmin } from './_lib/supabaseAdmin.js'
import { sendMail } from './_lib/mailer.js'
import { hasTeamWriteAccess, withinRateLimit } from './_lib/guards.js'

/** Template MailerSend du formulaire bien-être — le seul contenu envoyable à un joueur. */
const WELLNESS_TEMPLATE_ID = 'jpzkmgq5vqng059v'

/** Garde-fou de volume : un envoi manuel couvre un effectif, pas une liste de diffusion. */
const MAX_RECIPIENTS = 60

/**
 * POST /api/send-wellness-links
 * Body : { teamId, playerIds: [uuid] }
 *
 * Remplace l'ancien /api/send-email, qui acceptait destinataires et contenu libres :
 * tout utilisateur connecté pouvait donc écrire à n'importe quelle adresse depuis le
 * domaine du club. Ici rien n'est libre — le contenu est un template fixe, et les
 * destinataires sont relus en base parmi les joueurs de l'équipe visée.
 *
 * C'est aussi ce qui rend structurelle la règle « aucun contact automatique des
 * joueurs » : c'est le seul chemin par lequel un joueur peut recevoir un email,
 * il exige un droit d'écriture sur son équipe, et il est déclenché à la main.
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
    // Jamais dérivé des en-têtes de la requête : un Host falsifié enverrait aux
    // joueurs un lien vers un domaine ressemblant.
    console.error('[send-wellness-links] APP_ORIGIN non configuré')
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

    // Les destinataires ne viennent pas du client : on ne garde que les joueurs
    // réellement inscrits à la saison courante de cette équipe.
    const { data: season } = await admin
      .from('seasons')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_current', true)
      .maybeSingle()
    if (!season) return res.status(400).json({ error: 'Aucune saison courante sur cette équipe' })

    const { data: links, error } = await admin
      .from('player_season')
      .select('player_id, players(id, first_name, last_name, email)')
      .eq('season_id', season.id)
      .in('player_id', playerIds)
    if (error) throw error

    const roster = (links ?? []).map(l => l.players).filter(Boolean)

    const sent = []
    const skipped = []
    const failed = []

    for (const player of roster) {
      const name = `${player.first_name} ${player.last_name}`.trim()
      if (!player.email) { skipped.push(name); continue }
      try {
        await sendMail({
          to: [{ email: player.email, name }],
          subject: 'Formulaire bien-être',
          template_id: WELLNESS_TEMPLATE_ID,
          personalization: [{
            email: player.email,
            data: { name: player.first_name, url: `${origin}/joueur/${player.id}/bien-etre` },
          }],
        })
        sent.push(name)
      } catch (err) {
        // `details` porte la réponse du fournisseur, seule à dire POURQUOI l'envoi est refusé
        // (domaine non vérifié, compte d'essai, variable de template manquante…). Sans elle,
        // le journal ne disait que « MailerSend error » et un échec restait indiagnosticable.
        // Côté client la réponse reste muette à dessein : elle passe par le navigateur.
        console.error('[send-wellness-links] échec', player.id, err.status ?? '', err.message, err.details ?? '')
        failed.push(name)
      }
    }

    // Un id absent de l'effectif de l'équipe est ignoré silencieusement plutôt que
    // signalé : cela éviterait sinon de confirmer l'existence d'un joueur tiers.
    return res.status(200).json({ ok: true, sent, skipped, failed })
  } catch (err) {
    console.error('[send-wellness-links]', err)
    return res.status(500).json({ error: "Erreur lors de l'envoi des liens" })
  }
}

/**
 * Origine publique normalisée : le schéma est ajouté si absent (Vercel fournit un
 * domaine nu) et un éventuel slash final est retiré, sinon les liens envoyés aux
 * joueurs contiendraient un double slash.
 */
export function appOrigin(env = process.env) {
  const url = env.APP_ORIGIN || env.VERCEL_PROJECT_PRODUCTION_URL
  if (!url) return ''
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}
