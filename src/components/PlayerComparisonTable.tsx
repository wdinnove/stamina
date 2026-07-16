import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PlayerAvatar } from './PlayerAvatar';
import { playerNameShort } from '../utils/playerName';
import type { IndicatorDef } from '../data/crossAnalysis';
import type { Player } from '../data/types';

export interface ComparisonRow {
  player: Player;
  /** Moyenne de l'indicateur A sur la période (null si aucune donnée) */
  a: number | null;
  b: number | null;
  /** Éval moyenne période − éval moyenne saison */
  evalDelta: number | null;
  redAlerts: number;
  amberAlerts: number;
}

interface PlayerComparisonTableProps {
  rows: ComparisonRow[];
  aDef: IndicatorDef;
  bDef: IndicatorDef;
  onOpenPlayer: (playerId: string) => void;
}

type SortKey = 'name' | 'a' | 'b' | 'delta' | 'alerts';
type SortDir = 'asc' | 'desc';

const thStyle: CSSProperties = {
  padding: '8px 10px', textAlign: 'right', color: '#64748B', fontSize: '0.66rem',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700,
  cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
};
const tdStyle: CSSProperties = {
  padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem',
  fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap',
};

function fmtValue(def: IndicatorDef, v: number): string {
  if (def.key === 'acwr') return v.toFixed(2);
  if (def.domain === 'wellness' || def.key === 'rpe') return v.toFixed(1);
  return String(Math.round(v * 10) / 10);
}

/** Comparaison des joueurs sur les deux indicateurs croisés + progression d'éval + alertes */
export function PlayerComparisonTable({ rows, aDef, bDef, onOpenPlayer }: PlayerComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('alerts');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((x, y) => {
    switch (sortKey) {
      case 'name':   return `${x.player.lastName} ${x.player.firstName}`.localeCompare(`${y.player.lastName} ${y.player.firstName}`) * dir;
      case 'a':      return ((x.a ?? -Infinity) - (y.a ?? -Infinity)) * dir;
      case 'b':      return ((x.b ?? -Infinity) - (y.b ?? -Infinity)) * dir;
      case 'delta':  return ((x.evalDelta ?? -Infinity) - (y.evalDelta ?? -Infinity)) * dir;
      case 'alerts': return ((x.redAlerts * 10 + x.amberAlerts) - (y.redAlerts * 10 + y.amberAlerts)) * dir;
    }
  });

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  if (!rows.length) {
    return <p style={{ color: '#64748B', fontSize: '0.8rem', margin: 0 }}>Aucun joueur sur ce filtre.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
            <th style={{ ...thStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#161920' }} onClick={() => toggleSort('name')}>Joueur{arrow('name')}</th>
            <th style={{ ...thStyle, color: aDef.color }} onClick={() => toggleSort('a')}>
              {aDef.shortLabel}{aDef.unit ? ` (${aDef.unit})` : ''}{arrow('a')}
            </th>
            <th style={{ ...thStyle, color: bDef.color }} onClick={() => toggleSort('b')}>
              {bDef.shortLabel}{bDef.unit ? ` (${bDef.unit})` : ''}{arrow('b')}
            </th>
            <th style={thStyle} onClick={() => toggleSort('delta')}>Δ Éval vs saison{arrow('delta')}</th>
            <th style={thStyle} onClick={() => toggleSort('alerts')}>Alertes{arrow('alerts')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const deltaCfg = r.evalDelta === null ? null
              : r.evalDelta > 0.5  ? { sym: '▲', color: '#00E5A0' }
              : r.evalDelta < -0.5 ? { sym: '▼', color: '#EF4444' }
              : { sym: '—', color: '#475569' };
            return (
              <tr key={r.player.id} onClick={() => onOpenPlayer(r.player.id)}
                className="hover:bg-[#1E2229]"
                style={{ borderBottom: '1px solid #1E2229', cursor: 'pointer', transition: 'background 0.12s' }}>
                <td style={{ ...tdStyle, textAlign: 'left', fontFamily: 'inherit', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <PlayerAvatar player={r.player} size={22} />
                    <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{playerNameShort(r.player)}</span>
                    <span style={{ color: '#475569', fontSize: '0.68rem' }}>{r.player.position}</span>
                  </span>
                </td>
                <td style={{ ...tdStyle, color: r.a !== null ? (aDef.valueColor?.(r.a) ?? '#F1F5F9') : '#475569', fontWeight: 700 }}>
                  {r.a !== null ? fmtValue(aDef, r.a) : '—'}
                </td>
                <td style={{ ...tdStyle, color: r.b !== null ? (bDef.valueColor?.(r.b) ?? '#F1F5F9') : '#475569', fontWeight: 700 }}>
                  {r.b !== null ? fmtValue(bDef, r.b) : '—'}
                </td>
                <td style={{ ...tdStyle, color: deltaCfg?.color ?? '#475569' }}>
                  {deltaCfg ? `${deltaCfg.sym} ${r.evalDelta! > 0 ? '+' : ''}${r.evalDelta}` : '—'}
                </td>
                <td style={tdStyle}>
                  {r.redAlerts === 0 && r.amberAlerts === 0
                    ? <span style={{ color: '#475569' }}>—</span>
                    : (
                      <span style={{ display: 'inline-flex', gap: 5 }}>
                        {r.redAlerts > 0 && (
                          <span style={{ backgroundColor: '#EF444422', color: '#EF4444', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 3 }}>
                            {r.redAlerts}
                          </span>
                        )}
                        {r.amberAlerts > 0 && (
                          <span style={{ backgroundColor: '#F59E0B22', color: '#F59E0B', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: 3 }}>
                            {r.amberAlerts}
                          </span>
                        )}
                      </span>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
