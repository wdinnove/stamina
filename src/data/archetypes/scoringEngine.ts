import type { Contribution, FeatureVector } from './types';
import { getFeature } from './featureRegistry';

export interface IndicatorLike { featureKey: string; weight: number; required?: boolean }

export interface ScoredProfile {
  /** Score brut 0-100 avant shrinkage petit échantillon (voir explainer.ts). */
  rawScore: number;
  contributions: Contribution[];
}

/**
 * Somme pondérée de features normalisées (percentile centré-réduit sur [-1,1]) → score 0-100.
 * Aucun if/else métier : le comportement dépend uniquement des `indicators` passés en config.
 *
 * Retourne `null` si le profil n'est pas calculable pour ce joueur : soit un indicateur
 * `required` est indisponible, soit tous les indicateurs le sont.
 *
 * Invariant : si toutes les features référencées sont au percentile 50 (joueur moyen),
 * rawScore = 50 quel que soit le jeu de poids.
 */
export function scoreIndicators(vector: FeatureVector, indicators: IndicatorLike[]): ScoredProfile | null {
  const weightSum = indicators.reduce((sum, i) => sum + Math.abs(i.weight), 0);
  if (weightSum === 0) return null;

  const contributions: Contribution[] = [];
  for (const indicator of indicators) {
    const entry = vector.values[indicator.featureKey];
    const percentile = entry?.percentile ?? null;
    if (percentile === null) {
      if (indicator.required) return null;
      continue; // indicateur optionnel indisponible : ignoré, ni bonus ni pénalité
    }
    const centered = (percentile - 50) / 50; // ∈ [-1, 1]
    const points = ((indicator.weight * centered) / weightSum) * 100;
    contributions.push({
      featureKey: indicator.featureKey,
      label: getFeature(indicator.featureKey)?.label ?? indicator.featureKey,
      rawValue: entry?.raw ?? null,
      percentile,
      points,
    });
  }
  if (contributions.length === 0) return null;

  const rawSum = contributions.reduce((sum, c) => sum + c.points, 0) / 100; // ∈ [-1, 1]
  const rawScore = Math.min(100, Math.max(0, Math.round(50 + 50 * rawSum)));

  return { rawScore, contributions };
}
