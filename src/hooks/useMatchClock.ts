import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';

/** 10 minutes — durée standard FFBB d'un quart-temps senior. Réglable dans l'écran (8/10/12 min
 *  pour coller aux autres catégories) ; les prolongations gardent la même durée en v1, une
 *  simplification assumée (le vrai chrono de table de marque fait foi si besoin d'un écart). */
const DEFAULT_PERIOD_SECONDS = 10 * 60;

/** Durées usuelles en club (FFBB) — 8 min pour les jeunes catégories, 10 en senior, 12 en
 *  municipal/loisir. Purement indicatif : le chrono de la table de marque fait foi. */
export const PERIOD_PRESETS_MIN = [8, 10, 12] as const;

/**
 * Granularité du `elapsedSeconds` EXPOSÉ EN ÉTAT. Le chrono avance à la seconde, mais republier
 * cette seconde dans l'état React re-rendait tout l'écran de saisie — palette, deux effectifs,
 * historique — soixante fois par minute, sous le doigt de qui pointe.
 *
 * Les consommateurs de cette valeur sont des agrégations (minutes de jeu, boxscore) auxquelles
 * cinq secondes de retard ne changent rien à l'écran. Qui a besoin de la seconde exacte prend
 * `getElapsedSeconds()` (au moment d'écrire une action) ou s'abonne via `useClockSeconds`
 * (l'affichage du chrono).
 */
const COARSE_SECONDS = 5;

export interface MatchClock {
  quarter: number;
  running: boolean;
  /** Secondes écoulées depuis le début du quart-temps, ARRONDIES à `COARSE_SECONDS`. C'est la
   *  valeur des agrégations, jamais celle qu'on écrit en base. */
  elapsedSeconds: number;
  periodDurationSeconds: number;
  /** Valeur EXACTE à la seconde — à lire au moment de créer une action ou une rotation, et à la
   *  publication. Ne déclenche aucun rendu. */
  getElapsedSeconds: () => number;
  /** S'abonne au tic de seconde. Réservé à l'affichage du chrono (cf. `useClockSeconds`). */
  subscribeSeconds: (fn: () => void) => () => void;
  setPeriodDuration: (seconds: number) => void;
  start: () => void;
  pause: () => void;
  /** Ajoute (positif) ou retire (négatif) du temps au chrono AFFICHÉ — le sens qu'attend un coach
   *  qui corrige un oubli de pause en comparant à la table de marque, pas au temps écoulé. */
  adjustRemaining: (deltaSeconds: number) => void;
  setRemainingSeconds: (seconds: number) => void;
  /** Passe au quart-temps (ou à la prolongation) suivant, chrono remis à la durée pleine et en
   *  pause — reprendre est un geste volontaire du coach, pas automatique. */
  nextPeriod: () => void;
  /** Revient au quart-temps précédent (jamais sous Q1) — même remise à la durée pleine, pour
   *  corriger un oubli de clic sans devoir tout refaire dans le mauvais quart. */
  previousPeriod: () => void;
}

/** Position du chrono conservée LOCALEMENT (jamais en base) sous cette clé plus l'id du match. */
const STORAGE_PREFIX = 'stamina.matchClock.';

interface StoredClock { quarter: number; elapsedSeconds: number; periodDurationSeconds: number }

function readStored(matchId?: string): StoredClock | null {
  if (!matchId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + matchId);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredClock>;
    if (typeof v.quarter !== 'number' || typeof v.elapsedSeconds !== 'number') return null;
    return {
      quarter: v.quarter,
      elapsedSeconds: v.elapsedSeconds,
      periodDurationSeconds: typeof v.periodDurationSeconds === 'number' ? v.periodDurationSeconds : DEFAULT_PERIOD_SECONDS,
    };
  } catch {
    return null;  // navigation privée, quota, JSON corrompu : on repart de Q1, jamais d'écran cassé
  }
}

/**
 * Chrono de match interne : une convenance de saisie, jamais écrite en base — seuls
 * `quarter`/`gameTimeSeconds` partent sur les lignes de rotation/action au moment où elles sont
 * créées.
 *
 * Sa POSITION est conservée en `localStorage` quand `matchId` est fourni, et les deux écrans du
 * direct passent le même id : ils partagent donc le même chrono, et un rechargement en plein
 * match le retrouve. Sans ça, on repartait à Q1 00:00 alors que les rotations étaient en Q3 —
 * l'intervalle en cours mesurait 0, et ces minutes-là sont publiées dans `match_stats`.
 *
 * Le chrono revient toujours EN PAUSE : reprendre est un geste volontaire, et le temps passé
 * hors de l'écran n'est pas du temps de jeu.
 */
export function useMatchClock(matchId?: string): MatchClock {
  const stored = useRef<StoredClock | null>(readStored(matchId)).current;

  const [quarter, setQuarter] = useState(stored?.quarter ?? 1);
  const [running, setRunning] = useState(false);
  const [periodDurationSeconds, setPeriodDurationSeconds] = useState(stored?.periodDurationSeconds ?? DEFAULT_PERIOD_SECONDS);

  /** Source de vérité du temps écoulé : une ref, pour que la seconde qui avance ne rende rien. */
  const elapsedRef = useRef(stored?.elapsedSeconds ?? 0);
  const [coarseElapsed, setCoarseElapsed] = useState(() => coarse(elapsedRef.current));

  const listeners = useRef(new Set<() => void>()).current;

  const setElapsed = useCallback((next: number) => {
    const value = Math.max(0, Math.round(next));
    elapsedRef.current = value;
    for (const fn of listeners) fn();
    setCoarseElapsed(prev => (coarse(value) === prev ? prev : coarse(value)));
  }, [listeners]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(elapsedRef.current + 1), 1000);
    return () => clearInterval(id);
  }, [running, setElapsed]);

  // La position persistée suit la valeur GROSSIÈRE : écrire dans localStorage à chaque seconde
  // coûterait plus cher que tout ce qu'on vient d'économiser, pour cinq secondes de précision au
  // rechargement.
  useEffect(() => {
    if (!matchId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify({
        quarter, elapsedSeconds: elapsedRef.current, periodDurationSeconds,
      }));
    } catch { /* quota ou navigation privée : le chrono reste utilisable, il ne survivra pas au rechargement */ }
  }, [matchId, quarter, coarseElapsed, periodDurationSeconds]);

  const getElapsedSeconds = useCallback(() => elapsedRef.current, []);

  const subscribeSeconds = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [listeners]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

  const adjustRemaining = useCallback((delta: number) => setElapsed(elapsedRef.current - delta), [setElapsed]);

  const setRemaining = useCallback((seconds: number) => {
    setElapsed(periodDurationSeconds - Math.max(0, Math.round(seconds)));
  }, [periodDurationSeconds, setElapsed]);

  const setPeriodDuration = useCallback((seconds: number) => setPeriodDurationSeconds(Math.max(60, Math.round(seconds))), []);

  const nextPeriod = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    setQuarter(q => q + 1);
  }, [setElapsed]);

  const previousPeriod = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    setQuarter(q => Math.max(1, q - 1));
  }, [setElapsed]);

  return {
    quarter, running, elapsedSeconds: coarseElapsed, periodDurationSeconds,
    getElapsedSeconds, subscribeSeconds,
    setPeriodDuration, start, pause, adjustRemaining, setRemainingSeconds: setRemaining, nextPeriod, previousPeriod,
  };
}

function coarse(seconds: number): number {
  return Math.floor(seconds / COARSE_SECONDS) * COARSE_SECONDS;
}

/**
 * Temps écoulé à la SECONDE, pour le seul composant qui l'affiche. Isoler l'abonnement ici est ce
 * qui permet au reste de l'écran de ne pas se re-rendre soixante fois par minute.
 */
export function useClockSeconds(clock: MatchClock): number {
  return useSyncExternalStore(clock.subscribeSeconds, clock.getElapsedSeconds, clock.getElapsedSeconds);
}
