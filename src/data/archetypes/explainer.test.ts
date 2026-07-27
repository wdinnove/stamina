import { describe, it, expect } from 'vitest';
import { explainScore, MIN_MATCHES_HARD_CUTOFF, MIN_MINUTES_FULL_CONFIDENCE } from './explainer';
import type { ScoredProfile } from './scoringEngine';

function scored(rawScore: number, points: number[]): ScoredProfile {
  return {
    rawScore,
    contributions: points.map((p, i) => ({
      featureKey: `f${i}`, label: `f${i}`, rawValue: 1, percentile: 50, points: p,
    })),
  };
}

describe('explainScore', () => {
  it('trie les contributions par impact absolu décroissant, séparées positif/négatif', () => {
    const result = explainScore(scored(70, [5, -40, 20, -10]), { matches: 10, minutes: 300 });
    expect(result.topPositive.map(c => c.points)).toEqual([20, 5]);
    expect(result.topNegative.map(c => c.points)).toEqual([-40, -10]);
  });

  it('gère un topNegative vide si toutes les contributions sont positives', () => {
    const result = explainScore(scored(60, [5, 10]), { matches: 10, minutes: 300 });
    expect(result.topNegative).toEqual([]);
    expect(result.topPositive.length).toBe(2);
  });

  it('atténue totalement vers 50 à 0 minute jouée (confidence low)', () => {
    const result = explainScore(scored(90, [40]), { matches: 4, minutes: 0 });
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('low');
  });

  it('ne modifie pas le score au-delà du seuil de minutes plein', () => {
    const result = explainScore(scored(90, [40]), { matches: 12, minutes: MIN_MINUTES_FULL_CONFIDENCE });
    expect(result.score).toBe(90);
    expect(result.confidence).toBe('high');
  });

  it('applique un garde-fou dur sous le nombre minimum de matchs : non calculable', () => {
    const result = explainScore(scored(90, [40]), { matches: MIN_MATCHES_HARD_CUTOFF - 1, minutes: 500 });
    expect(result.computable).toBe(false);
    expect(result.score).toBeNull();
  });

  it('n\'est pas calculable si scoreIndicators a renvoyé null', () => {
    const result = explainScore(null, { matches: 10, minutes: 300 });
    expect(result.computable).toBe(false);
    expect(result.score).toBeNull();
  });
});
