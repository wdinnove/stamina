import { describe, it, expect } from 'vitest';
import { chemistryFromMatches, layoutChemistry, shrink, type ChemistryLink } from './lineupChemistry';
import type { EventLineupRow } from './matchEvents';

const row = (players: string[], over: Partial<EventLineupRow>): EventLineupRow => ({
  players, seconds: 0, matches: 1, possessions: 0, oppPossessions: 0,
  pointsFor: 0, pointsAgainst: 0, plusMinus: 0,
  pointsPerPossession: null, oppPointsPerPossession: null, ...over,
});

describe('chemistryFromMatches', () => {
  it('mesure la synergie comme l\'écart au duo attendu', () => {
    // a+b ensemble : +40/100 ; a sans b : −20/100.
    const { nodes, links } = chemistryFromMatches([[
      row(['a', 'b', 'c', 'd', 'e'], { seconds: 300, possessions: 10, oppPossessions: 10, pointsFor: 14, pointsAgainst: 10, pointsPerPossession: 1.4, oppPointsPerPossession: 1.0 }),
      row(['a', 'f', 'g', 'h', 'i'], { seconds: 300, possessions: 10, oppPossessions: 10, pointsFor: 8,  pointsAgainst: 10, pointsPerPossession: 0.8, oppPointsPerPossession: 1.0 }),
    ]]);
    const a = nodes.find(n => n.id === 'a')!;
    const b = nodes.find(n => n.id === 'b')!;
    expect(a.net).toBeCloseTo(10);   // (22 − 20) / 20 poss. × 100
    expect(b.net).toBeCloseTo(40);
    const ab = links.find(l => l.a === 'a' && l.b === 'b')!;
    expect(ab.duoNet).toBeCloseTo(40);
    expect(ab.expected).toBeCloseTo(25);
    expect(ab.rawSynergy).toBeCloseTo(15);
    // 10 possessions ensemble : ramenée vers 0, 15 × 10 / (10 + 30).
    expect(ab.synergy).toBeCloseTo(3.75);
    // Équipe : (22 − 20) / 20 poss. × 100 = +10 ; b est 30 au-dessus, sur 10 possessions.
    expect(b.vsTeam).toBeCloseTo(7.5);
  });
});

describe('layoutChemistry', () => {
  const link = (a: string, b: string, synergy: number): ChemistryLink =>
    ({ a, b, seconds: 1200, possessions: 60, duoNet: synergy, expected: 0, rawSynergy: synergy, synergy });

  it('rapproche un bon duo et éloigne un mauvais', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const pos = layoutChemistry(ids, [link('a', 'b', 25), link('a', 'c', -25), link('b', 'd', 0)], 600);
    const dist = (x: string, y: string) => Math.hypot(pos.get(x)!.x - pos.get(y)!.x, pos.get(x)!.y - pos.get(y)!.y);
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'c'));
  });

  it('est déterministe', () => {
    const ids = ['a', 'b', 'c'];
    const links = [link('a', 'b', 10), link('b', 'c', -10)];
    expect([...layoutChemistry(ids, links, 600)]).toEqual([...layoutChemistry(ids, links, 600)]);
  });
});

describe('shrink', () => {
  it('garde un gros échantillon, écrase un petit', () => {
    expect(shrink(25, 20)).toBeCloseTo(10);
    expect(shrink(25, 120)).toBeCloseTo(20);
    expect(shrink(null, 50)).toBeNull();
  });
});
