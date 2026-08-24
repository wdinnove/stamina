import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { dispatch, teamRecipients, claimDispatch, pruneDispatchLog } from '../_lib/notify.js'
import { sendMail } from '../_lib/mailer.js'

/**
 * RÈGLE ABSOLUE — aucun email ni push automatique ne part vers un joueur.
 * Les joueurs ne sont contactés que sur action manuelle du staff depuis
 * l'interface (bouton d'envoi des liens bien-être, cf. WellnessPage).
 * Ce cron ne s'adresse donc QU'aux membres du staff ayant un compte app.
 * Ne pas ajouter ici d'envoi utilisant players.email.
 */
const RTP_HORIZON_DAYS = 3
const TASK_HORIZON_DAYS = 1

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function shiftDays(date, days) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** Lundi de la semaine en cours (semaine ISO, comme submit_wellness_public). */
function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getUTCDay()
  return shiftDays(d, day === 0 ? -6 : 1 - day)
}

function fullName(p) {
  return `${p.first_name} ${p.last_name}`.trim()
}

/** Ancienneté au-delà de laquelle une trace de diffusion ne sert plus à rien. */
const LOG_RETENTION_DAYS = 90

/**
 * Cadence de relance d'une tâche : la veille et/ou le jour même selon les cases cochées sur la
 * tâche (toutes deux activées par défaut), plus une fois par semaine tant qu'elle reste ouverte
 * et en retard — cette relance hebdomadaire est inconditionnelle, elle ne dépend pas des cases.
 * Sans elle, une tâche en retard renotifierait son assigné chaque jour indéfiniment.
 *
 * `notifyCustomDate`, quand renseignée, s'ajoute à ces réglages (elle ne les remplace pas) : un
 * rappel supplémentaire part ce jour-là, qu'il coïncide ou non avec J-1/J-J.
 */
export function taskReminderReason(dueDate, today, { notifyJ1 = true, notifyJJ = true, notifyCustomDate = null } = {}) {
  const t = isoDate(today)
  if (notifyCustomDate && notifyCustomDate === t) return 'date personnalisée'
  if (notifyJ1 && dueDate === isoDate(shiftDays(today, 1))) return 'veille'
  if (notifyJJ && dueDate === t) return 'jour J'
  if (dueDate < t && today.getUTCDay() === 1) return 'relance hebdomadaire'
  return null
}

/**
 * GET /api/cron/notifications — déclenché quotidiennement par Vercel Cron.
 * Traite les rappels calculés (qui dépendent d'une date, pas d'une action utilisateur),
 * et y ajoute le bilan hebdomadaire le vendredi.
 */
export default async function handler(req, res) {
  // Refus par défaut : sans secret configuré, l'endpoint resterait ouvert et
  // n'importe qui pourrait déclencher une vague de notifications réelles.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET absent — exécution refusée')
    return res.status(503).json({ error: 'CRON_SECRET non configuré' })
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const admin = getSupabaseAdmin()
  const today = new Date()
  const isFriday = today.getUTCDay() === 5

  await pruneDispatchLog(admin, isoDate(shiftDays(today, -LOG_RETENTION_DAYS)))

  const { data: teams, error } = await admin.from('teams').select('id, organization_id, name')
  if (error) {
    console.error('[cron] lecture des équipes', error)
    return res.status(500).json({ error: 'Erreur lors de la lecture des équipes' })
  }

  const summary = []
  for (const team of teams ?? []) {
    try {
      summary.push({ team: team.name, ...(await runForTeam(admin, team, today, isFriday)) })
    } catch (err) {
      // Une équipe en erreur ne doit pas empêcher les autres d'être traitées.
      console.error('[cron] équipe', team.id, err)
      summary.push({ team: team.name, error: true })
    }
  }

  return res.status(200).json({ ok: true, date: isoDate(today), weekly: isFriday, summary })
}

async function runForTeam(admin, team, today, isFriday) {
  const { data: season } = await admin
    .from('seasons')
    .select('id')
    .eq('team_id', team.id)
    .eq('is_current', true)
    .maybeSingle()
  if (!season) return { skipped: 'aucune saison courante' }

  const { data: links } = await admin
    .from('player_season')
    .select('player_id, players(id, first_name, last_name)')
    .eq('season_id', season.id)
  const roster = (links ?? []).map(l => l.players).filter(Boolean)
  if (!roster.length) return { skipped: 'effectif vide' }

  const rosterIds = roster.map(p => p.id)
  const counts = {}

  counts.rtp = await notifyRtpUpcoming(admin, team, rosterIds, roster, today)
  counts.sessions = await notifySessionGaps(admin, team, season.id, rosterIds, roster, today)
  counts.wellnessDigest = await notifyWellnessDigest(admin, team, rosterIds, today)
  counts.tasks = await notifyTasksDue(admin, team, today)
  if (isFriday) counts.weekly = await notifyWeeklyWellness(admin, team, roster, rosterIds, today)

  return counts
}

async function notifyRtpUpcoming(admin, team, rosterIds, roster, today) {
  const { data: records } = await admin
    .from('medical_records')
    .select('id, player_id, rtp_date')
    .in('player_id', rosterIds)
    .neq('status', 'resolved')
    .gte('rtp_date', isoDate(today))
    .lte('rtp_date', isoDate(shiftDays(today, RTP_HORIZON_DAYS)))

  let sent = 0
  for (const record of records ?? []) {
    if (!await claimDispatch(admin, `rtp_upcoming:${record.id}`, isoDate(today))) continue
    const player = roster.find(p => p.id === record.player_id)
    sent += 1
    await dispatch(admin, {
      teamId: team.id,
      orgId: team.organization_id,
      type: 'rtp_upcoming',
      title: `Retour au jeu prévu — ${player ? fullName(player) : 'joueur'}`,
      body: `Date de reprise : ${record.rtp_date}`,
      entityType: 'medical_record',
      entityId: record.id,
    })
  }
  return sent
}

/** RPE non rempli et présence non renseignée sur les séances de la veille. */
async function notifySessionGaps(admin, team, seasonId, rosterIds, roster, today) {
  const yesterday = isoDate(shiftDays(today, -1))
  const { data: sessions } = await admin
    .from('training_sessions')
    .select('id, date')
    .eq('team_id', team.id)
    .eq('season_id', seasonId)
    .eq('date', yesterday)
  if (!sessions?.length) return 0

  for (const session of sessions) {
    const [{ data: rpe }, { data: attendance }] = await Promise.all([
      admin.from('rpe_entries').select('player_id').eq('session_id', session.id),
      admin.from('training_attendance').select('player_id').eq('session_id', session.id),
    ])

    const withRpe = new Set((rpe ?? []).map(r => r.player_id))
    const missing = roster.filter(p => !withRpe.has(p.id))
    if (missing.length && await claimDispatch(admin, `rpe_missing:${session.id}`, isoDate(today))) {
      await dispatch(admin, {
        teamId: team.id,
        orgId: team.organization_id,
        type: 'rpe_missing',
        title: `RPE manquant — ${missing.length} joueur${missing.length > 1 ? 's' : ''}`,
        body: `Séance du ${session.date} : ${missing.map(fullName).join(', ')}`,
        entityType: 'session',
        entityId: session.id,
      })
    }

    if ((attendance?.length ?? 0) < rosterIds.length
        && await claimDispatch(admin, `attendance_missing:${session.id}`, isoDate(today))) {
      await dispatch(admin, {
        teamId: team.id,
        orgId: team.organization_id,
        type: 'attendance_missing',
        title: 'Présence incomplète',
        body: `Séance du ${session.date} : ${attendance?.length ?? 0}/${rosterIds.length} joueurs renseignés`,
        entityType: 'session',
        entityId: session.id,
      })
    }
  }
  return sessions.length
}

/** Récap agrégé plutôt qu'un push par saisie : le volume quotidien peut être élevé. */
async function notifyWellnessDigest(admin, team, rosterIds, today) {
  const { data: entries } = await admin
    .from('wellness_entries')
    .select('player_id')
    .in('player_id', rosterIds)
    .eq('date', isoDate(today))
  const count = entries?.length ?? 0
  if (!count) return 0
  if (!await claimDispatch(admin, `wellness_digest:${team.id}`, isoDate(today))) return 0

  await dispatch(admin, {
    teamId: team.id,
    orgId: team.organization_id,
    type: 'wellness_digest',
    title: `Bien-être du jour — ${count}/${rosterIds.length}`,
    body: `${count} questionnaire${count > 1 ? 's' : ''} renseigné${count > 1 ? 's' : ''} pour la date du jour`,
  })
  return count
}

async function notifyTasksDue(admin, team, today) {
  const t = isoDate(today)
  const { data: actions } = await admin
    .from('player_actions')
    .select('id, title, due_date, notify_j1, notify_jj, notify_custom_date, assigned_to, staff(profile_id)')
    .eq('team_id', team.id)
    .neq('status', 'done')
    .not('assigned_to', 'is', null)
    // Une tâche à échéance lointaine mais avec une date de rappel personnalisée aujourd'hui doit
    // quand même remonter : le filtre ne peut plus se limiter à l'horizon de `due_date`.
    .or(`due_date.lte.${isoDate(shiftDays(today, TASK_HORIZON_DAYS))},notify_custom_date.eq.${t}`)

  let sent = 0
  for (const action of actions ?? []) {
    const profileId = action.staff?.profile_id
    if (!profileId) continue
    const reason = taskReminderReason(action.due_date, today, {
      notifyJ1: action.notify_j1,
      notifyJJ: action.notify_jj,
      notifyCustomDate: action.notify_custom_date,
    })
    if (!reason) continue
    if (!await claimDispatch(admin, `task_due_soon:${action.id}`, isoDate(today))) continue
    const overdue = action.due_date < isoDate(today)
    // Une date personnalisée ne dit rien de la proximité réelle de l'échéance (elle peut être
    // volontairement bien avant) — "Échéance proche" serait trompeur si l'échéance est lointaine.
    const title = reason === 'date personnalisée'
      ? `Rappel — ${action.title}`
      : overdue ? `Tâche en retard — ${action.title}` : `Échéance proche — ${action.title}`
    await dispatch(admin, {
      teamId: team.id,
      orgId: team.organization_id,
      type: 'task_due_soon',
      title,
      body: `À faire pour le ${action.due_date}`,
      entityType: 'player_action',
      entityId: action.id,
      assigneeUserIds: [profileId],
    })
    sent += 1
  }
  return sent
}

/**
 * Bilan du vendredi : joueurs sans aucune saisie depuis lundi.
 * Uniquement à destination du staff — récap in-app/push, et email de bilan pour
 * ceux qui l'ont activé. Les joueurs ne sont PAS contactés (cf. règle en tête
 * de fichier) : c'est au staff de déclencher la relance depuis l'interface.
 */
async function notifyWeeklyWellness(admin, team, roster, rosterIds, today) {
  const weekStart = isoDate(startOfWeek(today))
  const { data: entries } = await admin
    .from('wellness_entries')
    .select('player_id')
    .in('player_id', rosterIds)
    .gte('date', weekStart)

  const filled = new Set((entries ?? []).map(e => e.player_id))
  const missing = roster.filter(p => !filled.has(p.id))
  if (!missing.length) return { missing: 0 }

  if (!await claimDispatch(admin, `wellness_weekly_reminder:${team.id}`, isoDate(today))) {
    return { missing: missing.length, skipped: 'déjà diffusé' }
  }

  const names = missing.map(fullName).join(', ')
  const recipients = await teamRecipients(admin, team.id, 'wellness')
  await dispatch(admin, {
    teamId: team.id,
    orgId: team.organization_id,
    type: 'wellness_weekly_reminder',
    title: `${missing.length} joueur${missing.length > 1 ? 's' : ''} sans bien-être cette semaine`,
    body: `${names} — aucun rappel automatique envoyé, à relancer manuellement si besoin`,
    recipients,
  })

  const staffEmails = await resolveEmails(admin, recipients.filter(r => r.email).map(r => r.user_id))
  if (staffEmails.length) {
    await safeMail({
      to: staffEmails,
      subject: `Bilan bien-être — ${team.name}`,
      text: `Depuis le ${weekStart}, ${missing.length} joueur(s) n'ont rempli aucun questionnaire bien-être : ${names}.\n\n`
          + `Aucun rappel ne leur a été envoyé automatiquement : utilisez le bouton d'envoi des liens depuis la page Bien-être.`,
    })
  }

  return { missing: missing.length, staffEmails: staffEmails.length }
}

async function resolveEmails(admin, userIds) {
  if (!userIds.length) return []
  const { data } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', userIds)
  const names = new Map((data ?? []).map(p => [p.id, `${p.first_name} ${p.last_name}`.trim()]))

  const out = []
  for (const id of userIds) {
    const { data: user } = await admin.auth.admin.getUserById(id)
    if (user?.user?.email) out.push({ email: user.user.email, name: names.get(id) || undefined })
  }
  return out
}

/** Un email en échec ne doit pas interrompre la boucle du cron. */
async function safeMail(payload) {
  try {
    await sendMail(payload)
    return true
  } catch (err) {
    console.error('[cron] email non envoyé', err.message, err.details ?? '')
    return false
  }
}
