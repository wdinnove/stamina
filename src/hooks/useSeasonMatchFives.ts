import { useState, useEffect, useMemo } from 'react';
import { matchEventsApi } from '../api/matchEvents';
import { matchLiveApi } from '../api/matchLive';
import { lineupStatsFromEvents, isMilestoneEvent, lastTrackedInstant, type EventLineupRow } from '../data/matchEvents';
import type { Match, MatchEvent, MatchLineupEvent } from '../data/types';

/**
 * Cinq de notre équipe, match par match, sur plusieurs matchs — la base des onglets Lineups et
 * Affinités de l'analyse collective. Chaque match est mesuré à part (sa durée de quart-temps, sa
 * fin), le cumul se fait ensuite. Les matchs sans rotation suivie sont écartés.
 */
export function useSeasonMatchFives(matches: Match[]) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineupEvents, setLineupEvents] = useState<MatchLineupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Clé stable : la liste de matchs est recalculée à chaque rendu de la page parente.
  const matchIdsKey = matches.map(m => m.id).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const ids = matchIdsKey ? matchIdsKey.split(',') : [];
    setLoading(true);
    setError('');
    Promise.all([matchEventsApi.getByMatchIds(ids), matchLiveApi.getLineupEventsByMatchIds(ids)])
      .then(([evts, lineups]) => { if (!cancelled) { setEvents(evts); setLineupEvents(lineups); } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matchIdsKey]);

  const matchFives: EventLineupRow[][] = useMemo(() => matches.map(m => {
    const raw = events.filter(e => e.matchId === m.id);
    const lineups = lineupEvents.filter(l => l.matchId === m.id);
    const { lastQuarter, lastElapsedSeconds } = lastTrackedInstant(raw, lineups);
    return lineupStatsFromEvents(
      raw.filter(e => !isMilestoneEvent(e.type)), lineups, 'us',
      m.periodDurationSeconds, lastQuarter, lastElapsedSeconds,
    );
  }).filter(rows => rows.length > 0), [matches, events, lineupEvents]);

  return { matchFives, loading, error };
}
