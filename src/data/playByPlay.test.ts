import { describe, it, expect } from 'vitest';
import { playByPlayRows, PLAY_BY_PLAY_HEADER } from './playByPlay';
import { toCsv } from '../utils/csv';
import type { MatchEvent } from './types';

const ev = (over: Partial<MatchEvent> & { seq: number }): MatchEvent => ({
  matchId: 'm1', quarter: 1, gameTimeSeconds: 0, side: 'us',
  type: 'shot', onCourt: [], onCourtThem: [], ...over,
});

const NAMES = {
  us: 'NF2', them: 'ASVEL',
  player: (id: string) => ({ p1: 'Alex Martin' }[id] ?? '?'),
  opponent: (id: string) => ({ o1: 'Camille D.' }[id] ?? '?'),
};

const col = (row: string[], name: typeof PLAY_BY_PLAY_HEADER[number]) =>
  row[PLAY_BY_PLAY_HEADER.indexOf(name)];

describe('playByPlayRows', () => {
  it('suit le score au fil des actions, des deux côtés', () => {
    const rows = playByPlayRows([
      ev({ seq: 1, playerId: 'p1', x: 7.5, y: 9.0, made: true }),              // 3 pts
      ev({ seq: 2, side: 'them', opponentPlayerId: 'o1', x: 7.5, y: 3, made: true }), // 2 pts
      ev({ seq: 3, playerId: 'p1', type: 'ft', made: true }),                  // 1 pt
    ], NAMES);

    expect(rows.map(r => [col(r, 'Score nous'), col(r, 'Score eux')]))
      .toEqual([['3', '0'], ['3', '2'], ['4', '2']]);
  });

  it('nomme la zone et la valeur d\'un tir positionné', () => {
    const [row] = playByPlayRows([ev({ seq: 1, playerId: 'p1', x: 7.5, y: 9.0, made: false })], NAMES);
    expect(col(row, 'Action')).toBe('Tir à 3 pts');
    expect(col(row, 'Résultat')).toBe('Manqué');
    expect(col(row, 'Zone')).toBe('3 pts axe');
    expect(col(row, 'Points')).toBe('');
  });

  it('laisse la zone vide pour un tir sans position, qui compte quand même', () => {
    const [row] = playByPlayRows([ev({ seq: 1, playerId: 'p1', value: 2, made: true })], NAMES);
    expect(col(row, 'Zone')).toBe('');
    expect(col(row, 'X (m)')).toBe('');
    expect(col(row, 'Points')).toBe('2');
    expect(col(row, 'Score nous')).toBe('2');
  });

  it('laisse le joueur vide sur une action adverse anonyme — cas normal, pas une donnée manquante', () => {
    const [row] = playByPlayRows([ev({ seq: 1, side: 'them', type: 'reb_def' })], NAMES);
    expect(col(row, 'Joueur')).toBe('');
    expect(col(row, 'Équipe')).toBe('ASVEL');
    expect(col(row, 'Action')).toBe('Rebond déf.');
  });

  it('remet les actions dans l\'ordre des rangs', () => {
    const rows = playByPlayRows([
      ev({ seq: 2, playerId: 'p1', type: 'ft', made: true }),
      ev({ seq: 1, playerId: 'p1', type: 'ast' }),
    ], NAMES);
    expect(rows.map(r => col(r, 'Action'))).toEqual(['Passe déc.', 'LF']);
  });
});

describe('toCsv', () => {
  it('échappe les guillemets et les séparateurs, jamais le reste', () => {
    expect(toCsv([['a', 'b;c', 'd"e', 'f']])).toBe('a;"b;c";"d""e";f');
  });

  it('sépare les lignes en CRLF, ce qu\'attend Excel', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb');
  });
});
