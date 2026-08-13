import { COURT_SIZE, COURT_LINE_W, HALF, type CourtVariant } from '../utils/diagram';

/**
 * Terrain de basket en SVG, aux cotes FIBA (voir utils/diagram.ts).
 *
 * Le demi-terrain est dessiné une seule fois dans son repère local (u = largeur, v =
 * profondeur, panier en haut) ; le terrain entier n'est que ce même demi-terrain posé deux
 * fois par une rotation. Le demi-cercle central est tracé par chaque moitié sur sa ligne
 * médiane : sur le terrain entier, les deux moitiés reforment donc le rond central sans
 * qu'il ait à être dessiné à part.
 *
 * Rend un `<g>` : c'est l'appelant qui fournit le `<svg>` et son `viewBox`, calé sur
 * COURT_SIZE.
 */

export const COURT_COLORS = {
  surface: '#151A21',
  border:  '#2A2F3A',
  line:    'rgba(148,163,184,0.55)',
  ring:    'rgba(241,245,249,0.9)',
} as const;

/** Rotations plaçant le demi-terrain local (15 × 14) aux deux extrémités du terrain entier. */
const FULL_HALVES = [
  'matrix(0 -1 1 0 0 15)',   // panier à gauche
  'matrix(0 1 -1 0 28 0)',   // panier à droite
] as const;

function arc(from: [number, number], to: [number, number], r: number, sweep: 0 | 1): string {
  return `M ${from[0]} ${from[1]} A ${r} ${r} 0 0 ${sweep} ${to[0]} ${to[1]}`;
}

/** Lignes d'un demi-terrain, dans son repère local. */
function HalfCourtLines({ transform }: { transform?: string }) {
  const { basket, laneHW, laneV, ftCircleR, restrictedR, threeR, threeInset, threeStopV, ringR, backboardV, backboardHW, centerR, w, h } = HALF;
  const laneL = basket.u - laneHW;
  const laneR = basket.u + laneHW;
  const threeL = threeInset;
  const threeR_ = w - threeInset;

  return (
    <g transform={transform} fill="none" stroke={COURT_COLORS.line} strokeWidth={COURT_LINE_W} strokeLinecap="round">
      {/* Ligne à 3 points : corners droits puis arc de 6,75 m autour du panier */}
      <path d={`M ${threeL} 0 L ${threeL} ${threeStopV} A ${threeR} ${threeR} 0 0 0 ${threeR_} ${threeStopV} L ${threeR_} 0`} />

      {/* Raquette */}
      <path d={`M ${laneL} 0 L ${laneL} ${laneV} L ${laneR} ${laneV} L ${laneR} 0`} />

      {/* Cercle de lancer franc : la moitié située dans la raquette est en pointillés (cote FIBA) */}
      <path d={arc([basket.u - ftCircleR, laneV], [basket.u + ftCircleR, laneV], ftCircleR, 1)} strokeDasharray="0.35 0.3" />
      <path d={arc([basket.u - ftCircleR, laneV], [basket.u + ftCircleR, laneV], ftCircleR, 0)} />

      {/* Zone de non-charge sous le panier */}
      <path d={`M ${basket.u - restrictedR} ${backboardV} L ${basket.u - restrictedR} ${basket.v}`} />
      <path d={`M ${basket.u + restrictedR} ${backboardV} L ${basket.u + restrictedR} ${basket.v}`} />
      <path d={arc([basket.u - restrictedR, basket.v], [basket.u + restrictedR, basket.v], restrictedR, 0)} />

      {/* Planche, tige et anneau */}
      <path d={`M ${basket.u - backboardHW} ${backboardV} L ${basket.u + backboardHW} ${backboardV}`} strokeWidth={COURT_LINE_W * 1.6} />
      <path d={`M ${basket.u} ${backboardV} L ${basket.u} ${basket.v - ringR}`} stroke={COURT_COLORS.ring} />
      <circle cx={basket.u} cy={basket.v} r={ringR} stroke={COURT_COLORS.ring} />

      {/* Demi-cercle central, sur la ligne médiane */}
      <path d={arc([basket.u - centerR, h], [basket.u + centerR, h], centerR, 1)} />
    </g>
  );
}

export function DiagramCourt({ court }: { court: CourtVariant }) {
  const { w, h } = COURT_SIZE[court];
  const inset = COURT_LINE_W / 2;

  return (
    <g>
      <rect x={0} y={0} width={w} height={h} fill={COURT_COLORS.surface} />
      <rect
        x={inset} y={inset} width={w - COURT_LINE_W} height={h - COURT_LINE_W}
        fill="none" stroke={COURT_COLORS.line} strokeWidth={COURT_LINE_W}
      />
      {court === 'half' ? (
        <HalfCourtLines />
      ) : (
        <>
          {/* Ligne médiane — sur le demi-terrain c'est le bord bas du cadre, ici il faut la tracer */}
          <path d={`M ${w / 2} 0 L ${w / 2} ${h}`} fill="none" stroke={COURT_COLORS.line} strokeWidth={COURT_LINE_W} />
          {FULL_HALVES.map(t => <HalfCourtLines key={t} transform={t} />)}
        </>
      )}
    </g>
  );
}
