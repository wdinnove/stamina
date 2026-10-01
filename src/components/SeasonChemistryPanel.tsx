import { useState, useMemo } from 'react';
import { useSeasonMatchFives } from '../hooks/useSeasonMatchFives';
import { chemistryFromMatches, layoutChemistry, type ChemistryLink } from '../data/lineupChemistry';
import { formatClock } from '../data/liveTrackingAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player } from '../data/types';

/**
 * Carte des affinités : un point par joueur, proches quand leur duo fait mieux qu'attendu, loin
 * quand il fait moins bien (cf. `lineupChemistry`). La carte donne l'impression d'ensemble ; les
 * traits et le tableau joueurs × joueurs donnent la valeur exacte de chaque duo — une carte à plat
 * ne peut pas respecter toutes les distances à la fois.
 */

export interface SeasonChemistryPanelProps {
  /** Matchs déjà filtrés par la page (période, amicaux). */
  matches: Match[];
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};
const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 8px',
};

const GOOD = '#00E5A0';
const BAD  = '#EF4444';
const NEUTRAL = '#64748B';

/** Temps minimum ensemble (et sur le terrain, pour un joueur) pour qu'un duo compte. */
const MIN_PRESETS = [300, 600, 1200] as const;

/** Valeur (pts/100) à laquelle une couleur atteint son intensité maximale. */
const COLOR_SCALE = 20;

const W = 640, H = 440, PAD = 46;

export function SeasonChemistryPanel({ matches, players }: SeasonChemistryPanelProps) {
  const { matchFives, loading, error } = useSeasonMatchFives(matches);
  const [minSeconds, setMinSeconds] = useState<number>(600);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const nameOf = (id: string) => nameById.get(id) ?? '?';

  const { nodes, links } = useMemo(() => chemistryFromMatches(matchFives), [matchFives]);

  /** Joueurs retenus : assez de temps sur le terrain, triés par apport (le tableau suit cet ordre). */
  const shownNodes = useMemo(
    () => nodes.filter(n => n.seconds >= minSeconds)
      .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity)),
    [nodes, minSeconds],
  );
  const shownIds = useMemo(() => new Set(shownNodes.map(n => n.id)), [shownNodes]);
  /** Duos lisibles : les deux joueurs affichés ET assez de temps ensemble. */
  const shownLinks = useMemo(
    () => links.filter(l => shownIds.has(l.a) && shownIds.has(l.b) && l.seconds >= minSeconds && l.synergy !== null),
    [links, shownIds, minSeconds],
  );
  const linkOf = useMemo(() => {
    const m = new Map(shownLinks.map(l => [`${l.a}|${l.b}`, l]));
    return (x: string, y: string) => m.get(x < y ? `${x}|${y}` : `${y}|${x}`);
  }, [shownLinks]);

  const positions = useMemo(() => {
    // Ordre alphabétique des ids pour le départ : la carte ne dépend pas du tri d'affichage.
    const ids = shownNodes.map(n => n.id).sort();
    const raw = layoutChemistry(ids, shownLinks, minSeconds);
    const xs = [...raw.values()].map(p => p.x), ys = [...raw.values()].map(p => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Même échelle sur les deux axes : une distance doit se lire pareil dans tous les sens.
    const scale = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
    const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
    return new Map([...raw].map(([id, p]) => [id, { x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }]));
  }, [shownNodes, shownLinks, minSeconds]);

  const maxNodeSeconds = Math.max(1, ...shownNodes.map(n => n.seconds));
  const maxLinkSeconds = Math.max(1, ...shownLinks.map(l => l.seconds));

  const selectedPartners = useMemo(() => {
    if (!selectedId) return [];
    return shownLinks
      .filter(l => l.a === selectedId || l.b === selectedId)
      .map(l => ({ id: l.a === selectedId ? l.b : l.a, link: l }))
      .sort((x, y) => (y.link.synergy ?? 0) - (x.link.synergy ?? 0));
  }, [shownLinks, selectedId]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement des affinités…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (matchFives.length === 0) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune rotation suivie sur cette période.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les affinités se calculent depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Prise statistiques</strong> d'un
          match, qui enregistre le cinq sur le terrain à chaque action.
        </p>
      </div>
    );
  }

  const toggle = (id: string) => setSelectedId(s => (s === id ? null : id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
          Cumul sur {matchFives.length} match{matchFives.length > 1 ? 's' : ''} saisi{matchFives.length > 1 ? 's' : ''} en direct.
          {' '}{shownNodes.length} joueurs, {shownLinks.length} duos mesurables.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#64748B', fontSize: '0.74rem' }}>Au moins ensemble</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {MIN_PRESETS.map(s => (
              <button key={s} onClick={() => setMinSeconds(s)} aria-pressed={minSeconds === s} style={toggleStyle(minSeconds === s)}>
                {formatClock(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {/* ── Carte ── */}
        <div style={{ ...PANEL, flex: '2 1 420px', minWidth: 0 }}>
          <p style={SECTION_TITLE}>Carte des affinités</p>
          {shownNodes.length < 2 ? (
            <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
              Pas assez de joueurs au-dessus de {formatClock(minSeconds)} sur le terrain.
            </p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}
              role="img" aria-label="Carte des affinités entre joueurs"
              onClick={() => setSelectedId(null)}>
              {shownLinks.map(l => {
                const pa = positions.get(l.a), pb = positions.get(l.b);
                if (!pa || !pb) return null;
                const involved = !selectedId || l.a === selectedId || l.b === selectedId;
                const s = l.synergy ?? 0;
                return (
                  <line key={`${l.a}|${l.b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke={s >= 0 ? GOOD : BAD}
                    strokeWidth={1 + 5 * (l.seconds / maxLinkSeconds)}
                    strokeOpacity={involved ? 0.15 + 0.65 * Math.min(1, Math.abs(s) / COLOR_SCALE) : 0.04}
                    strokeLinecap="round" />
                );
              })}
              {shownNodes.map(n => {
                const p = positions.get(n.id);
                if (!p) return null;
                const r = 9 + 13 * Math.sqrt(n.seconds / maxNodeSeconds);
                const dim = selectedId !== null && selectedId !== n.id && !linkOf(selectedId, n.id);
                return (
                  <g key={n.id} style={{ cursor: 'pointer' }} opacity={dim ? 0.3 : 1}
                    onClick={e => { e.stopPropagation(); toggle(n.id); }}>
                    <title>{`${nameOf(n.id)} — ${fmtSigned(n.net)} /100 sur le terrain, ${formatClock(Math.round(n.seconds))}`}</title>
                    <circle cx={p.x} cy={p.y} r={r} fill={valueColor(n.net)} fillOpacity={0.25 + 0.6 * intensity(n.net)}
                      stroke={selectedId === n.id ? '#F1F5F9' : valueColor(n.net)} strokeWidth={selectedId === n.id ? 2.5 : 1.5} />
                    <text x={p.x} y={p.y + r + 13} textAnchor="middle" fill="#CBD5E1" fontSize={12} fontWeight={600}>
                      {nameOf(n.id)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '8px 0 0', lineHeight: 1.5 }}>
            Couleur du point : apport du joueur sur le terrain (vert positif, rouge négatif) · taille : temps de jeu ·
            trait : synergie du duo (vert = mieux qu'attendu, rouge = moins bien), épaisseur = temps ensemble.
            Les distances sont un compromis : le trait et le tableau font foi.
          </p>
        </div>

        {/* ── Détail du joueur sélectionné ── */}
        <div style={{ ...PANEL, flex: '1 1 240px' }}>
          <p style={SECTION_TITLE}>{selectedId ? nameOf(selectedId) : 'Partenaires'}</p>
          {!selectedId ? (
            <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
              Cliquez sur un joueur (carte ou tableau) pour voir avec qui il fonctionne le mieux, et le moins bien.
            </p>
          ) : selectedPartners.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
              Aucun duo de plus de {formatClock(minSeconds)} pour ce joueur.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selectedPartners.map(({ id, link }) => (
                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', padding: '4px 0', borderBottom: '1px solid #1E2229' }}>
                  <span style={{ color: '#F1F5F9' }}>{nameOf(id)}</span>
                  <span style={{ color: '#64748B', fontFamily: 'monospace' }}>{formatClock(Math.round(link.seconds))}</span>
                  <span style={{ color: valueColor(link.synergy), fontWeight: 700, minWidth: 44, textAlign: 'right' }}>
                    {fmtSigned(link.synergy)}
                  </span>
                </div>
              ))}
              <p style={{ color: '#475569', fontSize: '0.7rem', margin: '6px 0 0' }}>
                Synergie, en points pour 100 possessions au-delà de ce qu'on attendait du duo.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Tableau joueurs × joueurs ── */}
      <div style={PANEL}>
        <p style={SECTION_TITLE}>Synergie des duos</p>
        {shownNodes.length < 2 ? null : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th />
                  {shownNodes.map(n => (
                    <th key={n.id} onClick={() => toggle(n.id)}
                      style={{ padding: '4px 2px', color: selectedId === n.id ? '#F1F5F9' : '#64748B', fontWeight: 600, cursor: 'pointer',
                        writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', height: 80, verticalAlign: 'bottom' }}>
                      {nameOf(n.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownNodes.map(row => (
                  <tr key={row.id}>
                    <th onClick={() => toggle(row.id)}
                      style={{ padding: '2px 8px 2px 0', textAlign: 'right', color: selectedId === row.id ? '#F1F5F9' : '#94A3B8', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {nameOf(row.id)}
                    </th>
                    {shownNodes.map(col => {
                      if (col.id === row.id) {
                        // Diagonale : l'apport du joueur lui-même, encadré pour ne pas le lire comme un duo.
                        return (
                          <td key={col.id} title={`${nameOf(row.id)} sur le terrain : ${fmtSigned(row.net)} /100`}
                            style={{ ...CELL, border: `1px solid ${valueColor(row.net)}`, color: valueColor(row.net), fontWeight: 700 }}>
                            {fmtSigned(row.net)}
                          </td>
                        );
                      }
                      const l = linkOf(row.id, col.id);
                      return (
                        <td key={col.id} title={l ? cellTitle(nameOf(row.id), nameOf(col.id), l) : `${nameOf(row.id)} + ${nameOf(col.id)} : moins de ${formatClock(minSeconds)} ensemble`}
                          style={{
                            ...CELL,
                            backgroundColor: l ? tint(l.synergy) : 'transparent',
                            color: l ? '#F1F5F9' : '#334155',
                            outline: selectedId && (selectedId === row.id || selectedId === col.id) ? '1px solid #475569' : undefined,
                          }}>
                          {l ? fmtSigned(l.synergy) : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: '8px 0 0', lineHeight: 1.5 }}>
          Chaque case : ce que le duo fait de plus (ou de moins) que la moyenne de ses deux joueurs, pour 100 possessions.
          Diagonale : l'apport du joueur seul. « · » : moins de {formatClock(minSeconds)} ensemble. Survolez une case pour le détail.
        </p>
      </div>
    </div>
  );
}

const CELL: React.CSSProperties = {
  width: 40, minWidth: 40, height: 28, textAlign: 'center', borderRadius: 4,
  border: '1px solid #0D0F14', fontVariantNumeric: 'tabular-nums',
};

const intensity = (v: number | null) => (v === null ? 0 : Math.min(1, Math.abs(v) / COLOR_SCALE));
const valueColor = (v: number | null) => (v === null || Math.abs(v) < 1 ? NEUTRAL : v > 0 ? GOOD : BAD);
/** Fond d'une case : la couleur du signe, d'autant plus franche que la valeur est forte. */
function tint(v: number | null): string {
  if (v === null) return 'transparent';
  const alpha = Math.round((0.12 + 0.6 * intensity(v)) * 255).toString(16).padStart(2, '0');
  return `${valueColor(v)}${alpha}`;
}
const fmtSigned = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}`);

function cellTitle(a: string, b: string, l: ChemistryLink): string {
  return `${a} + ${b} — ${formatClock(Math.round(l.seconds))} ensemble\n`
    + `Duo : ${fmtSigned(l.duoNet)} /100 · attendu : ${fmtSigned(l.expected)} · synergie : ${fmtSigned(l.synergy)}`;
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
    border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
    backgroundColor: active ? '#00E5A01F' : '#0D0F14',
    color: active ? '#00E5A0' : '#94A3B8',
  };
}
