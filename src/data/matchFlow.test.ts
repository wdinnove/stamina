import { describe, it, expect } from 'vitest';
import { scoreTimeline, detectRuns, quarterSplits, absoluteSeconds } from './matchFlow';
import type { MatchEvent } from './types';

/** Panier sans position : `value` fige la valeur, ce qui rend ces fixtures lisibles. */
const shot = (seq: number, side: 'us' | 'them', value: 2 | 3, quarter = 1, t = 0): MatchEvent => ({
  matchId: 'm1', seq, quarter, gameTimeSeconds: t, side,
  type: 'shot', made: true, value, onCourt: [], onCourtThem: [],
});
const miss = (seq: number, side: 'us' | 'them', quarter = 1, t = 0): MatchEvent => ({
  ...shot(seq, side, 2, quarter, t), made: false,
});

describe('absoluteSeconds', () => {
  it('met les quart-temps bout à bout sur un axe continu', () => {
    expect(absoluteSeconds(3, 120, 600)).toBe(1320);
  });
});

describe('scoreTimeline', () => {
  it('part de 0-0 et ne bouge qu\'aux paniers', () => {
    const pts = scoreTimeline([shot(1, 'us', 3, 1, 10), miss(2, 'us', 1, 20), shot(3, 'them', 2, 1, 30)], 600);
    expect(pts).toEqual([
      { seconds: 0,  quarter: 1, us: 0, them: 0, diff: 0 },
      { seconds: 10, quarter: 1, us: 3, them: 0, diff: 3 },
      { seconds: 30, quarter: 1, us: 3, them: 2, diff: 1 },
    ]);
  });

  it('reste sur un axe continu au changement de quart-temps', () => {
    const pts = scoreTimeline([shot(1, 'us', 2, 2, 60)], 600);
    expect(pts[1].seconds).toBe(660);
  });
});

describe('detectRuns', () => {
  it('retient une série sans réponse au-delà du seuil', () => {
    const runs = detectRuns([
      shot(1, 'them', 2), shot(2, 'us', 3, 1, 10), shot(3, 'us', 3, 1, 20), shot(4, 'us', 2, 1, 30),
      shot(5, 'them', 2, 1, 40),
    ], 600);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ side: 'us', points: 8, startSeconds: 10, endSeconds: 30 });
    // La série a renversé l'écart : -2 avant, +6 après.
    expect(runs[0].diffBefore).toBe(-2);
    expect(runs[0].diffAfter).toBe(6);
  });

  it('coupe la série dès que l\'autre camp marque', () => {
    const runs = detectRuns([
      shot(1, 'us', 2), shot(2, 'us', 2), shot(3, 'them', 2), shot(4, 'us', 2), shot(5, 'us', 2),
    ], 600);
    expect(runs).toHaveLength(0);   // deux séries de 4, aucune n'atteint 6
  });

  it('ignore les actions sans point', () => {
    const reb: MatchEvent = { ...shot(3, 'them', 2), type: 'reb_def', made: undefined, value: undefined };
    const runs = detectRuns([shot(1, 'us', 3), reb, shot(2, 'us', 3, 1, 20)], 600);
    expect(runs).toHaveLength(1);
    expect(runs[0].points).toBe(6);
  });

  it('ferme la dernière série même si le match s\'arrête dessus', () => {
    const runs = detectRuns([shot(1, 'them', 2), shot(2, 'us', 3), shot(3, 'us', 3, 1, 10)], 600);
    expect(runs.map(r => r.points)).toEqual([6]);
  });
});

describe('quarterSplits', () => {
  it('découpe par quart-temps joué, écart non cumulé', () => {
    const splits = quarterSplits([
      shot(1, 'us', 3, 1), shot(2, 'them', 2, 1),
      shot(3, 'them', 3, 3), shot(4, 'them', 2, 3), shot(5, 'us', 2, 3),
    ]);
    expect(splits.map(s => s.quarter)).toEqual([1, 3]);
    expect(splits[0]).toMatchObject({ pointsUs: 3, pointsThem: 2, diff: 1 });
    expect(splits[1]).toMatchObject({ pointsUs: 2, pointsThem: 5, diff: -3 });
    expect(splits[1].them.fg3m).toBe(1);
  });

  it('compte les actions adverses sans auteur, comme les totaux d\'équipe', () => {
    const anonymous: MatchEvent = { ...shot(1, 'them', 2, 1) };
    const [q1] = quarterSplits([anonymous]);
    expect(q1.pointsThem).toBe(2);
    expect(q1.them.fg2a).toBe(1);
  });
});
