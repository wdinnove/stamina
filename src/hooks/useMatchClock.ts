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

/**
 * Chrono de match interne : purement une convenance de saisie, jamais persisté tel quel — seuls
 * `quarter`/`gameTimeSeconds` sont écrits sur les lignes de rotation/action au moment où elles
 * sont créées. Un rechargement de page remet donc le chrono à zéro, l'historique déjà enregistré
 * n'est pas affecté (limitation connue de la v1, pas un bug).
 */
export function useMatchClock(): MatchClock {
  const [quarter, setQuarter] = useState(1);
  const [running, setRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [periodDurationSeconds, setPeriodDurationSeconds] = useState(DEFAULT_PERIOD_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
