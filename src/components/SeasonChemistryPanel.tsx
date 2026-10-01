import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSeasonMatchFives } from '../hooks/useSeasonMatchFives';
import { chemistryFromMatches, layoutChemistry, shrink, RELIABLE_POSSESSIONS, type ChemistryLink, type ChemistryNode } from '../data/lineupChemistry';
import { combosAcrossMatches } from '../data/matchEvents';
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

const C = {
  panel: '#161920', border: '#2A2F3A', line: '#1E2229', ink: '#0D0F14',
  text: '#F1F5F9', soft: '#CBD5E1', muted: '#94A3B8', faint: '#64748B', ghost: '#475569',
  good: '#00E5A0', bad: '#EF4444', neutral: '#64748B',
};

const PANEL: React.CSSProperties = {
  backgroundColor: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
};
const SECTION_TITLE: React.CSSProperties = {
  color: C.muted, fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', margin: 0,
};

/** Temps minimum ensemble (et sur le terrain, pour un joueur) pour qu'un duo compte. */
const MIN_PRESETS = [300, 600, 1200] as const;

/** Valeur (pts/100, déjà ramenée vers 0) à laquelle une couleur atteint son intensité maximale. */
const COLOR_SCALE = 12;
/** En deçà (en valeur absolue), une valeur est neutre : un +1 n'est pas un signal à colorer. */
const NEUTRAL_BAND = 3;
/** Nombre d'entrées des listes « meilleurs / pires duos » et « meilleurs cinq ». */
const TOP_DUOS = 5;
const TOP_FIVES = 3;

/** Repère de la carte. Marges asymétriques : les noms sont sous les points. */
const W = 720, H = 460, PAD_X = 64, PAD_TOP = 36, PAD_BOTTOM = 56;

export function SeasonChemistryPanel({ matches, players }: SeasonChemistryPanelProps) {
  const { matchFives, loading, error } = useSeasonMatchFives(matches);
  const navigate = useNavigate();
  const location = useLocation();
  const [minSeconds, setMinSeconds] = useState<number>(600);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Le survol prévisualise, le clic fige : la carte et le tableau suivent le même joueur. */
  const focusId = hoverId ?? selectedId;

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const nameOf = (id: string) => nameById.get(id) ?? '?';

  const { nodes, links, teamNet } = useMemo(() => chemistryFromMatches(matchFives), [matchFives]);

  /** Joueurs retenus : assez de temps sur le terrain, triés par apport (le tableau suit cet ordre). */
  const shownNodes = useMemo(
    () => nodes.filter(n => n.seconds >= minSeconds)
      .sort((a, b) => (b.vsTeam ?? -Infinity) - (a.vsTeam ?? -Infinity)),
    [nodes, minSeconds],
  );
  const nodeById = useMemo(() => new Map(shownNodes.map(n => [n.id, n])), [shownNodes]);
  /** Duos lisibles : les deux joueurs affichés ET assez de temps ensemble. */
  const shownLinks = useMemo(
    () => links.filter(l => nodeById.has(l.a) && nodeById.has(l.b) && l.seconds >= minSeconds && l.synergy !== null),
    [links, nodeById, minSeconds],
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
    const innerW = W - 2 * PAD_X, innerH = H - PAD_TOP - PAD_BOTTOM;
    const scale = Math.min(innerW / (maxX - minX || 1), innerH / (maxY - minY || 1));
    const offX = PAD_X + (innerW - (maxX - minX) * scale) / 2;
    const offY = PAD_TOP + (innerH - (maxY - minY) * scale) / 2;
    return new Map([...raw].map(([id, p]) => [id, { x: offX + (p.x - minX) * scale, y: offY + (p.y - minY) * scale }]));
  }, [shownNodes, shownLinks, minSeconds]);

  const maxNodeSeconds = Math.max(1, ...shownNodes.map(n => n.seconds));
  const maxLinkSeconds = Math.max(1, ...shownLinks.map(l => l.seconds));
  const radius = (n: ChemistryNode) => 11 + 9 * Math.sqrt(n.seconds / maxNodeSeconds);

  /** Les traits du joueur suivi passent au premier plan, au-dessus des autres. */
  const orderedLinks = useMemo(() => {
    const touches = (l: ChemistryLink) => focusId !== null && (l.a === focusId || l.b === focusId);
    return [...shownLinks].sort((x, y) => Number(touches(x)) - Number(touches(y)) || x.seconds - y.seconds);
  }, [shownLinks, focusId]);

  const partners = useMemo(() => {
    if (!selectedId) return { good: [], bad: [] };
    const all = shownLinks
      .filter(l => l.a === selectedId || l.b === selectedId)
      .map(l => ({ id: l.a === selectedId ? l.b : l.a, link: l }))
      .sort((x, y) => (y.link.synergy ?? 0) - (x.link.synergy ?? 0));
    return { good: all.filter(p => (p.link.synergy ?? 0) >= 0), bad: all.filter(p => (p.link.synergy ?? 0) < 0).reverse() };
  }, [shownLinks, selectedId]);
  const maxAbsSynergy = Math.max(1, ...shownLinks.map(l => Math.abs(l.synergy ?? 0)));

  /** Les duos les plus nets dans chaque sens — la réponse directe, sans parcourir le tableau. */
  const topDuos = useMemo(() => {
    const sorted = [...shownLinks].sort((x, y) => (y.synergy ?? 0) - (x.synergy ?? 0));
    return {
      good: sorted.filter(l => (l.synergy ?? 0) >= NEUTRAL_BAND).slice(0, TOP_DUOS),
      bad:  sorted.filter(l => (l.synergy ?? 0) <= -NEUTRAL_BAND).reverse().slice(0, TOP_DUOS),
    };
  }, [shownLinks]);

  /** Cinq complets cumulés sur la période : « dans quel cinq le faire jouer », après « avec qui ». */
  const fives = useMemo(() => combosAcrossMatches(matchFives, 5), [matchFives]);
  const selectedFives = useMemo(() => {
    if (!selectedId) return [];
    return fives
      .filter(f => f.players.includes(selectedId) && f.seconds >= minSeconds / 2
        && f.pointsPerPossession !== null && f.oppPointsPerPossession !== null)
      .map(f => {
        const possessions = (f.possessions + f.oppPossessions) / 2;
        const net = (f.pointsPerPossession! - f.oppPointsPerPossession!) * 100;
        return { players: f.players, seconds: f.seconds, net, rank: shrink(net, possessions)! };
      })
      // Classés sur la valeur ramenée vers 0 : un +40 de deux minutes ne passe pas devant un +12 d'un quart-temps.
      .sort((x, y) => y.rank - x.rank)
      .slice(0, TOP_FIVES);
  }, [fives, selectedId, minSeconds]);

  /** Onglet Lineups, filtré sur ce joueur — en gardant la période et l'équipe de l'adresse. */
  const openInLineups = (id: string) => {
    const params = new URLSearchParams(location.search);
    params.set('avec', id);
    navigate(`/performance-collective/lineups?${params}`);
  };

  if (loading) return <div style={{ color: C.faint, padding: 24 }}>Chargement des affinités…</div>;
  if (error)   return <div style={{ color: C.bad, padding: 24 }}>{error}</div>;

  if (matchFives.length === 0) {
    return (
      <div style={{ ...PANEL, color: C.faint, fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: C.muted, fontWeight: 600 }}>Aucune rotation suivie sur cette période.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les affinités se calculent depuis l'onglet <strong style={{ color: C.soft }}>Prise statistiques</strong> d'un
          match, qui enregistre le cinq sur le terrain à chaque action.
        </p>
      </div>
    );
  }

  const toggle = (id: string) => setSelectedId(s => (s === id ? null : id));
  const selected = selectedId ? nodeById.get(selectedId) : undefined;
  const isRelated = (id: string) => focusId === null || id === focusId || !!linkOf(focusId, id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        .chem-node { cursor: pointer; transition: opacity .15s; }
        .chem-node:focus-visible { outline: none; }
        .chem-node:focus-visible circle.chem-ring { stroke: ${C.text}; stroke-width: 2.5; }
        .chem-cell { transition: opacity .15s; }
        .chem-head { cursor: pointer; transition: color .15s; }
        .chem-head:hover { color: ${C.text} !important; }
      `}</style>

      {/* ── Barre de contexte ── */}
      <div style={{ ...PANEL, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Stat value={matchFives.length} label={matchFives.length > 1 ? 'matchs saisis' : 'match saisi'} />
          <Stat value={shownNodes.length} label="joueurs" />
          <Stat value={shownLinks.length} label="duos mesurables" />
          {teamNet !== null && <Stat value={fmtSigned(teamNet)} label="équipe /100 poss." />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.faint, fontSize: '0.74rem' }}>Au moins ensemble</span>
          <div role="group" aria-label="Temps minimum ensemble" style={{ display: 'flex', padding: 3, gap: 2, borderRadius: 8, backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
            {MIN_PRESETS.map(s => (
              <button key={s} onClick={() => setMinSeconds(s)} aria-pressed={minSeconds === s} style={segmentStyle(minSeconds === s)}>
                {s / 60} min
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* ── Carte ── */}
        <div style={{ ...PANEL, flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={SECTION_TITLE}>Carte des affinités</p>
            <Legend />
          </div>
          {shownNodes.length < 2 ? (
            <p style={{ color: C.ghost, fontSize: '0.8rem', margin: 0 }}>
              Pas assez de joueurs au-dessus de {minSeconds / 60} min sur le terrain.
            </p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, backgroundColor: C.ink }}
              role="img" aria-label="Carte des affinités entre joueurs"
              onClick={() => setSelectedId(null)}>
              <defs>
                <pattern id="chem-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#1A1E27" />
                </pattern>
              </defs>
              <rect width={W} height={H} fill="url(#chem-grid)" />

              {orderedLinks.map(l => {
                const pa = positions.get(l.a), pb = positions.get(l.b);
                if (!pa || !pb) return null;
                const touches = focusId !== null && (l.a === focusId || l.b === focusId);
                const s = l.synergy ?? 0;
                const base = 0.12 + 0.5 * intensity(s);
                return (
                  <line key={`${l.a}|${l.b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke={s >= 0 ? C.good : C.bad}
                    strokeWidth={(touches ? 1.5 : 1) * (1 + 4 * (l.seconds / maxLinkSeconds))}
                    strokeOpacity={focusId === null ? base : touches ? Math.max(0.55, base + 0.3) : 0.03}
                    strokeLinecap="round" style={{ transition: 'stroke-opacity .15s' }}
                    // Pointillés : échantillon encore mince, même ramené vers 0.
                    strokeDasharray={l.possessions < RELIABLE_POSSESSIONS ? '5 6' : undefined} />
                );
              })}

              {shownNodes.map(n => {
                const p = positions.get(n.id);
                if (!p) return null;
                const r = radius(n);
                const color = valueColor(n.vsTeam);
                const isSel = selectedId === n.id;
                return (
                  <g key={n.id} className="chem-node" tabIndex={0} role="button"
                    aria-label={`${nameOf(n.id)}, ${fmtSigned(n.vsTeam)} par rapport à l'équipe`}
                    opacity={isRelated(n.id) ? 1 : 0.25}
                    onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(n.id)} onBlur={() => setHoverId(null)}
                    onClick={e => { e.stopPropagation(); toggle(n.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n.id); } }}>
                    <title>{`${nameOf(n.id)} — ${fmtSigned(n.vsTeam)} vs équipe (${fmtSigned(n.net)} /100 sur le terrain), ${formatClock(Math.round(n.seconds))}`}</title>
                    {isSel && <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={6} />}
                    {/* Fond opaque d'abord : sans lui, les traits traversent les points. */}
                    <circle cx={p.x} cy={p.y} r={r} fill={C.panel} />
                    <circle className="chem-ring" cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.18 + 0.5 * intensity(n.vsTeam)}
                      stroke={color} strokeWidth={isSel ? 2.5 : 1.5} />
                    <text x={p.x} y={p.y + 4} textAnchor="middle" fill={C.text} fontSize={11} fontWeight={700}
                      style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                      {fmtSigned(n.vsTeam)}
                    </text>
                    {/* Halo de la couleur du fond : le nom reste lisible par-dessus un trait. */}
                    <text x={p.x} y={p.y + r + 15} textAnchor="middle" fill={isSel ? C.text : C.soft} fontSize={12} fontWeight={600}
                      stroke={C.ink} strokeWidth={4} strokeLinejoin="round" style={{ paintOrder: 'stroke', pointerEvents: 'none' }}>
                      {nameOf(n.id)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          <p style={{ color: C.ghost, fontSize: '0.72rem', margin: 0, lineHeight: 1.5 }}>
            Les distances sont un compromis : une carte à plat ne peut pas respecter tous les duos à la fois. Les traits et le tableau font foi.
          </p>
        </div>

        {/* ── Partenaires du joueur sélectionné ── */}
        <div style={{ ...PANEL, flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {!selected ? (
            <>
              <p style={SECTION_TITLE}>Partenaires</p>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '24px 8px', color: C.ghost }}>
                <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
                  <circle cx="10" cy="22" r="5" fill="none" stroke={C.ghost} strokeWidth="1.5" />
                  <circle cx="26" cy="12" r="5" fill="none" stroke={C.ghost} strokeWidth="1.5" />
                  <line x1="14" y1="19" x2="22" y2="15" stroke={C.ghost} strokeWidth="1.5" />
                </svg>
                <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, maxWidth: 220 }}>
                  Sélectionnez un joueur sur la carte ou dans le tableau pour voir avec qui l'associer, et qui éviter.
                </p>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <p style={{ ...SECTION_TITLE, marginBottom: 4 }}>Partenaires</p>
                  <p style={{ margin: 0, color: C.text, fontSize: '1rem', fontWeight: 700 }}>{nameOf(selected.id)}</p>
                  <p style={{ margin: '2px 0 0', color: C.faint, fontSize: '0.74rem' }}>
                    {formatClock(Math.round(selected.seconds))} sur le terrain
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, color: valueColor(selected.vsTeam), fontSize: '1.25rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtSigned(selected.vsTeam)}
                  </p>
                  <p style={{ margin: 0, color: C.faint, fontSize: '0.68rem' }}>vs équipe /100</p>
                </div>
              </div>
              <PartnerList title="À associer" items={partners.good} nameOf={nameOf} maxAbs={maxAbsSynergy} onPick={toggle} />
              <PartnerList title="À éviter" items={partners.bad} nameOf={nameOf} maxAbs={maxAbsSynergy} onPick={toggle} />
              {selectedFives.length > 0 && (
                <div>
                  <p style={{ ...SECTION_TITLE, color: C.faint, fontSize: '0.62rem', marginBottom: 6 }}>Meilleurs cinq</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedFives.map(f => (
                      <div key={f.players.join(',')} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center',
                        padding: '8px 10px', borderRadius: 8, backgroundColor: C.ink, border: `1px solid ${C.line}` }}>
                        <span style={{ color: C.soft, fontSize: '0.74rem', lineHeight: 1.4 }}>
                          {f.players.filter(id => id !== selectedId).map(nameOf).join(' · ')}
                        </span>
                        <span style={{ textAlign: 'right' }}>
                          <span style={{ display: 'block', color: valueColor(f.net), fontWeight: 700, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(f.net)}</span>
                          <span style={{ display: 'block', color: C.faint, fontSize: '0.66rem' }}>{Math.round(f.seconds / 60)} min</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => openInLineups(selectedId!)}
                style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
                  border: `1px solid ${C.border}`, backgroundColor: C.ink, color: C.soft, fontWeight: 600 }}>
                Voir ses lineups →
              </button>
              {partners.good.length + partners.bad.length === 0 && (
                <p style={{ color: C.ghost, fontSize: '0.8rem', margin: 0 }}>Aucun duo de plus de {minSeconds / 60} min pour ce joueur.</p>
              )}
              <p style={{ color: C.ghost, fontSize: '0.7rem', margin: 'auto 0 0', lineHeight: 1.5 }}>
                Synergie : points pour 100 possessions au-delà de ce qu'on attendait du duo, ramenés vers 0 sur un petit échantillon.
                Cinq : écart pour 100 possessions, sur au moins {minSeconds / 120} min.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Tableau joueurs × joueurs ── */}
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={SECTION_TITLE}>Synergie des duos</p>
          <ScaleLegend />
        </div>
        {shownNodes.length >= 2 && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '1 1 260px', maxWidth: 360 }}>
            <DuoList title="Meilleurs duos" items={topDuos.good} nameOf={nameOf} maxAbs={maxAbsSynergy} onPick={toggle} empty="Aucun duo nettement au-dessus." />
            <DuoList title="Duos à éviter" items={topDuos.bad} nameOf={nameOf} maxAbs={maxAbsSynergy} onPick={toggle} empty="Aucun duo nettement en dessous." />
          </div>
          <div style={{ overflowX: 'auto', flex: '3 1 480px', minWidth: 0 }} onMouseLeave={() => setHoverId(null)}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: '0.72rem', margin: '0 auto' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, backgroundColor: C.panel }} />
                  {shownNodes.map(n => (
                    <th key={n.id} className="chem-head" onClick={() => toggle(n.id)} onMouseEnter={() => setHoverId(n.id)}
                      style={{ padding: 0, height: 92, verticalAlign: 'bottom', color: focusId === n.id ? C.text : C.faint, fontWeight: 600 }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', margin: '0 auto', paddingTop: 6 }}>
                        {nameOf(n.id)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownNodes.map(row => (
                  <tr key={row.id}>
                    <th className="chem-head" scope="row" onClick={() => toggle(row.id)} onMouseEnter={() => setHoverId(row.id)}
                      style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: C.panel, padding: '0 10px 0 0', textAlign: 'right',
                        color: focusId === row.id ? C.text : C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {nameOf(row.id)}
                    </th>
                    {shownNodes.map(col => {
                      const inFocus = focusId === null || row.id === focusId || col.id === focusId;
                      if (col.id === row.id) {
                        // Diagonale : l'apport du joueur lui-même, en contour pour ne pas le lire comme un duo.
                        return (
                          <td key={col.id} className="chem-cell" title={`${nameOf(row.id)} : ${fmtSigned(row.vsTeam)} vs équipe (${fmtSigned(row.net)} /100 sur le terrain)`}
                            style={{ ...CELL, boxShadow: `inset 0 0 0 1.5px ${valueColor(row.vsTeam)}`, color: valueColor(row.vsTeam), opacity: inFocus ? 1 : 0.3 }}>
                            {fmtSigned(row.vsTeam)}
                          </td>
                        );
                      }
                      const l = linkOf(row.id, col.id);
                      return (
                        <td key={col.id} className="chem-cell"
                          title={l ? cellTitle(nameOf(row.id), nameOf(col.id), l) : `${nameOf(row.id)} + ${nameOf(col.id)} : moins de ${minSeconds / 60} min ensemble`}
                          onClick={() => toggle(row.id)} onMouseEnter={() => setHoverId(row.id)}
                          style={{
                            ...CELL, cursor: 'pointer',
                            backgroundColor: l ? tint(l.synergy) : '#12151B',
                            color: l ? (strong(l.synergy) ? '#FFFFFF' : isNeutral(l.synergy) ? C.faint : C.soft) : '#2A2F3A',
                            fontWeight: l && strong(l.synergy) ? 700 : 500,
                            opacity: inFocus ? 1 : 0.3,
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
          </div>
        )}
        <p style={{ color: C.ghost, fontSize: '0.72rem', margin: 0, lineHeight: 1.5 }}>
          Chaque case : ce que le duo fait de plus (ou de moins) que la moyenne de ses deux joueurs, pour 100 possessions,
          ramené vers 0 sur un petit échantillon. Entre −{NEUTRAL_BAND} et +{NEUTRAL_BAND} : neutre. En diagonale, l'apport du joueur
          par rapport à l'équipe. « · » : moins de {minSeconds / 60} min ensemble.
        </p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '5px 10px', borderRadius: 999, backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
      <strong style={{ color: C.text, fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
      <span style={{ color: C.faint, fontSize: '0.72rem' }}>{label}</span>
    </span>
  );
}

function Legend() {
  const item = (swatch: React.ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{swatch}<span>{label}</span></span>
  );
  const dot = (color: string) => <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: `${color}55`, border: `1.5px solid ${color}` }} />;
  const bar = (color: string) => <span style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: color }} />;
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: C.faint, fontSize: '0.7rem' }}>
      {item(<span style={{ display: 'inline-flex', gap: 3 }}>{dot(C.good)}{dot(C.bad)}</span>, 'Apport vs équipe')}
      {item(<span style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${C.faint}` }} />, 'Taille = temps de jeu')}
      {item(<span style={{ display: 'inline-flex', gap: 3 }}>{bar(C.good)}{bar(C.bad)}</span>, 'Synergie du duo')}
      {item(<span style={{ width: 18, height: 0, borderTop: `2px dashed ${C.faint}` }} />, `< ${RELIABLE_POSSESSIONS} poss.`)}
    </div>
  );
}

/** Échelle de couleur du tableau, de −20 à +20. */
function ScaleLegend() {
  const steps = [-12, -7, -4, 0, 4, 7, 12];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.faint, fontSize: '0.7rem' }}>
      <span>Moins bien</span>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {steps.map(v => <span key={v} style={{ width: 16, height: 10, borderRadius: 3, backgroundColor: tint(v) }} />)}
      </span>
      <span>Mieux qu'attendu</span>
    </div>
  );
}

function PartnerList({ title, items, nameOf, maxAbs, onPick }: {
  title: string;
  items: { id: string; link: ChemistryLink }[];
  nameOf: (id: string) => string;
  maxAbs: number;
  onPick: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p style={{ ...SECTION_TITLE, color: C.faint, fontSize: '0.62rem', marginBottom: 6 }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(({ id, link }) => {
          const s = link.synergy ?? 0;
          return (
            <button key={id} onClick={() => onPick(id)} title={`Voir ${nameOf(id)}`}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px 64px 36px', alignItems: 'center', gap: 10,
                padding: '6px 4px', background: 'none', border: 'none', borderBottom: `1px solid ${C.line}`,
                cursor: 'pointer', textAlign: 'left', font: 'inherit', borderRadius: 4,
              }}>
              <span style={{ color: C.text, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
              <span style={{ color: C.faint, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                {Math.round(link.seconds / 60)} min
              </span>
              <span style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.max(6, (Math.abs(s) / maxAbs) * 100)}%`, backgroundColor: valueColor(s), borderRadius: 3 }} />
              </span>
              <span style={{ color: valueColor(s), fontWeight: 700, fontSize: '0.8rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtSigned(s)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CELL: React.CSSProperties = {
  width: 42, minWidth: 42, height: 30, textAlign: 'center', borderRadius: 6,
  fontVariantNumeric: 'tabular-nums', transition: 'opacity .15s',
};

const intensity = (v: number | null) => (v === null ? 0 : Math.min(1, Math.abs(v) / COLOR_SCALE));
const isNeutral = (v: number | null) => v === null || Math.abs(v) < NEUTRAL_BAND;
const strong = (v: number | null) => intensity(v) > 0.45;
const valueColor = (v: number | null) => (isNeutral(v) ? C.neutral : v! > 0 ? C.good : C.bad);
/** Fond d'une case : la couleur du signe, d'autant plus franche que la valeur est forte ; gris
 *  discret dans la bande neutre. */
function tint(v: number | null): string {
  if (v === null) return 'transparent';
  if (isNeutral(v)) return '#64748B1F';
  const alpha = Math.round((0.14 + 0.62 * intensity(v)) * 255).toString(16).padStart(2, '0');
  return `${valueColor(v)}${alpha}`;
}
const fmtSigned = (v: number | null) => {
  if (v === null) return '—';
  const r = Math.round(v);
  return `${r > 0 ? '+' : ''}${r}`;
};

function cellTitle(a: string, b: string, l: ChemistryLink): string {
  return `${a} + ${b} — ${formatClock(Math.round(l.seconds))} ensemble, ${Math.round(l.possessions)} possessions\n`
    + `Duo : ${fmtSigned(l.duoNet)} /100 · attendu : ${fmtSigned(l.expected)}\n`
    + `Synergie : ${fmtSigned(l.synergy)} (brute ${fmtSigned(l.rawSynergy)}, ramenée vers 0 selon l'échantillon)`;
}

function DuoList({ title, items, nameOf, maxAbs, onPick, empty }: {
  title: string;
  items: ChemistryLink[];
  nameOf: (id: string) => string;
  maxAbs: number;
  onPick: (id: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p style={{ ...SECTION_TITLE, color: C.faint, fontSize: '0.62rem', marginBottom: 6 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ color: C.ghost, fontSize: '0.76rem', margin: 0 }}>{empty}</p>
      ) : items.map(l => {
        const s = l.synergy ?? 0;
        return (
          <div key={`${l.a}|${l.b}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px 56px 32px', alignItems: 'center', gap: 10,
            padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>
              <button onClick={() => onPick(l.a)} style={LINK_BTN}>{nameOf(l.a)}</button>
              <span style={{ color: C.ghost }}> + </span>
              <button onClick={() => onPick(l.b)} style={LINK_BTN}>{nameOf(l.b)}</button>
            </span>
            <span style={{ color: C.faint, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{Math.round(l.seconds / 60)} min</span>
            <span style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(6, (Math.abs(s) / maxAbs) * 100)}%`, backgroundColor: valueColor(s), borderRadius: 3 }} />
            </span>
            <span style={{ color: valueColor(s), fontWeight: 700, fontSize: '0.8rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(s)}</span>
          </div>
        );
      })}
    </div>
  );
}

const LINK_BTN: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer',
};

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    height: 28, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer', border: 'none',
    backgroundColor: active ? '#00E5A01F' : 'transparent',
    color: active ? C.good : C.muted, fontWeight: active ? 700 : 500,
    boxShadow: active ? `inset 0 0 0 1px ${C.good}66` : 'none',
  };
}
