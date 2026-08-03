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
  for (const indicator of indicators) {
    if (!indicator.required) continue;
    if ((vector.values[indicator.featureKey]?.percentile ?? null) === null) return null;
  }

  // weightSum se calcule UNIQUEMENT sur les indicateurs réellement disponibles : sinon le poids
  // d'un indicateur optionnel manquant reste au dénominateur sans jamais contribuer au
  // numérateur, ce qui compresse silencieusement le score vers 50 même quand tous les
  // indicateurs disponibles sont à percentile 100 (ex. poids 1 dispo + poids 5 manquant ->
  // rawScore plafonné à 58 au lieu de 100 — bug corrigé ici, voir scoringEngine.test.ts).
  const available = indicators.filter(i => (vector.values[i.featureKey]?.percentile ?? null) !== null);
  const weightSum = available.reduce((sum, i) => sum + Math.abs(i.weight), 0);
  if (weightSum === 0) return null;

  const contributions: Contribution[] = available.map(indicator => {
    const entry = vector.values[indicator.featureKey]!;
    const percentile = entry.percentile!;
    const centered = (percentile - 50) / 50; // ∈ [-1, 1]
    const points = ((indicator.weight * centered) / weightSum) * 100;
    return {
      featureKey: indicator.featureKey,
      label: getFeature(indicator.featureKey)?.label ?? indicator.featureKey,
      rawValue: entry.raw,
      percentile,
      points,
    };
  });

  const rawSum = contributions.reduce((sum, c) => sum + c.points, 0) / 100; // ∈ [-1, 1]
  const rawScore = Math.min(100, Math.max(0, Math.round(50 + 50 * rawSum)));

  return { rawScore, contributions };
}
