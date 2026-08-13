/**
 * Agrégation d'un RATIO sur plusieurs observations (matchs, séances) : on somme le numérateur ET
 * le dénominateur, puis on divise. Jamais la moyenne des ratios déjà calculés observation par
 * observation — ce serait donner le même poids à un match à 3 tirs qu'à un match à 60.
 *
 * C'est la règle du § 4 de docs/CALCULS.md, jusqu'ici implémentée séparément dans chaque surface
 * (`pctFromSums` de TeamCompareStatBlocks, `shootingPctPeriod` de crossAnalysis,
 * `calcPlayerAdvancedForPeriod`…). Les versions locales avaient divergé : quatre ratios d'équipe
 * moyennaient encore les ratios par match à côté de six qui sommaient correctement.
 *
 * **Les observations dont le dénominateur est nul, absent, ou dont le numérateur est absent sont
 * exclues des DEUX sommes.** Un match sans possession saisie ne doit pas verser ses points dans un
 * dénominateur qui les ignore — c'était la source des ORtg d'équipe artificiellement gonflés.
 *
 * @param factor 100 pour un pourcentage, 1 pour un ratio brut (FT Rate : 0,28 et non 28 %).
 * @param decimals Défaut : 1 décimale pour un pourcentage, 2 pour un ratio — mêmes précisions
 *   qu'en base (`efg_pct NUMERIC(4,1)`, `ft_rate NUMERIC(4,2)`).
 */
export function ratioFromSums<T>(
  rows: readonly T[],
  num: (row: T) => number | null | undefined,
  den: (row: T) => number | null | undefined,
  factor: 1 | 100 = 100,
  decimals = factor === 100 ? 1 : 2,
): number | null {
  let sumNum = 0;
  let sumDen = 0;
  for (const row of rows) {
    const d = den(row);
    const n = num(row);
    if (d === null || d === undefined || d === 0) continue;
    if (n === null || n === undefined) continue;
    sumNum += n;
    sumDen += d;
  }
  if (sumDen === 0) return null;
  const pow = 10 ** decimals;
  return Math.round((sumNum / sumDen) * factor * pow) / pow;
}

/** Raccourci pour un pourcentage (facteur 100, 1 décimale) — le cas le plus fréquent. */
export function pctFromSums<T>(
  rows: readonly T[],
  made: (row: T) => number | null | undefined,
  att: (row: T) => number | null | undefined,
): number | null {
  return ratioFromSums(rows, made, att, 100);
}
