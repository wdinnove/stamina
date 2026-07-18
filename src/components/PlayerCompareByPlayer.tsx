import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { filterControlStyle, GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { EmptyState } from './EmptyState';
import { PlayerCompareStatBlocks } from './PlayerCompareStatBlocks';
import { StatDisplayToggle } from './StatDisplayToggle';
import { playerNameFull } from '../utils/playerName';
import type { PlayerCrossData } from '../data/crossAnalysis';

interface Props {
  /** Si fourni, verrouille le groupe A sur ce joueur (usage depuis la page d'un joueur précis).
   *  Sinon, les deux groupes sont librement sélectionnables (usage depuis une page équipe). */
  currentPlayerId?: string;
  roster: PlayerCrossData[];
}

export function PlayerCompareByPlayer({ currentPlayerId, roster }: Props) {
  const locked = !!currentPlayerId;
  // Pas de présélection en Groupe B (ni en Groupe A quand rien n'est verrouillé) : à
  // l'utilisateur de choisir les joueurs à comparer.
  const [aId, setAId] = useState<string>(currentPlayerId ?? '');
  const [bId, setBId] = useState<string>('');
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');

  if (roster.length < 2) {
    return <EmptyState message="Il faut au moins deux joueurs dans l'effectif pour comparer." />;
  }

  const a = roster.find(r => r.player.id === aId);
  const b = roster.find(r => r.player.id === bId);
  const aOptions = roster.filter(r => r.player.id !== bId);
  const bOptions = roster.filter(r => r.player.id !== aId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <GroupPickerBox color={GROUP_A_COLOR}>
            {locked ? (
              <select value={aId} disabled style={{ ...filterControlStyle, opacity: 0.7, cursor: 'default' }}>
                <option value={aId}>{a ? playerNameFull(a.player) : ''}</option>
              </select>
            ) : (
              <select value={aId} onChange={e => setAId(e.target.value)} style={filterControlStyle}>
                <option value="">Choisir un joueur</option>
                {aOptions.map(r => <option key={r.player.id} value={r.player.id}>{playerNameFull(r.player)}</option>)}
              </select>
            )}
          </GroupPickerBox>
          <GroupPickerBox color={GROUP_B_COLOR}>
            <select value={bId} onChange={e => setBId(e.target.value)} style={filterControlStyle}>
              <option value="">Choisir un joueur</option>
              {bOptions.map(r => <option key={r.player.id} value={r.player.id}>{playerNameFull(r.player)}</option>)}
            </select>
          </GroupPickerBox>
        </div>
      </Card>

      {/* teamStatsByMatchId (issu de usePerformanceData, commun à tout le roster) couvre TOUS les
          matchs de la saison/équipe en cours — contrairement à un teamStatsMap construit
          uniquement à partir de l'historique d'un seul joueur, qui aurait des trous sur les
          matchs joués par l'autre joueur (blessure, arrivée en cours de saison…). */}
      <PlayerCompareStatBlocks
        a={{
          label: a ? playerNameFull(a.player) : 'groupe A',
          matchStats: a?.matchStats ?? [],
          rpe: a?.rpe ?? [],
          wellness: a?.wellness ?? [],
        }}
        b={{
          label: b ? playerNameFull(b.player) : 'groupe B',
          matchStats: b?.matchStats ?? [],
          rpe: b?.rpe ?? [],
          wellness: b?.wellness ?? [],
        }}
        teamStatsMap={a?.teamStatsByMatchId ?? b?.teamStatsByMatchId ?? new Map()}
        display={display}
      />
    </div>
  );
}
