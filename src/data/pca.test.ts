import { describe, it, expect } from 'vitest';
import { computeWinFactors, computePlayerImpact } from './pca';
import { pearsonPValue, SIGNIFICANCE_ALPHA } from '../utils/correlation';
import type { MatchStat, Player, TeamMatchStat } from './types';

const teamMatch = (date: string, result: 'win' | 'loss', o: Partial<TeamMatchStat> = {}): TeamMatchStat => ({
  id: `t-${date}`, matchId: `m-${date}`, date, opponent: 'X', homeAway: 'home', kind: 'official', result,
  scoreUs: 60, scoreThem: 60,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, rt: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  possessions: 0,
  offRating: null, defRating: null, efgPct: null, ftRate: null, toPct: null, orebPct: null, drebPct: null,
  opp_fg2m: 0, opp_fg2a: 0, opp_fg3m: 0, opp_fg3a: 0, opp_ftm: 0, opp_fta: 0,
  opp_ro: 0, opp_rd: 0, opp_rt: 0, opp_pd: 0, opp_ct: 0, opp_intercepts: 0, opp_bp: 0, opp_fte: 0, opp_fpr: 0,
  opp_possessions: null, opp_efgPct: null, opp_toPct: null, opp_orebPct: null,
  ...o,
});

const playerStat = (date: string, result: 'win' | 'loss', evalValue: number): MatchStat => ({
  id: `s-${date}`, matchId: `m-${date}`, playerId: 'p1', date, opponent: 'X',
  homeAway: 'home', competition: 'NF2', kind: 'official', result, scoreUs: 60, scoreThem: 60,
  starter: true, min: 30, pts: 0,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  eval: evalValue, plusMinus: null,
});

const PLAYER = { id: 'p1', firstName: 'A', lastName: 'B' } as Player;

describe('facteurs de victoire — significativité statistique', () => {
  /**
   * 4 matchs (le minimum du calcul), réussite à 3 points 20/30/40/50 % contre des résultats
   * alternés. r ≈ 0,45 : une corrélation d'apparence « Forte » selon les seuils d'ampleur, mais
   * sur 4 observations elle ne se distingue pas du hasard. Avant ce correctif, elle s'affichait
   * « Impact fort » sans réserve.
   */
  const rows = [
    teamMatch('2026-01-03', 'loss', { fg3m: 2, fg3a: 10 }),
    teamMatch('2026-01-10', 'win',  { fg3m: 3, fg3a: 10 }),
    teamMatch('2026-01-17', 'loss', { fg3m: 4, fg3a: 10 }),
    teamMatch('2026-01-24', 'win',  { fg3m: 5, fg3a: 10 }),
  ];

  it('marque non significatif un lien modéré sur 4 matchs', () => {
    const fg3 = computeWinFactors(rows).find(f => f.key === 'fg3Pct')!;
    expect(fg3.corr).toBeCloseTo(0.447, 2);
    expect(fg3.n).toBe(4);
    expect(fg3.p).toBeGreaterThan(SIGNIFICANCE_ALPHA);
    expect(fg3.significant).toBe(false);
  });

  it('la p-value dérive bien de r et n, et `significant` du seuil α', () => {
    for (const f of computeWinFactors(rows)) {
      expect(f.p, f.key).toBeCloseTo(pearsonPValue(f.corr, f.n), 6);
      expect(f.significant, f.key).toBe(f.p < SIGNIFICANCE_ALPHA);
    }
  });

  it('reconnaît significatif un lien net sur un échantillon suffisant', () => {
    // 10 matchs où toutes les victoires ont un meilleur 3 points que toutes les défaites.
    const clean = [
      ...[20, 22, 24, 26, 28].map((pct, i) => teamMatch(`2026-02-0${i + 1}`, 'loss', { fg3m: pct / 10, fg3a: 10 })),
      ...[40, 42, 44, 46, 48].map((pct, i) => teamMatch(`2026-03-0${i + 1}`, 'win',  { fg3m: pct / 10, fg3a: 10 })),
    ];
    const fg3 = computeWinFactors(clean).find(f => f.key === 'fg3Pct')!;
    expect(fg3.significant).toBe(true);
    expect(fg3.p).toBeLessThan(SIGNIFICANCE_ALPHA);
  });
});

describe('impact joueur — significativité statistique', () => {
  it('expose p et significant, cohérents avec r et n', () => {
    const stats = [
      playerStat('2026-01-03', 'loss', 4),
      playerStat('2026-01-10', 'win',  8),
      playerStat('2026-01-17', 'loss', 6),
      playerStat('2026-01-24', 'win',  10),
      playerStat('2026-01-31', 'loss', 5),
    ];
    const impact = computePlayerImpact([PLAYER], stats)[0];
    expect(impact.n).toBe(5);
    expect(impact.p).toBeCloseTo(pearsonPValue(impact.corr, impact.n), 6);
    expect(impact.significant).toBe(impact.p < SIGNIFICANCE_ALPHA);
  });
});
