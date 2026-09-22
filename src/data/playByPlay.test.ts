import { describe, it, expect } from 'vitest';
import { playByPlayRows, playByPlayEntries, PLAY_BY_PLAY_HEADER } from './playByPlay';
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
    ], NAMES, 600);

    expect(rows.map(r => [col(r, 'Score nous'), col(r, 'Score eux')]))
      .toEqual([['3', '0'], ['3', '2'], ['4', '2']]);
  });

  it('nomme la zone et la valeur d\'un tir positionné', () => {
    const [row] = playByPlayRows([ev({ seq: 1, playerId: 'p1', x: 7.5, y: 9.0, made: false })], NAMES, 600);
    expect(col(row, 'Action')).toBe('Tir à 3 pts');
    expect(col(row, 'Résultat')).toBe('Manqué');
    expect(col(row, 'Zone')).toBe('3 pts axe');
    expect(col(row, 'Points')).toBe('');
  });

  it('laisse la zone vide pour un tir sans position, qui compte quand même', () => {
    const [row] = playByPlayRows([ev({ seq: 1, playerId: 'p1', value: 2, made: true })], NAMES, 600);
    expect(col(row, 'Zone')).toBe('');
    expect(col(row, 'X (m)')).toBe('');
    expect(col(row, 'Points')).toBe('2');
    expect(col(row, 'Score nous')).toBe('2');
  });

  it('rend un repère de fin de quart-temps/match sans auteur ni points, sans planter', () => {
    const [row] = playByPlayRows([ev({ seq: 1, type: 'period_end' })], NAMES, 600);
    expect(col(row, 'Action')).toBe('Fin de quart-temps');
    expect(col(row, 'Joueur')).toBe('');
    expect(col(row, 'Résultat')).toBe('');
    expect(col(row, 'Points')).toBe('');
  });

  it('laisse le joueur vide sur une action adverse anonyme — cas normal, pas une donnée manquante', () => {
    const [row] = playByPlayRows([ev({ seq: 1, side: 'them', type: 'reb_def' })], NAMES, 600);
    expect(col(row, 'Joueur')).toBe('');
    expect(col(row, 'Équipe')).toBe('ASVEL');
    expect(col(row, 'Action')).toBe('Rebond déf.');
  });

  it('remet les actions dans l\'ordre des rangs', () => {
    const rows = playByPlayRows([
      ev({ seq: 2, playerId: 'p1', type: 'ft', made: true }),
      ev({ seq: 1, playerId: 'p1', type: 'ast' }),
    ], NAMES, 600);
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

describe('playByPlayEntries', () => {
  it('porte le score APRÈS chaque action, et le camp sans passer par le nom d\'équipe', () => {
    const entries = playByPlayEntries([
      ev({ seq: 1, playerId: 'p1', x: 7.5, y: 9.0, made: true }),
      ev({ seq: 2, side: 'them', type: 'foul' }),
    ], NAMES);

    expect(entries[0]).toMatchObject({ side: 'us', points: 3, scoreUs: 3, scoreThem: 0, outcome: 'Réussi' });
    // Une action sans point ne fait pas bouger le score, mais le porte quand même.
    expect(entries[1]).toMatchObject({ side: 'them', points: 0, scoreUs: 3, scoreThem: 0, outcome: '', author: '' });
  });

  it('est la seule construction : le CSV en est l\'aplatissement', () => {
    const events = [ev({ seq: 1, playerId: 'p1', x: 7.5, y: 9.0, made: true })];
    const [entry] = playByPlayEntries(events, NAMES);
    const [row] = playByPlayRows(events, NAMES, 600);
    expect(col(row, 'Action')).toBe(entry.action);
    expect(col(row, 'Zone')).toBe(entry.zone);
    expect(col(row, 'Score nous')).toBe(String(entry.scoreUs));
  });
});

describe('colonne Temps', () => {
  const ev = (over: Partial<MatchEvent>): MatchEvent => ({
    matchId: 'm1', seq: 1, quarter: 1, gameTimeSeconds: 0, side: 'us',
    type: 'shot', onCourt: [], onCourtThem: [], ...over,
  });

  it('exporte le DÉCOMPTE du quart-temps, comme la feuille de marque', () => {
    // Le fichier sert à arbitrer un désaccord avec la feuille officielle : il doit se lire dans le
    // même sens qu'elle. 180 s écoulées d'un quart-temps de 10 min, c'est 07:00 au tableau.
    const [row] = playByPlayRows([ev({ playerId: 'p1', type: 'ast', gameTimeSeconds: 180 })], NAMES, 600);
    expect(col(row, 'Temps')).toBe('07:00');
  });

  it('décompte une prolongation depuis cinq minutes', () => {
    const [row] = playByPlayRows([ev({ playerId: 'p1', type: 'ast', quarter: 5, gameTimeSeconds: 60 })], NAMES, 600);
    expect(col(row, 'Temps')).toBe('04:00');
  });
});
