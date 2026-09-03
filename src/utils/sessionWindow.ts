/**
 * Fenêtre de séances affichée par la grille de présences.
 *
 * La grille montrait toute la saison d'un coup : une colonne par séance à balayer pour trouver
 * celle du jour, et une requête de présences sur toute la saison. Charger par fenêtre borne la
 * requête et donne un point d'entrée lisible autour de la séance du jour.
 */

/** Séances AVANT le pivot dans la fenêtre initiale. */
export const WINDOW_BEFORE = 6;
/** Séances APRÈS le pivot dans la fenêtre initiale. */
export const WINDOW_AFTER = 13;
/** Taille de la fenêtre initiale, et lot chargé à chaque clic sur « précédentes »/« suivantes ». */
export const WINDOW_SIZE = WINDOW_BEFORE + 1 + WINDOW_AFTER;

export interface SessionWindow {
  /** Index de la première séance affichée. */
  start: number;
  /** Index de fin, EXCLU — utilisable tel quel dans `slice`. */
  end: number;
}

/**
 * Séance autour de laquelle ouvrir la grille : celle du jour, sinon la PROCHAINE — c'est celle
 * qu'on prépare —, sinon la dernière passée quand la saison est finie.
 * `sessions` est attendu trié par date croissante. Renvoie -1 si la liste est vide.
 */
export function pivotSessionIndex(sessions: { date: string }[], today: string): number {
  if (!sessions.length) return -1;
  const exact = sessions.findIndex(s => s.date === today);
  if (exact !== -1) return exact;
  const next = sessions.findIndex(s => s.date > today);
  return next !== -1 ? next : sessions.length - 1;
}

/**
 * Fenêtre initiale : 6 séances avant le pivot, le pivot, 13 après. En début ou en fin de saison, le
 * côté qui manque est compensé sur l'autre — on affiche 20 colonnes tant qu'il y a 20 séances,
 * plutôt qu'une grille à moitié vide.
 */
export function initialSessionWindow(sessions: { date: string }[], today: string): SessionWindow {
  const total = sessions.length;
  if (!total) return { start: 0, end: 0 };
  const pivot = pivotSessionIndex(sessions, today);
  let start = pivot - WINDOW_BEFORE;
  let end   = start + WINDOW_SIZE;
  if (start < 0) { start = 0; end = Math.min(total, WINDOW_SIZE); }
  if (end > total) { end = total; start = Math.max(0, end - WINDOW_SIZE); }
  return { start, end };
}

/** Étend la fenêtre d'un lot vers le passé ou vers l'avenir, sans jamais sortir de la liste. */
export function expandSessionWindow(
  window: SessionWindow,
  total: number,
  direction: 'before' | 'after',
  step = WINDOW_SIZE,
): SessionWindow {
  return direction === 'before'
    ? { start: Math.max(0, window.start - step), end: window.end }
    : { start: window.start, end: Math.min(total, window.end + step) };
}

/** Fenêtre qui contient la séance visée, en gardant la taille d'une fenêtre initiale. */
export function windowAround(index: number, total: number): SessionWindow {
  let start = Math.max(0, index - WINDOW_BEFORE);
  let end   = Math.min(total, start + WINDOW_SIZE);
  start = Math.max(0, end - WINDOW_SIZE);
  return { start, end };
}
