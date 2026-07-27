import { describe, it, expect } from 'vitest';
import { percentileRank } from './normalizer';

describe('percentileRank', () => {
  it('est strictement croissant avec la valeur brute (pas d\'ex-aequo)', () => {
    // valeurs : idx0=10, idx1=30, idx2=20, idx3=40 → ordre croissant réel : idx0 < idx2 < idx1 < idx3
    const result = percentileRank([10, 30, 20, 40]);
    expect(result[0]!).toBeLessThan(result[2]!);
    expect(result[2]!).toBeLessThan(result[1]!);
    expect(result[1]!).toBeLessThan(result[3]!);
  });

  it('attribue le rang moyen aux ex-aequo', () => {
    const result = percentileRank([5, 5, 10]);
    expect(result[0]).toBe(result[1]);
    expect(result[0]!).toBeLessThan(result[2]!);
  });

  it('exclut les valeurs null du calcul et les retourne telles quelles', () => {
    const result = percentileRank([10, null, 20, 30]);
    expect(result[1]).toBeNull();
    // le rang de 10/20/30 est calculé parmi les 3 valeurs non-null uniquement
    expect(result[0]).toBeCloseTo((1 - 0.5) / 3 * 100, 5);
    expect(result[2]).toBeCloseTo((2 - 0.5) / 3 * 100, 5);
    expect(result[3]).toBeCloseTo((3 - 0.5) / 3 * 100, 5);
  });

  it('retourne 50 (neutre) pour un effectif à une seule valeur, sans diviser par zéro', () => {
    const result = percentileRank([42]);
    expect(result[0]).toBe(50);
  });

  it('retourne un tableau de null si toutes les valeurs sont indisponibles', () => {
    const result = percentileRank([null, null]);
    expect(result).toEqual([null, null]);
  });

  it('quand toutes les valeurs sont égales, tout le monde est à 50', () => {
    const result = percentileRank([7, 7, 7, 7]);
    expect(result).toEqual([50, 50, 50, 50]);
  });
});
