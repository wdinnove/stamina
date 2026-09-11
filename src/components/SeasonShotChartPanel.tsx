import { useState, useEffect, useCallback, useMemo } from 'react';
import { matchEventsApi } from '../api/matchEvents';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { ShotChartExplorer, type ShotAuthor } from './ShotChartExplorer';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player, MatchEvent, LineupSide } from '../data/types';

/**
 * Grille de tir sur PLUSIEURS matchs — c'est là que la carte devient une information de coaching :
 * dix tirs d'un match ne disent rien, deux cents d'une demi-saison dessinent un profil.
 *
 * Côté adverse, aucun joueur n'est sélectionnable : les identifiants adverses sont propres à
 * chaque match (saisis à la volée), et deux « Camille D. » de deux clubs ne sont pas la même
 * personne. Les tirs encaissés restent agrégés, ce qui est justement la lecture utile — d'où
 * l'adversaire nous marque.
 */

export interface SeasonShotChartPanelProps {
  /** Matchs déjà filtrés par la page (période, amicaux) — la carte suit exactement la sélection. */
  matches: Match[];
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

export function SeasonShotChartPanel({ matches, players }: SeasonShotChartPanelProps) {
  const { selected } = useTeamSeason();
  const teamColor   = selected?.team.color ?? '#00E5A0';
  const ourTeamName = selected?.team.name ?? 'Notre équipe';

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Clé stable : la liste de matchs est recalculée à chaque rendu de la page parente, la comparer
  // par référence relancerait la requête en boucle.
  const matchIdsKey = matches.map(m => m.id).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    const ids = matchIdsKey ? matchIdsKey.split(',') : [];
    setLoading(true);
    setError('');
    matchEventsApi.getByMatchIds(ids)
      .then(rows => { if (!cancelled) setEvents(rows); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [matchIdsKey]);

  const authors = useCallback((side: LineupSide): ShotAuthor[] => {
    if (side === 'them') return [];
    const ids = new Set<string>();
    for (const e of events) {
      if (e.side !== 'us' || e.type !== 'shot' || e.x === undefined || !e.playerId) continue;
      ids.add(e.playerId);
    }
    return [...ids]
      .map(id => {
        const p = players.find(x => x.id === id);
        return { id, name: p ? playerNameShort(p) : '?' };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events, players]);

  const trackedMatches = useMemo(() => new Set(events.map(e => e.matchId)).size, [events]);
  const shotCount = useMemo(() => events.filter(e => e.type === 'shot').length, [events]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement des tirs…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (shotCount === 0) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucun tir positionné sur cette période.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les positions de tir viennent de l'onglet <strong style={{ color: '#CBD5E1' }}>Saisie des stats</strong> d'un match.
          Les matchs importés par feuille de marque n'en contiennent pas : la feuille ne dit pas d'où
          chaque tir a été pris.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        {shotCount} tir{shotCount > 1 ? 's' : ''} sur {trackedMatches} match{trackedMatches > 1 ? 's' : ''} saisi
        {trackedMatches > 1 ? 's' : ''} en direct, parmi les {matches.length} de la période.
      </p>
      <ShotChartExplorer
        events={events}
        usLabel={ourTeamName} themLabel="Adversaires" teamColor={teamColor}
        authors={authors}
      />
    </div>
  );
}
