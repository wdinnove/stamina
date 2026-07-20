import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PlayerAvatar } from './PlayerAvatar';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { IndicatorDef } from '../data/crossAnalysis';
import type { Player } from '../data/types';

export interface RankingRow {
  player: Player;
  /** Moyenne du facteur choisi sur la période (null si aucune donnée) */
  value: number | null;
  /** Minutes moyennes par match sur la période — toujours affichées, quel que soit le facteur choisi */
  avgMin: number | null;
  /** Évaluation moyenne sur la période — toujours affichée, quel que soit le facteur choisi */
  evalAvg: number | null;
}

interface PlayerRankingTableProps {
  rows: RankingRow[];
  def: IndicatorDef;
  /** Moyenne d'équipe du facteur choisi — affichée en repère sur chaque ligne (même valeur partout) */
  teamAvg: number | null;
  /** Stats recalculées comme si chaque joueur jouait 25 min (cf. bouton "25 min") */
  normalized25?: boolean;
  onOpenPlayer: (playerId: string) => void;
}

type SortKey = 'name' | 'position' | 'min' | 'eval' | 'value';
type SortDir = 'asc' | 'desc';

const TH: CSSProperties = {
  padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A',
  position: 'sticky', top: 0, backgroundColor: '#161920', zIndex: 1,
  cursor: 'pointer', userSelect: 'none' as const,
};
const THS: CSSProperties = { ...TH, cursor: 'default' };
const TD: CSSProperties = {
  padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
};

const si = (col: SortKey, key: SortKey, dir: SortDir) => key === col ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
const thC = (col: SortKey, key: SortKey) => key === col ? '#CBD5E1' : '#475569';

// Colonne "Cl." sticky elle aussi (avant "Joueur") — décalage explicite pour ne pas se chevaucher.
const RANK_WIDTH = 36;

function fmtValue(def: IndicatorDef, v: number): string {
  const num = def.key === 'acwr' ? v.toFixed(2)
    : (def.domain === 'wellness' || def.key === 'rpe' || def.key === 'tsb') ? v.toFixed(1)
    : String(Math.round(v * 10) / 10);
  const signed = def.key === 'tsb' && v > 0 ? `+${num}` : num;
  const label = def.valueLabel ? ` · ${def.valueLabel(v)}` : '';
  return `${signed}${label}`;
}

/** Classement des joueurs sur un facteur choisi, avec repères constants (minutes, éval) */
export function PlayerRankingTable({ rows, def, teamAvg, normalized25, onOpenPlayer }: PlayerRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc'); }
  };

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((x, y) => {
    switch (sortKey) {
      case 'name':     return `${x.player.lastName} ${x.player.firstName}`.localeCompare(`${y.player.lastName} ${y.player.firstName}`) * dir;
      case 'position': return (x.player.position ?? '').localeCompare(y.player.position ?? '') * dir;
      case 'min':      return ((x.avgMin ?? -Infinity) - (y.avgMin ?? -Infinity)) * dir;
      case 'eval':     return ((x.evalAvg ?? -Infinity) - (y.evalAvg ?? -Infinity)) * dir;
      case 'value':    return ((x.value ?? -Infinity) - (y.value ?? -Infinity)) * dir;
    }
  });

  if (!rows.length) {
    return <p style={{ color: '#64748B', fontSize: '0.8rem', margin: 0 }}>Aucun joueur sur ce filtre.</p>;
  }

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
      <style>{`
        @media (max-width: 639px) {
          .player-ranking-table th, .player-ranking-table td { padding: 10px 12px !important; }
        }
      `}</style>
      <table className="player-ranking-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
        <thead><tr>
          <th style={{ ...THS, width: RANK_WIDTH, position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#161920' }}>Cl.</th>
          <th onClick={() => toggleSort('name')} style={{ ...TH, textAlign: 'left', position: 'sticky', left: RANK_WIDTH, zIndex: 2, color: thC('name', sortKey) }}>
            Joueur{si('name', sortKey, sortDir)}
          </th>
          <th onClick={() => toggleSort('position')} style={{ ...TH, color: thC('position', sortKey) }}>Poste{si('position', sortKey, sortDir)}</th>
          <th onClick={() => toggleSort('min')} style={{ ...TH, color: normalized25 ? '#F59E0B' : thC('min', sortKey) }}>Min{si('min', sortKey, sortDir)}{normalized25 ? ' ⟳' : ''}</th>
          <th onClick={() => toggleSort('eval')} style={{ ...TH, color: thC('eval', sortKey) }}>Éval{si('eval', sortKey, sortDir)}</th>
          <th onClick={() => toggleSort('value')} style={{ ...TH, color: def.color }}>
            {def.shortLabel}{def.unit ? ` (${def.unit})` : ''}{si('value', sortKey, sortDir)}
          </th>
          <th style={THS}>Moy. équipe</th>
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.player.id} onClick={() => onOpenPlayer(r.player.id)}
              style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}
              className="hover:!bg-white/5">
              <td style={{ ...TD, fontWeight: 800, color: i < 3 ? '#00E5A0' : '#475569', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{i + 1}</td>
              <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: RANK_WIDTH, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <PlayerAvatar player={r.player} size={22} />
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(r.player)}</span><span className="md:hidden">{playerNameShort(r.player)}</span></span>
                </span>
              </td>
              <td style={TD}>{r.player.position || '—'}</td>
              <td style={{ ...TD, color: normalized25 ? '#F59E0B' : '#94A3B8' }}>{r.avgMin !== null ? r.avgMin : '—'}</td>
              <td style={TD}>{r.evalAvg !== null ? r.evalAvg : '—'}</td>
              <td style={{ ...TD, color: r.value !== null ? (def.valueColor?.(r.value) ?? '#F1F5F9') : '#475569', fontWeight: 700 }}>
                {r.value !== null ? fmtValue(def, r.value) : '—'}
              </td>
              <td style={{ ...TD, color: '#475569' }}>{teamAvg !== null ? fmtValue(def, teamAvg) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
