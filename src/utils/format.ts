/** Formate un score RPE/bien-être à 1 décimale fixe (5 → "5.0"), pour un affichage uniforme partout hors formulaires de saisie. */
export function fmt1(v: number | null | undefined, fallback = '—'): string {
  return v === null || v === undefined ? fallback : v.toFixed(1);
}

/**
 * Minutes de boxscore (26.8, un DÉCIMAL en base — cf. `boxscoreFromEvents`, arrondi au dixième)
 * affichées comme un temps de jeu : 26:48. C'est ce que lit un coach — personne ne pense son temps
 * de jeu en dixièmes de minute, et 26.8 se confond trop facilement avec 26 min 8 s.
 *
 * `null`/`undefined` rendent le fallback plutôt que "0:00", pour ne pas confondre une donnée
 * absente avec un joueur entré sur le terrain sans y rester.
 */
export function formatMinutes(v: number | null | undefined, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  const totalSeconds = Math.max(0, Math.round(v * 60));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
