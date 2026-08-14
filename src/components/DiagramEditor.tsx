import { useCallback, useEffect, useRef, useState } from 'react';
import { Undo2, Trash2, Circle, Triangle, Type, MousePointer2 } from 'lucide-react';
import { DiagramSceneView, DiagramElementView, ELEMENT_COLORS, sceneAspect } from './DiagramSceneView';
import {
  ACTION_LABEL, COURT_LABEL, MARKER, PLAYER_LABELS,
  clampToCourt, convertCourt, ctrlFromHandle, ctrlHandle,
  defaultCtrl, hitTest, moveEndpoint, newId, spawnPoint, renderAction, arrowPoints, barSegment,
  type ActionKind, type CourtVariant, type DiagramElement, type DiagramScene, type Pt,
} from '../utils/diagram';

/**
 * Éditeur de schéma — terrain + palette, sans en-tête ni bouton d'enregistrement : c'est la
 * page qui l'accueille (voir `ExercisePhasePage`) qui porte le titre, le texte de la phase et
 * l'enregistrement.
 *
 * L'éditeur reste **maître de sa scène** : il la reçoit une fois par `initial` puis signale
 * chaque modification par `onChange`. Repasser la scène en prop à chaque geste exposerait le
 * glisser à une valeur en retard d'un événement — les `pointermove` arrivent plus vite qu'un
 * cycle de rendu. L'appelant garde donc la dernière scène connue comme miroir, pour
 * l'enregistrer.
 *
 * Un tracé posé rend la main à l'outil Sélection : le tracé fraîchement créé est
 * sélectionné, donc immédiatement ajustable par ses poignées, et un clic sur le terrain ne
 * part plus en ligne involontaire. Un geste avorté (trop court) garde l'outil actif, pour
 * pouvoir refaire le tracé sans le rechoisir.
 */

type Tool = 'select' | ActionKind;

/** Ce qu'un bouton de la palette dépose : le patron d'un élément, sans position. */
type SpawnSpec =
  | { type: 'player'; team: 'off' | 'def'; label: string }
  | { type: 'ball' }
  | { type: 'cone' }
  | { type: 'text' };

/** Glisser en cours depuis la palette vers le terrain. */
type PaletteDrag = { spec: SpawnSpec; sx: number; sy: number; at: Pt | null; moved: boolean };

type Drag =
  | { mode: 'move';     id: string; dx: number; dy: number }
  | { mode: 'handle';   id: string }
  | { mode: 'endpoint'; id: string; end: 'from' | 'to' }
  | { mode: 'draw';     kind: ActionKind; from: Pt; to: Pt };

const HISTORY_MAX = 40;

/** Distance sous laquelle une extrémité d'action s'aimante au centre d'un marqueur. */
const SNAP_R = MARKER.playerR + 0.35;
/** Rayon d'accroche des poignées d'un tracé sélectionné (départ, arrivée, courbure). */
const HANDLE_R = 0.6;
/** En deçà, un glissé est considéré comme un clic et ne crée pas d'action. */
const MIN_ACTION_LEN = 0.8;
/** Déplacement (en px) au-delà duquel un appui sur la palette devient un glisser. */
const DRAG_THRESHOLD = 5;

const ACTION_KINDS: ActionKind[] = ['dribble', 'pass', 'cut', 'screen', 'shot', 'handoff'];

/**
 * Hauteur maximale de la zone de dessin. Le terrain prend la place qu'on lui laisse et s'arrête
 * à ce gabarit — au-delà, il mangerait l'écran sans rien gagner en lisibilité.
 *
 * C'est la hauteur qui est plafonnée, jamais la largeur : le terrain entier est deux fois plus
 * large que haut, et un plafond de largeur l'écraserait autant qu'il laisserait le demi-terrain
 * s'étirer. La largeur maximale se déduit du format de la scène.
 */
const CANVAS_MAX_HEIGHT = 520;

/* ── Styles ───────────────────────────────────────────────────────────────── */

const panelLabel: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7,
};

function btnStyle(active: boolean, color = '#00E5A0'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '7px 9px', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
    touchAction: 'none',   // les boutons de la palette se glissent : pas de scroll parasite
    backgroundColor: active ? color + '22' : '#1E2229',
    border: `1px solid ${active ? color : '#2A2F3A'}`,
    color: active ? color : '#94A3B8',
  };
}

const inputStyle: React.CSSProperties = {
  padding: '6px 9px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 6, color: '#F1F5F9', fontSize: '0.8rem', outline: 'none',
};

/* ── Aperçu du tracé en cours ─────────────────────────────────────────────── */

function DrawPreview({ kind, from, to }: { kind: ActionKind; from: Pt; to: Pt }) {
  const el = { id: 'preview', type: 'action' as const, kind, from, ctrl: defaultCtrl(from, to), to };
  const a = renderAction(el);
  return (
    <g data-editor-only="" stroke={ELEMENT_COLORS.selection} strokeWidth={MARKER.strokeW} fill="none" opacity={0.85} strokeLinecap="round">
      <path d={a.d} strokeDasharray={a.dash} />
      {a.arrow && <polygon points={arrowPoints(a.arrow.tip, a.arrow.angle)} fill={ELEMENT_COLORS.selection} stroke="none" />}
      {a.bars?.map((b, i) => <line key={i} {...barSegment(b.at, b.angle)} />)}
    </g>
  );
}

/* ── Éditeur ──────────────────────────────────────────────────────────────── */

export function DiagramEditor({ initial, onChange, disabled }: {
  /** Scène de départ — les changements ultérieurs de cette prop sont ignorés. */
  initial: DiagramScene;
  onChange: (scene: DiagramScene) => void;
  /** Gèle l'édition, le temps d'un enregistrement par exemple. */
  disabled?: boolean;
}) {
  const [scene, setScene]           = useState<DiagramScene>(initial);
  const [past, setPast]             = useState<DiagramScene[]>([]);
  const [tool, setTool]             = useState<Tool>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag]             = useState<Drag | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDrag | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  /** L'historique n'est empilé qu'au premier déplacement réel : un clic qui ne fait que
   *  sélectionner ne doit pas consommer un « Annuler ». */
  const dragPushed = useRef(false);

  const selected = scene.elements.find(el => el.id === selectedId) ?? null;

  /**
   * L'appelant est prévenu après coup, depuis un effet : signaler depuis le calculateur d'état
   * le ferait pendant le rendu — et deux fois en développement, où React rejoue les
   * calculateurs pour détecter justement ce genre d'effet de bord.
   */
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => { notify.current(scene); }, [scene]);

  /** Empile l'état courant avant une modification, pour l'annulation. */
  const pushHistory = useCallback(() => {
    setPast(p => [...p.slice(-(HISTORY_MAX - 1)), scene]);
  }, [scene]);

  const commit = useCallback((next: DiagramScene) => {
    pushHistory();
    setScene(next);
  }, [pushHistory]);

  function undo() {
    setPast(p => {
      if (p.length === 0) return p;
      setScene(p[p.length - 1]);
      setSelectedId(null);
      return p.slice(0, -1);
    });
  }

  /* ── Ajout d'éléments ─────────────────────────────────────────────────── */

  function add(el: DiagramElement) {
    commit({ ...scene, elements: [...scene.elements, el] });
    setSelectedId(el.id);
    setTool('select');
  }

  function makeElement(spec: SpawnSpec, at: Pt): DiagramElement {
    const base = { id: newId(), ...at };
    switch (spec.type) {
      case 'player': return { ...base, type: 'player', team: spec.team, label: spec.label };
      case 'ball':   return { ...base, type: 'ball' };
      case 'cone':   return { ...base, type: 'cone' };
      case 'text':   return { ...base, type: 'text', text: 'Texte' };
    }
  }

  /* ── Glisser depuis la palette ────────────────────────────────────────── */

  /**
   * Chaque bouton de la palette se pose au clic (au centre du terrain) ou au glisser
   * (à l'endroit lâché). Le pointeur est capturé par le bouton : les événements continuent
   * de lui arriver même quand le curseur est passé au-dessus du terrain, ce qu'un simple
   * survol ne garantirait pas.
   */
  function spawnHandlers(spec: SpawnSpec) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPaletteDrag({ spec, sx: e.clientX, sy: e.clientY, at: null, moved: false });
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!paletteDrag) return;
        const moved = paletteDrag.moved || Math.hypot(e.clientX - paletteDrag.sx, e.clientY - paletteDrag.sy) > DRAG_THRESHOLD;
        setPaletteDrag({ ...paletteDrag, moved, at: moved ? courtPoint(e.clientX, e.clientY) : null });
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (!paletteDrag) return;
        setPaletteDrag(null);
        // Un simple clic pose au centre ; un glisser pose là où on lâche, et se contente
        // d'abandonner si le lâcher tombe hors du terrain.
        const at = paletteDrag.moved ? courtPoint(e.clientX, e.clientY) : spawnPoint(scene);
        if (at) add(makeElement(paletteDrag.spec, at));
      },
      onPointerCancel: () => setPaletteDrag(null),
    };
  }

  /* ── Interaction sur le terrain ───────────────────────────────────────── */

  function toScene(e: React.PointerEvent): Pt {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  /** Coordonnées terrain d'un point de l'écran, ou null s'il tombe hors de la zone de dessin. */
  function courtPoint(clientX: number, clientY: number): Pt | null {
    const svg  = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const ctm  = svg?.getScreenCTM();
    if (!svg || !rect || !ctm) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return clampToCourt({ x: p.x, y: p.y }, scene.court);
  }

  /** Aimante un point sur le centre du marqueur le plus proche, pour des tracés propres. */
  function snap(pt: Pt): Pt {
    let best: Pt | null = null;
    let bestD = SNAP_R;
    for (const el of scene.elements) {
      if (el.type === 'action') continue;
      const d = Math.hypot(el.x - pt.x, el.y - pt.y);
      if (d < bestD) { bestD = d; best = { x: el.x, y: el.y }; }
    }
    return best ?? pt;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.preventDefault();   // pas d'amorce de sélection de texte sur le geste de dessin
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPushed.current = false;
    const pt = toScene(e);

    if (tool !== 'select') {
      const from = snap(pt);
      setSelectedId(null);
      setDrag({ mode: 'draw', kind: tool, from, to: from });
      return;
    }

    // Poignées de l'action sélectionnée : prioritaires sur tout le reste, extrémités d'abord
    // (elles se superposent souvent à un joueur, qui sinon serait attrapé à leur place).
    if (selected?.type === 'action') {
      for (const end of ['from', 'to'] as const) {
        if (Math.hypot(selected[end].x - pt.x, selected[end].y - pt.y) < HANDLE_R) {
          setDrag({ mode: 'endpoint', id: selected.id, end });
          return;
        }
      }
      const h = ctrlHandle(selected);
      if (Math.hypot(h.x - pt.x, h.y - pt.y) < HANDLE_R) {
        setDrag({ mode: 'handle', id: selected.id });
        return;
      }
    }

    const hit = hitTest(scene, pt);
    setSelectedId(hit?.id ?? null);
    if (!hit) return;

    if (hit.type === 'action') {
      // Une action se déplace en bloc, par sa poignée médiane.
      setDrag({ mode: 'handle', id: hit.id });
    } else {
      setDrag({ mode: 'move', id: hit.id, dx: hit.x - pt.x, dy: hit.y - pt.y });
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const pt = toScene(e);

    if (drag.mode === 'draw') {
      setDrag({ ...drag, to: pt });
      return;
    }

    if (!dragPushed.current) { pushHistory(); dragPushed.current = true; }

    setScene(s => ({
      ...s,
      elements: s.elements.map(el => {
        if (el.id !== drag.id) return el;
        if (drag.mode === 'move' && el.type !== 'action') {
          return { ...el, ...clampToCourt({ x: pt.x + drag.dx, y: pt.y + drag.dy }, s.court) };
        }
        if (drag.mode === 'handle' && el.type === 'action') {
          return { ...el, ctrl: ctrlFromHandle(el.from, el.to, pt) };
        }
        if (drag.mode === 'endpoint' && el.type === 'action') {
          return moveEndpoint(el, drag.end, snap(clampToCourt(pt, s.court)));
        }
        return el;
      }),
    }));
  }

  function handlePointerUp() {
    if (drag?.mode === 'draw') {
      const to = snap(drag.to);
      if (Math.hypot(to.x - drag.from.x, to.y - drag.from.y) >= MIN_ACTION_LEN) {
        const el: DiagramElement = {
          id: newId(), type: 'action', kind: drag.kind,
          from: drag.from, ctrl: defaultCtrl(drag.from, to), to,
        };
        commit({ ...scene, elements: [...scene.elements, el] });
        setSelectedId(el.id);
        setTool('select');
      }
    }
    setDrag(null);
  }

  function removeSelected() {
    if (!selectedId) return;
    commit({ ...scene, elements: scene.elements.filter(el => el.id !== selectedId) });
    setSelectedId(null);
  }

  function patchSelected(patch: Partial<DiagramElement>) {
    setScene(s => ({
      ...s,
      elements: s.elements.map(el => (el.id === selectedId ? { ...el, ...patch } as DiagramElement : el)),
    }));
  }

  /* ── Raccourcis clavier ───────────────────────────────────────────────── */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;   // l'éditeur de texte de la phase vit sur la même page
      if (e.key === 'Escape')                       { setTool('select'); setSelectedId(null); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ── Rendu ────────────────────────────────────────────────────────────── */

  const courtBtn = (v: CourtVariant) => (
    <button key={v} type="button" style={{ ...btnStyle(scene.court === v), flex: 1 }}
      onClick={() => { if (scene.court !== v) commit(convertCourt(scene, v)); }}>
      {COURT_LABEL[v]}
    </button>
  );

  /** Largeur du terrain à son plafond de hauteur, selon le format de la scène. */
  const canvasMaxWidth = Math.round(CANVAS_MAX_HEIGHT * sceneAspect(scene));

  // `stretch` sur la ligne : la zone de dessin prend toute la hauteur des outils, plus hauts que
  // le terrain — c'est ce qui permet d'y centrer le terrain au lieu de le laisser collé en haut.
  return (
    <div className="flex flex-col md:flex-row" style={{ gap: 16, alignItems: 'stretch' }}>
      {/* Le terrain prend toute la place laissée par la palette et se centre dedans, dans les
          deux sens : sur un grand écran il se pose à son gabarit au milieu de son espace, plutôt
          que collé en haut à gauche.
          `md:flex-1` seulement en ligne — en colonne, une base de 0 écraserait sa hauteur. */}
      <div className="w-full md:flex-1 md:min-w-0" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: canvasMaxWidth, aspectRatio: String(sceneAspect(scene)), borderRadius: 10, overflow: 'hidden', border: '1px solid #2A2F3A' }}>
          <DiagramSceneView
            scene={scene}
            selectedId={selectedId}
            svgRef={svgRef}
            style={{ touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {drag?.mode === 'draw' && <DrawPreview kind={drag.kind} from={drag.from} to={drag.to} />}
            {/* Aperçu du marqueur glissé depuis la palette, à l'endroit exact où il tombera */}
            {paletteDrag?.at && (
              <g data-editor-only="" opacity={0.6}>
                <DiagramElementView el={makeElement(paletteDrag.spec, paletteDrag.at)} />
              </g>
            )}
            {selected?.type === 'action' && (
              <g data-editor-only="" style={{ cursor: 'grab' }}>
                {/* Extrémités creuses, courbure pleine : trois prises distinctes au coup d'œil */}
                {([selected.from, selected.to] as const).map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={0.32}
                    fill="#0D0F14" stroke={ELEMENT_COLORS.selection} strokeWidth={0.13} />
                ))}
                <circle
                  cx={ctrlHandle(selected).x} cy={ctrlHandle(selected).y} r={0.32}
                  fill={ELEMENT_COLORS.selection} stroke="#0D0F14" strokeWidth={0.08}
                />
              </g>
            )}
          </DiagramSceneView>
        </div>
      </div>

      {/* Outils — largeur fixe, collés au bord droit */}
      <div className="w-full md:w-[236px]" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={panelLabel}>Terrain</div>
          <div style={{ display: 'flex', gap: 6 }}>{(['half', 'full'] as CourtVariant[]).map(courtBtn)}</div>
        </div>

        <div>
          <div style={panelLabel}>Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button type="button" style={{ ...btnStyle(tool === 'select', '#38BDF8'), gridColumn: '1 / -1' }} onClick={() => setTool('select')}>
              <MousePointer2 size={13} /> Sélection
            </button>
            {ACTION_KINDS.map(k => (
              <button key={k} type="button" style={btnStyle(tool === k)} onClick={() => setTool(k)}>
                {ACTION_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={panelLabel}>Attaque</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {PLAYER_LABELS.map(l => (
              <button key={l} type="button" {...spawnHandlers({ type: 'player', team: 'off', label: l })}
                style={{ ...btnStyle(false, ELEMENT_COLORS.off), width: 34, height: 34, borderRadius: 17, color: ELEMENT_COLORS.off, borderColor: ELEMENT_COLORS.off }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={panelLabel}>Défense</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {PLAYER_LABELS.map(l => (
              <button key={l} type="button" {...spawnHandlers({ type: 'player', team: 'def', label: l })}
                style={{ ...btnStyle(false, ELEMENT_COLORS.def), width: 34, height: 34, color: ELEMENT_COLORS.def, borderColor: ELEMENT_COLORS.def }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={panelLabel}>Divers</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={{ ...btnStyle(false), flex: 1 }} {...spawnHandlers({ type: 'ball' })}>
              <Circle size={13} color={ELEMENT_COLORS.ball} fill={ELEMENT_COLORS.ball} /> Ballon
            </button>
            <button type="button" style={{ ...btnStyle(false), flex: 1 }} {...spawnHandlers({ type: 'cone' })}>
              <Triangle size={13} color={ELEMENT_COLORS.cone} /> Plot
            </button>
            <button type="button" style={{ ...btnStyle(false), flex: 1 }} {...spawnHandlers({ type: 'text' })}>
              <Type size={13} /> Texte
            </button>
          </div>
        </div>

        {/* Propriétés de la sélection — emplacement toujours réservé, pour que la page ne
            change pas de hauteur quand on sélectionne ou désélectionne un élément. */}
        <div>
          <div style={panelLabel}>Sélection</div>
          <div style={{ height: 33, display: 'flex', gap: 6, alignItems: 'center' }}>
            {selected?.type === 'player' && (
              <>
                <input
                  value={selected.label} maxLength={3} onChange={e => patchSelected({ label: e.target.value } as Partial<DiagramElement>)}
                  style={{ ...inputStyle, width: 54, textAlign: 'center' }}
                />
                <button type="button" style={{ ...btnStyle(false, selected.team === 'off' ? ELEMENT_COLORS.def : ELEMENT_COLORS.off), flex: 1 }}
                  onClick={() => patchSelected({ team: selected.team === 'off' ? 'def' : 'off' } as Partial<DiagramElement>)}>
                  {selected.team === 'off' ? 'Passer en défense' : 'Passer en attaque'}
                </button>
              </>
            )}
            {selected?.type === 'text' && (
              <input
                value={selected.text} onChange={e => patchSelected({ text: e.target.value } as Partial<DiagramElement>)}
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
              />
            )}
            {selected?.type === 'action' && (
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>
                Tirez les poignées : extrémités et courbure.
              </span>
            )}
            {!selected && (
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>Aucun élément sélectionné.</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={undo} disabled={past.length === 0}
            style={{ ...btnStyle(false), flex: 1, opacity: past.length === 0 ? 0.4 : 1, cursor: past.length === 0 ? 'not-allowed' : 'pointer' }}>
            <Undo2 size={13} /> Annuler
          </button>
          <button type="button" onClick={removeSelected} disabled={!selectedId}
            style={{ ...btnStyle(false, '#EF4444'), flex: 1, opacity: selectedId ? 1 : 0.4, cursor: selectedId ? 'pointer' : 'not-allowed', color: selectedId ? '#EF4444' : '#94A3B8' }}>
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
