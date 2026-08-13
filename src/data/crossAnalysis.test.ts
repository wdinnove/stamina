import { describe, it, expect } from 'vitest';
import { playerAttributeIndicators, teamIndicators, indicatorByKey, periodValueOf, type PlayerCrossData } from './crossAnalysis';
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

describe('documentation des indicateurs', () => {
  /**
   * Garde-fou : un indicateur sans explication apparaît quand même dans les sélecteurs et le
   * glossaire, sous forme d'une ligne vide. C'est ce test qui force à écrire la phrase en même
   * temps qu'on ajoute l'indicateur.
   */
  it('chaque indicateur porte une explication et un sens de lecture', () => {
    for (const def of teamIndicators()) {
      expect(def.explain, `${def.key} — explication manquante`).toBeTruthy();
      expect(['higher', 'lower', 'context'], `${def.key} — sens manquant`).toContain(def.sense);
    }
    for (const def of playerAttributeIndicators()) {
      expect(def.explain, `${def.key} — explication manquante`).toBeTruthy();
      expect(['higher', 'lower', 'context'], `${def.key} — sens manquant`).toContain(def.sense);
    }
  });

  it('explique ce que le chiffre signifie, pas seulement comment il se calcule', () => {
    // Une explication qui n'est qu'une formule ne rend pas service : la formule a son champ.
    for (const def of playerAttributeIndicators()) {
      expect(def.explain!.length, `${def.key} — explication trop courte`).toBeGreaterThan(25);
    }
  });

  it('donne une formule aux ratios avancés, où elle éclaire', () => {
    for (const key of ['adv_efgPct', 'adv_usagePct', 'adv_usagePctRaw', 'adv_tovPct', 'adv_astPct', 'adv_offRating']) {
      expect(indicatorByKey(key)!.formula, `${key} — formule manquante`).toBeTruthy();
    }
  });

  it('distingue %USG de %USG/min dans les explications', () => {
    const raw = indicatorByKey('adv_usagePctRaw')!.explain!;
    const perMin = indicatorByKey('adv_usagePct')!.explain!;
    expect(raw).toContain('temps de jeu');       // dit qu'il en dépend
    expect(perMin).toContain('minutes réellement jouées');
    expect(raw).not.toBe(perMin);
  });

  it('marque comme « contexte » ce qui n\'est ni bon ni mauvais', () => {
    for (const key of ['min', 'starter', 'homeAway', 'team_possessions', 'rpe', 'acwr', 'tsb']) {
      expect(indicatorByKey(key)!.sense, key).toBe('context');
    }
  });

  it('marque comme « plus bas = mieux » ce qui doit baisser', () => {
    for (const key of ['bp', 'fpr', 'adv_tovPct', 'team_defRating', 'team_ptsAgainst', 'team_opp_efgPct']) {
      expect(indicatorByKey(key)!.sense, key).toBe('lower');
    }
  });

  it('n\'inverse plus fautes commises et fautes provoquées', () => {
    // `fte` = fautes reçues, `fpr` = fautes commises (schema.sql, formulaire d'import).
    expect(indicatorByKey('fte')!.label).toBe('Fautes provoquées');
    expect(indicatorByKey('fpr')!.label).toBe('Fautes commises');
    expect(indicatorByKey('fte')!.sense).toBe('higher');
    expect(indicatorByKey('fpr')!.sense).toBe('lower');
  });
});
