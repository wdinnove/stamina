import { describe, it, expect } from 'vitest';
import {
  playStats, lineupStats, playerPlusMinus, playingTime, recomputeOnCourtSnapshots, periodLabel, formatClock,
} from './liveTrackingAnalysis';
import type { MatchLiveAction, MatchLineupEvent, Play } from './types';

const PLAY_PNR: Play = { id: 'p1', teamId: 't1', side: 'offense', name: 'Pick and roll', active: true, sortOrder: 0 };
const PLAY_M2M: Play = { id: 'p2', teamId: 't1', side: 'defense', name: 'M2M', active: true, sortOrder: 0 };

let seq = 0;
const action = (over: Partial<MatchLiveAction>): MatchLiveAction => ({
  matchId: 'm1', seq: ++seq, quarter: 1, gameTimeSeconds: 0,
  side: 'offense', points: 0, onCourt: [], onCourtThem: [],
  ...over,
});

describe('playStats', () => {
  it('groups by play and computes success rate and points per possession', () => {
    const actions = [
      action({ playId: 'p1', points: 2 }),
      action({ playId: 'p1', points: 0 }),
      action({ playId: undefined, points: 1 }),
    ];
    const rows = playStats(actions, [PLAY_PNR, PLAY_M2M]);

    const pnr = rows.find(r => r.playId === 'p1')!;
    expect(pnr.count).toBe(2);
    expect(pnr.successCount).toBe(1);
    expect(pnr.successRate).toBe(0.5);
    expect(pnr.rentabilite).toBe(1);

    const none = rows.find(r => r.playId === null)!;
    expect(none.playName).toBe('Sans play');
    expect(none.count).toBe(1);
  });

  it('labels a play removed from the catalog instead of dropping its history', () => {
    const rows = playStats([action({ playId: 'gone', points: 2 })], []);
    expect(rows[0].playName).toBe('Play supprimé');
  });
});

describe('lineupStats', () => {
  it('computes plus/minus from combined offense and defense flows', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    const actions = [
      action({ side: 'offense', onCourt: five, points: 2 }),
      action({ side: 'offense', onCourt: [...five].reverse(), points: 0 }),
      action({ side: 'defense', onCourt: five, points: 3 }),
      action({ side: 'defense', onCourt: five, points: 0 }),
    ];
    const rows = lineupStats(actions);
    expect(rows).toHaveLength(1);
    expect(rows[0].pointsFor).toBe(2);
    expect(rows[0].pointsAgainst).toBe(3);
    expect(rows[0].plusMinus).toBe(-1);
    expect(rows[0].possessionsOffense).toBe(2);
    expect(rows[0].possessionsDefense).toBe(2);
  });

  it('ignores actions with no lineup recorded', () => {
    expect(lineupStats([action({ onCourt: [] })])).toEqual([]);
  });
});

describe('playerPlusMinus', () => {
  it('credits points scored and debits points allowed while on court', () => {
    const totals = playerPlusMinus([
      action({ side: 'offense', onCourt: ['a', 'b'], points: 2 }),
      action({ side: 'defense', onCourt: ['a'], points: 3 }),
    ]);
    expect(totals.get('a')).toBe(2 - 3);
    expect(totals.get('b')).toBe(2);
  });
});

describe('playingTime', () => {
  const lineupEvent = (over: Partial<MatchLineupEvent>): MatchLineupEvent => ({
    matchId: 'm1', seq: 0, side: 'us', quarter: 1, gameTimeSeconds: 0,
    playersIn: [], playersOut: [], onCourt: [],
    ...over,
  });

  it('credits each interval between consecutive substitutions to the five that was on court', () => {
    const events = [
      lineupEvent({ seq: 1, quarter: 1, gameTimeSeconds: 0, onCourt: ['a', 'b', 'c', 'd', 'e'] }),
      lineupEvent({ seq: 2, quarter: 1, gameTimeSeconds: 100, onCourt: ['a', 'b', 'c', 'd', 'f'] }),
    ];
    // "maintenant" = Q1 250s : le dernier passage (depuis 100s) dure encore 150s.
    const totals = playingTime(events, 'us', 1, 250, 600);
    expect(totals.get('a')).toBe(250);
    expect(totals.get('e')).toBe(100);
    expect(totals.get('f')).toBe(150);
  });

  it('carries a stint across a quarter boundary using a constant period duration', () => {
    const events = [
      lineupEvent({ seq: 1, quarter: 1, gameTimeSeconds: 540, onCourt: ['a'] }),
    ];
    // Reste 60s de Q1 (600-540) + 60s de Q2 = 120s, sans changement entre-temps.
    const totals = playingTime(events, 'us', 2, 60, 600);
    expect(totals.get('a')).toBe(120);
  });

  it('never goes negative if "now" is earlier than the last substitution (e.g. after "quart précédent")', () => {
    const events = [lineupEvent({ seq: 1, quarter: 2, gameTimeSeconds: 300, onCourt: ['a'] })];
    const totals = playingTime(events, 'us', 1, 0, 600);
    expect(totals.get('a')).toBe(0);
  });

  it('only counts the requested side', () => {
    const events = [
      lineupEvent({ seq: 1, side: 'us', onCourt: ['a'] }),
      lineupEvent({ seq: 1, side: 'them', onCourt: ['x'] }),
    ];
    const totals = playingTime(events, 'us', 1, 100, 600);
    expect(totals.has('x')).toBe(false);
  });
});

describe('recomputeOnCourtSnapshots', () => {
  const lineupEvent = (over: Partial<MatchLineupEvent>): MatchLineupEvent => ({
    matchId: 'm1', seq: 0, side: 'us', quarter: 1, gameTimeSeconds: 0,
    playersIn: [], playersOut: [], onCourt: [],
    ...over,
  });

  it('re-derives onCourt for later lineup events after a middle substitution is deleted', () => {
    // Départ ABCDE, puis A->F (rang 2), puis B->G (rang 3, dépend du rang 2). On supprime le
    // rang 2 : le cinq réel n'a donc plus jamais vu F, et le rang 3 doit substituer B directement
    // depuis le cinq de départ.
    const events = [
      lineupEvent({ seq: 1, playersIn: ['A', 'B', 'C', 'D', 'E'], onCourt: ['A', 'B', 'C', 'D', 'E'] }),
      lineupEvent({ seq: 3, playersIn: ['G'], playersOut: ['B'], onCourt: ['F', 'G', 'C', 'D', 'E'] }),
    ];
    const { lineupEvents } = recomputeOnCourtSnapshots(events, []);
    const last = lineupEvents.find(e => e.seq === 3)!;
    expect(last.onCourt.sort()).toEqual(['A', 'C', 'D', 'E', 'G'].sort());
  });

  it('re-derives an action onCourt snapshot from the lineup events that remain', () => {
    const events = [
      lineupEvent({ seq: 1, side: 'us', quarter: 1, gameTimeSeconds: 0, playersIn: ['A', 'B'], onCourt: ['A', 'B'] }),
      lineupEvent({ seq: 2, side: 'us', quarter: 1, gameTimeSeconds: 300, playersIn: ['C'], playersOut: ['A'], onCourt: ['B', 'C'] }),
    ];
    const act = action({ side: 'offense', quarter: 1, gameTimeSeconds: 600, onCourt: ['stale'] });
    const { actions } = recomputeOnCourtSnapshots(events, [act]);
    expect(actions[0].onCourt.sort()).toEqual(['B', 'C']);
  });
});

describe('periodLabel', () => {
  it('numbers overtimes from 1 past the fourth quarter, matching MatchFormModal', () => {
    expect(periodLabel(1)).toBe('Q1');
    expect(periodLabel(4)).toBe('Q4');
    expect(periodLabel(5)).toBe('P1');
    expect(periodLabel(6)).toBe('P2');
  });
});

describe('formatClock', () => {
  it('formats seconds as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(-5)).toBe('00:00');
  });
});
