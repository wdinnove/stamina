import { describe, it, expect } from 'vitest';
import { chemistryFromMatches, layoutChemistry, type ChemistryLink } from './lineupChemistry';
import type { EventLineupRow } from './matchEvents';

const row = (players: string[], over: Partial<EventLineupRow>): EventLineupRow => ({
  players, seconds: 0, matches: 1, possessions: 0, oppPossessions: 0,
  pointsFor: 0, pointsAgainst: 0, plusMinus: 0,
  pointsPerPossession: null, oppPointsPerPossession: null, ...over,
});

describe('chemistryFromMatches', () => {
  it('donne au duo le même Net /100 que l\'onglet Lineups, et l\'apport par rapport à l\'équipe', () => {
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
    // Équipe : (22 − 20) / 20 poss. × 100 = +10.
    expect(ab.vsTeam).toBeCloseTo(30);
    expect(b.vsTeam).toBeCloseTo(30);
  });
});

describe('layoutChemistry', () => {
  const link = (a: string, b: string, vsTeam: number): ChemistryLink =>
    ({ a, b, seconds: 1200, possessions: 60, duoNet: vsTeam, vsTeam });

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

