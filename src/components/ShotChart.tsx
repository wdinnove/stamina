import { useId, useMemo } from 'react';
import { DiagramCourt, HalfCourtLines, COURT_COLORS } from './DiagramCourt';
import { COURT_SIZE, COURT_LINE_W, HALF } from '../utils/diagram';
import { CLOSE_R, ZONE_LABEL_POINTS, ZONE_ORDER, zoneTier, densityGrid, type ShotZone, type ZoneStatRow, type ZoneTier } from '../data/shotChart';
import type { MatchEvent } from '../data/types';

/**
 * Rendu des tirs sur un demi-terrain — partagé par l'écran de saisie et l'onglet d'analyse.
 *
 * La COULEUR dit l'équipe, la FORME dit la réussite (disque = réussi, croix = manqué) : deux
 * dimensions lisibles d'un coup d'œil, y compris quand les deux camps se superposent.
 *
 * Les tirs saisis sans position n'ont rien à faire ici — ils comptent au boxscore, pas à la carte.
 * C'est à l'appelant de les avoir écartés (`e.x !== undefined`).
 */

export interface ShotColors { made: string; miss: string }

/** Palette par défaut. Côté « nous », l'appelant remplace `made` par la couleur de l'équipe. */
export const SHOT_COLORS: Record<'us' | 'them', ShotColors> = {
  us:   { made: '#00E5A0', miss: '#EF4444' },
  them: { made: '#94A3B8', miss: '#64748B' },
};

/** Marqueurs d'un camp, dans le repère du demi-terrain — appelé une fois par équipe. */
export function ShotMarkers({ shots, colors, radius = 0.34 }: {
  shots: MatchEvent[]; colors: ShotColors; radius?: number;
}) {
  const arm = radius * 0.74;
  return (
    <>
      {shots.map(s => s.made
        // `matchId`+`seq` : `seq` seul n'est unique QUE dans un match. Cette carte est aussi
        // utilisée sur plusieurs matchs à la fois (`ShotChartExplorer`/saison) où deux matchs
        // partagent forcément des `seq` bas — une clé sur `seq` seul confondait alors deux tirs
        // de matchs différents, et React pouvait laisser un vieux marqueur affiché après un
        // changement de filtre au lieu de le retirer.
        ? <circle key={`${s.matchId}-${s.seq}`} cx={s.x} cy={s.y} r={radius} fill={colors.made} opacity={0.9} />
        : <g key={`${s.matchId}-${s.seq}`} stroke={colors.miss} strokeWidth={radius * 0.35} strokeLinecap="round" opacity={0.85}>
            <path d={`M ${s.x! - arm} ${s.y! - arm} L ${s.x! + arm} ${s.y! + arm}`} />
            <path d={`M ${s.x! + arm} ${s.y! - arm} L ${s.x! - arm} ${s.y! + arm}`} />
          </g>)}
    </>
  );
}

/** Le demi-terrain avec ses tirs, sans titre ni compteur — la brique nue. */
export function ShotCourt({ shots, colors, radius }: {
  shots: MatchEvent[]; colors: ShotColors; radius?: number;
}) {
  return (
    <svg viewBox={`0 0 ${COURT_SIZE.half.w} ${COURT_SIZE.half.h}`} style={{ width: '100%', display: 'block' }}>
      <DiagramCourt court="half" />
      <ShotMarkers shots={shots} colors={colors} radius={radius} />
    </svg>
  );
}

/** Grille de tir d'une équipe : le terrain, ses tirs, et le compte en dessous. */
export function ShotGrid({ title, shots, colors }: {
  title: string; shots: MatchEvent[]; colors: ShotColors;
}) {
  const made = shots.filter(s => s.made).length;
  const pct = shots.length > 0 ? Math.round((made / shots.length) * 100) : null;
  return (
    <div>
      <p style={{
        color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', margin: '0 0 8px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{title}</p>
      <ShotCourt shots={shots} colors={colors} />
      <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '8px 0 0', textAlign: 'center' }}>
        {shots.length === 0 ? 'Aucun tir positionné.' : `${made}/${shots.length} · ${pct} %`}
      </p>
    </div>
  );
}

const { basket: B, threeR: R3, threeInset: T3, threeStopV: T3V, laneHW, laneV, w: W, h: H } = HALF;

/** Dans l'axe, les tiers d'angle partent du panier à ±30° (même borne que `shotZone`). */
const RAY = { dx: 30 * Math.sin(Math.PI / 6), dy: 30 * Math.cos(Math.PI / 6) };
const WEDGE = {
  gauche: `M${B.u} ${B.v} L${B.u - RAY.dx} ${B.v + RAY.dy} L-50 ${B.v + RAY.dy} L-50 -50 L${B.u} -50Z`,
  axe:    `M${B.u} ${B.v} L${B.u - RAY.dx} ${B.v + RAY.dy} L${B.u + RAY.dx} ${B.v + RAY.dy}Z`,
  droite: `M${B.u} ${B.v} L${B.u + RAY.dx} ${B.v + RAY.dy} L50 ${B.v + RAY.dy} L50 -50 L${B.u} -50Z`,
};
/** L'intérieur de la ligne à 3 points (corners exclus). */
const INSIDE_ARC = `M${T3} 0 L${T3} ${T3V} A${R3} ${R3} 0 0 0 ${W - T3} ${T3V} L${W - T3} 0Z`;

/** Code feu tricolore : c'est ce qu'un coach lit sans légende. Le vert est celui de l'app. */
const TIER_COLORS: Record<ZoneTier, string> = { good: '#00E5A0', mid: '#FBBF24', bad: '#F43F5E' };
/** Mêmes teintes, un peu éclaircies pour rester lisibles en texte sur les pastilles sombres. */
const TIER_TEXT: Record<ZoneTier, string> = { good: '#5CF2C2', mid: '#FCD34D', bad: '#FB7185' };
const TIER_LABELS: Record<ZoneTier, string> = { good: 'bon', mid: 'moyen', bad: 'faible' };

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('');
}

/** Teinte OPAQUE (mélangée au parquet) : les zones se recouvrent de la plus lointaine à la plus
 *  proche, une transparence laisserait voir la couche du dessous. */
function zoneFill(z: ZoneStatRow | undefined): string {
  if (!z || z.fgPct === null) return COURT_COLORS.surface;
  return mix(COURT_COLORS.surface, TIER_COLORS[zoneTier(z.zone, z.fgPct)], 0.45);
}

/** Frontières des zones : le même trait fin que les lignes du terrain. */
const BORDER = { stroke: COURT_COLORS.line, strokeWidth: COURT_LINE_W, fill: 'none' } as const;

/**
 * Le demi-terrain colorié par zone selon le FG% — faible / moyen / bon d'après les seuils de
 * `zoneTier` — mêmes chiffres que la table « Par zone ». Une zone jamais tentée garde la couleur du
 * parquet.
 *
 * Les formes sont peintes de la plus lointaine à la plus proche, dans l'ordre inverse des tests de
 * `shotZone` : 3 pts par tiers d'angle, corners, mi-distance (découpée à l'arc), raquette, cercle.
 * Chaque couche recouvre la précédente, ce qui évite de calculer une seule intersection. Les
 * frontières sont tracées à part, AVANT raquette et cercle qui recouvrent la partie des rayons
 * qui les traverse.
 */
export function ShotZoneHeat({ zones }: { zones: ZoneStatRow[] }) {
  const clipId = useId();
  const byZone = new Map<ShotZone, ZoneStatRow>(zones.map(z => [z.zone, z]));
  const fill = (zone: ShotZone) => ({ fill: zoneFill(byZone.get(zone)) });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <defs><clipPath id={clipId}><path d={INSIDE_ARC} /></clipPath></defs>
      <rect x={0} y={0} width={W} height={H} fill={COURT_COLORS.surface} />

      <path d={WEDGE.gauche} {...fill('aile_gauche')} />
      <path d={WEDGE.axe} {...fill('arc_axe')} />
      <path d={WEDGE.droite} {...fill('aile_droite')} />
      <rect x={0} y={0} width={T3} height={T3V} {...fill('corner_gauche')} />
      <rect x={W - T3} y={0} width={T3} height={T3V} {...fill('corner_droite')} />
      <g clipPath={`url(#${clipId})`}>
        <path d={WEDGE.gauche} {...fill('mid_gauche')} />
        <path d={WEDGE.axe} {...fill('mid_axe')} />
        <path d={WEDGE.droite} {...fill('mid_droite')} />
      </g>

      <path d={`M${B.u} ${B.v} L${B.u - RAY.dx} ${B.v + RAY.dy} M${B.u} ${B.v} L${B.u + RAY.dx} ${B.v + RAY.dy}`} {...BORDER} />
      <path d={INSIDE_ARC} {...BORDER} />
      <path d={`M${T3} 0 V${T3V} H0 M${W - T3} 0 V${T3V} H${W}`} {...BORDER} />
      <rect x={B.u - laneHW} y={0} width={laneHW * 2} height={laneV} {...BORDER} fill={zoneFill(byZone.get('raquette'))} />
      <circle cx={B.u} cy={B.v} r={CLOSE_R} {...BORDER} fill={zoneFill(byZone.get('cercle'))} />

      <HalfCourtLines />
      <rect x={COURT_LINE_W / 2} y={COURT_LINE_W / 2} width={W - COURT_LINE_W} height={H - COURT_LINE_W} {...BORDER} />

      {ZONE_ORDER.map(zone => {
        const z = byZone.get(zone);
        if (!z || z.fgPct === null) return null;
        const p = ZONE_LABEL_POINTS[zone];
        const color = TIER_TEXT[zoneTier(zone, z.fgPct)];
        const pct = `${Math.round(z.fgPct)} %`;
        const count = `${z.made}/${z.attempts}`;
        const corner = zone === 'corner_gauche' || zone === 'corner_droite';
        return (
          <g key={zone} style={{ pointerEvents: 'none', fontFamily: 'inherit' }} textAnchor="middle">
            <title>{`${z.label} · ${count}`}</title>
            {corner ? (
              // 0,90 m de large : une pastille couchée le long de la ligne de touche.
              <g transform={`rotate(${zone === 'corner_gauche' ? -90 : 90} ${p.x} ${p.y})`}>
                <rect x={p.x - 1.2} y={p.y - 0.29} width={2.4} height={0.58} rx={0.29} fill="#0D0F14" fillOpacity={0.8} />
                <text x={p.x} y={p.y} dominantBaseline="central" fontSize={0.36} fontWeight={700} fill={color}>
                  {pct}<tspan fontWeight={500} fill="#94A3B8">{`  ${count}`}</tspan>
                </text>
              </g>
            ) : (
              <>
                <rect x={p.x - 0.9} y={p.y - 0.62} width={1.8} height={1.24} rx={0.3} fill="#0D0F14" fillOpacity={0.8} />
                <text x={p.x} y={p.y - 0.2} dominantBaseline="central" fontSize={0.46} fontWeight={800} fill={color}>{pct}</text>
                <text x={p.x} y={p.y + 0.3} dominantBaseline="central" fontSize={0.3} fontWeight={500} fill="#94A3B8">{count}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Sous ce nombre de tirs (un match, un joueur), la carte de densité lisse plus large. */
const FEW_SHOTS = 150;

/** Palette de la carte de densité (type « plasma ») : violet sombre → magenta → orange → jaune. */
const DENSITY_STOPS: [number, [number, number, number]][] = [
  [0, [13, 8, 135]], [0.3, [126, 3, 168]], [0.55, [204, 71, 120]], [0.8, [248, 149, 64]], [1, [240, 249, 33]],
];

function densityRgba(t: number): [number, number, number, number] {
  let i = 1;
  while (i < DENSITY_STOPS.length - 1 && t > DENSITY_STOPS[i][0]) i++;
  const [t0, a] = DENSITY_STOPS[i - 1], [t1, b] = DENSITY_STOPS[i];
  const u = (t - t0) / (t1 - t0);
  // Les très faibles densités s'effacent : le parquet reste visible hors des zones de tir.
  const alpha = t < 0.03 ? 0 : Math.min(1, t * 3);
  return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * u)).concat(Math.round(alpha * 235)) as [number, number, number, number];
}

const DENSITY_STEP = 0.2;

/**
 * Où l'on tire, en nappe lissée — tentatives, réussies ou non. La densité est calculée sur une
 * grille grossière puis peinte dans un petit canvas que le navigateur agrandit en le lissant : le
 * dégradé est continu sans un seul filtre SVG. Les lignes du terrain passent par-dessus.
 */
export function ShotDensityMap({ shots }: { shots: MatchEvent[] }) {
  const href = useMemo(() => {
    if (shots.length === 0) return null;
    // Peu de tirs → noyau plus large, sinon chaque tir isolé fait sa propre tache.
    const bandwidth = shots.length < FEW_SHOTS ? 1.1 : 0.75;
    const g = densityGrid(shots.map(s => ({ x: s.x!, y: s.y! })), DENSITY_STEP, bandwidth);
    const canvas = document.createElement('canvas');
    canvas.width = g.cols; canvas.height = g.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(g.cols, g.rows);
    g.values.forEach((v, i) => img.data.set(densityRgba(v), i * 4));
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }, [shots]);

  const { w, h } = COURT_SIZE.half;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
      <DiagramCourt court="half" />
      {href && <image href={href} x={0} y={0} width={w} height={h} preserveAspectRatio="none" />}
      <HalfCourtLines />
    </svg>
  );
}

/** Légende de la carte de densité : le dégradé, de « peu » à « beaucoup ». */
export function DensityLegend() {
  const gradient = DENSITY_STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      peu
      <span style={{ width: 110, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${gradient})` }} />
      beaucoup
    </span>
  );
}

/** Légende de la carte de réussite : les trois niveaux, dans les couleurs de la carte. */
export function ZoneTierLegend() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {(['bad', 'mid', 'good'] as const).map(t => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: TIER_COLORS[t] }} />
          {TIER_LABELS[t]}
        </span>
      ))}
    </span>
  );
}
