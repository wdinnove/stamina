import { describe, it, expect } from 'vitest';
import { shotValue, shotZone, zoneStats } from './shotChart';
import { boxscoreFromEvents, scoreFromEvents, plusMinusFromEvents, possessionsFromEvents, lineupStatsFromEvents, teamTotalsFromEvents, evaluation, trackerHistory, editableTimeWindow, backwardsLineupChange, sortLineupRows, type EventLineupRow, type PlayerBoxscoreRow } from './matchEvents';
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
  it('crédite chaque point aux joueurs présents au moment de l\'action', () => {
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

  it('produit le boxscore adverse à partir des joueurs nommés, en ignorant l\'agrégé', () => {
    const events = [
      ev({ side: 'them', opponentPlayerId: 'o1', x: 7.5, y: 9.0, made: true }),
      ev({ side: 'them', opponentPlayerId: 'o1', type: 'foul' }),        // → fte, PAS fpr
      ev({ side: 'them', x: 7.5, y: 2.0, made: true, value: 2 }),  // panier encaissé sans auteur
    ];
    const rows = boxscoreFromEvents(events, lineups, 600, 1, 600, 'them');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ playerId: 'o1', fg3a: 1, fg3m: 1, fte: 1, fpr: 0, pts: 3 });
    // Le panier anonyme compte quand même au score.
    expect(scoreFromEvents(events).them).toBe(5);
  });

  it('garde un joueur entré sans aucune action — ses minutes comptent', () => {
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

  it('réunit un cinq revenu sur le terrain, au lieu d\'en faire deux lignes', () => {
    // Le cas le plus courant d'un vrai match : un cinq sort, un autre joue, le premier revient.
    // Deux lignes pour la même combinaison rendraient le tableau illisible et fausseraient toute
    // comparaison — c'est la combinaison qu'on lit, pas le passage.
    const aller: MatchLineupEvent[] = [
      { matchId: 'm1', seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0,   playersIn: ['p1', 'p2'], playersOut: [],      onCourt: ['p1', 'p2'] },
      { matchId: 'm1', seq: 2, side: 'us', quarter: 1, gameTimeSeconds: 100, playersIn: ['p3'],       playersOut: ['p2'],  onCourt: ['p1', 'p3'] },
      { matchId: 'm1', seq: 3, side: 'us', quarter: 1, gameTimeSeconds: 250, playersIn: ['p2'],       playersOut: ['p3'],  onCourt: ['p1', 'p2'] },
    ];
    const rows = lineupStatsFromEvents([], aller, 'us', 600, 1, 400);

    expect(rows).toHaveLength(2);
    const back = rows.find(r => r.players.join(',') === 'p1,p2')!;
    expect(back.seconds).toBe(250);   // 100 s au premier passage + 150 s au second
  });

  it('réunit un cinq dont les joueurs sont dans un autre ordre', () => {
    // Les instantanés sont construits dans l'ordre des entrées sur le terrain : le même cinq peut
    // parfaitement arriver sous deux ordres différents. La clé de regroupement est triée.
    const desordre: MatchLineupEvent[] = [
      { matchId: 'm1', seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0,   playersIn: [], playersOut: [], onCourt: ['p1', 'p2', 'p3'] },
      { matchId: 'm1', seq: 2, side: 'us', quarter: 1, gameTimeSeconds: 100, playersIn: [], playersOut: [], onCourt: ['p3', 'p1', 'p2'] },
    ];
    const rows = lineupStatsFromEvents([
      ev({ x: 7.5, y: 2.0, made: true, onCourt: ['p2', 'p3', 'p1'] }),
    ], desordre, 'us', 600, 1, 300);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ players: ['p1', 'p2', 'p3'], seconds: 300, pointsFor: 2 });
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

describe('evaluation', () => {
  const row = (over: Partial<PlayerBoxscoreRow>): PlayerBoxscoreRow => ({
    playerId: 'p1', starter: false, min: 0,
    fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
    pts: 0, eval: 0, plusMinus: 0, ...over,
  });

  // Lignes réelles d'un import eMarque : c'est cette confrontation qui a établi la formule et
  // révélé que `fte` et `fpr` étaient lues à l'envers partout.
  it('reproduit les évaluations de la feuille de marque', () => {
    expect(evaluation(row({
      pts: 11, fg2m: 3, fg2a: 7, fg3m: 0, fg3a: 1, ftm: 5, fta: 10,
      ro: 2, rd: 2, pd: 1, ct: 0, intercepts: 2, bp: 0, fte: 1, fpr: 5,
    }))).toBe(13);

    expect(evaluation(row({
      pts: 6, fg2m: 2, fg2a: 5, ftm: 2, fta: 2,
      ro: 0, rd: 3, pd: 1, ct: 1, intercepts: 4, bp: 1, fte: 2, fpr: 2,
    }))).toBe(13);

    expect(evaluation(row({
      fg2a: 2, fg3a: 2, pd: 2, intercepts: 1, bp: 1, fte: 4, fpr: 0,
    }))).toBe(-2);
  });

  it("ne retranche pas les fautes commises — l'évaluation FFBB n'est pas l'index FIBA", () => {
    expect(evaluation(row({ pts: 10, fte: 5 }))).toBe(10);
  });

  it('crédite les fautes provoquées', () => {
    expect(evaluation(row({ pts: 10, fpr: 4 }))).toBe(14);
  });
});

describe('trackerHistory', () => {
  const lu = (over: Partial<MatchLineupEvent> & { seq: number }): MatchLineupEvent => ({
    matchId: 'm1', side: 'us', quarter: 1, gameTimeSeconds: 0,
    playersIn: [], playersOut: [], onCourt: [], ...over,
  });

  it('mêle les deux flux, le plus récent en tête', () => {
    const h = trackerHistory(
      [ev({ seq: 1, type: 'ast', quarter: 1, gameTimeSeconds: 30 }), ev({ seq: 2, type: 'ast', quarter: 2, gameTimeSeconds: 10 })],
      [lu({ seq: 1, gameTimeSeconds: 0 }), lu({ seq: 2, quarter: 1, gameTimeSeconds: 45 })],
    );
    expect(h.map(e => `${e.kind[0]}${e.quarter}:${e.gameTimeSeconds}`)).toEqual(['e2:10', 'l1:45', 'e1:30', 'l1:0']);
  });

  it('place le changement SOUS l\'action quand ils partagent l\'instant', () => {
    // Convention : le changement se fait sur ballon mort, le jeu reprend ensuite. Le plus récent
    // étant en tête, l'action se lit donc au-dessus.
    const h = trackerHistory([ev({ seq: 1, type: 'ast', gameTimeSeconds: 20 })], [lu({ seq: 1, gameTimeSeconds: 20 })]);
    expect(h.map(e => e.kind)).toEqual(['event', 'lineup']);
  });

  it('départage deux actions du même instant par leur rang', () => {
    const h = trackerHistory([ev({ seq: 1, type: 'ast', gameTimeSeconds: 20 }), ev({ seq: 2, type: 'stl', gameTimeSeconds: 20 })], []);
    expect(h.map(e => e.kind === 'event' ? e.event.seq : 0)).toEqual([2, 1]);
  });

  it('garde les deux bancs, sans confondre leurs rangs', () => {
    const h = trackerHistory([], [lu({ seq: 1, side: 'us', gameTimeSeconds: 10 }), lu({ seq: 1, side: 'them', gameTimeSeconds: 10 })]);
    expect(h).toHaveLength(2);
  });
});

describe('editableTimeWindow', () => {
  const ev = (seq: number, gameTimeSeconds: number, quarter = 1): MatchEvent => ({
    matchId: 'm1', seq, quarter, gameTimeSeconds, side: 'us', type: 'ast',
    playerId: 'p1', onCourt: [], onCourtThem: [],
  });
  const lu = (seq: number, gameTimeSeconds: number, side: 'us' | 'them' = 'us', quarter = 1): MatchLineupEvent => ({
    matchId: 'm1', seq, side, quarter, gameTimeSeconds,
    playersIn: [], playersOut: [], onCourt: [],
  });
  const forEvent  = (e: MatchEvent) => ({ kind: 'event' as const,  quarter: e.quarter, gameTimeSeconds: e.gameTimeSeconds, event: e });
  const forLineup = (l: MatchLineupEvent) => ({ kind: 'lineup' as const, quarter: l.quarter, gameTimeSeconds: l.gameTimeSeconds, lineup: l });

  it('borne une action aux deux changements qui l\'encadrent', () => {
    const a = ev(2, 250);
    expect(editableTimeWindow(forEvent(a), [a], [lu(1, 120), lu(2, 400)], 600)).toEqual({ min: 120, max: 400 });
  });

  it('compte AUSSI les changements du banc adverse', () => {
    // L'action porte les DEUX cinq : franchir un changement adverse fausserait le second.
    const a = ev(1, 250);
    expect(editableTimeWindow(forEvent(a), [a], [lu(1, 120), lu(1, 300, 'them')], 600))
      .toEqual({ min: 120, max: 300 });
  });

  it('ignore les changements des autres quart-temps', () => {
    const a = ev(1, 250, 2);
    expect(editableTimeWindow(forEvent(a), [a], [lu(1, 400, 'us', 1), lu(2, 500, 'us', 3)], 600))
      .toEqual({ min: 0, max: 600 });
  });

  it('borne au quart-temps quand aucun changement n\'existe', () => {
    const a = ev(1, 250);
    expect(editableTimeWindow(forEvent(a), [a], [], 600)).toEqual({ min: 0, max: 600 });
    // Prolongation : cinq minutes, quelle que soit la durée réglementaire.
    const ot = ev(1, 60, 5);
    expect(editableTimeWindow(forEvent(ot), [ot], [], 600)).toEqual({ min: 0, max: 300 });
  });

  it('interdit à une action de repasser AVANT le changement du même instant', () => {
    // Chrono à l'arrêt : le changement et les actions qui suivent portent le même temps. L'action
    // a été pointée après, son cinq est celui d'après — elle ne peut pas remonter plus haut.
    const a = ev(1, 168);
    expect(editableTimeWindow(forEvent(a), [a], [lu(1, 168), lu(2, 300)], 600))
      .toEqual({ min: 168, max: 300 });
  });

  it('laisse un changement reculer jusqu\'à la dernière action qui le précède', () => {
    // Le cas réel : on a tapé 07:12 au lieu de 08:12, puis pointé six actions. Le changement peut
    // redescendre jusqu'à l'action précédente, mais pas franchir celles qui le suivent.
    const before = ev(1, 90);
    const after  = [ev(2, 168), ev(3, 168)];
    const l = lu(2, 168);
    expect(editableTimeWindow(forLineup(l), [before, ...after], [lu(1, 60), l], 600))
      .toEqual({ min: 90, max: 168 });
  });

  it('ne se borne pas à lui-même', () => {
    const l = lu(1, 200);
    expect(editableTimeWindow(forLineup(l), [], [l], 600)).toEqual({ min: 0, max: 600 });
  });
});

describe('backwardsLineupChange', () => {
  const lu = (seq: number, gameTimeSeconds: number, quarter = 1, side: 'us' | 'them' = 'us'): MatchLineupEvent => ({
    matchId: 'm1', seq, side, quarter, gameTimeSeconds,
    playersIn: [], playersOut: [], onCourt: [],
  });

  it('ne signale rien quand les changements avancent', () => {
    expect(backwardsLineupChange([lu(1, 0), lu(2, 300)], 600)).toBeNull();
  });

  it('ne signale rien au passage d\'un quart-temps à l\'autre', () => {
    // Le temps repart à zéro : c'est normal, et c'est justement le geste qu'on veut voir faire.
    expect(backwardsLineupChange([lu(1, 560, 1), lu(2, 20, 2)], 600)).toBeNull();
  });

  it('signale un changement daté avant le précédent', () => {
    // Le quart-temps n'a pas été avancé : l'intervalle devient négatif, il est borné à zéro, et le
    // cinq entre les deux est crédité de rien.
    expect(backwardsLineupChange([lu(1, 480), lu(2, 60)], 600)).toMatchObject({
      side: 'us',
      previous: { quarter: 1, gameTimeSeconds: 480 },
      current:  { quarter: 1, gameTimeSeconds: 60 },
    });
  });

  it('IGNORE le désordre entre actions : il ne coûte aucune durée', () => {
    // Recaler le chrono en arrière, ou corriger le temps d'une action, met les actions dans le
    // désordre sans conséquence. Les signaler affichait une alerte qui ne s'éteignait plus.
    expect(backwardsLineupChange([], 600)).toBeNull();
  });

  it('surveille les deux bancs', () => {
    expect(backwardsLineupChange([lu(1, 400, 1, 'them'), lu(2, 50, 1, 'them')], 600)?.side).toBe('them');
  });

  it('compare sur l\'axe absolu, prolongations comprises', () => {
    // Q4 à 01:00 écoulé puis une prolongation : 5 min, pas la durée réglementaire.
    expect(backwardsLineupChange([lu(1, 60, 4), lu(2, 30, 5)], 600)).toBeNull();
    // Retour en arrière d'un quart-temps entier : négatif, donc signalé.
    expect(backwardsLineupChange([lu(1, 60, 3), lu(2, 30, 2)], 600)).not.toBeNull();
  });
});


describe('sortLineupRows', () => {
  const row = (over: Partial<EventLineupRow>): EventLineupRow => ({
    players: ['p1'], seconds: 0, possessions: 0, oppPossessions: 0,
    pointsFor: 0, pointsAgainst: 0, plusMinus: 0,
    pointsPerPossession: null, oppPointsPerPossession: null, ...over,
  });
  const names: Record<string, string> = { p1: 'Zoé', p2: 'Alice', p3: 'Marc' };
  const nameOf = (id: string) => names[id] ?? id;

  it('trie sur les NOMS affichés, pas sur les identifiants', () => {
    const rows = sortLineupRows([row({ players: ['p1'] }), row({ players: ['p2'] })], 'players', 'asc', nameOf);
    expect(rows.map(r => r.players[0])).toEqual(['p2', 'p1']);   // Alice avant Zoé
  });

  it('inverse le sens', () => {
    const rows = sortLineupRows([row({ seconds: 10 }), row({ seconds: 300 })], 'seconds', 'desc', nameOf);
    expect(rows.map(r => r.seconds)).toEqual([300, 10]);
    expect(sortLineupRows(rows, 'seconds', 'asc', nameOf).map(r => r.seconds)).toEqual([10, 300]);
  });

  it('laisse les ratios sans possession EN BAS dans les deux sens', () => {
    // `null` = aucune possession mesurée. Le trier comme un zéro le ferait passer pour la pire
    // performance de la soirée, alors qu'il n'y a simplement rien à lire.
    const rows = [
      row({ players: ['p1'], pointsPerPossession: null }),
      row({ players: ['p2'], pointsPerPossession: 1.2 }),
      row({ players: ['p3'], pointsPerPossession: 0.4 }),
    ];
    expect(sortLineupRows(rows, 'pointsPerPossession', 'desc', nameOf).map(r => r.players[0]))
      .toEqual(['p2', 'p3', 'p1']);
    expect(sortLineupRows(rows, 'pointsPerPossession', 'asc', nameOf).map(r => r.players[0]))
      .toEqual(['p3', 'p2', 'p1']);
  });

  it('départage à égalité par le temps, le plus long d\'abord', () => {
    const rows = sortLineupRows([
      row({ players: ['p1'], plusMinus: 4, seconds: 60 }),
      row({ players: ['p2'], plusMinus: 4, seconds: 300 }),
    ], 'plusMinus', 'desc', nameOf);
    expect(rows.map(r => r.players[0])).toEqual(['p2', 'p1']);
  });

  it('ne touche pas au tableau reçu', () => {
    const rows = [row({ seconds: 10 }), row({ seconds: 300 })];
    sortLineupRows(rows, 'seconds', 'desc', nameOf);
    expect(rows.map(r => r.seconds)).toEqual([10, 300]);
  });
});
