import { PCA } from 'ml-pca';
import { pearson, hasVariance } from '../utils/correlation';
import { playerNameFull } from '../utils/playerName';
import type { TeamMatchStat, MatchStat, Player } from './types';

// Ré-export : WinFactorsList et PlayerImpactList l'importent depuis ce module
export { impactLabel } from '../utils/correlation';

export interface PCAPoint { x: number; y: number; win: boolean; label: string }
export interface PCAVector { x: number; y: number; label: string }
export interface PCAResult { points: PCAPoint[]; vectors: PCAVector[]; varPct: [number, number] }
export interface WinFactor { label: string; corr: number; n: number }
export interface PlayerImpact { playerId: string; label: string; corr: number; n: number; avgEval: number }

const MIN_MATCHES = 4;
const PLAYER_MIN_MATCHES = 5;

/** Statistiques collectives par match — partagées avec le registre d'indicateurs de crossAnalysis.ts */
export const VARIABLES: { key: string; label: string; longLabel: string; get: (m: TeamMatchStat) => number | null }[] = [
  { key: 'fg2Pct',     label: '2%',        longLabel: 'Réussite aux tirs à 2 points',                  get: m => m.fg2a > 0 ? m.fg2m / m.fg2a * 100 : null },
  { key: 'fg3Pct',     label: '3%',        longLabel: 'Réussite aux tirs à 3 points',                  get: m => m.fg3a > 0 ? m.fg3m / m.fg3a * 100 : null },
  { key: 'ftPct',      label: 'LF%',       longLabel: 'Réussite aux lancers francs',                   get: m => m.fta  > 0 ? m.ftm  / m.fta  * 100 : null },
  { key: 'efgPct',     label: 'eFG%',      longLabel: 'Efficacité globale aux tirs (eFG%)',            get: m => m.efgPct },
  { key: 'ftRate',     label: 'FT Rate',   longLabel: 'Taux de lancers francs tentés',                 get: m => m.ftRate },
  { key: 'ro',         label: 'RO',        longLabel: 'Rebonds offensifs',                             get: m => m.ro },
  { key: 'rd',         label: 'RD',        longLabel: 'Rebonds défensifs',                             get: m => m.rd },
  { key: 'toPct',      label: '%BP',       longLabel: 'Taux de ballons perdus',                        get: m => m.toPct },
  { key: 'orebPct',    label: '%OREB',     longLabel: '% de rebonds offensifs captés',                 get: m => m.orebPct },
  { key: 'drebPct',    label: '%DREB',     longLabel: '% de rebonds défensifs captés',                 get: m => m.drebPct },
  { key: 'pd',         label: 'Pd',        longLabel: 'Passes décisives',                               get: m => m.pd },
  { key: 'ct',         label: 'Ct',        longLabel: 'Contres',                                        get: m => m.ct },
  { key: 'intercepts', label: 'Int',       longLabel: 'Interceptions',                                  get: m => m.intercepts },
  { key: 'bp',         label: 'Bp',        longLabel: 'Ballons perdus',                                 get: m => m.bp },
  { key: 'fte',        label: 'Fte',       longLabel: 'Fautes commises',                                get: m => m.fte },
  { key: 'fpr',        label: 'Fp',        longLabel: 'Fautes provoquées',                              get: m => m.fpr },
  { key: 'offRating',  label: 'ORtg',      longLabel: 'Efficacité offensive (ORtg)',                    get: m => m.offRating },
  { key: 'defRating',  label: 'DRtg',      longLabel: 'Efficacité défensive (DRtg)',                    get: m => m.defRating },
  { key: 'opp_efgPct', label: 'Adv eFG%',  longLabel: 'Efficacité aux tirs subie (adversaire)',         get: m => m.opp_efgPct },
  { key: 'opp_toPct',  label: 'Adv %BP',   longLabel: 'Pertes de balle forcées à l’adversaire',    get: m => m.opp_toPct },
  { key: 'opp_orebPct',label: 'Adv %OREB', longLabel: 'Rebonds offensifs concédés à l’adversaire', get: m => m.opp_orebPct },
];

/** Corrélation de chaque statistique avec la victoire, exprimée en langage simple pour un coach. */
export function computeWinFactors(teamStats: TeamMatchStat[]): WinFactor[] {
  const rows = teamStats.filter(m => VARIABLES.some(v => v.get(m) !== null));
  if (rows.length < MIN_MATCHES) return [];
  const winVals = rows.map(m => m.result === 'win' ? 1 : 0);

  return VARIABLES
    .map(v => {
      const pairs = rows
        .map((m, i) => [v.get(m), winVals[i]] as const)
        .filter((p): p is [number, 0 | 1] => p[0] !== null);
      if (pairs.length < MIN_MATCHES) return null;
      const xs = pairs.map(p => p[0]);
      if (!hasVariance(xs)) return null;
      return { label: v.longLabel, corr: pearson(xs, pairs.map(p => p[1])), n: pairs.length };
    })
    .filter((f): f is WinFactor => f !== null)
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
}

/**
 * Pour chaque joueur, corrèle son évaluation match par match avec le résultat (victoire/défaite)
 * de ces matchs. Un lien positif = ses bons matchs coïncident avec des victoires de l'équipe.
 * Corrélation, pas causalité : à interpréter avec prudence sur de petits échantillons.
 */
export function computePlayerImpact(players: Player[], allStats: MatchStat[]): PlayerImpact[] {
  const byPlayer = new Map<string, MatchStat[]>();
  for (const s of allStats) {
    if (s.eval === null) continue;
    if (!byPlayer.has(s.playerId)) byPlayer.set(s.playerId, []);
    byPlayer.get(s.playerId)!.push(s);
  }

  return players
    .map(p => {
      const ss = byPlayer.get(p.id) ?? [];
      if (ss.length < PLAYER_MIN_MATCHES) return null;
      const xs = ss.map(s => s.eval as number);
      if (!hasVariance(xs)) return null;
      const ys = ss.map(s => s.result === 'win' ? 1 : 0);
      return {
        playerId: p.id, label: playerNameFull(p),
        corr: pearson(xs, ys), n: ss.length,
        avgEval: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10,
      };
    })
    .filter((f): f is PlayerImpact => f !== null)
    .sort((a, b) => b.corr - a.corr);
}

export function computeMatchPCA(teamStats: TeamMatchStat[]): PCAResult | null {
  const rows = teamStats.filter(m => VARIABLES.some(v => v.get(m) !== null));
  if (rows.length < MIN_MATCHES) return null;

  const vars = VARIABLES.filter(v => hasVariance(rows.map(m => v.get(m) ?? 0)));
  if (vars.length < 2) return null;

  const matrix = rows.map(m => vars.map(v => v.get(m) ?? 0));

  try {
    const pca = new PCA(matrix, { center: true, scale: true, ignoreZeroVariance: true });
    const scores = pca.predict(matrix, { nComponents: 2 }).to2DArray();
    const eigenvectors = pca.getEigenvectors();
    const [pc1, pc2] = pca.getExplainedVariance();

    const maxAbsScore = Math.max(1e-9, ...scores.flat().map(Math.abs));
    const rawVectors = vars.map((v, i) => ({ x: eigenvectors.get(i, 0), y: eigenvectors.get(i, 1), label: v.label }));
    const maxAbsLoading = Math.max(1e-9, ...rawVectors.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]));
    const scale = (maxAbsScore * 0.85) / maxAbsLoading;

    return {
      points: rows.map((m, i) => ({
        x: scores[i][0], y: scores[i][1], win: m.result === 'win',
        label: `${m.opponent} · ${m.date}`,
      })),
      vectors: rawVectors.map(v => ({ x: v.x * scale, y: v.y * scale, label: v.label })),
      varPct: [Math.round(pc1 * 1000) / 10, Math.round(pc2 * 1000) / 10],
    };
  } catch {
    return null;
  }
}
