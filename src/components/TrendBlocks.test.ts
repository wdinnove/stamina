import { describe, it, expect } from 'vitest';
import { winningSide } from './TrendBlocks';

describe('winningSide — quel côté colorer dans une comparaison A/B', () => {
  it('donne le côté le plus haut quand plus haut est mieux', () => {
    expect(winningSide(52, 47, true, false)).toBe('a');
    expect(winningSide(47, 52, true, false)).toBe('b');
  });

  it('inverse le verdict quand plus bas est mieux (balles perdues, points concédés…)', () => {
    expect(winningSide(11, 15, false, false)).toBe('a');
    expect(winningSide(15, 11, false, false)).toBe('b');
  });

  it('ne colore rien sous 3 % d\'écart — même seuil que la flèche d\'évolution', () => {
    expect(winningSide(100, 98, true, false)).toBeNull();   // +2 %
    expect(winningSide(100, 96, true, false)).toBe('a');    // +4,2 %
  });

  it('ne colore rien sans gagnant identifiable', () => {
    expect(winningSide(50, 50, true, false)).toBeNull();    // égalité
    expect(winningSide(null, 50, true, false)).toBeNull();  // valeur manquante
    expect(winningSide(50, null, true, false)).toBeNull();
    expect(winningSide(52, 47, true, true)).toBeNull();     // ligne de contexte (muted)
  });

  it('tranche même quand la référence est nulle (delta incalculable)', () => {
    // deltaPct renvoie null si season === 0 : le seuil des 3 % ne s'applique pas, mais il y a
    // bien un gagnant et la ligne doit le montrer.
    expect(winningSide(5, 0, true, false)).toBe('a');
    expect(winningSide(0, 5, false, false)).toBe('a');
  });
});
