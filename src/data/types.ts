// ─── Primitive types ──────────────────────────────────────────────────────────
export type OrgRole           = 'admin' | 'editor';
export type PlayerStatus      = 'active' | 'injured' | 'limited' | 'suspended' | 'unavailable';
export type BasketballPosition = 'Meneur' | 'Arrière' | 'Ailier' | 'Ailier Fort' | 'Pivot';
export type SessionType       = 'training' | 'match' | 'gym' | 'rest';
export type ActionStatus      = 'todo' | 'in_progress' | 'waiting' | 'done';
export type ActionPriority    = 'low' | 'normal' | 'high' | 'critical';
export type ActionCategory    =
  | 'medical' | 'physical' | 'mental' | 'tactical'
  | 'administrative' | 'interview' | 'video' | 'discussion';

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
  evalTOrange?: number;
  evalTBlue?:   number;
  evalTGreen?:  number;
  ortgTAmber?:  number;
  ortgTGreen?:  number;
  drtgTAmber?:  number;
  drtgTRed?:    number;
}

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
  resolvedDate?: string;
  rtpDate?: string;
  treatment?: string;
}

export interface Action {
  id: string;
  playerId: string;
  teamId?: string;
  title: string;
  description?: string;
  category: ActionCategory;
  priority: ActionPriority;
  dueDate: string;
  assignedTo: string;
  status: ActionStatus;
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
  offRating: number;
  defRating: number;
  efgPct: number;
  ftRate: number;
  toPct: number;
  orebPct: number;
  drebPct: number;
  opp_fg2m: number; opp_fg2a: number;
  opp_fg3m: number; opp_fg3a: number;
  opp_ftm: number;  opp_fta: number;
  opp_ro: number; opp_rd: number; opp_rt: number;
  opp_pd: number; opp_ct: number; opp_intercepts: number; opp_bp: number; opp_fte: number; opp_fpr: number;
  opp_possessions: number;
  opp_efgPct: number;
  opp_toPct: number;
  opp_orebPct: number;
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

export interface TrainingSession {
  id: string;
  teamId: string;
  seasonId: string;
  date: string;
  sessionType: SessionType | string;
  plannedDuration: number;
  notes?: string;
  partnerCount?: number;
  partnerNames?: string;
  createdAt?: string;
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

export interface Exercise {
  id: string;
  name: string;
  teamId?: string;
  description?: string;
  category?: string;
  documentUrl?: string;
  documentName?: string;
  videoUrl?: string;
  createdAt: string;
}

export interface ExerciseImage {
  id: string;
  exerciseId: string;
  url: string;
  position: number;
  createdAt: string;
}

export type BlockIntensity = 'basse' | 'moyenne' | 'haute' | 'très élevée';

export interface SessionBlock {
  id: string;
  sessionId: string;
  position: number;
  duration: number;
  category: string;
  intensity: BlockIntensity;
  label: string;
  loadUa: number;
  drillId: string | null;
  createdAt: string;
}

export interface TrainingAttendance {
  id: string;
  sessionId: string;
  playerId: string;
  status: 'present' | 'absent' | 'late';
  createdAt: string;
}

export interface TeamSessionRow {
  id: string;
  date: string;
  type: SessionType;
  duration: number;
  nbPlayers: number;
  avg: number;
  max: number;
  min: number;
  totalLoad: number;
}

export interface PlayerRank {
  playerId: string;
  name: string;
  nbSessions: number;
  avgRpe: number;
  maxRpe: number;
  totalLoad: number;
  rpe3w:     number | null;
  load3w:    number | null;
  weekLoads: number[];
}

/** Moyennes calculées d'une joueur sur la saison */
export interface PlayerSeasonAvg {
  gp: number;
  min: number;
  pts: number;
  fg2m: number; fg2a: number; fg2pct: number;
  fg3m: number; fg3a: number; fg3pct: number;
  ftm: number;  fta: number;  ftpct: number;
  ro: number; rd: number; rt: number;
  pd: number; ct: number; intercepts: number; bp: number;
  fte: number; fpr: number;
  eval: number;
  plusMinus: number;
}
