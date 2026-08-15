import type { DiagramScene } from '../utils/diagram';

// ─── Primitive types ──────────────────────────────────────────────────────────
export type OrgRole           = 'superadmin' | 'member';
export type TeamRole          = 'admin' | 'editor' | 'viewer';
export type PlayerStatus      = 'active' | 'injured' | 'limited' | 'suspended' | 'unavailable';
export type BasketballPosition = 'Meneur' | 'Arrière' | 'Ailier' | 'Ailier Fort' | 'Pivot';
export type SessionType       = 'training' | 'match' | 'gym' | 'rest';
export type ActionStatus      = 'todo' | 'in_progress' | 'waiting' | 'done';
export type ActionPriority    = 'low' | 'normal' | 'high' | 'critical';
export type ActionCategory    =
  | 'medical' | 'physical' | 'mental' | 'tactical'
  | 'administrative' | 'interview' | 'video' | 'discussion';
export type NoteCategory      = 'entretien' | 'comportement' | 'perso' | 'match' | 'autre';
export type ObjectiveImportance = 'major' | 'normal' | 'minor';
export type ObjectiveComparator = 'gte' | 'lte' | 'eq';

// ─── New top-level entities ───────────────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export interface Season {
  id: string;
  teamId: string;
  label: string;          // '2025/2026'
  startDate: string;
  endDate: string;
  totalGames?: number;
  isCurrent: boolean;
}

export interface Match {
  id: string;
  teamId: string;
  seasonId: string;
  gameNumber?: number;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  competition: string;
  result: 'win' | 'loss';
  scoreUs: number;
  scoreThem: number;
  quarterScores?: { us: number; them: number }[];
}

export interface StaffMember {
  id: string;
  teamId: string;
  profileId?: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface TeamRoleAssignment {
  teamId:      string;
  teamName?:   string;
  profileId:   string;
  firstName:   string;
  lastName:    string;
  role:        TeamRole;
}

export interface StaffMeeting {
  id: string;
  teamId: string;
  title: string;
  date: string;
  time: string;
  notes?: string;
  createdAt: string;
}

// ─── Domain entities ──────────────────────────────────────────────────────────
export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  number: number;
  position: BasketballPosition;
  secondaryPosition?: BasketballPosition;
  organizationId: string;
  status: PlayerStatus;
  nationality: string;
  birthDate: string;
  height?: number;
  weight?: number;
  hand: 'right' | 'left' | 'both';
  contractEnd?: string;
  email?: string;
  photoUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  category: string;
  color: string;
  organizationId?: string;
  organizationName?: string;
  createdAt?: string;
  playerCount?: number;
  currentSeason?: string;
  loadLightMax?: number;
  loadNormalMax?: number;
  sessionsPerWeek?: number;
  evalTOrange?: number;
  evalTBlue?:   number;
  evalTGreen?:  number;
  ortgTAmber?:  number;
  ortgTGreen?:  number;
  drtgTAmber?:  number;
  drtgTRed?:    number;
  defaultWellnessMethod?: WellnessEntryMethod;
  publicWellnessMethod?:  WellnessEntryMethod;
}

/** Méthode de saisie bien-être : détaillée (6 axes précis), rapide (6 axes via smiley/couleur), ou note unique (1 valeur globale) */
export type WellnessEntryMethod = 'detailed' | 'emoji' | 'single';

export interface RPEEntry {
  id: string;
  sessionId: string;
  playerId: string;
  rpe: number;
  actualDuration?: number;
  notes?: string;
  // Enriched from training_sessions join
  date: string;
  sessionType: SessionType;
  plannedDuration: number;
  teamName?: string;
}

export interface WellnessEntry {
  id: string;
  playerId: string;
  date: string;
  fatigue: number;
  mood: number;
  stress: number;
  motivation: number;
  sleep: number;
  soreness: number;
  score: number;
  notes?: string;
}

/** Questionnaire de personnalité — réponses brutes d'un joueur (une seule passation).
 *  Le type à 4 lettres n'est pas stocké : il se recalcule depuis `answers` (src/data/mbti). */
export interface MbtiResponse {
  id: string;
  playerId: string;
  /** Clés = identifiants des 24 questions, valeurs 1–5. */
  answers: Record<number, number>;
  submittedAt: string;
}

export interface MedicalRecord {
  id: string;
  playerId: string;
  date: string;
  type: 'injury' | 'checkup' | 'treatment';
  description: string;
  location?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  daysAbsent?: number;
  status: 'active' | 'resolved';
  /** `null` explicite = rouvrir l'entrée en effaçant la date de clôture (cf. `treatment`). */
  resolvedDate?: string | null;
  rtpDate?: string;
  /** `null` explicite = effacer le champ en base (cf. `toRow` dans api/medical.ts), à distinguer
   *  de `undefined` = champ non modifié par cette mise à jour partielle. */
  treatment?: string | null;
}

/** Note de suivi mental — texte libre daté écrit par le staff sur un joueur.
 *  Ni échéance ni statut : c'est ce qui la distingue d'une `Action`. */
export interface PlayerNote {
  id: string;
  playerId: string;
  teamId: string;
  /** Saison de rattachement — une note reste dans la saison où elle a été écrite. */
  seasonId: string;
  /** Date de l'échange ou de l'observation, pas celle de la saisie. */
  date: string;
  category: NoteCategory;
  /** HTML de l'éditeur riche — à assainir (`sanitizeHtml`) avant tout affichage. */
  content: string;
  createdBy?: string;
  /** Nom de l'auteur, joint depuis `profiles` — absent si la note n'a pas d'auteur connu. */
  authorName?: string;
  createdAt?: string;
}

export interface Action {
  id: string;
  playerId?: string;
  teamId?: string;
  /** Saison de rattachement — un objectif/une tâche appartient à une saison. */
  seasonId?: string;
  title: string;
  description?: string;
  category?: ActionCategory;
  priority: ActionPriority;
  dueDate: string;
  assignedTo?: string;
  status: ActionStatus;
}

/** Objectif : seuil attendu sur un indicateur (clé du registre INDICATORS), pour un joueur ou une équipe */
export interface Objective {
  id: string;
  playerId?: string;
  teamId?: string;
  /** Saison de rattachement — un objectif/une tâche appartient à une saison. */
  seasonId?: string;
  indicatorKey: string;
  importance: ObjectiveImportance;
  comparator: ObjectiveComparator;
  thresholdValue: number;
  active: boolean;
  createdAt?: string;
}

/** Stats individuelles par match — nomenclature NF2 */
export interface MatchStat {
  id: string;
  matchId?: string;
  playerId: string;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  competition: string;
  result: 'win' | 'loss';
  scoreUs: number;
  scoreThem: number;
  starter: boolean;
  min: number;
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number;  fta: number;
  ro: number; rd: number;
  pd: number; ct: number; intercepts: number; bp: number;
  fte: number; fpr: number;
  eval: number | null;
  plusMinus: number | null;
}

/** Stats avancées équipe par match */
export interface TeamMatchStat {
  id: string;
  matchId?: string;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  result: 'win' | 'loss';
  scoreUs: number;
  scoreThem: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number;  fta: number;
  ro: number; rd: number; rt: number;
  pd: number; ct: number; intercepts: number; bp: number; fte: number; fpr: number;
  possessions: number;
  // Ratios avancés : `null` = dénominateur nul en base (aucun tir, aucune possession saisie), donc
  // « pas de donnée » — jamais 0. Les colonnes GENERATED de schema.sql renvoient bien NULL dans ce
  // cas ; les écraser en 0 côté client faisait entrer des matchs non documentés dans les facteurs
  // de victoire, la PCA et les moyennes d'équipe. Voir docs/CALCULS.md § 14.
  offRating: number | null;
  defRating: number | null;
  efgPct: number | null;
  ftRate: number | null;
  toPct: number | null;
  orebPct: number | null;
  drebPct: number | null;
  opp_fg2m: number; opp_fg2a: number;
  opp_fg3m: number; opp_fg3a: number;
  opp_ftm: number;  opp_fta: number;
  opp_ro: number; opp_rd: number; opp_rt: number;
  opp_pd: number; opp_ct: number; opp_intercepts: number; opp_bp: number; opp_fte: number; opp_fpr: number;
  opp_possessions: number | null;
  opp_efgPct: number | null;
  opp_toPct: number | null;
  opp_orebPct: number | null;
  /** Champ client-only (jamais lu depuis la DB) : Σ des minutes de TOUT l'effectif sur ce
   *  match — calculé quand les MatchStat du roster complet sont disponibles (voir
   *  usePerformanceData.ts), utilisé pour corriger usagePct par la part de minutes jouées
   *  (calcPlayerAdvanced). Absent si non calculé pour ce contexte. */
  teamMinutes?: number;
}

export interface OpponentMatchStat {
  id: string;
  matchId: string;
  playerName: string;
  min: number;
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number; intercepts: number; bp: number;
  fte: number; fpr: number;
  eval: number | null;
  plusMinus: number | null;
}

// ─── Données tactiques (import CSV vidéo) ─────────────────────────────────────

/** Catégorie tactique connue d'une équipe (ex. "Offense M2M") — auto-créée à l'import. */
export interface TacticalCategory {
  id: string;
  teamId: string;
  name: string;
  /** Nom normalisé figé à la création — ne change JAMAIS au renommage, pour que les imports
   *  futurs continuent à matcher sur le libellé d'origine du fichier vidéo, indépendamment
   *  des renommages d'affichage faits ensuite dans la config. */
  normalizedName: string;
  sortOrder: number;
  /** Couleur d'accent choisie librement, pour distinguer visuellement les blocs catégorie. */
  color: string;
  /** Seuils de coloration de la rentabilité (échelle liée à SA dimension "Valeur"). */
  rentabiliteSeuilVert: number;
  rentabiliteSeuilBleu: number;
  rentabiliteSeuilAmbre: number;
  /** true pour une catégorie où une valeur basse est meilleure (ex. défense : peu de points
   *  concédés) — inverse le sens de comparaison des seuils. false par défaut (attaque : plus haut
   *  = meilleur). */
  rentabiliteInversee: boolean;
}

/** Dimension d'une catégorie (ex. "Valeur", "Temps fort", "Finalité") — auto-créée à l'import. */
export interface TacticalDimension {
  id: string;
  teamId: string;
  categoryId: string;
  name: string;
  /** Nom normalisé figé à la création — voir `TacticalCategory.normalizedName`. */
  normalizedName: string;
  sortOrder: number;
}

/** Option attendue d'une dimension — curée à la main, jamais auto-créée par l'import. */
export interface TacticalDimensionOption {
  id: string;
  teamId: string;
  dimensionId: string;
  label: string;
  sortOrder: number;
}

/** Une ligne de données du CSV brut, pour une catégorie d'un match. */
export interface TacticalEvent {
  id: string;
  matchId: string;
  categoryId: string;
  sequenceNumber: number;
  values: TacticalEventValue[];
}

/** La valeur texte d'une dimension pour un événement (libre, pas de contrainte au catalogue d'options). */
export interface TacticalEventValue {
  dimensionId: string;
  label: string;
}

export type TacticalWidgetType = 'dimension_table' | 'evolution_chart' | 'cross_matrix' | 'pie_chart' | 'period_comparison' | 'custom_table';

/** Un bloc du tableau de bord tactique personnalisé, composé par l'équipe. */
export interface TacticalDashboardWidget {
  id: string;
  teamId: string;
  type: TacticalWidgetType;
  /** Null pour un bloc "custom_table" — les catégories réelles utilisées sont dans config.dimensions[].categoryId. */
  categoryId: string | null;
  title: string | null;
  /** Contenu spécifique au type — voir tacticalDashboard.ts pour les formes attendues par type. */
  config: Record<string, unknown>;
  sortOrder: number;
}

export interface TrainingSession {
  id: string;
  teamId: string;
  seasonId: string;
  date: string;
  sessionType: SessionType;
  plannedDuration: number;
  notes?: string;
  createdAt?: string;
}

export interface SessionTeamBlock {
  id: string;
  sessionId: string;
  label: string;
  position: number;
}

export interface SessionTeam {
  id: string;
  blockId: string;
  sessionId: string;
  name: string;
  color: string;
  position: number;
}

export interface SessionDocument {
  id: string;
  sessionId: string;
  storagePath: string;
  name: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

/**
 * Un exercice = un en-tête + une séquence de phases (voir `ExercisePhase`). Il ne porte que
 * ses objectifs : le déroulement, lui, vit phase par phase.
 */
export interface Exercise {
  id: string;
  name: string;
  teamId: string;
  /** Le « comment » de l'exercice, en un texte d'ensemble — recopié dans le bloc de séance. */
  deroulement?: string;
  /** Le « pourquoi » de l'exercice — recopié dans le bloc de séance à l'ajout. */
  objectifs?: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  videoUrl?: string;
  /** Nombre de phases, pour les écrans qui n'ont pas besoin de leur contenu. */
  phaseCount: number;
  /** Scène de la première phase — la vignette de l'exercice dans la liste. */
  coverScene?: DiagramScene;
  createdAt: string;
}

export interface ExerciseCategory {
  id: string;
  teamId: string;
  name: string;
  color: string;
  position: number;
}

/**
 * Une phase d'exercice : un schéma de terrain et son texte, dans l'ordre `position`.
 *
 * `scene` est la source de vérité et se rend en SVG partout — aucun fichier n'est produit.
 * Une scène sans élément est légitime : la phase n'est alors que du texte.
 */
export interface ExercisePhase {
  id: string;
  exerciseId: string;
  position: number;
  title?: string;
  text?: string;
  scene: DiagramScene;
  /** Raster réservé à un futur export PDF de séance — jamais renseigné aujourd'hui. */
  thumbUrl?: string;
  createdAt: string;
}

type BlockIntensity = 'basse' | 'moyenne' | 'haute' | 'très élevée';

export interface SessionBlock {
  id: string;
  sessionId: string;
  position: number;
  duration: number;
  category: string;
  intensity: BlockIntensity;
  label: string;
  description?: string;
  consignes?: string;
  loadUa: number;
  drillId: string | null;
  createdAt: string;
}

export interface TrainingAttendance {
  id: string;
  sessionId: string;
  playerId: string;
  status: 'present' | 'absent' | 'late';
  /**
   * Partenaire d'entraînement : joueur de l'organisation invité sur cette séance-là, hors
   * effectif de l'équipe. Elle ne compte dans aucune statistique de l'équipe qui l'invite,
   * mais son RPE entre dans SA charge. L'étiquette qualifie la présence, pas le joueur.
   */
  sparring: boolean;
  createdAt: string;
}

/** Une saisie RPE d'un joueur sur une séance — le grain minimal qui permet d'appliquer la règle
 *  de moyenne d'équipe (moyenne par joueur puis moyenne des joueurs) sur plusieurs séances. */
export interface SessionRpeEntry {
  playerId: string;
  rpe: number;
}

export interface TeamSessionRow {
  id: string;
  date: string;
  type: SessionType;
  duration: number;
  nbPlayers: number;
  /** Saisies RPE de la séance, par joueur. Porte le `playerId` (effectif distinct réellement
   *  actif sur une semaine, pas une moyenne par séance) ET la valeur, indispensable pour agréger
   *  plusieurs séances sans pondérer par l'assiduité. */
  entries: SessionRpeEntry[];
  avg: number;
  max: number;
  min: number;
  totalLoad: number;
}

export interface PlayerRank {
  playerId: string;
  name: string;
  nameFull: string;
  nbSessions: number;
  avgRpe: number;
  maxRpe: number;
  totalLoad: number;
  rpe3w:     number | null;
  weekLoads: number[];
}

