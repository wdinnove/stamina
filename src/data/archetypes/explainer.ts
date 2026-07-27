import type { Contribution } from './types';
import type { ScoredProfile } from './scoringEngine';

/** Sous ce nombre de matchs, le score n'est pas affiché du tout (pas assez de données pour être
 *  significatif) — un shrinkage seul ne suffit pas à éviter d'afficher un chiffre trompeur. */
export const MIN_MATCHES_HARD_CUTOFF = 3;
/** Minutes cumulées à partir desquelles le score n'est plus atténué vers 50 (neutre). */
export const MIN_MINUTES_FULL_CONFIDENCE = 150;

export interface ExplainedScore {
  computable: boolean;
  score: number | null;
  rawScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  topPositive: Contribution[];
  topNegative: Contribution[];
}

/**
 * Atténue le score brut vers 50 (neutre) proportionnellement aux minutes jouées, trie les
 * contributions par impact absolu décroissant, et applique un garde-fou dur sous
 * `MIN_MATCHES_HARD_CUTOFF` matchs (score non affiché, pas juste écrasé vers 50).
 */
export function explainScore(
  scored: ScoredProfile | null,
  sampleSize: { matches: number; minutes: number },
  topN = 4,
): ExplainedScore {
  if (!scored || sampleSize.matches < MIN_MATCHES_HARD_CUTOFF) {
    return { computable: false, score: null, rawScore: scored?.rawScore ?? null, confidence: 'low', topPositive: [], topNegative: [] };
  }

  const shrinkFactor = Math.min(1, Math.max(0, sampleSize.minutes / MIN_MINUTES_FULL_CONFIDENCE));
  const score = Math.round(50 + shrinkFactor * (scored.rawScore - 50));
  const confidence = sampleSize.matches < 5 ? 'low' : sampleSize.matches < 10 ? 'medium' : 'high';

  const sortedByImpact = [...scored.contributions].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const topPositive = sortedByImpact.filter(c => c.points > 0).slice(0, topN);
  const topNegative = sortedByImpact.filter(c => c.points < 0).slice(0, topN);

  return { computable: true, score, rawScore: scored.rawScore, confidence, topPositive, topNegative };
}
