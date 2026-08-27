import { ListOrdered } from 'lucide-react';
import { roundedAvg } from '../utils/avg';
import type { Player, WellnessEntry } from '../data/types';
import { WELLNESS_DIMENSIONS, wellnessDimColor, wellnessScoreColor, type WellnessDimension } from '../utils/wellness';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import { useUrlSort } from '../hooks/useUrlState';

interface WellnessPlayerRankingTableProps {
  entries: WellnessEntry[];
  roster:  Player[];
}

type SortKey = 'name' | 'score' | WellnessDimension['key'];
/** Clés acceptées dans l'URL : les deux colonnes fixes, plus une par dimension. */
const SORT_KEYS = [...['name', 'score'], ...WELLNESS_DIMENSIONS.map(d => d.key)] as const;

export function WellnessPlayerRankingTable({ entries, roster }: WellnessPlayerRankingTableProps) {
  // `ns` : le panneau POMS, sur la même page, porte son propre tableau triable.
  const { sortKey, sortDir, toggleSort } = useUrlSort<SortKey>({ key: 'score', dir: 'desc' }, { ns: 'classement', allowed: SORT_KEYS });

  const rows = roster
    .map(player => {
      const playerEntries = entries.filter(e => e.playerId === player.id);
      if (playerEntries.length === 0) return null;
      const avg = {
        fatigue:    roundedAvg(playerEntries.map(e => e.fatigue))    ?? 0,
        mood:       roundedAvg(playerEntries.map(e => e.mood))       ?? 0,
        stress:     roundedAvg(playerEntries.map(e => e.stress))     ?? 0,
        motivation: roundedAvg(playerEntries.map(e => e.motivation)) ?? 0,
        sleep:      roundedAvg(playerEntries.map(e => e.sleep))      ?? 0,
        soreness:   roundedAvg(playerEntries.map(e => e.soreness))   ?? 0,
        score:      roundedAvg(playerEntries.map(e => e.score))      ?? 0,
      };
      return { player, avg };
    })
    .filter((r): r is { player: Player; avg: Record<WellnessDimension['key'] | 'score', number> } => r !== null);

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === 'name') return playerNameShort(a.player).localeCompare(playerNameShort(b.player)) * dir;
    return (a.avg[sortKey] - b.avg[sortKey]) * dir;
  });

  const sortArrow = (key: SortKey) => sortKey === key
    ? <span style={{ fontSize: '0.6rem', marginLeft: 3 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
    : null;

  const thBase = { padding: '7px 8px', textAlign: 'left' as const, fontSize: '0.67rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', cursor: 'pointer', userSelect: 'none' as const };

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <style>{`
        @media (max-width: 639px) {
          .wellness-rank-table th, .wellness-rank-table td { padding: 8px 12px !important; }
        }
      `}</style>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', backgroundColor: '#1A1E26', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ListOrdered size={13} color="#94A3B8" />
        <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>Classement joueurs</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="wellness-rank-table" style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
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
                <td style={{ padding: '8px 8px', color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}><span className="hidden md:inline">{playerNameFull(player)}</span><span className="md:hidden">{playerNameShort(player)}</span></td>
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
