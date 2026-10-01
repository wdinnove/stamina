import { describe, it, expect } from 'vitest';
import { chemistryFromMatches, layoutChemistry, pairSplit, pairVerdict, playerReport, type ChemistryLink } from './lineupChemistry';
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


describe('pairSplit / pairVerdict', () => {
  const five = (players: string[], seconds: number, pf: number, pa: number) =>
    row(players, { seconds, possessions: 20, oppPossessions: 20, pointsFor: pf, pointsAgainst: pa });

  const matches = [[
    five(['a', 'b', 'c', 'd', 'e'], 700, 26, 20),   // ensemble : +30
    five(['a', 'f', 'g', 'h', 'i'], 700, 22, 20),   // a sans b : +10
    five(['b', 'f', 'g', 'h', 'i'], 700, 19, 20),   // b sans a : −5
    five(['c', 'd', 'e', 'f', 'g'], 700, 30, 10),   // ni l'un ni l'autre : ignoré
  ]];

  it('sépare ensemble, A sans B et B sans A', () => {
    const s = pairSplit(matches, 'a', 'b');
    expect(s.together).toMatchObject({ seconds: 700 });
    expect(s.together.net).toBeCloseTo(30);
    expect(s.aWithout.net).toBeCloseTo(10);
    expect(s.bWithout.net).toBeCloseTo(-5);
  });

  it('conclut en une phrase, et refuse sans assez de minutes', () => {
    const s = pairSplit(matches, 'a', 'b');
    expect(pairVerdict(s, 'A', 'B', 600).kind).toBe('together');
    expect(pairVerdict(s, 'A', 'B', 800).kind).toBe('unsure');
    const apart = pairSplit([[five(['a', 'b', 'c', 'd', 'e'], 700, 16, 20), five(['a', 'f', 'g', 'h', 'i'], 700, 22, 20), five(['b', 'f', 'g', 'h', 'i'], 700, 21, 20)]], 'a', 'b');
    expect(pairVerdict(apart, 'A', 'B', 600).kind).toBe('apart');
  });
});

describe('playerReport', () => {
  const five = (players: string[], seconds: number, pf: number, pa: number) =>
    row(players, { seconds, possessions: 20, oppPossessions: 20, pointsFor: pf, pointsAgainst: pa });
  const matches = [[
    five(['a', 'b', 'c', 'd', 'e'], 700, 26, 20),
    five(['a', 'f', 'g', 'h', 'i'], 700, 22, 20),
    five(['b', 'f', 'g', 'h', 'i'], 700, 19, 20),
  ]];
  const nameOf = (id: string) => id.toUpperCase();

  it('écrit le niveau, le meilleur duo et les associations nettes', () => {
    const { nodes, links, teamNet } = chemistryFromMatches(matches);
    const text = playerReport(nodes.find(n => n.id === 'a')!, teamNet, links, matches, nameOf, 600).join(' ');
    expect(text).toContain('quand A est sur le terrain');
    expect(text).toContain('Meilleur duo : avec');
    expect(text).toContain('B — à associer');
  });

  it('ne conclut rien sans assez de minutes ensemble', () => {
    const { nodes, links, teamNet } = chemistryFromMatches(matches);
    const text = playerReport(nodes.find(n => n.id === 'a')!, teamNet, links, matches, nameOf, 3600).join(' ');
    expect(text).toContain('Pas encore assez de minutes');
  });
});
