import { useMemo, useCallback } from 'react';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { ShotChartExplorer, type ShotAuthor } from './ShotChartExplorer';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player, LineupSide } from '../data/types';

/**
 * Grille de tir d'UN match. Le rendu et les filtres vivent dans `ShotChartExplorer`, partagé avec
 * la vue saison ; il ne reste ici que le chargement et la résolution des noms.
 *
 * Un match importé par feuille de marque n'aura jamais de grille : la feuille ne contient pas
 * l'endroit d'où chaque tir a été pris. L'état vide le dit plutôt que de laisser un écran blanc.
 */

export interface MatchShotChartPanelProps {
  match: Match;
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

export function MatchShotChartPanel({ match, players }: MatchShotChartPanelProps) {
  const { selected } = useTeamSeason();
  const teamColor    = selected?.team.color ?? '#00E5A0';
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';

  const { events, opponents, hasData, loading, error } = useMatchTracking(match.id);

  /** Seuls les auteurs ayant RÉELLEMENT tiré : un joueur sans tir dans le sélecteur est une
   *  impasse, on le choisit pour tomber sur un terrain vide. */
  const authors = useCallback((side: LineupSide): ShotAuthor[] => {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.side !== side || e.type !== 'shot' || e.x === undefined) continue;
      const id = side === 'us' ? e.playerId : e.opponentPlayerId;
      if (id) ids.add(id);
    }
    const nameOf = side === 'us'
      ? (id: string) => { const p = players.find(x => x.id === id); return p ? playerNameShort(p) : '?'; }
      : (id: string) => opponents.find(x => x.id === id)?.name ?? '?';
    return [...ids].map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [events, players, opponents]);

  const shotCount = useMemo(() => events.filter(e => e.type === 'shot').length, [events]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (!hasData || shotCount === 0) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucun tir saisi pour ce match.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les positions de tir se posent sur le terrain depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Saisie des stats</strong>.
          Un match importé par feuille de marque n'en aura jamais : la feuille de marque ne contient pas
          l'endroit d'où chaque tir a été pris.
        </p>
      </div>
    );
  }

  return (
    <ShotChartExplorer
      events={events}
      usLabel={ourTeamName} themLabel={opponentName} teamColor={teamColor}
      authors={authors} showQuarterFilter
    />
  );
}
