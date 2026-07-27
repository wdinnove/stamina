import type { MatchStat, TeamMatchStat } from '../types';
import { calcPlayerAdvanced } from '../playerAdvanced';
import type { RawPlayerStats } from './types';

const ZERO_TOTALS = {
  pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  startsCount: 0, plusMinus: 0, plusMinusCount: 0,
};

const ZERO_TEAM_TOTALS = {
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, fta: 0, bp: 0, ro: 0, rd: 0, opp_ro: 0, opp_rd: 0,
};

/**
 * Agrège les MatchStat d'un effectif complet, groupés par joueur, sur une période donnée.
 *
 * Point critique : les stats avancées (usage%, AST%, %REB...) sont recalculées en sommant
 * d'abord tous les composants bruts sur la période (numérateur ET dénominateur, y compris
 * côté équipe), puis en appliquant `calcPlayerAdvanced` une seule fois sur ces sommes —
 * jamais en moyennant les ratios déjà calculés match par match, ce qui ferait peser un match
 * de 2 minutes en garbage time autant qu'un match de 35 minutes en tant que titulaire.
 */
export function aggregateRawStats(
  matchStats: MatchStat[],
  teamStatsByMatchId: Map<string, TeamMatchStat>,
  periodLabel: string,
): RawPlayerStats[] {
  const byPlayer = new Map<string, MatchStat[]>();
  for (const stat of matchStats) {
    if (!byPlayer.has(stat.playerId)) byPlayer.set(stat.playerId, []);
    byPlayer.get(stat.playerId)!.push(stat);
  }
  return [...byPlayer.entries()].map(([playerId, stats]) =>
    aggregateOnePlayer(playerId, stats, teamStatsByMatchId, periodLabel));
}

function aggregateOnePlayer(
  playerId: string,
  stats: MatchStat[],
  teamStatsByMatchId: Map<string, TeamMatchStat>,
  periodLabel: string,
): RawPlayerStats {
  const totals = stats.reduce((acc, s) => ({
    pts: acc.pts + s.pts,
    fg2m: acc.fg2m + s.fg2m, fg2a: acc.fg2a + s.fg2a,
    fg3m: acc.fg3m + s.fg3m, fg3a: acc.fg3a + s.fg3a,
    ftm: acc.ftm + s.ftm, fta: acc.fta + s.fta,
    ro: acc.ro + s.ro, rd: acc.rd + s.rd,
    pd: acc.pd + s.pd, ct: acc.ct + s.ct,
    intercepts: acc.intercepts + s.intercepts, bp: acc.bp + s.bp,
    fte: acc.fte + s.fte, fpr: acc.fpr + s.fpr,
    startsCount: acc.startsCount + (s.starter ? 1 : 0),
    plusMinus: acc.plusMinus + (s.plusMinus ?? 0),
    plusMinusCount: acc.plusMinusCount + (s.plusMinus != null ? 1 : 0),
  }), { ...ZERO_TOTALS });

  const minutesTotal = stats.reduce((sum, s) => sum + s.min, 0);

  let teamTotals = { ...ZERO_TEAM_TOTALS };
  let hasTeamData = false;
  for (const s of stats) {
    const team = s.matchId ? teamStatsByMatchId.get(s.matchId) : undefined;
    if (!team) continue;
    hasTeamData = true;
    teamTotals = {
      fg2m: teamTotals.fg2m + team.fg2m, fg2a: teamTotals.fg2a + team.fg2a,
      fg3m: teamTotals.fg3m + team.fg3m, fg3a: teamTotals.fg3a + team.fg3a,
      fta: teamTotals.fta + team.fta, bp: teamTotals.bp + team.bp,
      ro: teamTotals.ro + team.ro, rd: teamTotals.rd + team.rd,
      opp_ro: teamTotals.opp_ro + team.opp_ro, opp_rd: teamTotals.opp_rd + team.opp_rd,
    };
  }

  const advancedAgg = calcPlayerAdvanced(totals, hasTeamData ? teamTotals : null);

  const per36 = minutesTotal > 0 ? {
    pts: (totals.pts * 36) / minutesTotal,
    ro: (totals.ro * 36) / minutesTotal,
    rd: (totals.rd * 36) / minutesTotal,
    pd: (totals.pd * 36) / minutesTotal,
    ct: (totals.ct * 36) / minutesTotal,
    intercepts: (totals.intercepts * 36) / minutesTotal,
    bp: (totals.bp * 36) / minutesTotal,
    fte: (totals.fte * 36) / minutesTotal,
    fpr: (totals.fpr * 36) / minutesTotal,
  } : null;

  return { playerId, periodLabel, matches: stats.length, minutesTotal, totals, per36, advancedAgg };
}
