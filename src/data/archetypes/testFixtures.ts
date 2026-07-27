import type { MatchStat, TeamMatchStat } from '../types';
import type { RawPlayerStats } from './types';

let idCounter = 0;

/** Fixture minimale de MatchStat pour les tests — `pts` recalculé comme le ferait la colonne
 *  GENERATED de la DB (fg2m*2 + fg3m*3 + ftm). */
export function makeMatchStat(overrides: Partial<MatchStat> & { playerId: string }): MatchStat {
  idCounter += 1;
  const base: MatchStat = {
    id: `stat-${idCounter}`,
    matchId: `match-${idCounter}`,
    playerId: overrides.playerId,
    date: '2026-01-01',
    opponent: 'Adversaire',
    homeAway: 'home',
    competition: 'NF2',
    result: 'win',
    scoreUs: 70,
    scoreThem: 60,
    starter: true,
    min: 20,
    pts: 0,
    fg2m: 0, fg2a: 0,
    fg3m: 0, fg3a: 0,
    ftm: 0, fta: 0,
    ro: 0, rd: 0,
    pd: 0, ct: 0, intercepts: 0, bp: 0,
    fte: 0, fpr: 0,
    eval: null,
    plusMinus: null,
  };
  const merged = { ...base, ...overrides };
  merged.pts = merged.fg2m * 2 + merged.fg3m * 3 + merged.ftm;
  return merged;
}

export function makeTeamMatchStat(overrides: Partial<TeamMatchStat> & { matchId: string }): TeamMatchStat {
  const base: TeamMatchStat = {
    id: `team-${overrides.matchId}`,
    matchId: overrides.matchId,
    date: '2026-01-01',
    opponent: 'Adversaire',
    homeAway: 'home',
    result: 'win',
    scoreUs: 70,
    scoreThem: 60,
    fg2m: 20, fg2a: 40,
    fg3m: 5, fg3a: 15,
    ftm: 10, fta: 14,
    ro: 10, rd: 25, rt: 35,
    pd: 15, ct: 3, intercepts: 6, bp: 12, fte: 10, fpr: 15,
    possessions: 65,
    offRating: 100, defRating: 95,
    efgPct: 50, ftRate: 0.35, toPct: 15, orebPct: 30, drebPct: 70,
    opp_fg2m: 18, opp_fg2a: 42,
    opp_fg3m: 6, opp_fg3a: 18,
    opp_ftm: 8, opp_fta: 12,
    opp_ro: 8, opp_rd: 22, opp_rt: 30,
    opp_pd: 12, opp_ct: 2, opp_intercepts: 5, opp_bp: 10, opp_fte: 15, opp_fpr: 10,
    opp_possessions: 63,
    opp_efgPct: 48, opp_toPct: 16, opp_orebPct: 28,
  };
  return { ...base, ...overrides };
}

export function makeRawPlayerStats(overrides: Partial<RawPlayerStats> & { playerId: string }): RawPlayerStats {
  const base: RawPlayerStats = {
    playerId: overrides.playerId,
    periodLabel: 'test-season',
    matches: 10,
    minutesTotal: 200,
    totals: {
      pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
      startsCount: 0, plusMinus: 0, plusMinusCount: 0,
    },
    advancedAgg: {
      usagePct: null, offRating: null, efgPct: null, ftRate: null, bpPerPoss: null,
      astPct: null, tovPct: null, trebPct: null, drebPct: null, orebPct: null, ptsProd: null,
    },
  };
  return { ...base, ...overrides };
}
