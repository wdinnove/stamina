import type { DiagramScene } from '../utils/diagram';

// ─── Primitive types ──────────────────────────────────────────────────────────
export type OrgRole           = 'superadmin' | 'member';
export type TeamRole          = 'admin' | 'editor' | 'viewer';
export type PlayerStatus      = 'active' | 'injured' | 'limited' | 'suspended' | 'unavailable';
export type BasketballPosition = 'Meneur' | 'Arrière' | 'Ailier' | 'Ailier Fort' | 'Pivot';
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

/**
 * Nature d'un match. Un amical ne se compare pas à un officiel — règles aménagées, adversaire
 * d'une autre division, rotations testées plutôt que subies — et n'entre donc dans AUCUN agrégat
 * de saison par défaut : bilan V-D, moyennes, PCA, archétypes, corrélations, objectifs.
 * L'inclusion est un geste explicite de l'utilisateur (`includeFriendlies`), jamais le défaut.
 */
export type MatchKind = 'official' | 'friendly';

export interface Match {
  id: string;
  teamId: string;
  seasonId: string;
  gameNumber?: number;
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  competition: string;
  kind: MatchKind;
  result: 'win' | 'loss';
  scoreUs: number;
  scoreThem: number;
  quarterScores?: { us: number; them: number }[];
}

/**
 * Une personne du staff, rattachée à l'ORGANISATION. Elle peut intervenir sur plusieurs
 * équipes : `teamIds` porte ces rattachements quand ils ont été chargés.
 *
 * `role` est un métier (coach, kiné, préparateur…), pas une fonction dans une équipe donnée.
 * `teamRole`, quand présent, surcharge ce métier pour UNE équipe précise (ex. assistant en U18,
 * coach en NF2) — n'est renseigné que par `listByTeam`, qui charge le staff d'une équipe donnée ;
 * le rôle à afficher/filtrer pour cette équipe est donc `teamRole ?? role`.
 */
export interface StaffMember {
  id: string;
  organizationId: string;
  profileId?: string;
  firstName: string;
  lastName: string;
  role: string;
  teamRole?: string;
  /** Équipes de la personne — absent quand la liste a été chargée équipe par équipe. */
  teamIds?: string[];
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
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
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
  email?: string;
  photoUrl?: string;
  /** Date de départ du club — présente = le joueur ne doit plus apparaître dans les listes de
   *  saisons futures ni dans les viviers de partenaires, mais reste visible sur les saisons où
   *  il a été rattaché (l'historique ne se réécrit pas). Absent des listes par défaut
   *  (`playersApi.list`) sauf demande explicite (`includeLeft`). */
  leftDate?: string;
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
  /** Nombre de crans de l'échelle rapide (méthodes "emoji" et "single") — 3 ou 5. */
  wellnessQuickScaleSize?: WellnessQuickScaleSize;
}

/** Méthode de saisie bien-être : détaillée (6 axes précis), rapide (6 axes via smiley/couleur), ou note unique (1 valeur globale) */
export type WellnessEntryMethod = 'detailed' | 'emoji' | 'single';

/** Nombre de crans de l'échelle rapide partagée par les méthodes "emoji" et "single". */
export type WellnessQuickScaleSize = 3 | 4 | 5;

export interface RPEEntry {
  id: string;
  sessionId: string;
  playerId: string;
  rpe: number;
  actualDuration?: number;
  notes?: string;
  // Enriched from training_sessions join
  date: string;
  categoryName?: string;
  categoryColor?: string;
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
  /** Rappel la veille de l'échéance (J-1). */
  notifyJ1?: boolean;
  /** Rappel le jour même de l'échéance (J-J). */
  notifyJJ?: boolean;
  /** Rappel supplémentaire optionnel à une date choisie — cumulable avec J-1/J-J, pas un
   *  remplacement. N'affecte pas la relance hebdomadaire d'une tâche en retard. */
  notifyCustomDate?: string;
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
  /** Dénormalisé depuis `matches` (trigger `sync_match_stats_from_match`) — permet de filtrer les
   *  amicaux sans jointure, y compris sur les requêtes qui n'interrogent que `match_stats`. */
  kind: MatchKind;
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
  /** Exposé par la vue `team_match_stats_full` (colonne `m.kind`) — sert à distinguer visuellement
   *  les amicaux quand l'utilisateur les réintègre volontairement dans une analyse. */
  kind: MatchKind;
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
  /** Position FIGÉE dans `TacticalAction.options` — attribuée à la création, jamais modifiée par
   *  un réordonnancement (qui ne touche que `sortOrder`). La changer ferait pointer toutes les
   *  actions déjà stockées vers la mauvaise dimension. */
  slot: number;
}

/** Option attendue d'une dimension. Curée à la main dans l'écran de configuration ou créée en
 *  masse par le CSV de configuration ; l'import de match y ajoute les valeurs qu'il ne connaît
 *  pas, puisque c'est le code de l'option qui est stocké sur l'action. */
export interface TacticalDimensionOption {
  id: string;
  teamId: string;
  dimensionId: string;
  label: string;
  sortOrder: number;
  /** Code stocké dans `TacticalAction.options`, attribué à la création et JAMAIS réattribué —
   *  un code réutilisé après suppression ferait basculer l'historique d'un libellé à un autre. */
  code: number;
}

/**
 * Une action telle qu'elle est STOCKÉE : une ligne, aucune identité propre (on n'affiche jamais
 * une action isolée), les valeurs réduites à des codes d'options positionnés sur le `slot` de
 * chaque dimension.
 */
export interface TacticalAction {
  matchId: string;
  categoryId: string;
  seq: number;
  /** Points de l'action (dimension « Valeur ») — null pour une action sans score. */
  valeur: number | null;
  /** `options[slot]` = code de l'option, null si la dimension n'est pas renseignée. */
  options: (number | null)[];
  /** Joueuses rapprochées de l'effectif à l'import. */
  playerIds: string[];
}

/**
 * Une action REHYDRATÉE pour l'analyse : les codes sont retraduits en libellés du catalogue une
 * fois au chargement, ce qui laisse toute l'agrégation (`tacticalAnalysis`, `crossAnalysis`,
 * widgets) travailler sur la même forme qu'avant.
 */
export interface TacticalEvent {
  /** Clé synthétique `match:catégorie:rang` — jamais stockée, seulement une identité de calcul. */
  id: string;
  matchId: string;
  categoryId: string;
  sequenceNumber: number;
  values: TacticalEventValue[];
  playerIds: string[];
}

/** La valeur d'une dimension pour une action, sous son libellé de catalogue. */
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
  /** Catégorie d'équipe (scope 'session'). Absente si la catégorie a été supprimée depuis. */
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
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
  /** Dossier libre (glisser-déposer depuis la bibliothèque), sans rapport avec la catégorie. */
  folderId?: string;
  videoUrl?: string;
  /** Nombre de phases, pour les écrans qui n'ont pas besoin de leur contenu. */
  phaseCount: number;
  /** Scène de la première phase — la vignette de l'exercice dans la liste. */
  coverScene?: DiagramScene;
  createdAt: string;
}

/** Ce qu'une catégorie d'équipe classe. Une même équipe peut avoir « Physique » en exercice
 *  et en séance : ce sont deux lignes, elles ne se confondent pas. */
export type CategoryScope = 'exercise' | 'meeting' | 'session' | 'system';

/** Un nom, une couleur, un rang — propres à une équipe. Le club se donne son vocabulaire,
 *  l'app n'en impose que les valeurs de départ. */
export interface TeamCategory {
  id: string;
  teamId: string;
  scope: CategoryScope;
  name: string;
  color: string;
  position: number;
}

/** Portées qui supportent le rangement en dossiers — volontairement limité (cf. migration
 *  `team_folders` dans schema.sql). Sans rapport avec `CategoryScope` : un dossier n'est PAS
 *  une catégorie, c'est un classement libre et indépendant, créé à la volée par un writer
 *  directement depuis la bibliothèque d'exercices/systèmes. */
export type FolderScope = 'exercise' | 'system';

/**
 * Un dossier créé librement par un writer pour ranger ses exercices/systèmes, sans rapport
 * avec les catégories : un exercice garde sa catégorie ET peut en plus être dans un dossier,
 * les deux classements sont orthogonaux.
 */
export interface TeamFolder {
  id: string;
  teamId: string;
  scope: FolderScope;
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

/**
 * Un système tactique = un en-tête + une séquence de phases (voir `TacticalSystemPhase`).
 * Contrairement à l'exercice, il ne se rattache jamais à une séance : pas d'équivalent au
 * `drillId` d'un bloc de séance, c'est un bloc de bibliothèque indépendant.
 */
export interface TacticalSystem {
  id: string;
  name: string;
  teamId: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  categoryColor?: string;
  /** Dossier libre (glisser-déposer depuis la bibliothèque), sans rapport avec la catégorie. */
  folderId?: string;
  /** Nombre de phases, pour les écrans qui n'ont pas besoin de leur contenu. */
  phaseCount: number;
  /** Scène de la première phase — la vignette du système dans la liste. */
  coverScene?: DiagramScene;
  createdAt: string;
}

/**
 * Une phase de système : un schéma de terrain et son texte, dans l'ordre `position`.
 *
 * `scene` est la source de vérité et se rend en SVG partout — aucun fichier n'est produit.
 * Une scène sans élément est légitime : la phase n'est alors que du texte.
 */
export interface TacticalSystemPhase {
  id: string;
  systemId: string;
  position: number;
  title?: string;
  text?: string;
  scene: DiagramScene;
  thumbUrl?: string;
  createdAt: string;
}

type BlockIntensity = 'très basse' | 'basse' | 'moyenne' | 'élevée' | 'très élevée';

/** Un repos occupe du temps et rien d'autre : ni catégorie, ni intensité, ni charge. */
export type SessionBlockKind = 'exercice' | 'repos';

export interface SessionBlock {
  id: string;
  sessionId: string;
  position: number;
  kind: SessionBlockKind;
  duration: number;
  category: string;
  intensity: BlockIntensity;
  label: string;
  description?: string;
  consignes?: string;
  loadUa: number;
  drillId: string | null;
  /** Membre du staff qui anime la séquence. */
  staffId: string | null;
  /** Groupe d'équipes du jour utilisé par la séquence — optionnel, masqué tant qu'il est nul. */
  teamBlockId: string | null;
  /** Schéma propre à cette séquence — indépendant de tout exercice de bibliothèque, pour
   *  dessiner sans avoir à créer/nommer un exercice au préalable. */
  scene: DiagramScene | null;
  createdAt: string;
}

export interface TrainingAttendance {
  id: string;
  sessionId: string;
  playerId: string;
  /**
   * `not_expected` — « non attendu » : le joueur n'était pas censé venir. Ni présence ni
   * absence, la ligne sort entièrement du taux d'assiduité (cf. `utils/attendance`).
   */
  status: 'present' | 'absent' | 'late' | 'not_expected';
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
  categoryName?: string;
  categoryColor?: string;
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

// ─── Suivi live : rotations & rentabilité des plays ───────────────────────────
// Domaine volontairement séparé du tactique (`TacticalAction` ci-dessus) : ici, pointage rapide
// en direct ou en relecture manuelle (qui est sur le terrain, fin de possession réussie ou non,
// pour quel play), pas de tag vidéo multi-dimensions a posteriori.

export type LiveSide    = 'offense' | 'defense';
export type LineupSide  = 'us' | 'them';

/** Un système d'attaque ou de défense nommé, propre à une équipe. */
export interface Play {
  id: string;
  teamId: string;
  side: LiveSide;
  name: string;
  active: boolean;
  sortOrder: number;
}

/** Joueuse adverse saisie à la volée pendant un match — aucun effectif adverse n'existe en base. */
export interface MatchOpponentPlayer {
  id: string;
  matchId: string;
  number?: number;
  name: string;
}

/**
 * Un changement de joueuses, sur l'un ou l'autre banc. `onCourt` est l'instantané complet après
 * le changement (pas seulement les entrantes/sortantes) : lire le cinq courant ne demande jamais
 * de rejouer tout l'historique depuis le début du match.
 */
export interface MatchLineupEvent {
  matchId: string;
  seq: number;
  side: LineupSide;
  quarter: number;
  /** Secondes écoulées depuis le début du quart-temps courant — chrono interne, aucun lien vidéo. */
  gameTimeSeconds: number;
  playersIn: string[];
  playersOut: string[];
  onCourt: string[];
}

/**
 * Fin d'une possession pointée en direct ou en relecture, pour l'équipe qui avait le ballon
 * (`side`: 'offense' = nous, 'defense' = l'adversaire). `points` porte un sens différent selon
 * `side` : marqués par nous en attaque, encaissés par nous en défense — les deux flux combinés
 * donnent un +/- par joueuse et par combinaison de cinq sans calcul supplémentaire.
 */
export interface MatchLiveAction {
  matchId: string;
  seq: number;
  quarter: number;
  gameTimeSeconds: number;
  side: LiveSide;
  playId?: string;
  /** 0 à 4 — la réussite d'une possession se lit directement dessus (0 = ratée, peu importe la
   *  raison : tir manqué, perte de balle, ballon mort…), pas de colonne d'issue séparée. */
  points: number;
  /** Cinq de l'équipe sur le terrain au moment de l'action. */
  onCourt: string[];
  /** Cinq adverse sur le terrain, si suivi — vide si non renseigné. */
  onCourtThem: string[];
}

