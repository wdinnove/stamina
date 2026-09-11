import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchEventsApi } from '../api/matchEvents';
import { matchLiveApi } from '../api/matchLive';
import type { MatchEvent, MatchLineupEvent, MatchOpponentPlayer } from '../data/types';

/**
 * Lecture seule du flux de saisie d'un match — pour les onglets d'analyse, qui n'écrivent rien.
 *
 * `match_events` n'existe que pour les matchs pointés dans l'application : un match importé par
 * feuille de marque n'en a aucun. `hasData` le dit explicitement plutôt que de laisser un écran
 * vide faire croire à un bug.
 */
export interface MatchTracking {
  events: MatchEvent[];
  lineupEvents: MatchLineupEvent[];
  opponents: MatchOpponentPlayer[];
  /** Repère « fin » pour les calculs de temps : le dernier instant réellement enregistré.
   *  Le match n'a pas de buzzer en base — la dernière action fait donc office de fin, ce qui
   *  sous-estime le dernier passage sur le terrain du temps écoulé depuis elle. */
  lastQuarter: number;
  lastElapsedSeconds: number;
  hasData: boolean;
  loading: boolean;
  error: string;
  reload: () => void;
}

export function useMatchTracking(matchId: string): MatchTracking {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineupEvents, setLineupEvents] = useState<MatchLineupEvent[]>([]);
  const [opponents, setOpponents] = useState<MatchOpponentPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [evts, lineups, opps] = await Promise.all([
        matchEventsApi.getByMatchId(matchId),
        matchLiveApi.getLineupEvents(matchId),
        matchLiveApi.getOpponentPlayers(matchId),
      ]);
      setEvents(evts);
      setLineupEvents(lineups);
      setOpponents(opps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  const { lastQuarter, lastElapsedSeconds } = useMemo(() => {
    let q = 1, s = 0;
    for (const e of [...events, ...lineupEvents]) {
      if (e.quarter > q || (e.quarter === q && e.gameTimeSeconds > s)) {
        q = e.quarter;
        s = e.gameTimeSeconds;
      }
    }
    return { lastQuarter: q, lastElapsedSeconds: s };
  }, [events, lineupEvents]);

  return {
    events, lineupEvents, opponents,
    lastQuarter, lastElapsedSeconds,
    hasData: events.length > 0,
    loading, error, reload: load,
  };
}
