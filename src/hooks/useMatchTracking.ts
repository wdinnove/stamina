import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchEventsApi } from '../api/matchEvents';
import { matchLiveApi } from '../api/matchLive';
import { isMilestoneEvent } from '../data/matchEvents';
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
  const [rawEvents, setRawEvents] = useState<MatchEvent[]>([]);
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
      setRawEvents(evts);
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
    // Les repères « fin de quart-temps »/« fin de match » comptent ICI : c'est justement ce qui
    // permet de dater la vraie fin du match plutôt que de la sous-estimer à la dernière action.
    for (const e of [...rawEvents, ...lineupEvents]) {
      if (e.quarter > q || (e.quarter === q && e.gameTimeSeconds > s)) {
        q = e.quarter;
        s = e.gameTimeSeconds;
      }
    }
    return { lastQuarter: q, lastElapsedSeconds: s };
  }, [rawEvents, lineupEvents]);

  /** Les repères de fin ne sont PAS des actions : les onglets de lecture (courbe, QT par QT,
   *  grille de tir, lineups) ne doivent ni les afficher ni les compter — ils n'existent que pour
   *  dater la fin du match, déjà exploité ci-dessus. */
  const events = useMemo(() => rawEvents.filter(e => !isMilestoneEvent(e.type)), [rawEvents]);

  return {
    events, lineupEvents, opponents,
    lastQuarter, lastElapsedSeconds,
    hasData: events.length > 0,
    loading, error, reload: load,
  };
}
