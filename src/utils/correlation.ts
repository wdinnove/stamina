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

export function strengthWord(absCorr: number): 'Majeur' | 'Fort' | 'Modéré' | 'Léger' {
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
  /** p-value bilatérale du test de significativité de r (H0 : pas de lien) */
  p: number;
  /** p < SIGNIFICANCE_ALPHA : le lien observé est statistiquement significatif */
  significant: boolean;
}

/** Seuil conventionnel de significativité (test bilatéral) */
export const SIGNIFICANCE_ALPHA = 0.05;

// ── Fonction bêta incomplète régularisée (méthode Numerical Recipes) ──────────
// Sert uniquement au calcul de la p-value du test de significativité de Pearson.

function gammaln(xx: number): number {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = xx;
  const x = xx;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100, EPS = 3e-7, FPMIN = 1e-30;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/**
 * p-value bilatérale du test de significativité d'une corrélation de Pearson
 * (H0 : r = 0), via la statistique t = r·√((n-2)/(1-r²)) à n-2 degrés de liberté.
 * Formule standard (Numerical Recipes / cor.test de R) ; vérifiée contre les
 * tables de valeurs critiques usuelles (ex. r=0,878 à n=5 ⇒ p≈0,05).
 */
export function pearsonPValue(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0) return 1;
  const rr = Math.min(0.999999999, Math.abs(r));
  const t = rr * Math.sqrt(df / (1 - rr * rr));
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

/** Régression linéaire simple (moindres carrés) ; null si variance nulle sur x */
export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
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
  const r = pearson(xs, ys);
  const p = pearsonPValue(r, pairs.length);
  return { r, n: pairs.length, pairs, p, significant: p < SIGNIFICANCE_ALPHA };
}
