import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import {
  elapsedAt, isExpired, freeze, seek, parseClockInput,
  type ClockPosition,
} from '../data/matchClock';

export { parseClockInput };

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
 * Le temps se DÉDUIT de l'horloge murale (`data/matchClock.ts`), il ne se compte pas en tics : un
 * onglet en arrière-plan ou un appareil endormi ne fait plus prendre de retard au chrono. Et il
 * s'ARRÊTE à la fin du quart-temps, au lieu de continuer derrière un affichage figé à 00:00.
 *
 * Sa POSITION est conservée en `localStorage`, par match, et les deux écrans du direct passent le
 * même id : ils partagent donc le même chrono, et un rechargement en plein match le retrouve.
 * Le chrono revient toujours EN PAUSE — le temps passé hors de l'écran n'est pas du temps de jeu.
 */
export function useMatchClock(matchId?: string): MatchClock {
  const [quarter, setQuarter] = useState(() => readStored(matchId)?.quarter ?? 1);
  const [running, setRunning] = useState(false);
  const [periodDurationSeconds, setPeriodDurationSeconds] = useState(
    () => readStored(matchId)?.periodDurationSeconds ?? DEFAULT_PERIOD_SECONDS,
  );

  /** Position courante : base figée + instant de départ. Une ref, pour que la seconde qui avance
   *  ne rende rien. */
  const posRef = useRef<ClockPosition>({ baseSeconds: readStored(matchId)?.elapsedSeconds ?? 0, startedAt: null });
  const [coarseElapsed, setCoarseElapsed] = useState(() => coarse(posRef.current.baseSeconds));

  const listeners = useRef(new Set<() => void>()).current;
  const periodRef = useRef(periodDurationSeconds);
  periodRef.current = periodDurationSeconds;

  const notify = useCallback(() => {
    const value = elapsedAt(posRef.current, Date.now(), periodRef.current);
    for (const fn of listeners) fn();
    setCoarseElapsed(prev => (coarse(value) === prev ? prev : coarse(value)));
  }, [listeners]);

  const getElapsedSeconds = useCallback(() => elapsedAt(posRef.current, Date.now(), periodRef.current), []);

  /**
   * Changer de match SANS démonter l'écran (lien d'un match vers un autre, notification) laissait
   * le chrono du match précédent en place — et l'écrivait ensuite sous la clé du nouveau match.
   */
  useEffect(() => {
    const restored = readStored(matchId);
    posRef.current = { baseSeconds: restored?.elapsedSeconds ?? 0, startedAt: null };
    setRunning(false);
    setQuarter(restored?.quarter ?? 1);
    setPeriodDurationSeconds(restored?.periodDurationSeconds ?? DEFAULT_PERIOD_SECONDS);
    setCoarseElapsed(coarse(posRef.current.baseSeconds));
    for (const fn of listeners) fn();
  }, [matchId, listeners]);

  // Le tic ne COMPTE plus le temps, il ne fait que rafraîchir l'affichage : sa régularité n'a donc
  // aucune importance, et un onglet bridé en arrière-plan ne fausse plus rien.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (isExpired(posRef.current, Date.now(), periodRef.current)) {
        posRef.current = freeze(posRef.current, Date.now(), periodRef.current);
        setRunning(false);   // fin du quart-temps : le chrono s'arrête pour de bon
      }
      notify();
    }, 1000);
    return () => clearInterval(id);
  }, [running, notify]);

  // La position persistée suit la valeur GROSSIÈRE pendant la marche, et l'arrêt la fige à la
  // seconde : écrire dans localStorage à chaque seconde coûterait plus cher que tout ce qu'on
  // vient d'économiser.
  useEffect(() => {
    if (!matchId) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + matchId, JSON.stringify({
        quarter,
        elapsedSeconds: elapsedAt(posRef.current, Date.now(), periodDurationSeconds),
        periodDurationSeconds,
      }));
    } catch { /* quota ou navigation privée : le chrono reste utilisable, il ne survivra pas au rechargement */ }
  }, [matchId, quarter, coarseElapsed, periodDurationSeconds, running]);

  const subscribeSeconds = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, [listeners]);

  const start = useCallback(() => {
    const now = Date.now();
    if (isExpired(posRef.current, now, periodRef.current)) return;  // rien à relancer à 00:00
    posRef.current = { baseSeconds: elapsedAt(posRef.current, now, periodRef.current), startedAt: now };
    setRunning(true);
    notify();
  }, [notify]);

  const pause = useCallback(() => {
    posRef.current = freeze(posRef.current, Date.now(), periodRef.current);
    setRunning(false);
    notify();
  }, [notify]);

  const moveTo = useCallback((elapsedSeconds: number) => {
    posRef.current = seek(posRef.current, elapsedSeconds, Date.now(), periodRef.current);
    notify();
  }, [notify]);

  const adjustRemaining = useCallback((delta: number) => {
    moveTo(elapsedAt(posRef.current, Date.now(), periodRef.current) - delta);
  }, [moveTo]);

  const setRemaining = useCallback((seconds: number) => {
    moveTo(periodRef.current - Math.max(0, Math.round(seconds)));
  }, [moveTo]);

  const setPeriodDuration = useCallback((seconds: number) => {
    setPeriodDurationSeconds(Math.max(60, Math.round(seconds)));
  }, []);

  const resetTo = useCallback((next: (q: number) => number) => {
    posRef.current = { baseSeconds: 0, startedAt: null };
    setRunning(false);
    setQuarter(next);
    setCoarseElapsed(0);
    notify();
  }, [notify]);

  const nextPeriod = useCallback(() => resetTo(q => q + 1), [resetTo]);
  const previousPeriod = useCallback(() => resetTo(q => Math.max(1, q - 1)), [resetTo]);

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
