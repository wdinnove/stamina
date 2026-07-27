/**
 * Percentile-rank au sein de l'effectif disponible : `(rang - 0.5) / n × 100`.
 * Choisi plutôt qu'un z-score ou un min-max car robuste à un seul outlier sur petit effectif
 * (10-15 joueurs) et directement explicable à un coach (« meilleur que 80 % de l'effectif »).
 * Limite assumée : le résultat est relatif au groupe comparé, jamais absolu.
 *
 * `null` reste `null` (feature indisponible pour ce joueur, exclue du calcul de rang des
 * autres). Les ex-aequo reçoivent le rang moyen. Un effectif à une seule valeur retourne 50
 * (neutre), sans division par zéro.
 */
export function percentileRank(values: (number | null)[]): (number | null)[] {
  const indexed = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  const n = indexed.length;
  const result: (number | null)[] = values.map(() => null);
  if (n === 0) return result;

  const sorted = [...indexed].sort((a, b) => a.v - b.v);
  let idx = 0;
  while (idx < n) {
    let j = idx;
    while (j + 1 < n && sorted[j + 1].v === sorted[idx].v) j++;
    // rang moyen (1-based) du groupe d'ex-aequo [idx, j]
    const avgRank = (idx + 1 + j + 1) / 2;
    const percentile = ((avgRank - 0.5) / n) * 100;
    for (let k = idx; k <= j; k++) result[sorted[k].i] = percentile;
    idx = j + 1;
  }
  return result;
}
