import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSeasonMatchFives } from '../hooks/useSeasonMatchFives';
import { chemistryFromMatches, layoutChemistry, pairSplit, pairVerdict, playerReport, type ChemistryLink, type ChemistryNode, type PairSplit, type PairVerdictKind } from '../data/lineupChemistry';
import {
  combosAcrossMatches, SEASON_MIN_PRESETS, SEASON_DEFAULT_MIN, MIN_PARAM, RELIABLE_SECONDS, NET_LABEL, NET_HELP, minPresetLabel,
} from '../data/matchEvents';
import { useUrlState } from '../hooks/useUrlState';
import { formatClock } from '../data/liveTrackingAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player } from '../data/types';

/**
 * Carte des affinités : un point par joueur, proches quand leur duo fait mieux que l'équipe, loin
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

/** Valeur (pts/100) à laquelle une couleur atteint son intensité maximale. */
const COLOR_SCALE = 25;
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
  // Même seuil, même clé d'adresse que l'onglet Lineups : un duo visible ici l'est là-bas, et inversement.
  const [minParam, setMinParam] = useUrlState(MIN_PARAM, String(SEASON_DEFAULT_MIN), { allowed: SEASON_MIN_PRESETS.map(String) });
  const minSeconds = Number(minParam);
  const setMinSeconds = (s: number) => setMinParam(String(s));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Duo ouvert dans le panneau : « ensemble / chacun sans l'autre ». */
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Le survol prévisualise, le clic fige : la carte et le tableau suivent le même joueur. */
  const focusId = hoverId ?? selectedId;

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const nameOf = (id: string) => nameById.get(id) ?? '?';

  const { nodes, links, teamNet } = useMemo(() => chemistryFromMatches(matchFives), [matchFives]);

  /** Joueurs retenus : assez de temps sur le terrain, triés par apport (le tableau suit cet ordre). */
  const shownNodes = useMemo(
    () => nodes.filter(n => n.seconds >= minSeconds)
      .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity)),
    [nodes, minSeconds],
  );
  const nodeById = useMemo(() => new Map(shownNodes.map(n => [n.id, n])), [shownNodes]);
  /** Duos lisibles : les deux joueurs affichés ET assez de temps ensemble. */
  const shownLinks = useMemo(
    () => links.filter(l => nodeById.has(l.a) && nodeById.has(l.b) && l.seconds >= minSeconds && l.duoNet !== null),
    [links, nodeById, minSeconds],
  );
  const linkOf = useMemo(() => {
    const m = new Map(shownLinks.map(l => [`${l.a}|${l.b}`, l]));
    return (x: string, y: string) => m.get(x < y ? `${x}|${y}` : `${y}|${x}`);
  }, [shownLinks]);
  /** Tous les duos, même sous le seuil : une case « · » dit quand même ce qu'elle cache. */
  const anyLinkOf = useMemo(() => {
    const m = new Map(links.map(l => [`${l.a}|${l.b}`, l]));
    return (x: string, y: string) => m.get(x < y ? `${x}|${y}` : `${y}|${x}`);
  }, [links]);
  /** Duos entre joueurs affichés, mais sous le seuil de temps — comptés pour ne pas disparaître en silence. */
  const hiddenDuos = useMemo(
    () => links.filter(l => nodeById.has(l.a) && nodeById.has(l.b) && l.seconds < minSeconds && l.seconds > 0).length,
    [links, nodeById, minSeconds],
  );

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

  /** Tous les duos du joueur sélectionné, du meilleur au moins bon. */
  const partners = useMemo(() => {
    if (!selectedId) return [];
    return shownLinks
      .filter(l => l.a === selectedId || l.b === selectedId)
      .map(l => ({ id: l.a === selectedId ? l.b : l.a, link: l }))
      .sort((x, y) => (y.link.duoNet ?? 0) - (x.link.duoNet ?? 0));
  }, [shownLinks, selectedId]);
  const maxAbsNet = Math.max(1, ...shownLinks.map(l => Math.abs(l.duoNet ?? 0)));

  /** Meilleurs et pires duos — seulement parmi ceux assez joués : sinon deux minutes heureuses
   *  passeraient en tête. */
  const topDuos = useMemo(() => {
    const sorted = shownLinks
      .filter(l => l.seconds >= RELIABLE_SECONDS)
      .sort((x, y) => (y.duoNet ?? 0) - (x.duoNet ?? 0));
    const good = sorted.slice(0, TOP_DUOS);
    return { good, bad: sorted.filter(l => !good.includes(l)).reverse().slice(0, TOP_DUOS) };
  }, [shownLinks]);

  /** Cinq complets cumulés sur la période : « dans quel cinq le faire jouer », après « avec qui ». */
  const fives = useMemo(() => combosAcrossMatches(matchFives, 5), [matchFives]);
  const selectedFives = useMemo(() => {
    if (!selectedId) return [];
    return fives
      .filter(f => f.players.includes(selectedId) && f.seconds >= minSeconds / 2
        && f.pointsPerPossession !== null && f.oppPointsPerPossession !== null)
      .map(f => ({ players: f.players, seconds: f.seconds, net: (f.pointsPerPossession! - f.oppPointsPerPossession!) * 100 }))
      .sort((x, y) => y.net - x.net)
      .slice(0, TOP_FIVES);
  }, [fives, selectedId, minSeconds]);

  /** Onglet Lineups, filtré sur ces joueurs — en gardant la période, le seuil et l'équipe de l'adresse. */
  const openInLineups = (ids: string[]) => {
    const params = new URLSearchParams(location.search);
    params.set('avec', ids.join(','));
    navigate(`/performance-collective/lineups?${params}`);
  };

  const split = useMemo(() => (pair ? pairSplit(matchFives, pair[0], pair[1]) : null), [matchFives, pair]);

  /** Bilan texte de chaque joueur affiché, dans l'ordre du tableau. */
  const reports = useMemo(
    () => shownNodes.map(node => ({ node, lines: playerReport(node, teamNet, links, matchFives, nameOf, RELIABLE_SECONDS) })),
    // `nameOf` dépend des joueurs, qui ne changent pas pendant la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownNodes, teamNet, links, matchFives, nameById],
  );

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

  const toggle = (id: string) => { setPair(null); setSelectedId(s => (s === id ? null : id)); };
  /** Ouvre un duo ; la carte suit le premier joueur, pour garder ses traits en évidence. */
  const openPair = (a: string, b: string) => { setPair([a, b]); setSelectedId(a); };
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
          <Stat value={shownLinks.length} label="duos affichés" />
          {hiddenDuos > 0 && <Stat value={hiddenDuos} label={`sous ${minPresetLabel(minSeconds)}`} />}
          {teamNet !== null && <Stat value={fmtSigned(teamNet)} label={`${NET_LABEL} équipe`} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.faint, fontSize: '0.74rem' }}>Au moins ensemble</span>
          <div role="group" aria-label="Temps minimum ensemble" style={{ display: 'flex', padding: 3, gap: 2, borderRadius: 8, backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
            {SEASON_MIN_PRESETS.map(s => (
              <button key={s} onClick={() => setMinSeconds(s)} aria-pressed={minSeconds === s} style={segmentStyle(minSeconds === s)}>
                {minPresetLabel(s)}
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
              Pas assez de joueurs avec au moins {minPresetLabel(minSeconds)} sur le terrain.
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
                const s = l.duoNet ?? 0;
                const base = 0.12 + 0.5 * intensity(s);
                return (
                  <line key={`${l.a}|${l.b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke={s >= 0 ? C.good : C.bad}
                    strokeWidth={(touches ? 1.5 : 1) * (1 + 4 * (l.seconds / maxLinkSeconds))}
                    strokeOpacity={focusId === null ? base : touches ? Math.max(0.55, base + 0.3) : 0.03}
                    strokeLinecap="round" style={{ transition: 'stroke-opacity .15s' }}
                    // Pointillés : échantillon trop mince pour conclure.
                    strokeDasharray={l.seconds < RELIABLE_SECONDS ? '5 6' : undefined} />
                );
              })}

              {shownNodes.map(n => {
                const p = positions.get(n.id);
                if (!p) return null;
                const r = radius(n);
                // Écart BRUT sur le terrain : rouge = l'équipe perd vraiment avec ce joueur, pas
                // « moins bien que la moyenne » — ce qui se lisait comme « mauvais joueur ».
                const color = valueColor(n.net);
                const isSel = selectedId === n.id;
                return (
                  <g key={n.id} className="chem-node" tabIndex={0} role="button"
                    aria-label={`${nameOf(n.id)}, ${fmtSigned(n.net)} pour 100 possessions sur le terrain`}
                    opacity={isRelated(n.id) ? 1 : 0.25}
                    onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(n.id)} onBlur={() => setHoverId(null)}
                    onClick={e => { e.stopPropagation(); toggle(n.id); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(n.id); } }}>
                    <title>{`${nameOf(n.id)} sur le terrain — ${NET_LABEL} : ${fmtSigned(n.net)} (${fmtSigned(n.vsTeam)} vs l'équipe), ${formatClock(Math.round(n.seconds))}`}</title>
                    {isSel && <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={6} />}
                    {/* Fond opaque d'abord : sans lui, les traits traversent les points. */}
                    <circle cx={p.x} cy={p.y} r={r} fill={C.panel} />
                    <circle className="chem-ring" cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.18 + 0.5 * intensity(n.net)}
                      stroke={color} strokeWidth={isSel ? 2.5 : 1.5} />
                    <text x={p.x} y={p.y + 4} textAnchor="middle" fill={C.text} fontSize={11} fontWeight={700}
                      style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                      {fmtSigned(n.net)}
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
          {pair && split ? (
            <PairView nameA={nameOf(pair[0])} nameB={nameOf(pair[1])} split={split}
              verdict={pairVerdict(split, nameOf(pair[0]), nameOf(pair[1]), RELIABLE_SECONDS)}
              onBack={() => setPair(null)} onOpenLineups={() => openInLineups(pair)} />
          ) : !selected ? (
            <>
              <p style={SECTION_TITLE}>Partenaires</p>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '24px 8px', color: C.ghost }}>
                <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
                  <circle cx="10" cy="22" r="5" fill="none" stroke={C.ghost} strokeWidth="1.5" />
                  <circle cx="26" cy="12" r="5" fill="none" stroke={C.ghost} strokeWidth="1.5" />
                  <line x1="14" y1="19" x2="22" y2="15" stroke={C.ghost} strokeWidth="1.5" />
                </svg>
                <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, maxWidth: 220 }}>
                  Cliquez sur un joueur pour voir ses duos, ou sur une case du tableau pour comparer deux joueurs ensemble et séparément.
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
                  <p style={{ margin: 0, color: valueColor(selected.net), fontSize: '1.25rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtSigned(selected.net)}
                  </p>
                  <p style={{ margin: 0, color: C.faint, fontSize: '0.68rem' }}>{NET_LABEL} sur le terrain</p>
                  <p style={{ margin: '2px 0 0', color: C.ghost, fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtSigned(selected.vsTeam)} vs moyenne équipe
                  </p>
                </div>
              </div>
              <PartnerList title="Ses duos" items={partners} nameOf={nameOf} maxAbs={maxAbsNet} onPick={id => openPair(selectedId!, id)} />
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
              <button onClick={() => openInLineups([selectedId!])}
                style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
                  border: `1px solid ${C.border}`, backgroundColor: C.ink, color: C.soft, fontWeight: 600 }}>
                Voir ses lineups →
              </button>
              {partners.length === 0 && (
                <p style={{ color: C.ghost, fontSize: '0.8rem', margin: 0 }}>Aucun duo d'au moins {minPresetLabel(minSeconds)} pour ce joueur.</p>
              )}
              <p style={{ color: C.ghost, fontSize: '0.7rem', margin: 'auto 0 0', lineHeight: 1.5 }}>
                {NET_HELP}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Tableau joueurs × joueurs ── */}
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={SECTION_TITLE}>Duos</p>
          <ScaleLegend />
        </div>
        {shownNodes.length >= 2 && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '1 1 260px', maxWidth: 360 }}>
            <DuoList title="Meilleurs duos" items={topDuos.good} nameOf={nameOf} maxAbs={maxAbsNet} onPick={openPair} empty={`Aucun duo d'au moins ${minPresetLabel(RELIABLE_SECONDS)} ensemble.`} />
            <DuoList title="Pires duos" items={topDuos.bad} nameOf={nameOf} maxAbs={maxAbsNet} onPick={openPair} empty="—" />
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
                        // Diagonale : le joueur lui-même sur le terrain, en contour pour ne pas le lire comme un duo.
                        return (
                          <td key={col.id} className="chem-cell" title={`${nameOf(row.id)} sur le terrain — ${NET_LABEL} : ${fmtSigned(row.net)} (${fmtSigned(row.vsTeam)} vs l'équipe)`}
                            style={{ ...CELL, boxShadow: `inset 0 0 0 1.5px ${valueColor(row.net)}`, color: valueColor(row.net), opacity: inFocus ? 1 : 0.3 }}>
                            {fmtSigned(row.net)}
                          </td>
                        );
                      }
                      const l = linkOf(row.id, col.id);
                      return (
                        <td key={col.id} className="chem-cell"
                          title={l ? cellTitle(nameOf(row.id), nameOf(col.id), l) : hiddenTitle(nameOf(row.id), nameOf(col.id), anyLinkOf(row.id, col.id), minSeconds)}
                          onClick={() => (anyLinkOf(row.id, col.id) ? openPair(row.id, col.id) : toggle(row.id))} onMouseEnter={() => setHoverId(row.id)}
                          style={{
                            ...CELL, cursor: 'pointer',
                            backgroundColor: l ? tint(l.duoNet) : '#12151B',
                            color: l ? (strong(l.duoNet) ? '#FFFFFF' : isNeutral(l.duoNet) ? C.faint : C.soft) : '#2A2F3A',
                            fontWeight: l && strong(l.duoNet) ? 700 : 500,
                            // Échantillon mince : estompé, pour qu'on ne le lise pas comme les autres.
                            opacity: !inFocus ? 0.3 : l && l.seconds < RELIABLE_SECONDS ? 0.5 : 1,
                          }}>
                          {l ? fmtSigned(l.duoNet) : '·'}
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
          {NET_HELP} Le même chiffre que l'onglet Lineups (Duos · Pour 100 poss.). Estompée : moins de {minPresetLabel(RELIABLE_SECONDS)} ensemble,
          à confirmer. En diagonale, le joueur seul sur le terrain. « · » : moins de {minPresetLabel(minSeconds)} ensemble (survolez pour la valeur).
        </p>
      </div>

      {/* ── Bilan par joueur, en phrases ── */}
      <div style={{ ...PANEL, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={SECTION_TITLE}>Bilan par joueur</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
          {reports.map(({ node, lines }) => (
            <div key={node.id} style={{ padding: '12px 14px', borderRadius: 10, backgroundColor: C.ink,
              border: `1px solid ${selectedId === node.id ? C.muted : C.line}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <button onClick={() => toggle(node.id)} title="Voir ses duos"
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: C.text, fontSize: '0.86rem', fontWeight: 700, textAlign: 'left' }}>
                  {nameOf(node.id)}
                </button>
                <span style={{ color: valueColor(node.net), fontWeight: 800, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(node.net)}</span>
              </div>
              {lines.map((line, i) => (
                <p key={i} style={{ margin: 0, color: i === 0 ? C.soft : C.muted, fontSize: '0.76rem', lineHeight: 1.55 }}>{line}</p>
              ))}
            </div>
          ))}
        </div>
        <p style={{ color: C.ghost, fontSize: '0.72rem', margin: 0, lineHeight: 1.5 }}>
          Un partenaire n'est cité qu'à partir de {minPresetLabel(RELIABLE_SECONDS)} ensemble. « À associer » / « à séparer » : comparaison
          entre jouer ensemble et chacun sans l'autre (cliquez sur une case du tableau pour le détail).
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
      {item(<span style={{ display: 'inline-flex', gap: 3 }}>{dot(C.good)}{dot(C.bad)}</span>, `${NET_LABEL} du joueur`)}
      {item(<span style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${C.faint}` }} />, 'Taille = temps de jeu')}
      {item(<span style={{ display: 'inline-flex', gap: 3 }}>{bar(C.good)}{bar(C.bad)}</span>, `${NET_LABEL} du duo`)}
      {item(<span style={{ width: 18, height: 0, borderTop: `2px dashed ${C.faint}` }} />, `< ${minPresetLabel(RELIABLE_SECONDS)}, à confirmer`)}
    </div>
  );
}

/** Échelle de couleur du tableau, de −25 à +25 pts/100. */
function ScaleLegend() {
  const steps = [-25, -15, -7, 0, 7, 15, 25];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.faint, fontSize: '0.7rem' }}>
      <span>Perdant</span>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {steps.map(v => <span key={v} style={{ width: 16, height: 10, borderRadius: 3, backgroundColor: tint(v) }} />)}
      </span>
      <span>Gagnant</span>
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
          const s = link.duoNet ?? 0;
          return (
            <button key={id} onClick={() => onPick(id)} title={`Ensemble, et chacun sans l'autre`}
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
    + `${NET_LABEL} : ${fmtSigned(l.duoNet)}`
    + (l.seconds < RELIABLE_SECONDS ? `\nMoins de ${minPresetLabel(RELIABLE_SECONDS)} ensemble : à confirmer` : '');
}

/** Case « · » : le duo existe peut-être, sous le seuil — on dit ce qu'il cache plutôt que rien. */
function hiddenTitle(a: string, b: string, l: ChemistryLink | undefined, minSeconds: number): string {
  if (!l || l.seconds === 0) return `${a} + ${b} : jamais ensemble sur le terrain`;
  return `${a} + ${b} — ${formatClock(Math.round(l.seconds))} ensemble : ${NET_LABEL} ${fmtSigned(l.duoNet)}\n`
    + `Sous le seuil de ${minPresetLabel(minSeconds)} : masqué de la carte et des listes`;
}

function DuoList({ title, items, nameOf, maxAbs, onPick, empty }: {
  title: string;
  items: ChemistryLink[];
  nameOf: (id: string) => string;
  maxAbs: number;
  onPick: (a: string, b: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p style={{ ...SECTION_TITLE, color: C.faint, fontSize: '0.62rem', marginBottom: 6 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ color: C.ghost, fontSize: '0.76rem', margin: 0 }}>{empty}</p>
      ) : items.map(l => {
        const s = l.duoNet ?? 0;
        return (
          <button key={`${l.a}|${l.b}`} onClick={() => onPick(l.a, l.b)} title="Ensemble, et chacun sans l'autre"
            style={{ ...ROW_BTN, gridTemplateColumns: 'minmax(0, 1fr) 44px 56px 32px' }}>
            <span style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>
              {nameOf(l.a)}<span style={{ color: C.ghost }}> + </span>{nameOf(l.b)}
            </span>
            <span style={{ color: C.faint, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{Math.round(l.seconds / 60)} min</span>
            <span style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.max(6, (Math.abs(s) / maxAbs) * 100)}%`, backgroundColor: valueColor(s), borderRadius: 3 }} />
            </span>
            <span style={{ color: valueColor(s), fontWeight: 700, fontSize: '0.8rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(s)}</span>
          </button>
        );
      })}
    </div>
  );
}

const ROW_BTN: React.CSSProperties = {
  display: 'grid', alignItems: 'center', gap: 10, width: '100%', padding: '6px 4px', background: 'none', border: 'none',
  borderBottom: `1px solid ${C.line}`, borderRadius: 4, cursor: 'pointer', textAlign: 'left', font: 'inherit',
};

const VERDICT_COLOR: Record<PairVerdictKind, string> = {
  together: C.good, apart: C.bad, aAlone: '#F59E0B', bAlone: '#F59E0B', even: C.muted, unsure: C.faint,
};

/** Un duo vu sous trois angles, avec sa conclusion en une phrase — pour un coach, pas un statisticien. */
function PairView({ nameA, nameB, split, verdict, onBack, onOpenLineups }: {
  nameA: string;
  nameB: string;
  split: PairSplit;
  verdict: { kind: PairVerdictKind; text: string };
  onBack: () => void;
  onOpenLineups: () => void;
}) {
  const rows: [string, PairSplit['together']][] = [
    ['Ensemble', split.together],
    [`${nameA} sans ${nameB}`, split.aWithout],
    [`${nameB} sans ${nameA}`, split.bWithout],
  ];
  const maxAbs = Math.max(10, ...rows.map(([, p]) => Math.abs(p.net ?? 0)));
  const color = VERDICT_COLOR[verdict.kind];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ ...SECTION_TITLE, marginBottom: 4 }}>Duo</p>
          <p style={{ margin: 0, color: C.text, fontSize: '1rem', fontWeight: 700 }}>{nameA} + {nameB}</p>
        </div>
        <button onClick={onBack} aria-label="Fermer le duo"
          style={{ height: 28, padding: '0 10px', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer', border: `1px solid ${C.border}`, backgroundColor: C.ink, color: C.muted }}>
          ← Retour
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(([label, p], i) => {
          const v = p.net;
          const w = v === null ? 0 : (Math.abs(v) / maxAbs) * 50;
          return (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ color: i === 0 ? C.text : C.soft, fontSize: '0.78rem', fontWeight: i === 0 ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ color: C.faint, fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{Math.round(p.seconds / 60)} min</span>
                </div>
                {/* Barre centrée sur 0 : à droite on gagne, à gauche on perd. */}
                <div style={{ position: 'relative', height: 8, borderRadius: 4, backgroundColor: C.ink }}>
                  <span style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, backgroundColor: C.border }} />
                  {v !== null && (
                    <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, backgroundColor: valueColor(v),
                      left: v >= 0 ? '50%' : `${50 - w}%`, width: `${Math.max(w, 1)}%` }} />
                  )}
                </div>
              </div>
              <span style={{ color: valueColor(v), fontWeight: 700, fontSize: '0.9rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtSigned(v)}</span>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, padding: '10px 12px', borderRadius: 8, fontSize: '0.8rem', lineHeight: 1.5, color: C.text,
        backgroundColor: `${color}14`, border: `1px solid ${color}55` }}>
        {verdict.text}
      </p>

      <details style={{ color: C.muted, fontSize: '0.74rem', lineHeight: 1.6 }}>
        <summary style={{ cursor: 'pointer', color: C.soft, fontWeight: 600 }}>Comment lire ?</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li><strong style={{ color: C.soft }}>Ensemble</strong> : le {NET_LABEL} quand les deux sont sur le terrain.</li>
          <li><strong style={{ color: C.soft }}>{nameA} sans {nameB}</strong> : quand {nameA} joue et {nameB} est sur le banc.</li>
          <li>Si « Ensemble » dépasse les deux autres lignes, elles se valorisent : à faire jouer ensemble. S'il est en dessous des deux, elles se gênent.</li>
          <li>Il faut au moins {minPresetLabel(RELIABLE_SECONDS)} dans chaque situation pour conclure.</li>
        </ul>
      </details>

      <button onClick={onOpenLineups}
        style={{ alignSelf: 'flex-start', height: 30, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
          border: `1px solid ${C.border}`, backgroundColor: C.ink, color: C.soft, fontWeight: 600, marginTop: 'auto' }}>
        Voir leurs lineups →
      </button>
    </>
  );
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    height: 28, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer', border: 'none',
    backgroundColor: active ? '#00E5A01F' : 'transparent',
    color: active ? C.good : C.muted, fontWeight: active ? 700 : 500,
    boxShadow: active ? `inset 0 0 0 1px ${C.good}66` : 'none',
  };
}
