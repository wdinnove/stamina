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
 */
export function urlFor(type, entityId) {
  switch (type) {
    case 'player_added':
    case 'player_removed':
    case 'player_status_changed':
      return '/roster';
    case 'medical_added':
    case 'medical_updated':
    case 'medical_resolved':
      return entityId ? `/medical/record/${entityId}` : '/medical';
    case 'rtp_upcoming':
      return '/medical';
    case 'wellness_added':
      return entityId ? `/wellness/new/${entityId}` : '/wellness';
    case 'wellness_alert':
    case 'wellness_digest':
    case 'wellness_weekly_reminder':
      return '/wellness';
    case 'session_updated':
      return entityId ? `/sessions/${entityId}` : '/sessions';
    case 'attendance_missing':
      return '/attendance';
    case 'rpe_added':
    case 'rpe_missing':
      return entityId ? `/sessions/${entityId}` : '/rpe';
    case 'meeting_added':
      return entityId ? `/meetings/${entityId}` : '/meetings';
    case 'meeting_deleted':
      return '/meetings';
    case 'action_added':
    case 'task_due_soon':
      return '/actions';
    case 'match_added':
    case 'match_stats_added':
    case 'tactical_import_done':
      return entityId ? `/matches/${entityId}` : '/matches';
    case 'season_changed':
      return '/teams';
    default:
      return '/';
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
