import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Player } from '../data/types';
import type { PlayerArchetypeReport, ArchetypeSelection } from '../data/archetypes';
import { confidenceNote } from '../data/archetypes';
import type { RankingRow } from './PlayerRankingTable';
import { Badge } from './Badge';
import { PlayerAvatar } from './PlayerAvatar';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { roundedAvg } from '../utils/avg';

type SortKey = 'name' | 'position' | 'min' | 'eval' | 'score';
type SortDir = 'asc' | 'desc';

interface Row {
  player: Player; score: number; confidence: 'low' | 'medium' | 'high'; caveat?: string;
  sampleSize: { matches: number; minutes: number };
  avgMin: number | null; evalAvg: number | null;
}

interface TeamArchetypesPanelProps {
  reports: PlayerArchetypeReport[];
  roster: Player[];
  selection: ArchetypeSelection;
  /** Min/Éval de repère — mêmes lignes que "Classement joueurs" (voir usePerformanceData/rankingRows),
   *  affichées ici quel que soit le profil/dimension choisi. */
  rankingRows: RankingRow[];
  normalized25?: boolean;
  onOpenPlayer?: (playerId: string) => void;
}

const si = (col: SortKey, key: SortKey, dir: SortDir) => key === col ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
const thC = (col: SortKey, key: SortKey) => key === col ? '#CBD5E1' : '#475569';

// Colonne "Cl." sticky elle aussi (avant "Joueur") — décalage explicite pour ne pas se chevaucher.
const RANK_WIDTH = 36;

/** Classement de tout l'effectif sur un profil/dimension choisi — les rapports par joueur sont
 *  déjà calculés (voir useArchetypes), ce composant se contente de choisir la bonne entrée et de
 *  trier. Même structure que PlayerRankingTable (colonnes, tri, styles) pour rester cohérent avec
 *  l'onglet "Classement joueurs" sur la même page. */
export function TeamArchetypesPanel({ reports, roster, selection, rankingRows, normalized25, onOpenPlayer }: TeamArchetypesPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows: Row[] = useMemo(() => {
    const playerById = new Map(roster.map(p => [p.id, p]));
    const refByPlayerId = new Map(rankingRows.map(r => [r.player.id, r]));
    const built: Row[] = [];
    for (const report of reports) {
      const player = playerById.get(report.playerId);
      if (!player) continue;
      const result = selection.kind === 'profile'
        ? report.archetypes.find(a => a.profileKey === selection.key)
        : report.dimensions.find(d => d.dimensionKey === selection.key);
      if (!result || !result.computable || result.score === null) continue;
      const ref = refByPlayerId.get(player.id);
      built.push({
        player, score: result.score, confidence: result.confidence, caveat: result.caveat,
        sampleSize: result.sampleSize,
        avgMin: ref?.avgMin ?? null, evalAvg: ref?.evalAvg ?? null,
      });
    }
    return built;
  }, [reports, roster, selection, rankingRows]);

  // Le caveat est une propriété du PROFIL, pas du joueur : identique sur toutes les lignes.
  const methodCaveat = rows.find(r => r.caveat)?.caveat;

  const teamAvg = roundedAvg(rows.map(r => r.score));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' || key === 'position' ? 'asc' : 'desc'); }
  };

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'name':     return `${a.player.lastName} ${a.player.firstName}`.localeCompare(`${b.player.lastName} ${b.player.firstName}`) * dir;
      case 'position': return (a.player.position ?? '').localeCompare(b.player.position ?? '') * dir;
      case 'min':      return ((a.avgMin ?? -Infinity) - (b.avgMin ?? -Infinity)) * dir;
      case 'eval':     return ((a.evalAvg ?? -Infinity) - (b.evalAvg ?? -Infinity)) * dir;
      case 'score':    return (a.score - b.score) * dir;
    }
  });

  if (!rows.length) {
    return <p style={{ color: '#64748B', fontSize: '0.8rem', margin: 0 }}>Aucun joueur éligible ou historique suffisant pour ce choix.</p>;
  }

  return (
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
          <th onClick={() => toggleSort('min')} style={{ ...TH, color: normalized25 ? '#F59E0B' : thC('min', sortKey) }}>Min{si('min', sortKey, sortDir)}{normalized25 ? ' ⟳' : ''}</th>
          <th onClick={() => toggleSort('eval')} style={{ ...TH, color: thC('eval', sortKey) }}>Éval{si('eval', sortKey, sortDir)}</th>
          <th onClick={() => toggleSort('score')} style={{ ...TH, color: '#00E5A0' }}>
            Score{si('score', sortKey, sortDir)}
          </th>
          <th style={THS}>Moy. équipe</th>
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
              <td style={{ ...TD, color: normalized25 ? '#F59E0B' : '#94A3B8' }}>{row.avgMin !== null ? row.avgMin : '—'}</td>
              <td style={TD}>{row.evalAvg !== null ? row.evalAvg : '—'}</td>
              <td style={{ ...TD, color: '#00E5A0', fontWeight: 700 }}>
                {row.score}%
                {/* Le `?` ne porte QUE la fiabilité du chiffre. La limite méthodologique du profil
                    (`caveat`) est indiquée une fois pour toutes sous le tableau : mélanger les deux
                    faisait lire une explication sur la méthode là où on cherchait à savoir si le
                    score était solide. */}
                {row.confidence !== 'high' && (
                  <span title={confidenceNote(row.confidence, row.sampleSize) ?? undefined} style={{ marginLeft: 6, cursor: 'help' }}>
                    <Badge color="#F59E0B" label="?" size="sm" />
                  </span>
                )}
              </td>
              <td style={{ ...TD, color: '#475569' }}>{teamAvg !== null ? `${teamAvg}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* La limite méthodologique du profil ne dépend pas du joueur : une note sous le tableau
          plutôt qu'un tooltip répété sur chaque ligne. */}
      {methodCaveat && (
        <p style={{ color: '#475569', fontSize: '0.7rem', lineHeight: 1.5, margin: '10px 2px 0' }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>Méthode : </span>{methodCaveat}
        </p>
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
