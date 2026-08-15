/** Moyenne brute, non arrondie — à utiliser pour les calculs intermédiaires (ex. valeur d'une
 * joueur avant la moyenne d'équipe), afin de ne jamais arrondir deux fois de suite. */
export function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Moyenne arrondie à 1 décimale, null si la liste est vide — évite les implémentations dupliquées
 * de `Math.round(sum/n*10)/10` à travers l'app (éval moyenne, comparaisons de stats...). */
export function roundedAvg(values: number[]): number | null {
  const m = mean(values);
  return m === null ? null : Math.round(m * 10) / 10;
}
