import type { CSSProperties, Ref, SVGProps } from 'react';
import { DiagramCourt, COURT_COLORS } from './DiagramCourt';
import {
  COURT_SIZE, MARKER, renderAction, arrowPoints, barSegment,
  type DiagramScene, type DiagramElement,
} from '../utils/diagram';

/**
 * Rendu d'un schéma — sans aucune interaction. Sert à la fois de zone de dessin sous
 * l'éditeur, de vignette dans la fiche exercice et de source pour l'export PNG : un seul
 * rendu, donc aucune divergence possible entre ce que le coach dessine et l'image produite.
 *
 * La police est une pile système explicite : lors de l'export, le SVG est rasterisé dans un
 * contexte isolé qui n'a pas accès aux @font-face du document — une police maison y
 * retomberait silencieusement sur un fallback et décalerait tous les numéros.
 */

const FONT = 'Arial, Helvetica, sans-serif';

/** Marge autour du terrain, pour qu'un marqueur posé sur une ligne de touche ne soit pas rogné. */
export const VIEW_MARGIN = 0.9;

export const ELEMENT_COLORS = {
  off:       '#00E5A0',
  def:       '#F87171',
  ball:      '#F97316',
  cone:      '#FBBF24',
  text:      '#F1F5F9',
  action:    '#E2E8F0',
  selection: '#38BDF8',
  outside:   '#0D0F14',
} as const;

export function sceneViewBox(scene: DiagramScene): string {
  const { w, h } = COURT_SIZE[scene.court];
  return `${-VIEW_MARGIN} ${-VIEW_MARGIN} ${w + VIEW_MARGIN * 2} ${h + VIEW_MARGIN * 2}`;
}

export function sceneAspect(scene: DiagramScene): number {
  const { w, h } = COURT_SIZE[scene.court];
  return (w + VIEW_MARGIN * 2) / (h + VIEW_MARGIN * 2);
}

/* ── Marqueurs ────────────────────────────────────────────────────────────── */

function Player({ el }: { el: Extract<DiagramElement, { type: 'player' }> }) {
  const color = el.team === 'off' ? ELEMENT_COLORS.off : ELEMENT_COLORS.def;
  const r = MARKER.playerR;
  return (
    <g>
      {el.team === 'off' ? (
        <circle cx={el.x} cy={el.y} r={r} fill={COURT_COLORS.surface} stroke={color} strokeWidth={MARKER.strokeW} />
      ) : (
        <rect
          x={el.x - r} y={el.y - r} width={r * 2} height={r * 2} rx={0.14}
          fill={COURT_COLORS.surface} stroke={color} strokeWidth={MARKER.strokeW}
        />
      )}
      <text
        x={el.x} y={el.y} fill={color} fontFamily={FONT} fontSize={0.86} fontWeight={700}
        textAnchor="middle" dominantBaseline="central"
      >
        {el.label}
      </text>
    </g>
  );
}

/** Un point orange plein : à cette taille, toute tentative de « vrai ballon » salit le trait. */
function Ball({ el }: { el: Extract<DiagramElement, { type: 'ball' }> }) {
  return <circle cx={el.x} cy={el.y} r={MARKER.ballR} fill={ELEMENT_COLORS.ball} />;
}

function Cone({ el }: { el: Extract<DiagramElement, { type: 'cone' }> }) {
  const r = MARKER.coneR;
  return (
    <polygon
      points={`${el.x},${el.y - r} ${el.x + r * 0.85},${el.y + r * 0.7} ${el.x - r * 0.85},${el.y + r * 0.7}`}
      fill={ELEMENT_COLORS.cone}
    />
  );
}

function Label({ el }: { el: Extract<DiagramElement, { type: 'text' }> }) {
  return (
    <text
      x={el.x} y={el.y} fill={ELEMENT_COLORS.text} fontFamily={FONT} fontSize={MARKER.textH}
      fontWeight={600} textAnchor="middle" dominantBaseline="central"
    >
      {el.text}
    </text>
  );
}

function Action({ el }: { el: Extract<DiagramElement, { type: 'action' }> }) {
  const a = renderAction(el);
  return (
    <g stroke={ELEMENT_COLORS.action} strokeWidth={MARKER.strokeW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={a.d} strokeDasharray={a.dash} />
      {a.arrow && <polygon points={arrowPoints(a.arrow.tip, a.arrow.angle)} fill={ELEMENT_COLORS.action} stroke="none" />}
      {a.bars?.map((b, i) => <line key={i} {...barSegment(b.at, b.angle)} />)}
      {a.target && <circle cx={a.target.x} cy={a.target.y} r={0.3} />}
    </g>
  );
}

/** Rendu d'un élément isolé — exporté pour l'aperçu de dépôt de l'éditeur, qui doit montrer
 *  exactement le marqueur qui sera posé. */
export function DiagramElementView({ el }: { el: DiagramElement }) {
  switch (el.type) {
    case 'player': return <Player el={el} />;
    case 'ball':   return <Ball   el={el} />;
    case 'cone':   return <Cone   el={el} />;
    case 'text':   return <Label  el={el} />;
    case 'action': return <Action el={el} />;
  }
}

/**
 * Halo de sélection. Marqué `data-editor-only` : c'est une aide à l'édition, l'export PNG
 * retire ces nœuds avant de rasteriser (voir utils/diagramExport.ts).
 */
function Selection({ el }: { el: DiagramElement }) {
  const common = { fill: 'none', stroke: ELEMENT_COLORS.selection, strokeWidth: 0.12, strokeDasharray: '0.3 0.24' } as const;
  const shape = el.type === 'action'
    ? <path d={renderAction(el).d} fill="none" stroke={ELEMENT_COLORS.selection} strokeWidth={MARKER.strokeW * 3.4} opacity={0.28} strokeLinecap="round" />
    : <circle
        cx={el.x} cy={el.y}
        r={(el.type === 'player' ? MARKER.playerR : el.type === 'ball' ? MARKER.ballR : el.type === 'cone' ? MARKER.coneR : MARKER.textH) + 0.28}
        {...common}
      />;
  return <g data-editor-only="">{shape}</g>;
}

/* ── Vue ──────────────────────────────────────────────────────────────────── */

export function DiagramSceneView({
  scene, selectedId, svgRef, style, className, children, ...pointerHandlers
}: {
  scene: DiagramScene;
  selectedId?: string | null;
  svgRef?: Ref<SVGSVGElement>;
  style?: CSSProperties;
  className?: string;
  /** Surcouche d'édition (poignées, aperçu du tracé en cours), dans le repère du terrain. */
  children?: React.ReactNode;
} & Pick<SVGProps<SVGSVGElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>) {
  const selected = selectedId ? scene.elements.find(el => el.id === selectedId) : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={sceneViewBox(scene)}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'block', width: '100%', height: '100%',
        // Sans ça, glisser une poignée surligne les numéros et les libellés du schéma comme
        // du texte de page — le navigateur interprète le geste comme une sélection.
        userSelect: 'none', WebkitUserSelect: 'none',
        ...style,
      }}
      className={className}
      {...pointerHandlers}
    >
      <rect
        x={-VIEW_MARGIN} y={-VIEW_MARGIN}
        width={COURT_SIZE[scene.court].w + VIEW_MARGIN * 2}
        height={COURT_SIZE[scene.court].h + VIEW_MARGIN * 2}
        fill={ELEMENT_COLORS.outside}
      />
      <DiagramCourt court={scene.court} />
      {/* Les actions passent sous les marqueurs : un tracé ne doit jamais barrer un numéro. */}
      {scene.elements.filter(el => el.type === 'action').map(el => <DiagramElementView key={el.id} el={el} />)}
      {selected && <Selection el={selected} />}
      {scene.elements.filter(el => el.type !== 'action').map(el => <DiagramElementView key={el.id} el={el} />)}
      {children}
    </svg>
  );
}
