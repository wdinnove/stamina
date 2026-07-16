import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import type { Player, WellnessEntry } from '../data/types';
import { WELLNESS_DIMENSIONS, wellnessAvg, wellnessDimColor, wellnessScoreColor, type WellnessDimension } from '../utils/wellness';
import { playerNameShort } from '../utils/playerName';
import { fmt1 } from '../utils/format';

interface WellnessPlayerRankingTableProps {
  entries: WellnessEntry[];
  roster:  Player[];
}

type SortKey = 'name' | 'score' | WellnessDimension['key'];

const COL_WIDTH = `${100 / 8}%`;

export function WellnessPlayerRankingTable({ entries, roster }: WellnessPlayerRankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = roster
    .map(player => {
      const playerEntries = entries.filter(e => e.playerId === player.id);
      if (playerEntries.length === 0) return null;
      const avg = {
        fatigue:    wellnessAvg(playerEntries.map(e => e.fatigue))    ?? 0,
        mood:       wellnessAvg(playerEntries.map(e => e.mood))       ?? 0,
        stress:     wellnessAvg(playerEntries.map(e => e.stress))     ?? 0,
        motivation: wellnessAvg(playerEntries.map(e => e.motivation)) ?? 0,
        sleep:      wellnessAvg(playerEntries.map(e => e.sleep))      ?? 0,
        soreness:   wellnessAvg(playerEntries.map(e => e.soreness))   ?? 0,
        score:      wellnessAvg(playerEntries.map(e => e.score))      ?? 0,
      };
      return { player, avg };
    })
    .filter((r): r is { player: Player; avg: Record<WellnessDimension['key'] | 'score', number> } => r !== null);

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'name') return playerNameShort(a.player).localeCompare(playerNameShort(b.player)) * dir;
    return (a.avg[sortKey] - b.avg[sortKey]) * dir;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortArrow = (key: SortKey) => sortKey === key
    ? <span style={{ fontSize: '0.6rem', marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
    : null;

  const thBase = { padding: '7px 8px', textAlign: 'left' as const, fontSize: '0.67rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', cursor: 'pointer', userSelect: 'none' as const };

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 639px) {
          .wellness-rank-table { table-layout: auto !important; }
          .wellness-rank-table col { width: auto !important; }
          .wellness-rank-table th, .wellness-rank-table td { padding: 8px 12px !important; }
        }
      `}</style>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', backgroundColor: '#1A1E26', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ListOrdered size={13} color="#94A3B8" />
        <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>Classement joueurs</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="wellness-rank-table" style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL_WIDTH }} />
            {WELLNESS_DIMENSIONS.map(d => <col key={d.key} style={{ width: COL_WIDTH }} />)}
            <col style={{ width: COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#1A1E26', position: 'sticky', top: 0, zIndex: 1 }}>
              <th onClick={() => toggleSort('name')} style={{ ...thBase, whiteSpace: 'nowrap', color: sortKey === 'name' ? '#94A3B8' : '#475569', position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#1A1E26' }}>Nom{sortArrow('name')}</th>
              {WELLNESS_DIMENSIONS.map(dim => (
                <th key={dim.key} onClick={() => toggleSort(dim.key)} style={{ ...thBase, color: sortKey === dim.key ? '#94A3B8' : '#475569' }}>{dim.shortLabel}{sortArrow(dim.key)}</th>
              ))}
              <th onClick={() => toggleSort('score')} style={{ ...thBase, color: sortKey === 'score' ? '#94A3B8' : '#475569' }}>Score{sortArrow('score')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ player, avg }) => (
              <tr key={player.id} style={{ borderBottom: '1px solid #1E2229' }}
                onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                <td style={{ padding: '8px 8px', color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>{playerNameShort(player)}</td>
                {WELLNESS_DIMENSIONS.map(dim => (
                  <td key={dim.key} style={{ padding: '8px 8px', color: wellnessDimColor(avg[dim.key], dim.inverted), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(avg[dim.key])}</td>
                ))}
                <td style={{ padding: '8px 8px', color: wellnessScoreColor(avg.score), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(avg.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
