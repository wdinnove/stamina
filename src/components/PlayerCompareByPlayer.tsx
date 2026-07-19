import { useState } from 'react';
import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { PeriodFields, useDateRange } from './DateRangeCard';
import { filterControlStyle, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
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
  seasonStart?: string;
  seasonEnd?: string;
}

/** Boîte de groupe à 2 lignes (joueur + période) — variante de GroupPickerBox (qui est à hauteur
 * fixe, une seule ligne) pour cet onglet, seul à avoir besoin d'un filtre de période par groupe. */
function PlayerGroupBox({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div style={{
      flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8,
      border: `1px solid ${color}40`, borderRadius: 8, padding: '10px 12px',
    }}>
      {children}
    </div>
  );
}

export function PlayerCompareByPlayer({ currentPlayerId, roster, seasonStart, seasonEnd }: Props) {
  const locked = !!currentPlayerId;
  // Pas de présélection en Groupe B (ni en Groupe A quand rien n'est verrouillé) : à
  // l'utilisateur de choisir les joueurs à comparer.
  const [aId, setAId] = useState<string>(currentPlayerId ?? '');
  const [bId, setBId] = useState<string>('');
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');
  // Filtre de période par groupe — saison entière par défaut, ajustable indépendamment pour
  // chaque joueur (ex. comparer la forme récente de B à la saison complète de A).
  const rangeA = useDateRange(seasonStart, 'saison', seasonEnd);
  const rangeB = useDateRange(seasonStart, 'saison', seasonEnd);

  if (roster.length < 2) {
    return <EmptyState message="Il faut au moins deux joueurs dans l'effectif pour comparer." />;
  }

  const a = roster.find(r => r.player.id === aId);
  const b = roster.find(r => r.player.id === bId);
  const aOptions = roster.filter(r => r.player.id !== bId);
  const bOptions = roster.filter(r => r.player.id !== aId);

  const inRangeA = (iso: string) => iso >= rangeA.from && iso <= rangeA.to;
  const inRangeB = (iso: string) => iso >= rangeB.from && iso <= rangeB.to;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PlayerGroupBox color={GROUP_A_COLOR}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: GROUP_A_COLOR, flexShrink: 0 }} />
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
            </div>
            <PeriodFields
              from={rangeA.from} to={rangeA.to} preset={rangeA.preset}
              onPreset={p => rangeA.applyPreset(p, seasonStart, seasonEnd)} onFrom={rangeA.setFrom} onTo={rangeA.setTo}
            />
          </PlayerGroupBox>
          <PlayerGroupBox color={GROUP_B_COLOR}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: GROUP_B_COLOR, flexShrink: 0 }} />
              <select value={bId} onChange={e => setBId(e.target.value)} style={filterControlStyle}>
                <option value="">Choisir un joueur</option>
                {bOptions.map(r => <option key={r.player.id} value={r.player.id}>{playerNameFull(r.player)}</option>)}
              </select>
            </div>
            <PeriodFields
              from={rangeB.from} to={rangeB.to} preset={rangeB.preset}
              onPreset={p => rangeB.applyPreset(p, seasonStart, seasonEnd)} onFrom={rangeB.setFrom} onTo={rangeB.setTo}
            />
          </PlayerGroupBox>
        </div>
      </Card>

      {/* teamStatsByMatchId (issu de usePerformanceData, commun à tout le roster) couvre TOUS les
          matchs de la saison/équipe en cours — contrairement à un teamStatsMap construit
          uniquement à partir de l'historique d'un seul joueur, qui aurait des trous sur les
          matchs joués par l'autre joueur (blessure, arrivée en cours de saison…). */}
      <PlayerCompareStatBlocks
        a={{
          label: a ? playerNameFull(a.player) : 'groupe A',
          matchStats: (a?.matchStats ?? []).filter(m => inRangeA(m.date)),
          rpe: (a?.rpe ?? []).filter(e => inRangeA(e.date)),
          wellness: (a?.wellness ?? []).filter(w => inRangeA(w.date)),
        }}
        b={{
          label: b ? playerNameFull(b.player) : 'groupe B',
          matchStats: (b?.matchStats ?? []).filter(m => inRangeB(m.date)),
          rpe: (b?.rpe ?? []).filter(e => inRangeB(e.date)),
          wellness: (b?.wellness ?? []).filter(w => inRangeB(w.date)),
        }}
        teamStatsMap={a?.teamStatsByMatchId ?? b?.teamStatsByMatchId ?? new Map()}
        display={display}
      />
    </div>
  );
}
