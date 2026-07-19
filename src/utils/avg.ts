/** Moyenne arrondie à 1 décimale, null si la liste est vide — évite les implémentations dupliquées
 * de `Math.round(sum/n*10)/10` à travers l'app (éval moyenne, comparaisons de stats...). */
export function roundedAvg(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
}
