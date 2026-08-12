import { describe, it, expect } from 'vitest';
import { indicatorByKey, periodValueOf, type PlayerCrossData } from './crossAnalysis';
import type { MatchStat } from './types';

const FROM = '2026-01-01';
const TO   = '2026-12-31';

const match = (date: string, o: Partial<MatchStat> = {}): MatchStat => ({
  id: `${date}-${o.pts ?? 0}`, playerId: 'p1', matchId: `m-${date}-${o.pts ?? 0}`, date,
  opponent: 'X', starter: true, min: 30, pts: 0,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  eval: null, plusMinus: null, homeAway: 'home', result: 'win',
  ...o,
} as MatchStat);

const player = (matchStats: MatchStat[]): PlayerCrossData => ({
  player: { id: 'p1', firstName: 'A', lastName: 'B' } as PlayerCrossData['player'],
  matchStats, rpe: [], allTimeRpe: [], wellness: [], medical: [], attendance: [],
});

describe('periodValueOf — volumes : moyenne sur les MATCHS, pas sur les dates', () => {
  it('compte deux matchs joués le même jour comme deux observations', () => {
    // Plateau : deux matchs le 10 janvier (10 pts et 20 pts), puis un match à 30 pts.
    const d = player([
      match('2026-01-10', { pts: 10 }),
      match('2026-01-10', { pts: 20 }),
      match('2026-01-17', { pts: 30 }),
    ]);
    const def = indicatorByKey('pts')!;

    // Moyenne sur les dates (ancien comportement) : (15 + 30) / 2 = 22,5
    // Moyenne sur les matchs (tableaux : somme/nb) : (10 + 20 + 30) / 3 = 20
    expect(periodValueOf(def, d, FROM, TO)).toBe(20);
  });

  it('coïncide avec la moyenne par date quand il y a un seul match par jour', () => {
    const d = player([
      match('2026-01-10', { pts: 10 }),
      match('2026-01-17', { pts: 20 }),
    ]);
    expect(periodValueOf(indicatorByKey('pts')!, d, FROM, TO)).toBe(15);
  });
});

describe('periodValueOf — % de tir : ratio de sommes', () => {
  it('ne moyenne pas les pourcentages match par match', () => {
    const d = player([
      match('2026-01-10', { fg3m: 1, fg3a: 1 }),   // 100 % sur un seul tir
      match('2026-01-17', { fg3m: 3, fg3a: 15 }),  // 20 %
    ]);
    // Moyenne des % : (100 + 20) / 2 = 60 %. Ratio des sommes : 4 / 16 = 25 %.
    expect(periodValueOf(indicatorByKey('fg3Pct')!, d, FROM, TO)).toBe(25);
  });

  it('s\'affiche en entier, comme dans les tableaux de statistiques', () => {
    expect(indicatorByKey('fg2Pct')!.decimals).toBe(0);
    expect(indicatorByKey('fg3Pct')!.decimals).toBe(0);
    expect(indicatorByKey('ftPct')!.decimals).toBe(0);
  });
});

describe('periodValueOf — tous les indicateurs de match ont une valeur de période', () => {
  it('aucun indicateur du domaine match ne retombe sur la moyenne de la série', () => {
    const matchDefs = ['pts', 'fg2Pct', 'fg3Pct', 'ftPct', 'ro', 'rd', 'pd', 'ct', 'bp', 'eval',
      'adv_usagePctRaw', 'adv_usagePct', 'adv_efgPct', 'adv_astPct', 'adv_tovPct',
      'adv_trebPct', 'adv_orebPct', 'adv_drebPct', 'adv_offRating', 'adv_ftRate', 'adv_ptsProd'];
    for (const key of matchDefs) {
      const def = indicatorByKey(key);
      expect(def, key).toBeDefined();
      expect(def!.periodValue, key).toBeDefined();
    }
  });
});
