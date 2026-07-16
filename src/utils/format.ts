/** Formate un score RPE/bien-être à 1 décimale fixe (5 → "5.0"), pour un affichage uniforme partout hors formulaires de saisie. */
export function fmt1(v: number | null | undefined, fallback = '—'): string {
  return v === null || v === undefined ? fallback : v.toFixed(1);
}
