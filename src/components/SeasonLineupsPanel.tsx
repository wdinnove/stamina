import { useMemo, useCallback } from 'react';
import { useSeasonMatchFives } from '../hooks/useSeasonMatchFives';
import { LineupComboTable } from './MatchLineupsPanel';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player } from '../data/types';

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
  const { matchFives, loading, error } = useSeasonMatchFives(matches);
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
