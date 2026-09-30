import { useState, useEffect, useMemo, useCallback } from 'react';
import { matchEventsApi } from '../api/matchEvents';
import { matchLiveApi } from '../api/matchLive';
import { lineupStatsFromEvents, isMilestoneEvent, lastTrackedInstant } from '../data/matchEvents';
import { LineupComboTable } from './MatchLineupsPanel';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player, MatchEvent, MatchLineupEvent } from '../data/types';

/**
 * Lineups sur PLUSIEURS matchs : chaque match est mesuré à part (sa durée de quart-temps, sa fin),
 * puis les mêmes cinq sont cumulés. Notre équipe seulement — les identifiants adverses sont propres
 * à chaque match, cf. `SeasonShotChartPanel`.
 */

export interface SeasonLineupsPanelProps {
  /** Matchs déjà filtrés par la page (période, amicaux). */
  matches: Match[];
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

/** Seuils plus larges qu'en match : sur une saison, 30 s ensemble ne disent rien. */
const SEASON_MIN_PRESETS = [0, 60, 300, 600] as const;

export function SeasonLineupsPanel({ matches, players }: SeasonLineupsPanelProps) {
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

  /** Une liste de cinq par match suivi : chaque match est mesuré à part, le cumul se fait ensuite. */
  const matchFives = useMemo(() => matches.map(m => {
    const raw = events.filter(e => e.matchId === m.id);
    const lineups = lineupEvents.filter(l => l.matchId === m.id);
    const { lastQuarter, lastElapsedSeconds } = lastTrackedInstant(raw, lineups);
    return lineupStatsFromEvents(
      raw.filter(e => !isMilestoneEvent(e.type)), lineups, 'us',
      m.periodDurationSeconds, lastQuarter, lastElapsedSeconds,
    );
  }).filter(rows => rows.length > 0), [matches, events, lineupEvents]);
  const trackedMatches = matchFives.length;

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const nameOf = useCallback((id: string) => nameById.get(id) ?? '?', [nameById]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement des lineups…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (trackedMatches === 0) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune rotation suivie sur cette période.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les lineups viennent de l'onglet <strong style={{ color: '#CBD5E1' }}>Prise statistiques</strong> d'un match.
          Les matchs importés par feuille de marque n'en contiennent pas : la feuille ne dit pas qui était
          sur le terrain à chaque action.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        Cumul sur {trackedMatches} match{trackedMatches > 1 ? 's' : ''} saisi{trackedMatches > 1 ? 's' : ''} en
        direct, parmi les {matches.length} de la période.
      </p>
      <LineupComboTable matchFives={matchFives} nameOf={nameOf} minPresets={SEASON_MIN_PRESETS} />
    </div>
  );
}
