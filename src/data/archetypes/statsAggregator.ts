import type { MatchStat, TeamMatchStat } from '../types';
import { calcPlayerAdvancedForPeriod } from '../playerAdvanced';
import type { RawPlayerStats } from './types';

const ZERO_TOTALS = {
  pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  startsCount: 0, plusMinus: 0, plusMinusCount: 0,
};

/**
 * Agrège les MatchStat d'un effectif complet, groupés par joueur, sur une période donnée.
 *
 * Point critique : les stats avancées (usage%, AST%, %REB...) sont recalculées en sommant
 * d'abord tous les composants bruts sur la période (numérateur ET dénominateur, y compris
 * côté équipe), puis en appliquant `calcPlayerAdvanced` une seule fois sur ces sommes —
 * jamais en moyennant les ratios déjà calculés match par match, ce qui ferait peser un match
 * de 2 minutes en garbage time autant qu'un match de 35 minutes en tant que titulaire.
 *
 * Second point critique : les indicateurs qui dépendent d'un dénominateur équipe (usage%,
 * AST%, %REB, points produits) ne doivent sommer que les matchs où une ligne `team_match_stats`
 * correspondante existe — sinon un match dont les stats individuelles sont importées sans les
 * stats collectives associées gonflerait le numérateur (totals) sans son dénominateur (team),
 * biaisant ces indicateurs. Les indicateurs qui ne dépendent que du joueur (eFG%, FT Rate,
 * TOV%, ORtg) restent calculés sur tous les matchs, sans cette restriction.
 *
 * Troisième point : `usagePct` est corrigé par la part de minutes réellement jouées par le
 * joueur (voir `calcPlayerAdvanced`) quand la somme des minutes de tout l'effectif sur les
 * matchs couverts est plausible (`isTeamMinutesPlausible`) — sinon repli silencieux sur
 * l'ancien calcul, jamais pire qu'avant ce fix.
 */
export function aggregateRawStats(
  matchStats: MatchStat[],
  teamStatsByMatchId: Map<string, TeamMatchStat>,
  periodLabel: string,
): RawPlayerStats[] {
  const byPlayer = new Map<string, MatchStat[]>();
  // Minutes cumulées de TOUT l'effectif par match (5 joueurs sur le terrain en permanence ⇒
  // Σmin ≈ 5 × durée du match) — sert à corriger usagePct par la part de minutes jouées
  // (voir calcPlayerAdvanced). Calculé une fois ici car il faut le roster complet du match,
  // pas seulement les matchs d'un joueur donné.
  const teamMinutesByMatchId = new Map<string, number>();
  for (const stat of matchStats) {
    if (!stat.matchId) continue;
    teamMinutesByMatchId.set(stat.matchId, (teamMinutesByMatchId.get(stat.matchId) ?? 0) + stat.min);
  }
  for (const stat of matchStats) {
    if (!byPlayer.has(stat.playerId)) byPlayer.set(stat.playerId, []);
    byPlayer.get(stat.playerId)!.push(stat);
  }
  return [...byPlayer.entries()].map(([playerId, stats]) =>
    aggregateOnePlayer(playerId, stats, teamStatsByMatchId, teamMinutesByMatchId, periodLabel));
}

function aggregateOnePlayer(
  playerId: string,
  stats: MatchStat[],
  teamStatsByMatchId: Map<string, TeamMatchStat>,
  teamMinutesByMatchId: Map<string, number>,
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

  // Agrégation des ratios déléguée à `calcPlayerAdvancedForPeriod` (src/data/playerAdvanced.ts),
  // qui porte désormais cette logique pour toute l'app — y compris les tableaux de l'interface,
  // qui moyennaient jusqu'ici les ratios match par match. Elle applique les deux périmètres
  // décrits ci-dessus. Le résolveur de minutes est fourni ici : ce module reconstruit les Σ
  // minutes depuis le roster complet, il n'a pas de lignes collectives enrichies sous la main.
  const { stats: advancedAgg } = calcPlayerAdvancedForPeriod(
    stats,
    teamStatsByMatchId,
    matchId => teamMinutesByMatchId.get(matchId),
  );

  return { playerId, periodLabel, matches: stats.length, minutesTotal, totals, advancedAgg };
}
