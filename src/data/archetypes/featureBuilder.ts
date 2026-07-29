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

/** Taille de groupe à partir de laquelle on fait confiance à 100% au percentile calculé au
 *  sein du groupe restreint (ex. par poste) plutôt qu'à l'effectif entier. */
export const MIN_GROUP_SIZE_FOR_FULL_TRUST = 6;

/**
 * Mélange les percentiles d'un groupe restreint (ex. pool de comparaison par poste) avec ceux
 * de l'effectif entier, pondéré par la taille du groupe. Sur un petit groupe (n<6), le
 * percentile interne est presque binaire (n=2 ⇒ seulement 25/75 possibles) : n'importe quel
 * écart, même bruité, ressort comme un score extrême. Le mélange atténue cet effet en
 * rapprochant le résultat du percentile — plus stable — calculé sur l'effectif entier.
 * `raw` n'est jamais modifié (seule la comparaison change, pas la valeur mesurée).
 */
export function blendWithSquadVectors(
  groupVectors: FeatureVector[],
  squadVectorsById: Map<string, FeatureVector>,
  groupSize: number,
): FeatureVector[] {
  const groupWeight = Math.min(1, groupSize / MIN_GROUP_SIZE_FOR_FULL_TRUST);
  if (groupWeight >= 1) return groupVectors;

  return groupVectors.map(gv => {
    const squadVector = squadVectorsById.get(gv.playerId);
    if (!squadVector) return gv;
    const values: FeatureVector['values'] = {};
    for (const key of Object.keys(gv.values)) {
      const inGroup = gv.values[key];
      const inSquad = squadVector.values[key];
      const percentile = inGroup.percentile !== null && inSquad?.percentile != null
        ? groupWeight * inGroup.percentile + (1 - groupWeight) * inSquad.percentile
        : inGroup.percentile;
      values[key] = { raw: inGroup.raw, percentile };
    }
    return { ...gv, values };
  });
}
