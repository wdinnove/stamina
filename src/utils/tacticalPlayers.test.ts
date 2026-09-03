import { describe, it, expect } from 'vitest';
import {
  parsePlayerToken, matchPlayerToken, collectPlayerTokens, splitPlayerCell, isPlayerColumnName,
} from './tacticalPlayers';
import type { Player } from '../data/types';

/** Seuls les quatre champs lus par le rapprochement sont renseignés. */
const player = (number: number, firstName: string, lastName: string): Player =>
  ({ id: `p${number}`, firstName, lastName, number } as unknown as Player);

/** Deux « Eva » dans l'effectif, comme dans l'équipe réelle : le numéro est le seul discriminant. */
const squad = [
  player(0, 'Cynthia', 'Dupont'),
  player(1, 'Yanaelle', 'Martin'),
  player(6, 'Eva', 'Thomas'),
  player(8, 'Eva', 'Ibrahim'),
  player(11, 'Chloé', 'Bernard'),
];

describe('parsePlayerToken', () => {
  it('sépare le numéro de maillot du nom', () => {
    expect(parsePlayerToken('#0 Cynthia')).toEqual({ raw: '#0 Cynthia', number: 0, name: 'Cynthia' });
    expect(parsePlayerToken('#14 Eva Ha')).toEqual({ raw: '#14 Eva Ha', number: 14, name: 'Eva Ha' });
  });

  it('accepte un jeton sans numéro', () => {
    expect(parsePlayerToken('Cynthia')).toEqual({ raw: 'Cynthia', number: null, name: 'Cynthia' });
  });

  it('accepte un numéro sans nom', () => {
    expect(parsePlayerToken('#12')).toEqual({ raw: '#12', number: 12, name: '' });
  });
});

describe('matchPlayerToken', () => {
  it('rapproche par numéro de maillot en priorité', () => {
    expect(matchPlayerToken('#6 Eva Th', squad)?.id).toBe('p6');
    expect(matchPlayerToken('#8 Eva Ib', squad)?.id).toBe('p8');
  });

  it('retombe sur le prénom quand il ne désigne qu\'une joueuse', () => {
    expect(matchPlayerToken('Cynthia', squad)?.id).toBe('p0');
    expect(matchPlayerToken('chloe', squad)?.id).toBe('p11');
  });

  it('ne devine pas quand un prénom est porté par deux joueuses', () => {
    expect(matchPlayerToken('Eva', squad)).toBeNull();
  });

  it('rend null pour un numéro et un nom inconnus', () => {
    expect(matchPlayerToken('#99 Inconnue', squad)).toBeNull();
  });

  it('préfère le numéro même si le nom écrit est celui d\'une autre', () => {
    expect(matchPlayerToken('#0 Yanaelle', squad)?.id).toBe('p0');
  });
});

describe('collectPlayerTokens', () => {
  const blocks = [{
    dimensionNames: ['Joueuses', 'Finalite'],
    rows: [
      ['#0 Cynthia, #14 Eva Ha', 'Scoring'],
      ['#0 Cynthia', 'Faute'],
      ['', 'Perte de balle'],
    ],
  }];

  it('compte les actions par jeton distinct, pas par ligne', () => {
    expect(collectPlayerTokens(blocks)).toEqual([
      { raw: '#0 Cynthia', actions: 2 },
      { raw: '#14 Eva Ha', actions: 1 },
    ]);
  });

  it('ignore un bloc sans colonne de joueuses', () => {
    expect(collectPlayerTokens([{ dimensionNames: ['Finalite'], rows: [['Scoring']] }])).toEqual([]);
  });
});

describe('splitPlayerCell / isPlayerColumnName', () => {
  it('découpe sur les virgules sans garder de vide', () => {
    expect(splitPlayerCell('#0 Cynthia,  #1 Yana , ')).toEqual(['#0 Cynthia', '#1 Yana']);
  });

  it('reconnaît la colonne quelle que soit sa casse ou son accent', () => {
    expect(isPlayerColumnName('Joueuses')).toBe(true);
    expect(isPlayerColumnName('JOUEURS')).toBe(true);
    expect(isPlayerColumnName('Finalite')).toBe(false);
  });
});
