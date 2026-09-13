/**
 * Position du chrono de match — fonctions pures, aucune horloge interne.
 *
 * Le temps se DÉDUIT de l'horloge murale, il ne se compte pas en tics. Un `setInterval` de une
 * seconde est bridé par le navigateur dès que l'onglet passe en arrière-plan (une fois par minute
 * au lieu de soixante), et ne tourne pas du tout pendant que l'appareil dort. Une tablette posée
 * écran éteint pendant un temps mort perdait ainsi des minutes entières de match, et toutes les
 * actions pointées ensuite étaient datées faux — y compris les minutes publiées dans `match_stats`.
 *
 * Le tic ne sert donc plus qu'à RAFRAÎCHIR l'affichage ; sa régularité n'a plus d'importance.
 */

export interface ClockPosition {
  /** Secondes écoulées figées au dernier arrêt. */
  baseSeconds: number;
  /** `Date.now()` du démarrage. `null` quand le chrono est à l'arrêt. */
  startedAt: number | null;
}

export const PAUSED_AT_ZERO: ClockPosition = { baseSeconds: 0, startedAt: null };

/**
 * Secondes écoulées à l'instant `now`, BORNÉES au quart-temps.
 *
 * La borne haute est le correctif central : sans elle le chrono continuait au-delà de 00:00 — la
 * table de marque affichait bien zéro (l'affichage écrêtait), mais les actions suivantes étaient
 * enregistrées avec un `gameTimeSeconds` supérieur à la durée d'un quart-temps. Elles basculaient
 * alors dans le quart-temps suivant sur l'axe de temps continu, et gonflaient le temps de jeu de
 * tout le cinq présent.
 */
export function elapsedAt(pos: ClockPosition, now: number, periodDurationSeconds: number): number {
  const raw = pos.startedAt === null
    ? pos.baseSeconds
    : pos.baseSeconds + (now - pos.startedAt) / 1000;
  return Math.min(periodDurationSeconds, Math.max(0, Math.floor(raw)));
}

/** Vrai quand le quart-temps est écoulé : l'appelant doit alors arrêter le chrono. */
export function isExpired(pos: ClockPosition, now: number, periodDurationSeconds: number): boolean {
  return elapsedAt(pos, now, periodDurationSeconds) >= periodDurationSeconds;
}

/** Fige la position courante — pause, correction manuelle, changement de quart-temps. */
export function freeze(pos: ClockPosition, now: number, periodDurationSeconds: number): ClockPosition {
  return { baseSeconds: elapsedAt(pos, now, periodDurationSeconds), startedAt: null };
}

/**
 * Déplace le chrono à une position donnée, en conservant son état de marche : corriger le temps
 * pendant que le chrono tourne ne doit pas l'arrêter, sinon chaque recalage sur la table de marque
 * officielle demande de le relancer à la main.
 */
export function seek(
  pos: ClockPosition,
  elapsedSeconds: number,
  now: number,
  periodDurationSeconds: number,
): ClockPosition {
  const base = Math.min(periodDurationSeconds, Math.max(0, Math.round(elapsedSeconds)));
  return { baseSeconds: base, startedAt: pos.startedAt === null ? null : now };
}

/** Temps AFFICHÉ, en décompte — ce que montre la table de marque. */
export function remainingAt(pos: ClockPosition, now: number, periodDurationSeconds: number): number {
  return Math.max(0, periodDurationSeconds - elapsedAt(pos, now, periodDurationSeconds));
}

/**
 * Lit un temps saisi à la main dans le chrono. Accepte `mm:ss`, `m:ss` et un nombre seul de
 * secondes ; rend `null` sur une saisie illisible, pour que l'appelant garde la valeur précédente
 * plutôt que d'écrire un temps inventé.
 */
export function parseClockInput(raw: string): number | null {
  const value = raw.trim();
  const mmss = value.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  if (/^\d{1,4}$/.test(value)) return Number(value);
  return null;
}
