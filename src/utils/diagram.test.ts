import { describe, it, expect } from 'vitest';
import {
  HALF, COURT_SIZE, MARKER,
  createScene, convertCourt, clampToCourt, spawnPoint,
  quadPoint, quadTangent, defaultCtrl, renderAction, arrowPoints, barSegment,
  hitTest, ctrlHandle, ctrlFromHandle, moveEndpoint,
  type DiagramScene, type DiagramElement, type ActionElement, type Pt,
} from './diagram';

const player = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: 'player', team: 'off', label: '1', x, y });

const action = (kind: ActionElement['kind'], from: Pt, to: Pt, ctrl?: Pt): ActionElement =>
  ({ id: 'a', type: 'action', kind, from, to, ctrl: ctrl ?? defaultCtrl(from, to) });

const scene = (elements: DiagramElement[], court: DiagramScene['court'] = 'half'): DiagramScene =>
  ({ v: 1, court, elements });

/** Extrait les couples de nombres d'un chemin SVG, pour vérifier un tracé sans le parser. */
function coords(d: string): Pt[] {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

describe('géométrie du terrain', () => {
  it('la ligne à 3 points rejoint le corner à 2,99 m de la ligne de fond', () => {
    // Le corner est droit jusqu'au point où il rencontre l'arc de 6,75 m : c'est cette
    // valeur (2,99 m, cote FIBA officielle) que le tracé du terrain doit retrouver seul.
    const dx = HALF.basket.u - HALF.threeInset;
    const dy = Math.sqrt(HALF.threeR ** 2 - dx ** 2);
    expect(HALF.basket.v + dy).toBeCloseTo(HALF.threeStopV, 2);
  });

  it('la raquette est centrée sur le panier et large de 4,90 m', () => {
    expect(HALF.laneHW * 2).toBeCloseTo(4.9, 3);
    expect(HALF.basket.u - HALF.laneHW).toBeCloseTo(5.05, 3);
    expect(HALF.basket.u + HALF.laneHW).toBeCloseTo(9.95, 3);
  });

  it('le demi-terrain fait bien la moitié du terrain entier', () => {
    expect(COURT_SIZE.half.w).toBe(COURT_SIZE.full.h);
    expect(COURT_SIZE.half.h).toBe(COURT_SIZE.full.w / 2);
  });
});

describe('convertCourt', () => {
  it('conserve les positions relatives en changeant de format', () => {
    const s = convertCourt(scene([player('p', 7.5, 7)]), 'full');
    const p = s.elements[0] as Extract<DiagramElement, { type: 'player' }>;
    expect(s.court).toBe('full');
    expect(p.x / COURT_SIZE.full.w).toBeCloseTo(7.5 / COURT_SIZE.half.w, 6);
    expect(p.y / COURT_SIZE.full.h).toBeCloseTo(7 / COURT_SIZE.half.h, 6);
  });

  it('remet une action à l\'échelle sur ses trois points', () => {
    const a = action('pass', { x: 3, y: 3 }, { x: 12, y: 10 });
    const s = convertCourt(scene([a]), 'full');
    const out = s.elements[0] as ActionElement;
    const sx = COURT_SIZE.full.w / COURT_SIZE.half.w;
    expect(out.from.x).toBeCloseTo(3 * sx, 6);
    expect(out.ctrl.x).toBeCloseTo(defaultCtrl(a.from, a.to).x * sx, 6);
    expect(out.to.x).toBeCloseTo(12 * sx, 6);
  });

  it('est neutre si le format ne change pas', () => {
    const s = scene([player('p', 4, 4)]);
    expect(convertCourt(s, 'half')).toBe(s);
  });
});

describe('placement', () => {
  it('clampToCourt garde le point dans le terrain', () => {
    expect(clampToCourt({ x: -5, y: 99 }, 'half')).toEqual({ x: 0.3, y: 13.7 });
  });

  it('spawnPoint évite de superposer deux éléments', () => {
    let s = createScene('half');
    const placed: Pt[] = [];
    for (let i = 0; i < 6; i++) {
      const p = spawnPoint(s);
      placed.push(p);
      s = { ...s, elements: [...s.elements, player(String(i), p.x, p.y)] };
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)).toBeGreaterThan(1);
      }
    }
  });
});

describe('courbe de Bézier', () => {
  it('passe par ses extrémités', () => {
    const [p0, p1, p2] = [{ x: 0, y: 0 }, { x: 5, y: 8 }, { x: 10, y: 0 }];
    expect(quadPoint(p0, p1, p2, 0)).toEqual(p0);
    expect(quadPoint(p0, p1, p2, 1)).toEqual(p2);
  });

  it('avec le point de contrôle par défaut, la courbe est le segment droit', () => {
    const [from, to] = [{ x: 1, y: 2 }, { x: 9, y: 6 }];
    const mid = quadPoint(from, defaultCtrl(from, to), to, 0.5);
    expect(mid.x).toBeCloseTo(5, 6);
    expect(mid.y).toBeCloseTo(4, 6);
  });

  it('la tangente suit le sens du tracé', () => {
    const t = quadTangent({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, 0.5);
    expect(Math.atan2(t.y, t.x)).toBeCloseTo(0, 6);
  });
});

describe('poignée de courbure', () => {
  it('ctrlFromHandle place le milieu de la courbe sur la poignée', () => {
    const [from, to] = [{ x: 2, y: 2 }, { x: 12, y: 9 }];
    const target = { x: 4, y: 11 };
    const el = action('cut', from, to, ctrlFromHandle(from, to, target));
    const mid = ctrlHandle(el);
    expect(mid.x).toBeCloseTo(target.x, 6);
    expect(mid.y).toBeCloseTo(target.y, 6);
  });
});

describe('moveEndpoint', () => {
  it('déplace bien l\'extrémité visée et laisse l\'autre en place', () => {
    const a = action('pass', { x: 2, y: 2 }, { x: 10, y: 2 });
    const moved = moveEndpoint(a, 'to', { x: 10, y: 8 });
    expect(moved.to).toEqual({ x: 10, y: 8 });
    expect(moved.from).toEqual({ x: 2, y: 2 });
  });

  it('garde droit un tracé droit', () => {
    const a = action('cut', { x: 2, y: 2 }, { x: 10, y: 2 });
    const moved = moveEndpoint(a, 'from', { x: 3, y: 9 });
    const mid = ctrlHandle(moved);
    // Le milieu de la courbe reste sur le segment : aucune courbure n'est apparue.
    expect(mid.x).toBeCloseTo((3 + 10) / 2, 6);
    expect(mid.y).toBeCloseTo((9 + 2) / 2, 6);
  });

  it('conserve la courbure d\'un tracé courbé', () => {
    const from = { x: 2, y: 2 };
    const to   = { x: 10, y: 2 };
    // Courbure de 2 m perpendiculairement au segment.
    const a = action('dribble', from, to, ctrlFromHandle(from, to, { x: 6, y: 4 }));
    const moved = moveEndpoint(a, 'to', { x: 2, y: 10 });  // segment pivoté d'un quart de tour
    const off = { x: ctrlHandle(moved).x - 2, y: ctrlHandle(moved).y - 6 }; // écart au nouveau milieu
    expect(Math.hypot(off.x, off.y)).toBeCloseTo(2, 6);    // même amplitude…
    expect(Math.abs(off.x)).toBeCloseTo(2, 6);             // …tournée avec le segment
  });

  it('reste stable si le tracé était de longueur nulle', () => {
    const a = action('pass', { x: 5, y: 5 }, { x: 5, y: 5 });
    const moved = moveEndpoint(a, 'to', { x: 9, y: 5 });
    expect(moved.ctrl.x).not.toBeNaN();
    expect(moved.ctrl.y).not.toBeNaN();
  });
});

describe('renderAction', () => {
  const from = { x: 2, y: 2 };
  const to   = { x: 10, y: 2 };

  it('la coupe est un trait plein fléché', () => {
    const out = renderAction(action('cut', from, to));
    expect(out.dash).toBeUndefined();
    expect(out.arrow?.tip).toEqual(to);
    expect(out.bars).toBeUndefined();
  });

  it('la passe est pointillée et fléchée', () => {
    const out = renderAction(action('pass', from, to));
    expect(out.dash).toBeTruthy();
    expect(out.arrow).toBeDefined();
  });

  it('le tir porte une cible en plus de la flèche', () => {
    const out = renderAction(action('shot', from, to));
    expect(out.target).toEqual(to);
    expect(out.dash).toBeTruthy();
  });

  it('l\'écran est barré et jamais fléché', () => {
    const out = renderAction(action('screen', from, to));
    expect(out.arrow).toBeUndefined();
    expect(out.bars).toHaveLength(1);
    // La barre est posée au bout du trait, pas au milieu.
    expect(out.bars![0].at.x).toBeCloseTo(to.x, 1);
  });

  it('le hand-off porte deux barres distinctes', () => {
    const out = renderAction(action('handoff', from, to));
    expect(out.bars).toHaveLength(2);
    const [b1, b2] = out.bars!;
    expect(Math.hypot(b1.at.x - b2.at.x, b1.at.y - b2.at.y)).toBeGreaterThan(0.2);
  });

  it('le dribble ondule autour de l\'axe sans le quitter aux extrémités', () => {
    const out = renderAction(action('dribble', from, to));
    const pts = coords(out.d);
    const offsets = pts.map(p => p.y - 2);
    expect(Math.max(...offsets.map(Math.abs))).toBeGreaterThan(0.2);   // ça ondule
    expect(Math.abs(offsets[0])).toBeLessThan(0.01);                    // départ sur l'axe
    expect(Math.abs(offsets[offsets.length - 1])).toBeLessThan(0.05);   // et retour sur l'axe
  });

  it('le trait s\'arrête avant la pointe de flèche, qui la prolonge jusqu\'au bout', () => {
    const out = renderAction(action('cut', from, to));
    const pts = coords(out.d);
    const end = pts[pts.length - 1];
    expect(end.x).toBeLessThan(to.x);          // le trait s'arrête en retrait…
    expect(end.x).toBeGreaterThan(to.x - 1);   // …mais de peu
    expect(out.arrow!.tip.x).toBe(to.x);       // la flèche atteint la cible
  });

  it('reste stable sur une action de longueur nulle', () => {
    const out = renderAction(action('pass', { x: 5, y: 5 }, { x: 5, y: 5 }));
    expect(out.d).not.toMatch(/NaN/);
  });
});

describe('décorations', () => {
  it('la flèche est un triangle pointant vers la cible', () => {
    const pts = coords(arrowPoints({ x: 10, y: 0 }, 0));
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 10, y: 0 });
    expect(pts[1].x).toBeLessThan(10);
    expect(pts[2].x).toBeLessThan(10);
  });

  it('la barre est perpendiculaire au tracé', () => {
    const seg = barSegment({ x: 4, y: 4 }, 0);
    expect(seg.x1).toBeCloseTo(4, 6);
    expect(seg.x2).toBeCloseTo(4, 6);
    expect(seg.y1).not.toBeCloseTo(seg.y2, 1);
  });
});

describe('hitTest', () => {
  it('attrape un joueur sous le curseur', () => {
    const s = scene([player('p', 5, 5)]);
    expect(hitTest(s, { x: 5.2, y: 5.1 })?.id).toBe('p');
  });

  it('ignore un clic loin de tout', () => {
    expect(hitTest(scene([player('p', 5, 5)]), { x: 12, y: 12 })).toBeNull();
  });

  it('rend d\'abord l\'élément du dessus en cas de superposition', () => {
    const s = scene([player('dessous', 5, 5), player('dessus', 5, 5)]);
    expect(hitTest(s, { x: 5, y: 5 })?.id).toBe('dessus');
  });

  it('attrape une action près de son tracé, y compris au milieu', () => {
    const a = action('pass', { x: 2, y: 2 }, { x: 10, y: 2 });
    const s = scene([a]);
    expect(hitTest(s, { x: 6, y: 2.1 })?.id).toBe('a');
    expect(hitTest(s, { x: 6, y: 4 })).toBeNull();
  });

  it('la tolérance de sélection ne dépasse pas le marqueur de plus de hitPad', () => {
    const s = scene([player('p', 5, 5)]);
    const justOutside = MARKER.playerR + MARKER.hitPad + 0.05;
    expect(hitTest(s, { x: 5 + justOutside, y: 5 })).toBeNull();
  });
});
