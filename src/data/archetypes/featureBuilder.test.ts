import { describe, it, expect } from 'vitest';
import { blendWithSquadVectors, MIN_GROUP_SIZE_FOR_FULL_TRUST } from './featureBuilder';
import type { FeatureVector } from './types';

function vector(playerId: string, percentile: number): FeatureVector {
  return { playerId, values: { x: { raw: percentile, percentile } }, sampleSize: { matches: 12, minutes: 300 } };
}

describe('blendWithSquadVectors', () => {
  it('fait confiance à 100% au groupe dès que sa taille atteint le seuil (pas de mélange)', () => {
    const group = [vector('a', 90)];
    const squad = new Map([['a', vector('a', 10)]]);
    const [blended] = blendWithSquadVectors(group, squad, MIN_GROUP_SIZE_FOR_FULL_TRUST);
    expect(blended!.values.x!.percentile).toBe(90);
  });

  it('mélange proportionnellement à la taille du groupe sous le seuil', () => {
    // groupWeight = 2 / 6 = 1/3 -> 1/3×75 + 2/3×50 = 58.33
    const group = [vector('a', 75)];
    const squad = new Map([['a', vector('a', 50)]]);
    const [blended] = blendWithSquadVectors(group, squad, 2);
    expect(blended!.values.x!.percentile).toBeCloseTo(58.33, 1);
  });

  it('un petit groupe (n=2, percentile 25/75 pur) se rapproche du percentile de l\'effectif entier plutôt que de rester à l\'extrême', () => {
    // Un groupe de 2 ne peut produire que 25 ou 75 en percentile pur — le mélange doit tirer ce
    // 75 vers un effectif entier neutre (50) plutôt que de le laisser tel quel.
    const group = [vector('a', 75)];
    const squad = new Map([['a', vector('a', 50)]]);
    const [blended] = blendWithSquadVectors(group, squad, 2);
    expect(blended!.values.x!.percentile).toBeLessThan(75);
    expect(blended!.values.x!.percentile).toBeGreaterThan(50);
  });

  it('ne modifie jamais la valeur brute (raw), seulement le percentile', () => {
    const group = [vector('a', 75)];
    const squad = new Map([['a', vector('a', 50)]]);
    const [blended] = blendWithSquadVectors(group, squad, 2);
    expect(blended!.values.x!.raw).toBe(75);
  });

  it("laisse le percentile inchangé si le joueur est absent du vecteur d'effectif entier", () => {
    const group = [vector('a', 75)];
    const squad = new Map<string, FeatureVector>();
    const [blended] = blendWithSquadVectors(group, squad, 2);
    expect(blended!.values.x!.percentile).toBe(75);
  });
});
