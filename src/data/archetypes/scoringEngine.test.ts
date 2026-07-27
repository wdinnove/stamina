import { describe, it, expect } from 'vitest';
import { scoreIndicators } from './scoringEngine';
import type { FeatureVector } from './types';

function vectorWithPercentiles(values: Record<string, number | null>): FeatureVector {
  return {
    playerId: 'p1',
    sampleSize: { matches: 10, minutes: 200 },
    values: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, { raw: v, percentile: v }])
    ),
  };
}

describe('scoreIndicators', () => {
  it('renvoie 50 quand tous les indicateurs sont au percentile 50, quel que soit le jeu de poids', () => {
    const vector = vectorWithPercentiles({ a: 50, b: 50, c: 50 });
    const result = scoreIndicators(vector, [
      { featureKey: 'a', weight: 3 },
      { featureKey: 'b', weight: -2 },
      { featureKey: 'c', weight: 1 },
    ]);
    expect(result?.rawScore).toBe(50);
  });

  it('renvoie null si un indicateur required est indisponible', () => {
    const vector = vectorWithPercentiles({ a: 80 });
    const result = scoreIndicators(vector, [
      { featureKey: 'a', weight: 1 },
      { featureKey: 'missing', weight: 1, required: true },
    ]);
    expect(result).toBeNull();
  });

  it('ignore un indicateur optionnel indisponible sans le pénaliser (ni bonus ni malus)', () => {
    const vector = vectorWithPercentiles({ a: 50 });
    const result = scoreIndicators(vector, [
      { featureKey: 'a', weight: 1 },
      { featureKey: 'missing', weight: 5 }, // gros poids, mais indisponible et optionnel
    ]);
    expect(result?.rawScore).toBe(50);
  });

  it('un poids négatif à percentile 100 tire le score sous 50', () => {
    const vector = vectorWithPercentiles({ a: 100 });
    const result = scoreIndicators(vector, [{ featureKey: 'a', weight: -1 }]);
    expect(result?.rawScore).toBeLessThan(50);
  });

  it('un poids positif à percentile 100 pousse le score au-dessus de 50', () => {
    const vector = vectorWithPercentiles({ a: 100 });
    const result = scoreIndicators(vector, [{ featureKey: 'a', weight: 1 }]);
    expect(result?.rawScore).toBeGreaterThan(50);
    expect(result?.rawScore).toBeLessThanOrEqual(100);
  });

  it('clamp strictement le score dans [0, 100]', () => {
    const vector = vectorWithPercentiles({ a: 100, b: 100 });
    const result = scoreIndicators(vector, [
      { featureKey: 'a', weight: 10 },
      { featureKey: 'b', weight: 10 },
    ]);
    expect(result!.rawScore).toBeGreaterThanOrEqual(0);
    expect(result!.rawScore).toBeLessThanOrEqual(100);
  });

  it('renvoie null si tous les indicateurs sont indisponibles', () => {
    const vector = vectorWithPercentiles({});
    const result = scoreIndicators(vector, [{ featureKey: 'missing', weight: 1 }]);
    expect(result).toBeNull();
  });

  it('renvoie null si la liste d\'indicateurs a un poids total nul', () => {
    const vector = vectorWithPercentiles({ a: 80 });
    const result = scoreIndicators(vector, []);
    expect(result).toBeNull();
  });
});
