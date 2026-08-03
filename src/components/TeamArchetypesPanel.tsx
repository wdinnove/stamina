import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Player } from '../data/types';
import type { PlayerArchetypeReport } from '../data/archetypes';
import { PROFILES_V1, DIMENSIONS_V1, CATEGORY_LABELS } from '../data/archetypes';
import { EmptyState } from './EmptyState';
import { Badge } from './Badge';
import { filterControlStyle } from './FilterField';
import { playerNameFull, playerNameShort } from '../utils/playerName';

interface Selection { kind: 'profile' | 'dimension'; key: string; label: string }

const SELECTIONS: Selection[] = [
  ...PROFILES_V1.filter(p => p.status !== 'planned').map(p => ({ kind: 'profile' as const, key: p.key, label: `${CATEGORY_LABELS[p.category]} — ${p.label}` })),
  ...DIMENSIONS_V1.filter(d => d.status !== 'planned').map(d => ({ kind: 'dimension' as const, key: d.key, label: `Dimension — ${d.label}` })),
];

type SortKey = 'name' | 'score';

interface Row { player: Player; score: number; confidence: 'low' | 'medium' | 'high'; caveat?: string }

interface TeamArchetypesPanelProps {
  reports: PlayerArchetypeReport[];
  roster: Player[];
  onOpenPlayer?: (playerId: string) => void;
}

/** Classement de tout l'effectif sur un profil/dimension choisi — les rapports par joueur sont
 *  déjà calculés (voir useArchetypes), ce composant se contente de choisir la bonne entrée et de
 *  trier. Suit le pattern "un composant de tableau dédié par domaine" déjà utilisé pour RPE/
 *  bien-être (RPEPlayerRankingTable/WellnessPlayerRankingTable) plutôt qu'une factorisation avec
 *  PlayerRankingTable, dont le schéma de colonnes (Min/Éval fixes) ne correspond pas ici. */
export function TeamArchetypesPanel({ reports, roster, onOpenPlayer }: TeamArchetypesPanelProps) {
  const [selection, setSelection] = useState<Selection>(SELECTIONS[0]!);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows: Row[] = useMemo(() => {
    const playerById = new Map(roster.map(p => [p.id, p]));
    const built: Row[] = [];
    for (const report of reports) {
      const player = playerById.get(report.playerId);
      if (!player) continue;
      const result = selection.kind === 'profile'
        ? report.archetypes.find(a => a.profileKey === selection.key)
        : report.dimensions.find(d => d.dimensionKey === selection.key);
      if (!result || !result.computable || result.score === null) continue;
      built.push({ player, score: result.score, confidence: result.confidence, caveat: result.caveat });
    }
    const mul = sortDir === 'asc' ? 1 : -1;
    return built.sort((a, b) => sortKey === 'name'
      ? playerNameFull(a.player).localeCompare(playerNameFull(b.player)) * mul
      : (a.score - b.score) * mul);
  }, [reports, roster, selection, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const thSortable = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th onClick={() => toggleSort(key)} style={{
      ...thBase, textAlign: align, cursor: 'pointer', userSelect: 'none',
      color: sortKey === key ? '#00E5A0' : '#64748B',
    }}>
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select
          value={`${selection.kind}:${selection.key}`}
          onChange={e => {
            const [kind, key] = e.target.value.split(':') as [Selection['kind'], string];
            setSelection(SELECTIONS.find(s => s.kind === kind && s.key === key)!);
          }}
          style={filterControlStyle}
        >
          {SELECTIONS.map(s => (
            <option key={`${s.kind}:${s.key}`} value={`${s.kind}:${s.key}`}>{s.label}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Aucun joueur éligible ou historique suffisant pour ce choix." />
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#1A1D24' }}>Cl.</th>
                {thSortable('name', 'Joueur', 'left')}
                {thSortable('score', 'Score')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.player.id}
                  onClick={() => onOpenPlayer?.(row.player.id)}
                  style={{ cursor: onOpenPlayer ? 'pointer' : undefined, backgroundColor: i % 2 === 0 ? '#1A1D24' : '#1E2229' }}
                >
                  <td style={{ ...tdBase, color: i < 3 ? '#00E5A0' : '#475569', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ ...tdBase, textAlign: 'left', color: '#F1F5F9', fontWeight: 600 }}>
                    <span className="hidden md:inline">{playerNameFull(row.player)}</span>
                    <span className="md:hidden">{playerNameShort(row.player)}</span>
                  </td>
                  <td style={{ ...tdBase, fontWeight: 700, color: '#00E5A0', fontVariantNumeric: 'tabular-nums' }}>
                    {row.score}%
                    {row.confidence !== 'high' && (
                      <span title={row.caveat ?? "Échantillon ou groupe de comparaison limité"} style={{ marginLeft: 6, cursor: 'help' }}>
                        <Badge color="#F59E0B" label="i" size="sm" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thBase: CSSProperties = {
  padding: '8px 12px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  borderBottom: '1px solid #2A2F3A', whiteSpace: 'nowrap',
};
const tdBase: CSSProperties = { padding: '8px 12px', fontSize: '0.82rem', textAlign: 'right', whiteSpace: 'nowrap' };
