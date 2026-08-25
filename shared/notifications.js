/**
 * Registre des notifications — importé côté client (src/**) ET côté serverless (api/**).
 * Source unique de vérité : ne pas dupliquer ces tables ailleurs.
 */

/** Catégories exposées à l'utilisateur dans les réglages (granularité de configuration). */
export const NOTIFICATION_CATEGORIES = [
  { key: 'roster',   label: 'Effectif',      color: '#3B82F6' },
  { key: 'medical',  label: 'Médical',       color: '#EF4444' },
  { key: 'wellness', label: 'Bien-être',     color: '#EC4899' },
  { key: 'training', label: 'Entraînement',  color: '#06B6D4' },
  { key: 'meetings', label: 'Réunions',      color: '#F97316' },
  { key: 'tasks',    label: 'Tâches',        color: '#8B5CF6' },
  { key: 'mental',   label: 'Mental',        color: '#A78BFA' },
  { key: 'matches',  label: 'Matchs',        color: '#F59E0B' },
  { key: 'tactical', label: 'Tactique',      color: '#10B981' },
  { key: 'season',   label: 'Saison',        color: '#94A3B8' },
];

/**
 * Un type par événement métier.
 * - audience : 'team' = tout le staff ayant accès à l'équipe · 'assignee' = la personne assignée
 * - inApp / push / email : canaux activés par défaut (l'équipe puis l'utilisateur peuvent restreindre)
 * - timing : 'immediate' | 'daily_cron' | 'weekly_cron'
 */
export const NOTIFICATION_TYPES = [
  { key: 'player_added',             category: 'roster',   audience: 'team',     label: 'Joueur ajouté à l\'effectif',      inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'player_status_changed',    category: 'roster',   audience: 'team',     label: 'Statut d\'un joueur modifié',      inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'player_removed',           category: 'roster',   audience: 'team',     label: 'Joueur retiré de l\'effectif',     inApp: true,  push: false, email: false, timing: 'immediate' },

  { key: 'medical_added',            category: 'medical',  audience: 'team',     label: 'Nouvelle fiche médicale',          inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'medical_updated',          category: 'medical',  audience: 'team',     label: 'Fiche médicale mise à jour',       inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'medical_resolved',         category: 'medical',  audience: 'team',     label: 'Blessure clôturée',                inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'rtp_upcoming',             category: 'medical',  audience: 'team',     label: 'Retour au jeu imminent',           inApp: true,  push: false, email: false, timing: 'daily_cron' },

  { key: 'wellness_added',           category: 'wellness', audience: 'team',     label: 'Bien-être saisi',                  inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'wellness_digest',          category: 'wellness', audience: 'team',     label: 'Récap quotidien bien-être',        inApp: false, push: true,  email: false, timing: 'daily_cron' },
  { key: 'wellness_alert',           category: 'wellness', audience: 'team',     label: 'Alerte bien-être',                 inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'wellness_weekly_reminder', category: 'wellness', audience: 'team',     label: 'Bilan hebdo bien-être',            inApp: true,  push: true,  email: true,  timing: 'weekly_cron' },

  { key: 'session_updated',          category: 'training', audience: 'team',     label: 'Séance modifiée ou annulée',       inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'attendance_missing',       category: 'training', audience: 'team',     label: 'Présence non renseignée',          inApp: true,  push: false, email: false, timing: 'daily_cron' },
  { key: 'rpe_added',                category: 'training', audience: 'team',     label: 'RPE saisi',                        inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'rpe_missing',              category: 'training', audience: 'team',     label: 'RPE non rempli',                   inApp: true,  push: true,  email: false, timing: 'daily_cron' },

  { key: 'meeting_added',            category: 'meetings', audience: 'team',     label: 'Réunion créée',                    inApp: true,  push: false, email: false, timing: 'immediate' },
  { key: 'meeting_deleted',          category: 'meetings', audience: 'team',     label: 'Réunion supprimée',                inApp: true,  push: false, email: false, timing: 'immediate' },

  { key: 'action_added',             category: 'tasks',    audience: 'assignee', label: 'Tâche assignée',                   inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'task_due_soon',            category: 'tasks',    audience: 'assignee', label: 'Échéance de tâche',                inApp: true,  push: true,  email: false, timing: 'daily_cron' },

  // Le contenu de la note ne sort JAMAIS d'ici : la notification ne porte que le nom du joueur
  // et la catégorie. Un compte rendu d'entretien n'a pas à s'afficher dans une bannière push.
  { key: 'note_added',               category: 'mental',   audience: 'team',     label: 'Note de suivi ajoutée',            inApp: true,  push: false, email: false, timing: 'immediate' },

  { key: 'match_added',              category: 'matches',  audience: 'team',     label: 'Match planifié',                   inApp: true,  push: true,  email: false, timing: 'immediate' },
  { key: 'match_stats_added',        category: 'matches',  audience: 'team',     label: 'Statistiques de match ajoutées',   inApp: true,  push: true,  email: false, timing: 'immediate' },

  { key: 'tactical_import_done',     category: 'tactical', audience: 'team',     label: 'Import tactique terminé',          inApp: true,  push: true,  email: false, timing: 'immediate' },

  { key: 'season_changed',           category: 'season',   audience: 'team',     label: 'Saison créée ou changée',          inApp: true,  push: false, email: false, timing: 'immediate' },
];

const TYPES_BY_KEY = new Map(NOTIFICATION_TYPES.map(t => [t.key, t]));
const CATEGORIES_BY_KEY = new Map(NOTIFICATION_CATEGORIES.map(c => [c.key, c]));

export function getNotificationType(key) {
  return TYPES_BY_KEY.get(key) ?? null;
}

export function getNotificationCategory(key) {
  return CATEGORIES_BY_KEY.get(key) ?? null;
}

/** Types couverts par une catégorie — sert à expliquer à l'utilisateur ce qu'il coupe. */
export function typesInCategory(categoryKey) {
  return NOTIFICATION_TYPES.filter(t => t.category === categoryKey);
}

/** Une catégorie n'expose le canal email que si au moins un de ses types l'utilise. */
export function categorySupportsEmail(categoryKey) {
  return typesInCategory(categoryKey).some(t => t.email);
}

/**
 * Cible du clic sur une notification. Le service worker ne sait suivre qu'une URL
 * pré-calculée : c'est cette fonction qui la produit, côté client comme côté serveur.
 *
 * Deux règles, apprises d'un renommage qui avait laissé cette fonction derrière :
 *
 * 1. **URLs canoniques uniquement** — celles déclarées dans `src/router.tsx`, jamais un ancien
 *    chemin qui ne marche que par redirection. Les redirections fonctionnent, mais elles font
 *    perdre l'onglet ciblé et rendent la fonction muette quand une route change.
 *    `shared/notifications.test.ts` vérifie que chaque type pointe vers une route déclarée.
 *
 * 2. **Toujours viser l'onglet, pas seulement la page.** Une notification qui ramène sur l'écran
 *    déjà affiché donne l'impression que le clic n'a rien fait — c'est le symptôme qui a mené
 *    ici. `entityId` doit donc être placé dans le bon segment de route.
 */
export function urlFor(type, entityId) {
  switch (type) {
    case 'player_added':
    case 'player_removed':
    case 'player_status_changed':
      return '/effectif';

    // `entityId` = joueur concerné → onglet "joueur" du dossier médical, sur sa fiche.
    case 'medical_added':
    case 'medical_updated':
    case 'medical_resolved':
      return entityId ? `/medical/joueur/${entityId}` : '/medical';
    case 'rtp_upcoming':
      return '/medical/infirmerie';

    // `entityId` = joueur concerné (cf. WellnessPage) → onglet "joueur" sur sa fiche.
    case 'wellness_added':
      return entityId ? `/bien-etre/joueur/${entityId}` : '/bien-etre';
    // L'alerte porte l'id de l'ENTRÉE bien-être, pas celui du joueur : inutilisable comme
    // paramètre de route, on reste donc sur la vue d'équipe qui met l'alerte en évidence.
    case 'wellness_alert':
      return '/bien-etre/equipe';
    case 'wellness_digest':
    case 'wellness_weekly_reminder':
      return '/bien-etre/equipe';

    case 'session_updated':
      return entityId ? `/seances/${entityId}` : '/seances';
    // `entityId` = séance concernée → sa fiche porte la modale de présences, pas la grille
    // globale (même pattern que `rpe_missing` juste en dessous, créé par le même cron).
    case 'attendance_missing':
      return entityId ? `/seances/${entityId}` : '/presences';

    // `entityId` = séance concernée → la fiche de séance porte les RPE saisis.
    case 'rpe_added':
      return entityId ? `/seances/${entityId}` : '/rpe/equipe';
    case 'rpe_missing':
      return entityId ? `/seances/${entityId}` : '/rpe/saisie';

    case 'meeting_added':
      return entityId ? `/reunions/${entityId}` : '/reunions';
    case 'meeting_deleted':
      return '/reunions';

    case 'action_added':
    case 'task_due_soon':
      return '/taches';

    // `entityId` = joueur concerné → son onglet de suivi mental, pas la vue d'équipe.
    case 'note_added':
      return entityId ? `/performance-individuelle/${entityId}/suivi-mental` : '/performance-collective/suivi-mental';

    case 'match_added':
      return entityId ? `/matchs/${entityId}` : '/matchs';
    case 'match_stats_added':
      return entityId ? `/matchs/${entityId}` : '/matchs';
    // Import tactique : viser l'onglet tactique de la fiche match, pas son boxscore — c'est la
    // donnée que la notification annonce. Slug défini dans MatchDetailPage (MATCH_TAB_GROUPS).
    case 'tactical_import_done':
      return entityId ? `/matchs/${entityId}/tactique` : '/matchs';

    case 'season_changed':
      return '/equipes';

    default:
      return '/tableau-de-bord';
  }
}

/**
 * Seuils de l'alerte bien-être. `score` est le champ généré 0–10 (plus haut = mieux) ;
 * fatigue/stress/soreness sont inversées (plus haut = pire).
 */
export const WELLNESS_ALERT = {
  scoreMax: 4,
  invertedDimensionMin: 8,
  invertedDimensions: ['fatigue', 'stress', 'soreness'],
};

/** Vrai si une entrée bien-être justifie une alerte immédiate au staff. */
export function isWellnessAlerting(entry) {
  if (entry == null) return false;
  if (typeof entry.score === 'number' && entry.score <= WELLNESS_ALERT.scoreMax) return true;
  return WELLNESS_ALERT.invertedDimensions.some(
    dim => typeof entry[dim] === 'number' && entry[dim] >= WELLNESS_ALERT.invertedDimensionMin,
  );
}

/* ── Dates ───────────────────────────────────────────────────────────────────
 *
 * Une notification lue dans un menu déroulant ou une bannière push n'est pas un
 * export de données : « 2026-08-24 » y demande un effort de lecture que
 * « lundi 24 août » n'exige pas. Le formatage vit ici parce que les titres et
 * corps sont écrits des DEUX côtés — pages React (src/**) et crons (api/**) —
 * et que `src/utils/dateFormat.ts` n'est pas importable depuis une fonction
 * serverless en JS pur.
 *
 * Volontairement sans `Intl` ni objet `Date` pour l'affichage : une date métier
 * « 2026-08-24 » n'a pas de fuseau, et `new Date('2026-08-24')` la place à
 * minuit UTC — un serveur à l'ouest de Greenwich afficherait donc la veille.
 * Seul le jour de la semaine passe par `Date`, en accesseurs UTC.
 */

const NOTIF_WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const NOTIF_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Date ISO, avec l'heure optionnelle : « 2026-08-24 » comme « 2026-08-24T18:30 ». */
const ISO_DATE_RE = /(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/**
 * « 2026-08-24 » → « lundi 24 août ». L'année n'est ajoutée que si elle diffère de
 * celle de `reference` : la porter sur une échéance à trois jours est du bruit,
 * l'omettre sur une date de reprise en janvier prochain est une ambiguïté.
 * Une chaîne qui n'est pas une date est renvoyée telle quelle.
 */
export function formatNotifDate(iso, reference = new Date()) {
  if (typeof iso !== 'string') return '';
  const m = ISO_DATE_RE.exec(iso);
  if (!m || m.index !== 0) return iso;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return iso;

  const weekday = NOTIF_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  let out = `${weekday} ${day} ${NOTIF_MONTHS[month - 1]}`;
  if (year !== reference.getFullYear()) out += ` ${year}`;
  if (m[4]) out += ` à ${Number(m[4])}h${m[5] === '00' ? '' : m[5]}`;
  return out;
}

/**
 * Réécrit toutes les dates ISO trouvées dans un texte déjà composé.
 *
 * Appliquée à deux endroits, pour deux raisons distinctes :
 * - dans `dispatch()` (api/_lib/notify.js) — seul passage obligé de toute notification,
 *   donc l'endroit où normaliser plutôt que sur chaque `notify(...)` d'écran ;
 * - au rendu du centre de notifications — les lignes DÉJÀ en base ont leur corps figé,
 *   et resteraient sinon en « 2026-08-24 » à l'écran.
 */
export function prettifyDates(text, reference = new Date()) {
  if (typeof text !== 'string') return text;
  return text.replace(new RegExp(ISO_DATE_RE, 'g'), match => formatNotifDate(match, reference));
}
