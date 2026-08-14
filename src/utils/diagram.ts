/**
 * Schémas d'exercice — modèle de données et géométrie.
 *
 * Les coordonnées sont exprimées en MÈTRES dans le repère du terrain, jamais en pixels :
 * un schéma reste donc net à toutes les tailles (vignette, plein écran, impression) et
 * les cercles restent ronds puisque les deux axes ont la même unité.
 *
 * Deux formats de terrain, choisis par schéma :
 *   - `half` : demi-terrain en portrait, panier en haut  (15 m de large × 14 m de profondeur)
 *   - `full` : terrain entier en paysage                 (28 m × 15 m)
 *
 * Ce fichier ne contient aucun rendu React — uniquement le modèle, la géométrie et les
 * tracés, pour être testable sans DOM (voir diagram.test.ts).
 */

export type CourtVariant = 'half' | 'full';
export type DiagramTeam  = 'off' | 'def';
export type ActionKind   = 'dribble' | 'pass' | 'cut' | 'screen' | 'shot' | 'handoff';

export interface Pt { x: number; y: number }

export interface PlayerElement { id: string; type: 'player'; team: DiagramTeam; label: string; x: number; y: number }
export interface BallElement   { id: string; type: 'ball';   x: number; y: number }
export interface ConeElement   { id: string; type: 'cone';   x: number; y: number }
export interface TextElement   { id: string; type: 'text';   text: string; x: number; y: number }
export interface ActionElement { id: string; type: 'action'; kind: ActionKind; from: Pt; ctrl: Pt; to: Pt }

export type DiagramElement = PlayerElement | BallElement | ConeElement | TextElement | ActionElement;

export interface DiagramScene {
  v: 1;
  court: CourtVariant;
  elements: DiagramElement[];
}

/* ── Dimensions FIBA ──────────────────────────────────────────────────────── */

export const COURT_SIZE: Record<CourtVariant, { w: number; h: number }> = {
  half: { w: 15, h: 14 },
  full: { w: 28, h: 15 },
};

/** Repères du demi-terrain, exprimés dans son repère local (u = largeur, v = profondeur). */
export const HALF = {
  w: 15,
  h: 14,
  basket:      { u: 7.5, v: 1.575 },  // centre de l'anneau
  ringR:       0.225,
  backboardV:  1.2,
  backboardHW: 0.9,                   // demi-largeur de la planche
  laneHW:      2.45,                  // demi-largeur de la raquette
  laneV:       5.8,                   // ligne de lancer franc
  ftCircleR:   1.8,
  restrictedR: 1.25,                  // zone de non-charge
  threeR:      6.75,
  threeInset:  0.9,                   // distance ligne à 3 pts / ligne de touche dans le corner
  threeStopV:  2.99,                  // fin de la portion droite du corner (dérivé, cf. test)
  centerR:     1.8,
} as const;

export const COURT_LINE_W = 0.07;

/* ── Tailles des marqueurs (mètres) ───────────────────────────────────────── */

export const MARKER = {
  playerR: 0.62,
  ballR:   0.34,
  coneR:   0.4,
  textH:   0.9,
  strokeW: 0.11,
  /** Rayon de tolérance ajouté aux marqueurs pour la sélection à la souris. */
  hitPad:  0.25,
} as const;

/* ── Création / manipulation de scène ─────────────────────────────────────── */

export function newId(): string {
  return crypto.randomUUID();
}

export function createScene(court: CourtVariant = 'half'): DiagramScene {
  return { v: 1, court, elements: [] };
}

/**
 * Change le format de terrain en conservant les positions relatives : sans cette
 * remise à l'échelle, passer de demi à entier tasserait tout le schéma dans un coin.
 */
export function convertCourt(scene: DiagramScene, court: CourtVariant): DiagramScene {
  if (court === scene.court) return scene;
  const from = COURT_SIZE[scene.court];
  const to   = COURT_SIZE[court];
  const sx   = to.w / from.w;
  const sy   = to.h / from.h;
  const p    = (pt: Pt): Pt => ({ x: pt.x * sx, y: pt.y * sy });
  return {
    ...scene,
    court,
    elements: scene.elements.map(el => (
      el.type === 'action'
        ? { ...el, from: p(el.from), ctrl: p(el.ctrl), to: p(el.to) }
        : { ...el, ...p(el) }
    )),
  };
}

export function clampToCourt(pt: Pt, court: CourtVariant, pad = 0.3): Pt {
  const { w, h } = COURT_SIZE[court];
  return {
    x: Math.min(Math.max(pt.x, pad), w - pad),
    y: Math.min(Math.max(pt.y, pad), h - pad),
  };
}

/** Position par défaut d'un nouvel élément : centre du terrain, décalé si la place est prise. */
export function spawnPoint(scene: DiagramScene): Pt {
  const { w, h } = COURT_SIZE[scene.court];
  const taken = scene.elements.filter(el => el.type !== 'action') as { x: number; y: number }[];
  for (let i = 0; i < 40; i++) {
    const p = { x: w / 2 + (i % 8) * 1.4 - 4.9, y: h / 2 + Math.floor(i / 8) * 1.4 - 2.1 };
    if (!taken.some(t => Math.hypot(t.x - p.x, t.y - p.y) < 1.2)) return clampToCourt(p, scene.court);
  }
  return { x: w / 2, y: h / 2 };
}

/* ── Phase suivante ───────────────────────────────────────────────────────── */

/**
 * Tracés qui déplacent le joueur qui les initie. Une passe ou un tir n'envoient que le ballon :
 * le joueur, lui, reste où il est.
 */
export const MOVING_ACTIONS: ActionKind[] = ['dribble', 'cut', 'screen', 'handoff'];

/**
 * Distance en deçà de laquelle le départ d'un tracé est considéré comme parti d'un joueur —
 * la même tolérance que l'aimant de l'éditeur, qui colle déjà les extrémités aux marqueurs.
 */
const LINK_R = MARKER.playerR + 0.35;

/**
 * Scène de départ de la phase suivante : les joueurs de `scene`, posés là où ses tracés les
 * envoient.
 *
 * Un joueur peut enchaîner (dribbler puis poser un écran) : on suit la chaîne tant qu'un tracé
 * encore libre part de là où il vient d'arriver. Chaque tracé n'est consommé qu'une fois, sinon
 * deux joueurs partis du même point s'y renverraient l'un l'autre indéfiniment.
 *
 * Tout le reste — ballon, plots, textes et les tracés eux-mêmes — repart de zéro : la phase
 * suivante décrit un autre mouvement, pas la copie du précédent.
 */
export function nextPhaseScene(scene: DiagramScene): DiagramScene {
  const players = scene.elements.filter((el): el is PlayerElement => el.type === 'player').map(p => ({ ...p }));
  const moves   = scene.elements.filter(
    (el): el is ActionElement => el.type === 'action' && MOVING_ACTIONS.includes(el.kind),
  );
  const used = new Set<string>();

  for (const player of players) {
    for (let step = 0; step < moves.length; step++) {
      const move = moves.find(a => !used.has(a.id) && Math.hypot(a.from.x - player.x, a.from.y - player.y) <= LINK_R);
      if (!move) break;
      used.add(move.id);
      // Le bout d'un tracé peut mordre hors du terrain : un joueur, non.
      const at = clampToCourt(move.to, scene.court);
      player.x = at.x;
      player.y = at.y;
    }
  }

  return { ...scene, elements: players };
}

/* ── Courbe de Bézier quadratique ─────────────────────────────────────────── */

export function quadPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const m = 1 - t;
  return {
    x: m * m * p0.x + 2 * m * t * p1.x + t * t * p2.x,
    y: m * m * p0.y + 2 * m * t * p1.y + t * t * p2.y,
  };
}

export function quadTangent(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const m = 1 - t;
  return {
    x: 2 * m * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * m * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

/** Point de contrôle par défaut : milieu du segment, donc un tracé rectiligne. */
export function defaultCtrl(from: Pt, to: Pt): Pt {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function angleOf(v: Pt): number {
  return Math.atan2(v.y, v.x);
}

function norm(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Échantillonne la courbe et renvoie les points avec leur abscisse curviligne cumulée. */
function sampleQuad(p0: Pt, p1: Pt, p2: Pt, steps = 64): { pt: Pt; s: number }[] {
  const out: { pt: Pt; s: number }[] = [];
  let s = 0;
  let prev = p0;
  for (let i = 0; i <= steps; i++) {
    const pt = quadPoint(p0, p1, p2, i / steps);
    s += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    out.push({ pt, s });
    prev = pt;
  }
  return out;
}

/** Paramètre t correspondant à une abscisse curviligne donnée (approché par échantillonnage). */
function tAtLength(samples: { pt: Pt; s: number }[], target: number): number {
  const last = samples[samples.length - 1].s;
  if (target <= 0) return 0;
  if (target >= last) return 1;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].s >= target) {
      const span = samples[i].s - samples[i - 1].s || 1;
      const frac = (target - samples[i - 1].s) / span;
      return (i - 1 + frac) / (samples.length - 1);
    }
  }
  return 1;
}

/* ── Tracé des actions ────────────────────────────────────────────────────── */

export interface ActionRender {
  /** Chemin SVG principal (`d`). */
  d: string;
  /** `stroke-dasharray`, absent si trait plein. */
  dash?: string;
  /** Pointe de flèche : sommet + angle en radians. */
  arrow?: { tip: Pt; angle: number };
  /** Barre(s) perpendiculaire(s) — écran et hand-off. */
  bars?: { at: Pt; angle: number }[];
  /** Cible du tir. */
  target?: Pt;
}

const ARROW_LEN  = 0.62;   // longueur réservée à la pointe de flèche
const WAVE_AMP   = 0.3;    // amplitude du dribble
const WAVE_PERIOD = 1.0;   // longueur d'onde du dribble, en mètres
const BAR_HALF   = 0.5;    // demi-longueur de la barre d'écran

/** Trace la courbe jusqu'à `stop` mètres avant la fin, pour laisser la place aux décorations. */
function trimmedPath(p0: Pt, p1: Pt, p2: Pt, stop: number): { d: string; end: Pt; endAngle: number } {
  const samples = sampleQuad(p0, p1, p2);
  const total   = samples[samples.length - 1].s;
  const t       = tAtLength(samples, Math.max(total - stop, total * 0.02));
  const end     = quadPoint(p0, p1, p2, t);
  const endAngle = angleOf(quadTangent(p0, p1, p2, t));
  // Découpe de De Casteljau : le sous-chemin [0, t] est lui aussi une quadratique.
  const c = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
  return {
    d: `M ${r(p0.x)} ${r(p0.y)} Q ${r(c.x)} ${r(c.y)} ${r(end.x)} ${r(end.y)}`,
    end,
    endAngle,
  };
}

function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Ligne ondulée du dribble, suivant la courbe puis se redressant avant la flèche. */
function wavyPath(p0: Pt, p1: Pt, p2: Pt, stop: number): string {
  const samples = sampleQuad(p0, p1, p2, 160);
  const total   = samples[samples.length - 1].s;
  const usable  = Math.max(total - stop, 0.1);
  // Nombre entier de périodes, pour que l'onde se referme sur l'axe avant la flèche.
  const periods = Math.max(1, Math.round(usable / WAVE_PERIOD));
  const pts: Pt[] = [];
  const steps = Math.max(24, periods * 12);
  for (let i = 0; i <= steps; i++) {
    const s   = (usable * i) / steps;
    const t   = tAtLength(samples, s);
    const on  = quadPoint(p0, p1, p2, t);
    const tan = norm(quadTangent(p0, p1, p2, t));
    const amp = WAVE_AMP * Math.sin((2 * Math.PI * periods * s) / usable);
    pts.push({ x: on.x - tan.y * amp, y: on.y + tan.x * amp });
  }
  return 'M ' + pts.map(p => `${r(p.x)} ${r(p.y)}`).join(' L ');
}

export function renderAction(el: ActionElement): ActionRender {
  const { from, ctrl, to, kind } = el;

  if (kind === 'dribble') {
    const { endAngle } = trimmedPath(from, ctrl, to, ARROW_LEN);
    return { d: wavyPath(from, ctrl, to, ARROW_LEN), arrow: { tip: to, angle: endAngle } };
  }

  if (kind === 'screen') {
    // Trait plein jusqu'au point d'écran, barré d'une perpendiculaire — pas de flèche.
    const { d, end, endAngle } = trimmedPath(from, ctrl, to, 0);
    return { d, bars: [{ at: end, angle: endAngle }] };
  }

  if (kind === 'handoff') {
    const { d, end, endAngle } = trimmedPath(from, ctrl, to, 0);
    const back = { x: end.x - Math.cos(endAngle) * 0.34, y: end.y - Math.sin(endAngle) * 0.34 };
    return { d, bars: [{ at: end, angle: endAngle }, { at: back, angle: endAngle }] };
  }

  const { d, endAngle } = trimmedPath(from, ctrl, to, ARROW_LEN);
  if (kind === 'pass') return { d, dash: '0.55 0.4', arrow: { tip: to, angle: endAngle } };
  if (kind === 'shot') return { d, dash: '0.28 0.32', arrow: { tip: to, angle: endAngle }, target: to };
  return { d, arrow: { tip: to, angle: endAngle } }; // cut
}

/** Triangle de la pointe de flèche, prêt à être passé à `points` d'un `<polygon>`. */
export function arrowPoints(tip: Pt, angle: number, len = ARROW_LEN, halfW = 0.26): string {
  const back = { x: tip.x - Math.cos(angle) * len, y: tip.y - Math.sin(angle) * len };
  const nx = -Math.sin(angle) * halfW;
  const ny =  Math.cos(angle) * halfW;
  return [
    `${r(tip.x)},${r(tip.y)}`,
    `${r(back.x + nx)},${r(back.y + ny)}`,
    `${r(back.x - nx)},${r(back.y - ny)}`,
  ].join(' ');
}

/** Segment d'une barre perpendiculaire (écran, hand-off). */
export function barSegment(at: Pt, angle: number, half = BAR_HALF): { x1: number; y1: number; x2: number; y2: number } {
  const nx = -Math.sin(angle) * half;
  const ny =  Math.cos(angle) * half;
  return { x1: r(at.x + nx), y1: r(at.y + ny), x2: r(at.x - nx), y2: r(at.y - ny) };
}

/* ── Sélection ────────────────────────────────────────────────────────────── */

function markerRadius(el: DiagramElement): number {
  switch (el.type) {
    case 'player': return MARKER.playerR;
    case 'ball':   return MARKER.ballR;
    case 'cone':   return MARKER.coneR;
    case 'text':   return MARKER.textH;
    default:       return 0;
  }
}

function distToAction(el: ActionElement, pt: Pt): number {
  let best = Infinity;
  const samples = sampleQuad(el.from, el.ctrl, el.to, 48);
  for (const { pt: p } of samples) best = Math.min(best, Math.hypot(p.x - pt.x, p.y - pt.y));
  return best;
}

/**
 * Élément sous le curseur, du plus récent au plus ancien : le dernier ajouté est dessiné
 * au-dessus, il doit donc être attrapé en premier.
 */
export function hitTest(scene: DiagramScene, pt: Pt): DiagramElement | null {
  for (let i = scene.elements.length - 1; i >= 0; i--) {
    const el = scene.elements[i];
    if (el.type === 'action') {
      if (distToAction(el, pt) <= MARKER.hitPad + 0.25) return el;
    } else if (Math.hypot(el.x - pt.x, el.y - pt.y) <= markerRadius(el) + MARKER.hitPad) {
      return el;
    }
  }
  return null;
}

/** Poignée de courbure d'une action : le point réellement sur la courbe à mi-parcours. */
export function ctrlHandle(el: ActionElement): Pt {
  return quadPoint(el.from, el.ctrl, el.to, 0.5);
}

/**
 * Repositionne le point de contrôle pour que le milieu de la courbe passe par `handle` —
 * sans cette inversion, tirer la poignée ferait bouger la courbe deux fois moins vite que
 * le curseur.
 */
export function ctrlFromHandle(from: Pt, to: Pt, handle: Pt): Pt {
  return {
    x: 2 * handle.x - (from.x + to.x) / 2,
    y: 2 * handle.y - (from.y + to.y) / 2,
  };
}

/**
 * Déplace une extrémité d'un tracé en conservant sa courbure.
 *
 * L'écart de la poignée au milieu du segment est transporté dans le nouveau repère du
 * segment (rotation + échelle, écrites ici comme une multiplication complexe) : un tracé
 * droit le reste, un tracé courbé garde sa courbe au lieu de se déformer au hasard dès
 * qu'on bouge son départ.
 */
export function moveEndpoint(el: ActionElement, end: 'from' | 'to', pt: Pt): ActionElement {
  const from = end === 'from' ? pt : el.from;
  const to   = end === 'to'   ? pt : el.to;

  const oldMid = defaultCtrl(el.from, el.to);
  const handle = ctrlHandle(el);
  const off    = { x: handle.x - oldMid.x, y: handle.y - oldMid.y };

  const a  = { x: el.to.x - el.from.x, y: el.to.y - el.from.y };
  const b  = { x: to.x - from.x,       y: to.y - from.y };
  const la = a.x * a.x + a.y * a.y;
  // b / a en complexes : identité si le segment d'origine était de longueur nulle.
  const ratio = la === 0
    ? { x: 1, y: 0 }
    : { x: (b.x * a.x + b.y * a.y) / la, y: (b.y * a.x - b.x * a.y) / la };
  const moved = { x: off.x * ratio.x - off.y * ratio.y, y: off.x * ratio.y + off.y * ratio.x };

  const newMid = defaultCtrl(from, to);
  return { ...el, from, to, ctrl: ctrlFromHandle(from, to, { x: newMid.x + moved.x, y: newMid.y + moved.y }) };
}

/* ── Libellés par défaut ──────────────────────────────────────────────────── */

export const PLAYER_LABELS = ['1', '2', '3', '4', '5'] as const;

export const ACTION_LABEL: Record<ActionKind, string> = {
  dribble: 'Dribble',
  pass:    'Passe',
  cut:     'Coupe',
  screen:  'Écran',
  shot:    'Tir',
  handoff: 'Hand-off',
};

export const COURT_LABEL: Record<CourtVariant, string> = {
  half: 'Demi-terrain',
  full: 'Terrain entier',
};
