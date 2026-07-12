/**
 * Corrélation de Pearson et libellés d'impact partagés.
 * Extrait de data/pca.ts pour être réutilisé par l'analyse de performance
 * croisée (data/crossAnalysis.ts) — les seuils restent identiques partout.
 */

/** Minimum d'observations appariées pour afficher une corrélation (même esprit que PLAYER_MIN_MATCHES de pca.ts) */
export const MIN_CORRELATION_PAIRS = 5;

/** Vrai si la série contient au moins deux valeurs distinctes (à 10⁻³ près) */
export function hasVariance(values: number[]): boolean {
  return new Set(values.map(v => Math.round(v * 1000))).size > 1;
}

function strengthWord(absCorr: number): 'Majeur' | 'Fort' | 'Modéré' | 'Léger' {
  if (absCorr >= 0.6) return 'Majeur';
  if (absCorr >= 0.4) return 'Fort';
  if (absCorr >= 0.25) return 'Modéré';
  return 'Léger';
}

/** Libellé court pour une corrélation : « Impact fort », « Impact léger », etc. */
export function impactLabel(corr: number): string {
  return `Impact ${strengthWord(Math.abs(corr))}`;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? num / denom : 0;
}

/** Paire de valeurs appariées (par date ou par match) prête à corréler */
export interface CorrelationPair {
  x: number;
  y: number;
  /** Date de l'observation (côté « résultat ») */
  date: string;
  /** Libellé optionnel (ex. adversaire du match) */
  label?: string;
}

export interface CorrelationResult {
  r: number;
  n: number;
  pairs: CorrelationPair[];
}

/**
 * Corrélation sur des paires déjà appariées, avec les mêmes garde-fous que pca.ts :
 * null si moins de `minPairs` observations ou si l'une des séries est constante
 * (une corrélation sur 2-3 points afficherait ±1 de façon trompeuse).
 */
export function correlatePairs(pairs: CorrelationPair[], minPairs = MIN_CORRELATION_PAIRS): CorrelationResult | null {
  if (pairs.length < minPairs) return null;
  const xs = pairs.map(p => p.x);
  const ys = pairs.map(p => p.y);
  if (!hasVariance(xs) || !hasVariance(ys)) return null;
  return { r: pearson(xs, ys), n: pairs.length, pairs };
}
