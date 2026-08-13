import type { Contribution } from './types';
import type { ScoredProfile } from './scoringEngine';

/** Sous ce nombre de matchs, le score n'est pas affiché du tout (pas assez de données pour être
 *  significatif) — un shrinkage seul ne suffit pas à éviter d'afficher un chiffre trompeur. */
export const MIN_MATCHES_HARD_CUTOFF = 3;

/**
 * Message de FIABILITÉ d'un score, dérivé de la taille d'échantillon.
 *
 * À ne pas confondre avec le `caveat` d'un profil, qui est une limite MÉTHODOLOGIQUE permanente
 * (« proxy sans donnée de déviations »). Les deux étaient affichés dans le même point
 * d'interrogation : on lisait une explication sur la méthode là où on cherchait à savoir si le
 * chiffre était solide. Le `?` ne porte plus que la fiabilité ; le caveat a son propre indicateur.
 */
export function confidenceNote(
  confidence: 'low' | 'medium' | 'high',
  sampleSize: { matches: number; minutes: number },
): string | null {
  if (confidence === 'high') return null;
  const m = `${sampleSize.matches} match${sampleSize.matches > 1 ? 's' : ''}`;
  const min = `${Math.round(sampleSize.minutes)} min`;
  return confidence === 'low'
    ? `Trop peu de données pour que ce score soit significatif (${m}, ${min} jouées). Il est rapproché de la moyenne tant que l'échantillon reste faible.`
    : `Échantillon encore limité (${m}, ${min} jouées) : le score se précisera avec les prochains matchs.`;
}
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

/** Nombre de matchs à partir duquel le nombre de matchs cesse de limiter la confiance. */
const MATCHES_FOR_FULL_CONFIDENCE = 10;

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

  // La confiance reflète le facteur le plus limitant entre nombre de matchs et minutes jouées —
  // sinon un joueur avec beaucoup de matchs mais très peu de minutes (garbage time) afficherait
  // "confiance haute" alors que son score est en réalité fortement atténué vers 50 par le shrinkage.
  const matchesFactor = Math.min(1, sampleSize.matches / MATCHES_FOR_FULL_CONFIDENCE);
  const confidenceFactor = Math.min(matchesFactor, shrinkFactor);
  const confidence = confidenceFactor < 0.34 ? 'low' : confidenceFactor < 0.67 ? 'medium' : 'high';

  const sortedByImpact = [...scored.contributions].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const topPositive = sortedByImpact.filter(c => c.points > 0).slice(0, topN);
  const topNegative = sortedByImpact.filter(c => c.points < 0).slice(0, topN);

  return { computable: true, score, rawScore: scored.rawScore, confidence, topPositive, topNegative };
}
