import type { RawPlayerStats, FeatureVector } from './types';
import { FEATURE_REGISTRY } from './featureRegistry';
import { percentileRank } from './normalizer';

/**
 * Construit les vecteurs de features de tout l'effectif : pour chaque feature du registre,
 * calcule la valeur brute de chaque joueur puis son percentile au sein de l'effectif fourni.
 * Le percentile d'un joueur dépend donc de l'effectif passé en entrée (comparaison relative).
 */
export function buildFeatureVectors(raws: RawPlayerStats[]): FeatureVector[] {
  const vectors = new Map<string, FeatureVector>(
    raws.map(r => [r.playerId, {
      playerId: r.playerId,
      values: {},
      sampleSize: { matches: r.matches, minutes: r.minutesTotal },
    }])
  );

  for (const feature of FEATURE_REGISTRY) {
    const rawValues = raws.map(r => feature.get(r));
    const percentiles = percentileRank(rawValues);
    raws.forEach((r, i) => {
      vectors.get(r.playerId)!.values[feature.key] = { raw: rawValues[i], percentile: percentiles[i] };
    });
  }

  return [...vectors.values()];
}
