import { useState, useRef, useEffect, useCallback } from 'react';

/** 10 minutes — durée standard FFBB d'un quart-temps senior. Réglable dans l'écran (8/10/12 min
 *  pour coller aux autres catégories) ; les prolongations gardent la même durée en v1, une
 *  simplification assumée (le vrai chrono de table de marque fait foi si besoin d'un écart). */
const DEFAULT_PERIOD_SECONDS = 10 * 60;

export interface MatchClock {
  quarter: number;
  running: boolean;
  /** Secondes écoulées depuis le début du quart-temps courant — ce qui est stocké en base
   *  (`gameTimeSeconds`) : une différence entre deux actions donne directement une durée. */
  elapsedSeconds: number;
  /** Temps restant affiché à l'écran — ce que montre la table de marque. Dérivé, jamais stocké. */
  remainingSeconds: number;
  periodDurationSeconds: number;
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
  const [elapsedSeconds, setElapsedSeconds] = useState(stored?.elapsedSeconds ?? 0);
  const [periodDurationSeconds, setPeriodDurationSeconds] = useState(stored?.periodDurationSeconds ?? DEFAULT_PERIOD_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!matchId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify({ quarter, elapsedSeconds, periodDurationSeconds }));
    } catch { /* quota ou navigation privée : le chrono reste utilisable, il ne survivra pas au rechargement */ }
  }, [matchId, quarter, elapsedSeconds, periodDurationSeconds]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const remainingSeconds = Math.max(0, periodDurationSeconds - elapsedSeconds);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

  const adjustRemaining = useCallback((delta: number) => {
    setElapsedSeconds(s => Math.max(0, s - delta));
  }, []);

  const setRemaining = useCallback((seconds: number) => {
    setElapsedSeconds(Math.max(0, periodDurationSeconds - Math.max(0, Math.round(seconds))));
  }, [periodDurationSeconds]);

  const setPeriodDuration = useCallback((seconds: number) => setPeriodDurationSeconds(Math.max(60, Math.round(seconds))), []);

  const nextPeriod = useCallback(() => {
    setRunning(false);
    setElapsedSeconds(0);
    setQuarter(q => q + 1);
  }, []);

  const previousPeriod = useCallback(() => {
    setRunning(false);
    setElapsedSeconds(0);
    setQuarter(q => Math.max(1, q - 1));
  }, []);

  return {
    quarter, running, elapsedSeconds, remainingSeconds, periodDurationSeconds,
    setPeriodDuration, start, pause, adjustRemaining, setRemainingSeconds: setRemaining, nextPeriod, previousPeriod,
  };
}
