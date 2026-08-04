import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Player } from '../data/types';
import type { PlayerArchetypeReport } from '../data/archetypes';
import { PROFILES_V1, DIMENSIONS_V1, CATEGORY_LABELS } from '../data/archetypes';
import { EmptyState } from './EmptyState';
import { Badge } from './Badge';
import { PlayerAvatar } from './PlayerAvatar';
import { filterControlStyle } from './FilterField';
import { playerNameFull, playerNameShort } from '../utils/playerName';

interface Selection { kind: 'profile' | 'dimension'; key: string; label: string }

const SELECTIONS: Selection[] = [
  ...PROFILES_V1.filter(p => p.status !== 'planned').map(p => ({ kind: 'profile' as const, key: p.key, label: `${CATEGORY_LABELS[p.category]} — ${p.label}` })),
  ...DIMENSIONS_V1.filter(d => d.status !== 'planned').map(d => ({ kind: 'dimension' as const, key: d.key, label: `Dimension — ${d.label}` })),
];

type SortKey = 'name' | 'position' | 'score';
type SortDir = 'asc' | 'desc';

interface Row { player: Player; score: number; confidence: 'low' | 'medium' | 'high'; caveat?: string }

interface TeamArchetypesPanelProps {
  reports: PlayerArchetypeReport[];
  roster: Player[];
  onOpenPlayer?: (playerId: string) => void;
}

const si = (col: SortKey, key: SortKey, dir: SortDir) => key === col ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
const thC = (col: SortKey, key: SortKey) => key === col ? '#CBD5E1' : '#475569';

// Colonne "Cl." sticky elle aussi (avant "Joueur") — décalage explicite pour ne pas se chevaucher.
const RANK_WIDTH = 36;

/** Classement de tout l'effectif sur un profil/dimension choisi — les rapports par joueur sont
 *  déjà calculés (voir useArchetypes), ce composant se contente de choisir la bonne entrée et de
 *  trier. Même style de tableau que PlayerRankingTable (colonnes sticky Cl./Joueur, avatar,
 *  postes, en-têtes triables) pour rester cohérent avec "Classement joueurs" sur la même page. */
export function TeamArchetypesPanel({ reports, roster, onOpenPlayer }: TeamArchetypesPanelProps) {
  const [selection, setSelection] = useState<Selection>(SELECTIONS[0]!);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
    return built;
  }, [reports, roster, selection]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc'); }
  };

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'name':     return `${a.player.lastName} ${a.player.firstName}`.localeCompare(`${b.player.lastName} ${b.player.firstName}`) * dir;
      case 'position': return (a.player.position ?? '').localeCompare(b.player.position ?? '') * dir;
      case 'score':    return (a.score - b.score) * dir;
    }
  });

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
        <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
          <style>{`
            @media (max-width: 639px) {
              .archetypes-ranking-table th, .archetypes-ranking-table td { padding: 10px 12px !important; }
            }
          `}</style>
          <table className="archetypes-ranking-table" style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr>
              <th style={{ ...THS, width: RANK_WIDTH, position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#161920' }}>Cl.</th>
              <th onClick={() => toggleSort('name')} style={{ ...TH, textAlign: 'left', position: 'sticky', left: RANK_WIDTH, zIndex: 2, color: thC('name', sortKey) }}>
                Joueur{si('name', sortKey, sortDir)}
              </th>
              <th onClick={() => toggleSort('position')} style={{ ...TH, color: thC('position', sortKey) }}>Poste{si('position', sortKey, sortDir)}</th>
              <th onClick={() => toggleSort('score')} style={{ ...TH, color: '#00E5A0' }}>
                Score{si('score', sortKey, sortDir)}
              </th>
            </tr></thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.player.id} onClick={() => onOpenPlayer?.(row.player.id)}
                  style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: onOpenPlayer ? 'pointer' : undefined }}
                  className="hover:!bg-white/5">
                  <td style={{ ...TD, fontWeight: 800, color: i < 3 ? '#00E5A0' : '#475569', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{i + 1}</td>
                  <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: RANK_WIDTH, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar player={row.player} size={22} />
                      <span style={{ color: '#F1F5F9', fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(row.player)}</span><span className="md:hidden">{playerNameShort(row.player)}</span></span>
                    </span>
                  </td>
                  <td style={TD}>{row.player.position || '—'}</td>
                  <td style={{ ...TD, color: '#00E5A0', fontWeight: 700 }}>
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
