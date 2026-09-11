import { describe, it, expect } from 'vitest';
import { queueDelete, type QueuedOp } from './eventQueue';
import type { MatchEvent } from './types';

const EVENT = (seq: number, matchId = 'm1'): MatchEvent => ({
  matchId, seq, quarter: 1, gameTimeSeconds: 0, side: 'us',
  playerId: 'p1', type: 'reb_def', onCourt: [], onCourtThem: [],
});

const insert = (seq: number, matchId?: string): QueuedOp => ({ kind: 'insert', event: EVENT(seq, matchId) });

describe('queueDelete', () => {
  it('efface l\'insertion encore en attente au lieu d\'empiler une suppression', () => {
    expect(queueDelete([insert(1), insert(2)], 'm1', 2)).toEqual([insert(1)]);
  });

  it('empile une suppression quand l\'insertion est déjà partie', () => {
    expect(queueDelete([insert(3)], 'm1', 1)).toEqual([
      insert(3), { kind: 'delete', matchId: 'm1', seq: 1 },
    ]);
  });

  it('ne confond pas deux matchs de même rang', () => {
    const q = [insert(1, 'autre')];
    expect(queueDelete(q, 'm1', 1)).toEqual([...q, { kind: 'delete', matchId: 'm1', seq: 1 }]);
  });

  it('conserve l\'ordre des opérations restantes', () => {
    expect(queueDelete([insert(1), insert(2), insert(3)], 'm1', 2)).toEqual([insert(1), insert(3)]);
  });
});
