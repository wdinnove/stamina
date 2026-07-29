import type { MatchStat, TeamMatchStat } from './types';

/** Champs de MatchStat réellement utilisés par calcPlayerAdvanced — permet de lui passer soit
 *  un match individuel, soit un agrégat de plusieurs matchs sommés (voir archetypes/statsAggregator.ts). */
export type PlayerAdvancedInput = Pick<MatchStat, 'fg2m' | 'fg2a' | 'fg3m' | 'fg3a' | 'fta' | 'bp' | 'pts' | 'pd' | 'ro' | 'rd' | 'min'>;
/** Idem pour TeamMatchStat. */
export type TeamAdvancedInput = Pick<TeamMatchStat, 'fg2m' | 'fg2a' | 'fg3m' | 'fg3a' | 'fta' | 'bp' | 'ro' | 'rd' | 'opp_ro' | 'opp_rd'>;

export interface PlayerAdvancedStats {
  usagePct: number | null;    // % Usage
  offRating: number | null;   // Offensive Rating (pts × 100 / indPoss)
  efgPct: number | null;      // eFG% = (fg2m + 1.5×fg3m) / fga
  ftRate: number | null;      // FT Rate = fta / fga
  bpPerPoss: number | null;   // BP/poss = bp / indPoss (ratio décimal)
  astPct: number | null;      // %PD = pd / (teamFgm - fgm)
  tovPct: number | null;      // %BP = bp / indPoss × 100
  trebPct: number | null;     // %TREB = (ro+rd) / (team+opp rebonds)
  drebPct: number | null;     // %DREB = rd / (team_rd + opp_ro)
  orebPct: number | null;     // %OREB = ro / (team_ro + opp_rd)
  ptsProd: number | null;     // Points générés = pts + pd × (team_pts_fg / teamFgm)
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Bornes de plausibilité pour Σmin de tout l'effectif sur un match complet (5 joueurs,
 *  ~40 min réglementaires) — au-delà de cette fourchette par match couvert, la donnée est jugée
 *  non fiable (saisie "collectif" sans lignes individuelles, colonne MIN non reconnue à
 *  l'import...) : mieux vaut retomber sur l'ancien calcul non corrigé que de propager une
 *  correction erronée. Partagé entre tous les appelants de `calcPlayerAdvanced` qui décident de
 *  la fiabilité de leur `teamMinutes` avant de l'y passer. */
export function isTeamMinutesPlausible(teamMinutes: number, matchesCovered: number): boolean {
  if (matchesCovered <= 0) return false;
  return teamMinutes >= matchesCovered * 150 && teamMinutes <= matchesCovered * 300;
}

/** En dessous de ce nombre de minutes jouées par le joueur lui-même, la correction usage%
 *  n'est pas appliquée : `indPoss` y est un tout petit compte entier (0, 1, 2 possessions...),
 *  et le facteur d'amplification `(teamMinutes/5) / minutes joueur` peut alors pousser le
 *  usage% corrigé bien au-delà de 100 % pour une poignée de possessions en fin de match — un
 *  artefact statistique, pas un vrai usage exceptionnel. */
export const MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION = 5;

/**
 * Variante de `calcPlayerAdvanced` pour un affichage par match unique : applique automatiquement
 * la correction usage% si `team.teamMinutes` (Σ minutes de tout l'effectif sur CE match — voir
 * `usePerformanceData.ts`/`MatchDetailPage.tsx`) est plausible, sinon retombe sur l'ancien calcul.
 * À utiliser à la place de `calcPlayerAdvanced` partout où un `TeamMatchStat` potentiellement
 * enrichi de `teamMinutes` est déjà disponible pour un seul match.
 */
export function calcPlayerAdvancedForMatch(
  s: PlayerAdvancedInput,
  team?: (TeamAdvancedInput & { teamMinutes?: number }) | null,
): PlayerAdvancedStats {
  const teamMinutes = team?.teamMinutes;
  return calcPlayerAdvanced(s, team, teamMinutes !== undefined && isTeamMinutesPlausible(teamMinutes, 1) ? teamMinutes : undefined);
}

/**
 * @param teamMinutes Total des minutes jouées par TOUTE l'équipe sur la même période/les mêmes
 *   matchs que `s`/`team` (Σ `min` de tous les `MatchStat` du roster — 5 joueurs sur le terrain
 *   en permanence ⇒ Σmin ≈ 5 × durée du/des match(s)). Sert à corriger `usagePct` par la part de
 *   minutes réellement jouées par le joueur (sinon un remplaçant à fort usage sur peu de minutes
 *   ressort avec un usage% artificiellement bas). **L'appelant est responsable de la fiabilité**
 *   de cette valeur (saisie "collectif" sans lignes individuelles, colonne MIN non reconnue à
 *   l'import, etc. peuvent la rendre absente ou incohérente) : si omise, ou si `s.min` est en
 *   dessous de `MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION`, on retombe silencieusement sur
 *   l'ancien calcul non corrigé (jamais pire, jamais bloquant).
 */
export function calcPlayerAdvanced(s: PlayerAdvancedInput, team?: TeamAdvancedInput | null, teamMinutes?: number): PlayerAdvancedStats {
  const fga     = s.fg2a + s.fg3a;
  const fgm     = s.fg2m + s.fg3m;
  const indPoss = fga + 0.44 * s.fta + s.bp;

  const efgPct   = fga > 0      ? r1((fgm + 0.5 * s.fg3m) / fga * 100) : null;
  const ftRate   = fga > 0      ? r2(s.fta / fga)                        : null;
  const bpPerPoss = indPoss > 0 ? r2(s.bp / indPoss)                    : null;
  const offRating = indPoss > 0 ? r1(s.pts * 100 / indPoss)             : null;
  const tovPct    = indPoss > 0 ? r1(s.bp / indPoss * 100)              : null;

  if (!team) {
    return { usagePct: null, offRating, efgPct, ftRate, bpPerPoss, astPct: null, tovPct, trebPct: null, drebPct: null, orebPct: null, ptsProd: null };
  }

  const teamFga  = team.fg2a + team.fg3a;
  const teamFgm  = team.fg2m + team.fg3m;
  const teamPoss = teamFga + 0.44 * team.fta + team.bp;

  const usagePct = teamPoss > 0
    ? (teamMinutes && teamMinutes > 0 && s.min >= MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION
        ? r1((indPoss * (teamMinutes / 5)) / (s.min * teamPoss) * 100)
        : r1(indPoss / teamPoss * 100))
    : null;
  const astPct   = (teamFgm - fgm) > 0   ? r1(s.pd / (teamFgm - fgm) * 100)                     : null;
  const trebPct  = (team.ro + team.rd + team.opp_ro + team.opp_rd) > 0
    ? r1((s.ro + s.rd) / (team.ro + team.rd + team.opp_ro + team.opp_rd) * 100) : null;
  const drebPct  = (team.rd + team.opp_ro) > 0 ? r1(s.rd / (team.rd + team.opp_ro) * 100) : null;
  const orebPct  = (team.ro + team.opp_rd) > 0 ? r1(s.ro / (team.ro + team.opp_rd) * 100) : null;

  // Points générés = pts + pd × (fg2m×2 + fg3m×3) / teamFgm
  const teamPtsFg = team.fg2m * 2 + team.fg3m * 3;
  const ptsProd   = teamFgm > 0 ? r1(s.pts + s.pd * teamPtsFg / teamFgm) : null;

  return { usagePct, offRating, efgPct, ftRate, bpPerPoss, astPct, tovPct, trebPct, drebPct, orebPct, ptsProd };
}
