import { describe, it, expect } from 'vitest';
import { shotValue, shotZone, zoneStats } from './shotChart';
import { boxscoreFromEvents, scoreFromEvents, plusMinusFromEvents, possessionsFromEvents, lineupStatsFromEvents, teamTotalsFromEvents } from './matchEvents';
import { HALF } from '../utils/diagram';
import type { MatchEvent, MatchLineupEvent } from './types';

let seq = 0;
const ev = (over: Partial<MatchEvent>): MatchEvent => ({
  matchId: 'm1', seq: ++seq, quarter: 1, gameTimeSeconds: 0,
  side: 'us', type: 'shot', onCourt: [], onCourtThem: [],
  ...over,
});

describe('shotValue', () => {
  it('compte un corner à 3 points même à moins de 6,75 m du panier', () => {
    // Sur la ligne de corner (x = 0,9), à hauteur du panier : 6,60 m seulement, mais c'est un 3.
    expect(Math.hypot(0.9 - HALF.basket.u, 1.575 - HALF.basket.v)).toBeCloseTo(6.6, 2);
    expect(shotValue(0.9, 1.575)).toBe(3);
    expect(shotValue(14.1, 1.575)).toBe(3);
  });

  it('compte à 2 points le liseré entre la ligne de corner et l\'arc', () => {
    expect(shotValue(1.2, 1.575)).toBe(2);
  });

  it('bascule à 3 points exactement sur l\'arc, dans l\'axe', () => {
    expect(shotValue(HALF.basket.u, HALF.basket.v + HALF.threeR - 0.05)).toBe(2);
    expect(shotValue(HALF.basket.u, HALF.basket.v + HALF.threeR + 0.05)).toBe(3);
  });

  it('raccorde le corner et l\'arc à la cote threeStopV', () => {
    // La jonction des deux tracés doit tomber pile sur le rayon de l'arc, sinon un tir d'aile
    // basse changerait de valeur selon un centimètre.
    const d = Math.hypot(HALF.threeInset - HALF.basket.u, HALF.threeStopV - HALF.basket.v);
    expect(d).toBeCloseTo(HALF.threeR, 2);
  });
});

describe('shotZone', () => {
  it('découpe le demi-terrain en 10 zones', () => {
    expect(shotZone(7.5, 1.575)).toBe('cercle');
    expect(shotZone(7.5, 4.0)).toBe('raquette');
    expect(shotZone(7.5, 7.0)).toBe('mid_axe');
    expect(shotZone(2.0, 3.0)).toBe('mid_gauche');
    expect(shotZone(13.0, 3.0)).toBe('mid_droite');
    expect(shotZone(0.5, 2.0)).toBe('corner_gauche');
    expect(shotZone(14.5, 2.0)).toBe('corner_droite');
    expect(shotZone(2.0, 6.0)).toBe('aile_gauche');
    expect(shotZone(13.0, 6.0)).toBe('aile_droite');
    expect(shotZone(7.5, 9.0)).toBe('arc_axe');
  });
});

describe('zoneStats', () => {
  it('ignore les tirs sans position mais garde les 10 zones', () => {
    const rows = zoneStats([
      ev({ x: 7.5, y: 1.6, made: true }),
      ev({ x: 7.5, y: 1.6, made: false }),
      ev({ made: true, value: 3 }),            // tir rapide, sans position
    ], 'us');

    expect(rows).toHaveLength(10);
    const cercle = rows.find(r => r.zone === 'cercle')!;
    expect(cercle.attempts).toBe(2);
    expect(cercle.made).toBe(1);
    expect(cercle.fgPct).toBe(50);
    expect(cercle.thin).toBe(true);
    expect(rows.find(r => r.zone === 'arc_axe')!.attempts).toBe(0);
  });

  it('compte un 3 points pour 1,5 tir réussi dans l\'eFG%', () => {
    const rows = zoneStats([
      ev({ x: 7.5, y: 9.0, made: true }),
      ev({ x: 7.5, y: 9.0, made: false }),
    ], 'us');
    const arc = rows.find(r => r.zone === 'arc_axe')!;
    expect(arc.fgPct).toBe(50);
    expect(arc.efgPct).toBe(75);
  });
});

describe('scoreFromEvents', () => {
  it('dérive le score des deux camps, lancers francs compris', () => {
    const score = scoreFromEvents([
      ev({ x: 7.5, y: 9.0, made: true }),               // +3 nous
      ev({ x: 7.5, y: 2.0, made: true }),               // +2 nous
      ev({ type: 'ft', made: true }),                   // +1 nous
      ev({ type: 'ft', made: false }),
      ev({ side: 'them', x: 7.5, y: 2.0, made: true }), // +2 eux
    ]);
    expect(score).toEqual({ us: 6, them: 2 });
  });
});

describe('plusMinusFromEvents', () => {
  it('crédite chaque point aux joueuses présentes au moment de l\'action', () => {
    const pm = plusMinusFromEvents([
      ev({ x: 7.5, y: 9.0, made: true, onCourt: ['p1', 'p2'] }),
      ev({ side: 'them', x: 7.5, y: 2.0, made: true, onCourt: ['p2', 'p3'] }),
    ]);
    expect(pm.get('p1')).toBe(3);
    expect(pm.get('p2')).toBe(1);   // +3 puis -2
    expect(pm.get('p3')).toBe(-2);
  });
});

describe('boxscoreFromEvents', () => {
  const lineups: MatchLineupEvent[] = [
    { matchId: 'm1', seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0, playersIn: ['p1', 'p2'], playersOut: [], onCourt: ['p1', 'p2'] },
  ];

  it('ventile les événements dans les colonnes de match_stats', () => {
    const events = [
      ev({ playerId: 'p1', x: 7.5, y: 9.0, made: true,  onCourt: ['p1', 'p2'] }), // 3 pts
      ev({ playerId: 'p1', x: 7.5, y: 3.0, made: false, onCourt: ['p1', 'p2'] }), // 2 pts raté
      ev({ playerId: 'p1', type: 'reb_def', onCourt: ['p1', 'p2'] }),
      ev({ playerId: 'p1', type: 'tov',     onCourt: ['p1', 'p2'] }),
    ];
    const [p1] = boxscoreFromEvents(events, lineups, 600, 1, 600);

    expect(p1.playerId).toBe('p1');
    expect(p1).toMatchObject({ fg3a: 1, fg3m: 1, fg2a: 1, fg2m: 0, rd: 1, bp: 1, pts: 3 });
    expect(p1.starter).toBe(true);
    expect(p1.min).toBe(10);
    expect(p1.plusMinus).toBe(3);
    // (3 pts + 1 rebond) − (1 tir raté + 1 perte) = 2
    expect(p1.eval).toBe(2);
  });

  it('produit le boxscore adverse à partir des joueuses nommées, en ignorant l\'agrégé', () => {
    const events = [
      ev({ side: 'them', opponentPlayerId: 'o1', x: 7.5, y: 9.0, made: true }),
      ev({ side: 'them', opponentPlayerId: 'o1', type: 'foul' }),
      ev({ side: 'them', x: 7.5, y: 2.0, made: true, value: 2 }),  // panier encaissé sans auteur
    ];
    const rows = boxscoreFromEvents(events, lineups, 600, 1, 600, 'them');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 'o1', fg3a: 1, fg3m: 1, fpr: 1, pts: 3 });
    // Le panier anonyme compte quand même au score.
    expect(scoreFromEvents(events).them).toBe(5);
  });

  it('garde une joueuse entrée sans aucune action — ses minutes comptent', () => {
    const rows = boxscoreFromEvents([], lineups, 600, 1, 300);
    expect(rows.map(r => r.playerId).sort()).toEqual(['p1', 'p2']);
    expect(rows[0].min).toBe(5);
    expect(rows[0].pts).toBe(0);
  });
});

describe('possessionsFromEvents', () => {
  it('applique la formule du rythme (rebonds offensifs retirés)', () => {
    const events = [
      ev({ x: 7.5, y: 3.0, made: false }),
      ev({ type: 'reb_off' }),
      ev({ x: 7.5, y: 3.0, made: true }),
      ev({ type: 'tov' }),
      ev({ type: 'ft', made: true }),
    ];
    // 2 tirs − 1 RO + 1 perte + 0,44 × 1 LF
    expect(possessionsFromEvents(events, 'us')).toBeCloseTo(2.44, 2);
  });
});

describe('lineupStatsFromEvents', () => {
  const lineups: MatchLineupEvent[] = [
    { matchId: 'm1', seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0,   playersIn: ['p1', 'p2'], playersOut: [], onCourt: ['p1', 'p2'] },
    { matchId: 'm1', seq: 2, side: 'us', quarter: 1, gameTimeSeconds: 120, playersIn: ['p3'], playersOut: ['p2'], onCourt: ['p1', 'p3'] },
  ];

  it('mesure le temps, les points et la rentabilité de chaque cinq', () => {
    const rows = lineupStatsFromEvents([
      ev({ x: 7.5, y: 9.0, made: true,  onCourt: ['p1', 'p2'] }),                 // +3 pour le 1er cinq
      ev({ side: 'them', x: 7.5, y: 2.0, made: true, onCourt: ['p1', 'p2'] }),    // −2 pour le 1er cinq
      ev({ x: 7.5, y: 2.0, made: true,  onCourt: ['p1', 'p3'] }),                 // +2 pour le 2e cinq
    ], lineups, 'us', 600, 1, 300);

    expect(rows).toHaveLength(2);
    const first = rows.find(r => r.players.join(',') === 'p1,p2')!;
    expect(first.seconds).toBe(120);
    expect(first).toMatchObject({ pointsFor: 3, pointsAgainst: 2, plusMinus: 1, possessions: 1, oppPossessions: 1 });
    expect(first.pointsPerPossession).toBe(3);

    const second = rows.find(r => r.players.join(',') === 'p1,p3')!;
    expect(second.seconds).toBe(180);
    expect(second.plusMinus).toBe(2);
  });

  it('écarte les actions sans cinq relevé', () => {
    const rows = lineupStatsFromEvents([ev({ x: 7.5, y: 2.0, made: true })], [], 'us', 600, 1, 300);
    expect(rows).toHaveLength(0);
  });
});

describe('teamTotalsFromEvents', () => {
  it('compte aussi les actions sans auteur, contrairement au boxscore', () => {
    const events = [
      ev({ side: 'them', opponentPlayerId: 'o1', x: 7.5, y: 9.0, made: true }),
      ev({ side: 'them', x: 7.5, y: 2.0, made: true, value: 2 }),   // anonyme
      ev({ side: 'them', type: 'tov' }),                             // anonyme
    ];
    const totals = teamTotalsFromEvents(events, 'them');

    expect(totals).toMatchObject({ fg3a: 1, fg3m: 1, fg2a: 1, fg2m: 1, bp: 1 });
    // 2 tirs + 1 perte = 3 possessions
    expect(totals.possessions).toBe(3);

    // Le boxscore individuel, lui, n'en retient que la ligne attribuée.
    const rows = boxscoreFromEvents(events, [], 600, 1, 600, 'them');
    expect(rows).toHaveLength(1);
    expect(rows[0].fg2a).toBe(0);
  });
});
