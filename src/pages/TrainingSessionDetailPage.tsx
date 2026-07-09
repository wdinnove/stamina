import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock, File, FileText, Image, Video, Trash2, ExternalLink, Edit, X, AlertCircle, Plus, GripVertical, ArrowRight, ArrowUp, ArrowDown, BookOpen, Users, Check, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { rpeApi } from '../api/rpe';
import { playersApi } from '../api/players';
import { documentsApi } from '../api/documents';
import { sessionBlocksApi } from '../api/sessionBlocks';
import { sessionTeamsApi } from '../api/sessionTeams';
import { exercisesApi } from '../api/exercises';
import { PlayerAvatar } from '../components';
import { ExerciseImageGallery, SocialVideoEmbed } from '../components';
import RichTextEditor from '../components/RichTextEditor';
import { detectSocialPlatform } from '../utils/socialVideo';
import type { TrainingSession, Player, TrainingAttendance, SessionDocument, SessionBlock, Exercise, ExerciseImage } from '../data/types';

// Noir, blanc, rouge, bleu, vert, jaune
const TEAM_COLORS = ['#0D0F14', '#F1F5F9', '#EF4444', '#3B82F6', '#00E5A0', '#EAB308'];
const POSITIONS: Player['position'][] = ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot'];

interface TeamDraft { localId: string; name: string; color: string; }
interface BlockDraft { localId: string; label: string; teams: TeamDraft[]; assign: Record<string, string>; }

function defaultBlockDrafts(): BlockDraft[] {
  return [{
    localId: crypto.randomUUID(),
    label: 'Groupe 1',
    teams: [
      { localId: crypto.randomUUID(), name: 'Équipe A', color: TEAM_COLORS[0] },
      { localId: crypto.randomUUID(), name: 'Équipe B', color: TEAM_COLORS[1] },
    ],
    assign: {},
  }];
}

const BLOCK_CATEGORIES = [
  'Échauffement', 'Jeu réduit', 'Jeu rapide', 'Tirs', 'Technique',
  'Physique', 'Tactique', 'Retour au calme', 'Autre',
];

const INTENSITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  'basse':       { label: 'Basse',       color: '#00E5A0', bg: 'rgba(0,229,160,0.12)'   },
  'moyenne':     { label: 'Moyenne',     color: '#3B82F6', bg: 'rgba(59,130,246,0.12)'  },
  'haute':       { label: 'Haute',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  'très élevée': { label: 'Très élevée', color: '#EF4444', bg: 'rgba(239,68,68,0.12)'   },
};

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

const STATUS_CFG = {
  present: { label: 'Présent', color: '#00E5A0', bg: 'rgba(0,229,160,0.12)' },
  absent:  { label: 'Absent',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  late:    { label: 'Retard',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
} as const;

function PlayerChip({ player, status }: { player: Player; status?: TrainingAttendance['status'] }) {
  const cfg = status ? STATUS_CFG[status] : null;
  return (
    <div draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', player.id); e.dataTransfer.effectAllowed = 'move'; }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, cursor: 'grab', userSelect: 'none' }}>
      <PlayerAvatar player={player} size={22} />
      <span style={{ color: '#F1F5F9', fontSize: '0.8rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {player.lastName} {player.firstName[0]}.
      </span>
      {cfg && <span title={cfg.label} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.color, flexShrink: 0 }} />}
    </div>
  );
}

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function rpeColor(rpe: number): string {
  if (rpe >= 8) return '#EF4444';
  if (rpe >= 7) return '#F97316';
  if (rpe >= 5) return '#EAB308';
  return '#00E5A0';
}

// Même convention que la liste des séances (TrainingSessionsPage) pour comparer réel vs estimé
function deltaColor(real: number, estimated: number): string {
  if (estimated <= 0) return '#94A3B8';
  const delta = (real - estimated) / estimated;
  if (delta > 0.25)      return '#EF4444';
  if (delta > 0.10)      return '#F59E0B';
  if (delta < -0.10)     return '#3B82F6';
  return '#00E5A0';
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mimeType }: { mimeType?: string }) {
  const m = mimeType ?? '';
  if (m.startsWith('image/'))  return <Image  size={15} color="#A855F7" />;
  if (m.startsWith('video/'))  return <Video  size={15} color="#F59E0B" />;
  if (m === 'application/pdf') return <FileText size={15} color="#EF4444" />;
  return <File size={15} color="#94A3B8" />;
}

const BLANK_BLOCK = { duration: '15', category: 'Échauffement', intensity: 'moyenne' as SessionBlock['intensity'], label: '', consignes: '' };

function ExercisePicker({ exercises, value, onChange, inputStyle }: {
  exercises: Exercise[];
  value: string | null;
  onChange: (id: string | null, ex: Exercise | null) => void;
  inputStyle: React.CSSProperties;
}) {
  const [query,   setQuery]   = useState('');
  const [open,    setOpen]    = useState(false);
  const [cursor,  setCursor]  = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = exercises.find(ex => ex.id === value) ?? null;

  const filtered = exercises.filter(ex => {
    const q = query.toLowerCase();
    return ex.name.toLowerCase().includes(q) || (ex.categoryName ?? '').toLowerCase().includes(q);
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setCursor(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function select(ex: Exercise) {
    onChange(ex.id, ex);
    setQuery(''); setOpen(false); setCursor(-1);
  }

  function clear() {
    onChange(null, null);
    setQuery(''); setOpen(false); setCursor(-1);
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && cursor >= 0 && filtered[cursor]) { e.preventDefault(); select(filtered[cursor]); }
    else if (e.key === 'Escape') { setOpen(false); setCursor(-1); }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Champ — même box model que inputStyle, padding géré par le flex + input interne */}
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#0F1117', border: '1px solid rgba(0,229,160,0.35)', boxShadow: '0 0 0 1px rgba(0,229,160,0.08)', cursor: 'text', padding: 0 }}>
        {/* Préfixe icône + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 0 12px', flexShrink: 0 }}>
          <BookOpen size={13} color="#00E5A0" />
          <span style={{ color: '#00E5A0', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Bibliothèque</span>
        </div>
        {/* Séparateur */}
        <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: '#1E2229' }} />
        {/* Input de recherche */}
        <input
          ref={inputRef}
          type="text"
          placeholder={selected ? '' : 'Rechercher un exercice…'}
          value={selected ? selected.name : query}
          readOnly={!!selected}
          onChange={e => { if (!selected) { setQuery(e.target.value); setOpen(true); setCursor(-1); } }}
          onFocus={() => { setOpen(true); }}
          onKeyDown={handleKey}
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: selected ? '#F1F5F9' : '#94A3B8', fontSize: '0.88rem', padding: '10px 0', minWidth: 0, cursor: selected ? 'default' : 'text' }} />
        {/* Bouton effacer */}
        {(value || query) && (
          <button type="button" onClick={e => { e.stopPropagation(); clear(); }}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', alignSelf: 'stretch' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
            <X size={12} />
          </button>
        )}
        {!value && !query && (
          <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', alignSelf: 'stretch', pointerEvents: 'none' }}>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 220, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', color: '#475569', fontSize: '0.8rem' }}>Aucun exercice trouvé</div>
          ) : (
            filtered.map((ex, i) => (
              <button key={ex.id} type="button" onClick={() => select(ex)}
                style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 12px', background: cursor === i ? 'rgba(0,229,160,0.08)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 8 }}
                onMouseEnter={() => setCursor(i)}
                onMouseLeave={() => setCursor(-1)}>
                {ex.categoryName && (
                  <span style={{ color: ex.categoryColor ?? '#94A3B8', backgroundColor: (ex.categoryColor ?? '#94A3B8') + '22', fontSize: '0.64rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {ex.categoryName}
                  </span>
                )}
                <span style={{ color: '#F1F5F9', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SessionBlocks({ sessionId, blocks, onBlocksChange }: {
  sessionId: string;
  blocks: SessionBlock[];
  onBlocksChange: (blocks: SessionBlock[]) => void;
}) {
  const [showForm,       setShowForm]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [blockError,     setBlockError]     = useState('');
  const [form,           setForm]           = useState(BLANK_BLOCK);
  const [formDrillId,    setFormDrillId]    = useState<string | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editForm,       setEditForm]       = useState(BLANK_BLOCK);
  const [editDrillId,    setEditDrillId]    = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [draggingIndex,  setDraggingIndex]  = useState<number | null>(null);
  const [overIndex,      setOverIndex]      = useState<number | null>(null);
  const [exercises,       setExercises]       = useState<Exercise[]>([]);
  const [viewExercise,    setViewExercise]    = useState<Exercise | null>(null);
  const [viewExerciseImages, setViewExerciseImages] = useState<ExerciseImage[]>([]);

  useEffect(() => {
    exercisesApi.list().then(setExercises).catch(() => {});
  }, []);

  useEffect(() => {
    if (!viewExercise) { setViewExerciseImages([]); return; }
    exercisesApi.listImages(viewExercise.id).then(setViewExerciseImages).catch(() => {});
  }, [viewExercise?.id]);

  function startDrag(e: React.PointerEvent<HTMLElement>, fromIndex: number) {
    e.preventDefault();
    setDraggingIndex(fromIndex);
    setOverIndex(fromIndex);

    const onMove = (ev: PointerEvent) => {
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-bi]') as HTMLElement | null;
      if (el) setOverIndex(Number(el.dataset.bi));
    };

    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-bi]') as HTMLElement | null;
      const to = el ? Number(el.dataset.bi) : fromIndex;
      setDraggingIndex(null);
      setOverIndex(null);
      if (to !== fromIndex) reorderBlocks(fromIndex, to);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function reorderBlocks(from: number, to: number) {
    const arr = [...blocks];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    onBlocksChange(arr.map((b, i) => ({ ...b, position: i + 1 })));
    arr.forEach((b, i) => {
      sessionBlocksApi.update(b.id, { position: i + 1 }).catch(() => {});
    });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
    border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
    fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    color: '#64748B', fontSize: '0.72rem', fontWeight: 500,
    display: 'block', marginBottom: 4,
  };

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) return;
    setSaving(true);
    setBlockError('');
    try {
      const next = await sessionBlocksApi.create(sessionId, {
        position: blocks.length + 1,
        duration: parseInt(form.duration),
        category: form.category,
        intensity: form.intensity,
        label: form.label.trim(),
        description: formDescription.trim() || undefined,
        consignes: form.consignes.trim() || undefined,
        drillId: formDrillId,
      });
      onBlocksChange([...blocks, next]);
      setForm(BLANK_BLOCK);
      setFormDrillId(null);
      setFormDescription('');
      setShowForm(false);
    } catch (err: unknown) {
      setBlockError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(block: SessionBlock) {
    setEditingId(block.id);
    setEditForm({ duration: String(block.duration), category: block.category, intensity: block.intensity, label: block.label, consignes: block.consignes ?? '' });
    setEditDrillId(block.drillId);
    setEditDescription(block.description ?? '');
  }

  async function handleEditSave(block: SessionBlock) {
    setSaving(true);
    setBlockError('');
    try {
      const updated = await sessionBlocksApi.update(block.id, {
        duration:    parseInt(editForm.duration),
        category:    editForm.category,
        intensity:   editForm.intensity,
        label:       editForm.label.trim(),
        description: editDescription.trim(),
        consignes:   editForm.consignes.trim(),
        drillId:     editDrillId,
      });
      onBlocksChange(blocks.map(b => b.id === block.id ? updated : b));
      setEditingId(null);
    } catch (err: unknown) {
      setBlockError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await sessionBlocksApi.remove(id);
      onBlocksChange(blocks.filter(b => b.id !== id));
    } catch (err: unknown) {
      setBlockError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  const totalDuration = blocks.reduce((s, b) => s + b.duration, 0);
  const totalLoadUa   = blocks.reduce((s, b) => s + b.loadUa, 0);

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <BookOpen size={15} style={{ color: '#00E5A0' }} />
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Contenu de la séance</h2>
        {blocks.length > 0 && (
          <span style={{ color: '#475569', fontSize: '0.72rem' }}>
            {totalDuration} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''} · <span style={{ color: '#F59E0B' }}>{totalLoadUa} UA</span>
          </span>
        )}
      </div>

      {blockError && (
        <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 10 }}>{blockError}</div>
      )}

      {/* Liste des blocs */}
      {blocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: showForm ? 12 : 0 }}>
          {blocks.map((block, i) => {
            const intCfg = INTENSITY_CFG[block.intensity] ?? INTENSITY_CFG['moyenne'];
            const linkedExercise = block.drillId ? exercises.find(e => e.id === block.drillId) ?? null : null;
            const neutralBadge: React.CSSProperties = { backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' };
            const uaBadge: React.CSSProperties = { backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 4, color: '#F59E0B', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' };
            const isEditing = editingId === block.id;

            const isDragging = draggingIndex === i;
            const isOver     = overIndex === i && draggingIndex !== null && draggingIndex !== i;

            return (
              <div key={block.id}
                data-bi={i}
                style={{
                  backgroundColor: '#161920',
                  border: isOver ? '1px solid #00E5A0' : '1px solid #2A2F3A',
                  borderRadius: 8, padding: '10px 14px', minHeight: 52,
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: isEditing ? 10 : 0,
                  opacity: isDragging ? 0.4 : 1,
                  transition: 'opacity 0.15s, border-color 0.15s',
                  userSelect: 'none',
                  boxSizing: 'border-box',
                }}>
                {isEditing ? (
                  /* Édition inline */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {/* Bibliothèque — autocomplete */}
                    {exercises.length > 0 && (
                      <ExercisePicker
                        exercises={exercises}
                        value={editDrillId}
                        inputStyle={inputStyle}
                        onChange={(id, ex) => {
                          setEditDrillId(id);
                          setEditDescription(ex?.description ?? '');
                          if (ex) setEditForm(f => ({
                            ...f,
                            label: ex.name,
                            consignes: ex.consignes ?? f.consignes,
                            ...(ex.categoryName ? { category: ex.categoryName } : {}),
                          }));
                        }}
                      />
                    )}

                    {/* Libellé */}
                    <div>
                      <label style={labelStyle}>Libellé</label>
                      <input type="text" placeholder="Nom de l'exercice…" value={editForm.label}
                        onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        style={inputStyle} />
                    </div>

                    {/* Métadonnées */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ width: 86, flexShrink: 0 }}>
                        <label style={labelStyle}>Durée (min)</label>
                        <input type="number" min={1} max={180} value={editForm.duration}
                          onChange={e => setEditForm(f => ({ ...f, duration: e.target.value }))}
                          style={inputStyle} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={labelStyle}>Catégorie</label>
                        <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                          {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <label style={labelStyle}>Intensité</label>
                        <select value={editForm.intensity} onChange={e => setEditForm(f => ({ ...f, intensity: e.target.value as SessionBlock['intensity'] }))} style={inputStyle}>
                          {Object.entries(INTENSITY_CFG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Description / Consignes */}
                    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 10, alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={labelStyle}>Déroulement</label>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <RichTextEditor value={editDescription} onChange={setEditDescription}
                            placeholder="Déroulement de l'exercice…" minHeight={60} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <label style={labelStyle}>Objectifs</label>
                        <div style={{ flex: 1, minHeight: 0 }}>
                          <RichTextEditor value={editForm.consignes} onChange={html => setEditForm(f => ({ ...f, consignes: html }))}
                            placeholder="Objectifs spécifiques pour cet exercice…" minHeight={60} />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                      <button onClick={() => setEditingId(null)}
                        style={{ padding: '8px 16px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.84rem' }}>
                        Annuler
                      </button>
                      <button disabled={saving} onClick={() => handleEditSave(block)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.84rem' }}>
                        <Save size={14} />
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* === Mobile (< md) : 2 lignes === */}
                    <div className="flex flex-col md:hidden" style={{ gap: 6, minWidth: 0 }}>
                      {/* Ligne 1 : grip + numéro + label + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div
                          onPointerDown={e => startDrag(e, i)}
                          style={{ color: '#475569', flexShrink: 0, cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}>
                          <GripVertical size={14} />
                        </div>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ color: '#475569', fontSize: '0.6rem', fontWeight: 700 }}>{i + 1}</span>
                        </div>
                        <span style={{ color: '#F1F5F9', fontSize: '0.92rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{block.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {block.drillId && (
                            <button
                              onClick={() => { if (linkedExercise) setViewExercise(linkedExercise); }}
                              style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                              title="Voir l'exercice">
                              <BookOpen size={14} />
                            </button>
                          )}
                          <button onClick={() => openEdit(block)}
                            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                            <Edit size={14} />
                          </button>
                          <button onClick={() => handleDelete(block.id)}
                            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {/* Ligne 2 : badges, indentés */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 28, flexWrap: 'wrap' }}>
                        <span style={{ ...neutralBadge, fontSize: '0.68rem', padding: '2px 7px' }}>{block.duration} min</span>
                        <span style={{ ...neutralBadge, fontSize: '0.68rem', padding: '2px 7px' }}>{block.category}</span>
                        <span style={{ color: intCfg.color, backgroundColor: intCfg.bg, fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {intCfg.label}
                        </span>
                        <span style={{ ...uaBadge, fontSize: '0.68rem', padding: '2px 7px' }}>{block.loadUa} UA</span>
                      </div>
                    </div>

                    {/* === Desktop / tablette (≥ md) : 1 ligne === */}
                    <div className="hidden md:flex" style={{ alignItems: 'center', gap: 10 }}>
                      <div
                        onPointerDown={e => startDrag(e, i)}
                        style={{ color: '#475569', flexShrink: 0, cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}>
                        <GripVertical size={14} />
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700 }}>{i + 1}</span>
                      </div>
                      <span style={{ ...neutralBadge, fontSize: '0.72rem', padding: '3px 8px' }}>{block.duration} min</span>
                      <span style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.label}</span>
                      <span style={{ ...neutralBadge, fontSize: '0.72rem', padding: '3px 8px' }}>{block.category}</span>
                      <span style={{ color: intCfg.color, backgroundColor: intCfg.bg, fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {intCfg.label}
                      </span>
                      <span style={{ ...uaBadge, fontSize: '0.72rem', padding: '3px 8px' }}>{block.loadUa} UA</span>
                      <div style={{ width: 1, height: 18, backgroundColor: '#2A2F3A', flexShrink: 0 }} />
                      {block.drillId && (
                        <button
                          onClick={() => { if (linkedExercise) setViewExercise(linkedExercise); }}
                          style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 3, flexShrink: 0 }}
                          title="Voir l'exercice">
                          <BookOpen size={14} />
                        </button>
                      )}
                      <button onClick={() => openEdit(block)}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 3, flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                        <Edit size={14} />
                      </button>
                      <button onClick={() => handleDelete(block.id)}
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 3, flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2"
                      style={{ gap: 10, margin: '10px 0 0', paddingLeft: 30, paddingTop: 10, borderTop: '1px solid #1E2229' }}>
                      <div>
                        <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Déroulement</div>
                        {block.description ? (
                          <div className="rich-display" style={{ color: '#94A3B8', fontSize: '0.76rem' }}
                            dangerouslySetInnerHTML={{ __html: block.description }} />
                        ) : (
                          <span style={{ color: '#334155', fontSize: '0.76rem' }}>—</span>
                        )}
                      </div>
                      <div>
                        <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Objectifs</div>
                        {block.consignes ? (
                          <div className="rich-display" style={{ color: '#94A3B8', fontSize: '0.76rem' }}
                            dangerouslySetInnerHTML={{ __html: block.consignes }} />
                        ) : (
                          <span style={{ color: '#334155', fontSize: '0.76rem' }}>—</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Formulaire d'ajout */}
      {showForm && (
        <form onSubmit={handleAdd}
          style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Bibliothèque — autocomplete */}
          {exercises.length > 0 && (
            <ExercisePicker
              exercises={exercises}
              value={formDrillId}
              inputStyle={inputStyle}
              onChange={(id, ex) => {
                setFormDrillId(id);
                setFormDescription(ex?.description ?? '');
                if (ex) setForm(f => ({
                  ...f,
                  label: ex.name,
                  consignes: ex.consignes ?? f.consignes,
                  ...(ex.categoryName ? { category: ex.categoryName } : {}),
                }));
              }}
            />
          )}

          {/* Durée, libellé, catégorie, intensité — sur une ligne */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ width: 86, flexShrink: 0 }}>
              <label style={labelStyle}>Durée (min)</label>
              <input type="number" required min={1} max={180} value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                style={inputStyle} />
            </div>
            <div style={{ flex: 2, minWidth: 160 }}>
              <label style={labelStyle}>Libellé *</label>
              <input type="text" required placeholder="Nom de l'exercice…" value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                style={inputStyle} autoFocus />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Catégorie</label>
              <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Intensité</label>
              <select required value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value as SessionBlock['intensity'] }))} style={inputStyle}>
                {Object.entries(INTENSITY_CFG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
              </select>
            </div>
          </div>

          {/* Description / Consignes */}
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 10, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Déroulement</label>
              <div style={{ flex: 1, minHeight: 0 }}>
                <RichTextEditor value={formDescription} onChange={setFormDescription}
                  placeholder="Déroulement de l'exercice…" minHeight={60} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Objectifs</label>
              <div style={{ flex: 1, minHeight: 0 }}>
                <RichTextEditor value={form.consignes} onChange={html => setForm(f => ({ ...f, consignes: html }))}
                  placeholder="Objectifs spécifiques pour cet exercice…" minHeight={60} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={() => { setShowForm(false); setForm(BLANK_BLOCK); setFormDrillId(null); setFormDescription(''); }}
              style={{ padding: '8px 16px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.84rem' }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.84rem' }}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {!showForm && (
        <div style={{ border: '1px dashed #2A2F3A', borderRadius: 8, padding: '20px 16px', minHeight: 60, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer', transition: 'border-color 0.15s', marginTop: blocks.length > 0 ? 8 : 0 }}
          onClick={() => { setShowForm(true); setBlockError(''); }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3A4454'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2F3A'; }}>
          <Plus size={14} />
          Cliquer pour ajouter
        </div>
      )}

      {/* Modal détail exercice — même format que la fiche exercice */}
      {viewExercise && (
        <div
          onClick={() => setViewExercise(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <style>{`
            .ex-view-desc { color:#94A3B8; font-size:0.88rem; line-height:1.6; }
            .ex-view-desc p { margin:0 0 8px; }
            .ex-view-desc p:last-child { margin:0; }
            .ex-view-desc ul { margin:4px 0; padding-left:18px; list-style-type:disc; }
            .ex-view-desc ol { margin:4px 0; padding-left:18px; list-style-type:decimal; }
            .ex-view-desc li { display:list-item; margin:2px 0; }
            .ex-view-desc strong { color:#F1F5F9; }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 24, maxWidth: 720, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <button onClick={() => setViewExercise(null)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
              <X size={18} />
            </button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, paddingRight: 28 }}>
              <h1 style={{ color: '#F1F5F9', margin: 0 }}>{viewExercise.name}</h1>
              {viewExercise.categoryName && (
                <span style={{ color: viewExercise.categoryColor, backgroundColor: viewExercise.categoryColor + '18', fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
                  {viewExercise.categoryName}
                </span>
              )}
            </div>

            {/* Description / Consignes par défaut */}
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ borderTop: '1px solid #2A2F3A', paddingTop: 16, gap: 16 }}>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Déroulement</p>
                {viewExercise.description && viewExercise.description !== '<p></p>' ? (
                  <div className="ex-view-desc" dangerouslySetInnerHTML={{ __html: viewExercise.description }} />
                ) : (
                  <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucun déroulement.</span>
                )}
              </div>
              <div>
                <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Objectifs</p>
                {viewExercise.consignes && viewExercise.consignes !== '<p></p>' ? (
                  <div className="ex-view-desc" dangerouslySetInnerHTML={{ __html: viewExercise.consignes }} />
                ) : (
                  <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucun objectif.</span>
                )}
              </div>
            </div>

            {/* Images */}
            {viewExerciseImages.length > 0 && (
              <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
                <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Images</p>
                <ExerciseImageGallery images={viewExerciseImages} alt={viewExercise.name} />
              </div>
            )}

            {/* Document */}
            {viewExercise.documentUrl && (
              <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
                <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Document</p>
                <a href={viewExercise.documentUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F1F5F9', fontSize: '0.85rem', textDecoration: 'none' }}>
                  <FileText size={15} color="#00E5A0" />
                  {viewExercise.documentName || 'Document PDF'}
                  <ExternalLink size={13} color="#475569" />
                </a>
              </div>
            )}

            {/* Vidéo */}
            {viewExercise.videoUrl && detectSocialPlatform(viewExercise.videoUrl) && (
              <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
                <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Vidéo</p>
                <SocialVideoEmbed url={viewExercise.videoUrl} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionDocuments({ sessionId }: { sessionId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs,      setDocs]      = useState<SessionDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [docError,  setDocError]  = useState('');

  useEffect(() => {
    documentsApi.list(sessionId).then(setDocs).catch(() => {});
  }, [sessionId]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    setDocError('');
    try {
      for (const file of Array.from(files)) {
        const doc = await documentsApi.upload(sessionId, file);
        setDocs(prev => [...prev, doc]);
      }
    } catch (e: any) {
      setDocError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleOpen(doc: SessionDocument) {
    try {
      const url = await documentsApi.getSignedUrl(doc.storagePath);
      window.open(url, '_blank', 'noreferrer');
    } catch (e: any) {
      setDocError(e.message);
    }
  }

  async function handleDelete(doc: SessionDocument) {
    try {
      await documentsApi.remove(doc);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (e: any) {
      setDocError(e.message);
    }
  }

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <FileText size={15} style={{ color: '#00E5A0' }} />
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Documents</h2>
        {uploading && <span style={{ color: '#475569', fontSize: '0.76rem' }}>Upload…</span>}
      </div>

      {docError && (
        <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 10 }}>{docError}</div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {docs.length === 0 && !uploading ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{ border: `1px dashed ${dragOver ? '#00E5A0' : '#2A2F3A'}`, borderRadius: 8, padding: '20px 16px', minHeight: 60, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
        >
          <Plus size={14} />
          Glisser-déposer ou cliquer pour ajouter
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 14px' }}>
              <DocIcon mimeType={doc.mimeType} />
              <span style={{ color: '#F1F5F9', fontSize: '0.83rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
              {doc.size && <span style={{ color: '#475569', fontSize: '0.72rem', flexShrink: 0 }}>{fmtSize(doc.size)}</span>}
              <button onClick={() => handleOpen(doc)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                <ExternalLink size={13} />
              </button>
              <button onClick={() => handleDelete(doc)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {!uploading && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `1px dashed ${dragOver ? '#00E5A0' : '#1E2229'}`, borderRadius: 6, padding: '8px', textAlign: 'center', color: '#2A2F3A', fontSize: '0.74rem', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = '#475569'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = '#2A2F3A'; }}
            >
              + Ajouter un document
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session,    setSession]    = useState<TrainingSession | null>(null);
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<TrainingAttendance[]>([]);
  const [rpeEntries, setRpeEntries] = useState<{ playerId: string; rpe: number; actualDuration?: number }[]>([]);
  const [blocks,     setBlocks]     = useState<SessionBlock[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const [showEdit,   setShowEdit]   = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');
  const [editForm,   setEditForm]   = useState({ date: '', sessionType: 'training', duration: '90', notes: '' });

  const [rosterPlayers,    setRosterPlayers]    = useState<Player[]>([]);
  const [showAttendance,   setShowAttendance]   = useState(false);
  const [presencesCollapsed, setPresencesCollapsed] = useState(false);
  const [teamsCollapsed,     setTeamsCollapsed]     = useState(true);
  const [attSavingId,      setAttSavingId]      = useState<string | null>(null);
  const [attError,         setAttError]         = useState('');

  const [blockDrafts, setBlockDrafts] = useState<BlockDraft[]>(defaultBlockDrafts);
  const [teamsSaving, setTeamsSaving] = useState(false);
  const [teamsSaved,  setTeamsSaved]  = useState(false);
  const [teamsError,  setTeamsError]  = useState('');
  const [dragOver,    setDragOver]    = useState<{ block: string; col: string } | null>(null);

  const [notesDraft,  setNotesDraft]  = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved,  setNotesSaved]  = useState(false);
  const [notesError,  setNotesError]  = useState('');

  useEffect(() => {
    if (!session?.seasonId) return;
    playersApi.listBySeason(session.seasonId).then(setRosterPlayers).catch(() => {});
  }, [session?.seasonId]);

  useEffect(() => {
    if (id) loadBlocks(id).catch(err => setTeamsError(err instanceof Error ? err.message : 'Erreur de chargement des équipes.'));
  }, [id]);

  async function loadBlocks(sessionId: string) {
    const { blocks, teamsByBlock, playersByTeam } = await sessionTeamsApi.list(sessionId);
    setBlockDrafts(blocks.map(b => {
      const teams = teamsByBlock[b.id] ?? [];
      const assign: Record<string, string> = {};
      teams.forEach(t => { (playersByTeam[t.id] ?? []).forEach(pid => { assign[pid] = t.id; }); });
      return {
        localId: b.id,
        label: b.label,
        teams: teams.map(t => ({ localId: t.id, name: t.name, color: t.color })),
        assign,
      };
    }));
  }

  useEffect(() => {
    setNotesDraft(session?.notes ?? '');
  }, [session?.notes]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([
      attendanceApi.getSession(id),
      playersApi.list(),
      attendanceApi.listAttendance([id]),
      rpeApi.listBySession(id),
      sessionBlocksApi.list(id),
    ])
      .then(([sess, ps, att, rpe, blks]) => {
        setSession(sess);
        setPlayers(ps);
        setAttendance(att);
        setRpeEntries(rpe);
        setBlocks(blks);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !session) return (
    <div className="p-4 md:p-6">
      <button onClick={() => navigate('/sessions')} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Toutes les séances
      </button>
      <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>{error || 'Séance introuvable.'}</div>
    </div>
  );

  function openEdit() {
    setEditForm({ date: session!.date, sessionType: session!.sessionType, duration: String(session!.plannedDuration), notes: session!.notes ?? '' });
    setEditError('');
    setShowEdit(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await attendanceApi.updateSession(session.id, {
        date:            editForm.date,
        sessionType:     editForm.sessionType,
        plannedDuration: parseInt(editForm.duration),
        notes:           editForm.notes || null,
      });
      setSession(updated);
      setShowEdit(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleAttendance(playerId: string, status: TrainingAttendance['status']) {
    if (!session) return;
    const current = attendance.find(a => a.playerId === playerId)?.status;
    setAttSavingId(playerId);
    setAttError('');
    try {
      if (current === status) {
        await attendanceApi.deleteAttendance(session.id, playerId);
        setAttendance(prev => prev.filter(a => a.playerId !== playerId));
      } else {
        await attendanceApi.setAttendance({ sessionId: session.id, playerId, status });
        setAttendance(prev => [
          ...prev.filter(a => a.playerId !== playerId),
          { id: `${session.id}:${playerId}`, sessionId: session.id, playerId, status, createdAt: new Date().toISOString() },
        ]);
      }
    } catch (err: unknown) {
      setAttError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setAttSavingId(null);
    }
  }

  function updateBlock(blockLocalId: string, updater: (b: BlockDraft) => BlockDraft) {
    setBlockDrafts(prev => prev.map(b => b.localId === blockLocalId ? updater(b) : b));
  }
  function addBlock() {
    setBlockDrafts(prev => [...prev, {
      localId: crypto.randomUUID(),
      label: `Groupe ${prev.length + 1}`,
      teams: [
        { localId: crypto.randomUUID(), name: 'Équipe A', color: TEAM_COLORS[0] },
        { localId: crypto.randomUUID(), name: 'Équipe B', color: TEAM_COLORS[1] },
      ],
      assign: {},
    }]);
  }
  function removeBlock(blockLocalId: string) {
    setBlockDrafts(prev => prev.filter(b => b.localId !== blockLocalId));
  }
  function renameBlock(blockLocalId: string, label: string) {
    updateBlock(blockLocalId, b => ({ ...b, label }));
  }
  function setTeamCount(blockLocalId: string, n: number) {
    n = Math.max(2, Math.min(8, n));
    updateBlock(blockLocalId, b => {
      if (n === b.teams.length) return b;
      if (n < b.teams.length) {
        const kept = b.teams.slice(0, n);
        const keptIds = new Set(kept.map(t => t.localId));
        const assign = Object.fromEntries(Object.entries(b.assign).filter(([, tid]) => keptIds.has(tid)));
        return { ...b, teams: kept, assign };
      }
      const additions = Array.from({ length: n - b.teams.length }, (_, i) => {
        const idx = b.teams.length + i;
        return { localId: crypto.randomUUID(), name: `Équipe ${String.fromCharCode(65 + idx)}`, color: TEAM_COLORS[idx % TEAM_COLORS.length] };
      });
      return { ...b, teams: [...b.teams, ...additions] };
    });
  }
  function renameTeam(blockLocalId: string, teamLocalId: string, name: string) {
    updateBlock(blockLocalId, b => ({ ...b, teams: b.teams.map(t => t.localId === teamLocalId ? { ...t, name } : t) }));
  }
  function recolorTeam(blockLocalId: string, teamLocalId: string, color: string) {
    updateBlock(blockLocalId, b => ({ ...b, teams: b.teams.map(t => t.localId === teamLocalId ? { ...t, color } : t) }));
  }
  function assignPlayer(blockLocalId: string, playerId: string, teamLocalId: string) {
    updateBlock(blockLocalId, b => {
      if (!teamLocalId) { const { [playerId]: _drop, ...rest } = b.assign; return { ...b, assign: rest }; }
      return { ...b, assign: { ...b.assign, [playerId]: teamLocalId } };
    });
  }

  async function handleSaveTeams() {
    if (!session) return;
    setTeamsSaving(true);
    setTeamsError('');
    try {
      const payload = blockDrafts.map(b => ({
        label: b.label,
        teams: b.teams.map(t => ({
          name:      t.name,
          color:     t.color,
          playerIds: Object.entries(b.assign).filter(([, tid]) => tid === t.localId).map(([pid]) => pid),
        })),
      }));
      await sessionTeamsApi.saveBlocks(session.id, payload);
      await loadBlocks(session.id);
      setTeamsSaved(true);
      setTimeout(() => setTeamsSaved(false), 2000);
    } catch (err: unknown) {
      setTeamsError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.');
    } finally {
      setTeamsSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!session) return;
    setNotesSaving(true);
    setNotesError('');
    try {
      const updated = await attendanceApi.updateSession(session.id, { notes: notesDraft || null });
      setSession(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err: unknown) {
      setNotesError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.');
    } finally {
      setNotesSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
    border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
    fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  };

  const typeCfg = SESSION_TYPES[session.sessionType] ?? SESSION_TYPES.training;
  const attMap  = Object.fromEntries(attendance.map(a => [a.playerId, a.status]));
  const rpeMap  = Object.fromEntries(rpeEntries.map(e => [e.playerId, e]));

  const knownIds = new Set([...attendance.map(a => a.playerId), ...rpeEntries.map(e => e.playerId)]);
  const relevantPlayers = players
    .filter(p => knownIds.has(p.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  // Équipes du jour : seules les joueuses présentes ou en retard sont sélectionnables
  const eligiblePlayers = rosterPlayers.filter(p => attMap[p.id] === 'present' || attMap[p.id] === 'late');

  function renderPlayerItem(player: Player) {
    const attStatus = attMap[player.id] as TrainingAttendance['status'] | undefined;
    const rpe       = rpeMap[player.id];
    const statusCfg = attStatus === 'late' ? STATUS_CFG[attStatus] : null;
    return (
      <div key={player.id} onClick={() => navigate(`/players/${player.id}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
        <PlayerAvatar player={player} size={26} />
        <span style={{ color: '#F1F5F9', fontSize: '0.78rem', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.firstName} {player.lastName[0]}.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {rpe && (
            <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: rpeColor(rpe.rpe) + '22', color: rpeColor(rpe.rpe), fontSize: '0.7rem', fontWeight: 700 }}>
              {rpe.rpe}
            </span>
          )}
          {statusCfg && (
            <span style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, fontSize: '0.64rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
              {statusCfg.label}
            </span>
          )}
        </div>
      </div>
    );
  }

  const presentCount    = attendance.filter(a => a.status === 'present').length;
  const absentCount     = attendance.filter(a => a.status === 'absent').length;
  const lateCount       = attendance.filter(a => a.status === 'late').length;
  const rpeValues       = rpeEntries.map(e => e.rpe);
  const avgRpe          = rpeValues.length ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null;
  const totalLoad       = rpeEntries.reduce((sum, e) => sum + e.rpe * (e.actualDuration ?? session.plannedDuration), 0);
  const blockDuration   = blocks.reduce((s, b) => s + b.duration, 0);
  const blockLoadUa     = blocks.reduce((s, b) => s + b.loadUa, 0);
  const estimatedRpe    = blockDuration > 0 ? blockLoadUa / blockDuration : null;
  const avgLoadPerPlayer = rpeEntries.length > 0 ? totalLoad / rpeEntries.length : null;

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/sessions')}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          <ArrowLeft size={14} /> Toutes les séances
        </button>
        <button onClick={openEdit} style={{ padding: '6px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Edit size={13} /> Modifier
        </button>
      </div>

      {/* Header + KPIs */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

          {/* Partie 1 : titre + infos */}
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <h1 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>{fmtDateFull(session.date)}</h1>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: typeCfg.color, backgroundColor: typeCfg.bg, fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 4 }}>
                {typeCfg.label}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.82rem' }}>
                <Clock size={13} /> {session.plannedDuration} min
              </span>
              {(session.partnerCount ?? 0) > 0 && (
                <span style={{ color: '#475569', fontSize: '0.78rem' }}>{session.partnerCount} partenaire{(session.partnerCount ?? 0) > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {/* Partie 2 : KPIs alignés à droite */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
        {(estimatedRpe !== null || avgRpe !== null) && (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {estimatedRpe !== null && (
              <div style={{ textAlign: 'center', minWidth: 84 }}>
                <div style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{estimatedRpe.toFixed(1)}</div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>RPE estimé</div>
              </div>
            )}
            {estimatedRpe !== null && (
              <div style={{ width: 1, height: 28, backgroundColor: '#2A2F3A', flexShrink: 0 }} />
            )}
            {avgRpe !== null ? (
                <div style={{ textAlign: 'center', minWidth: 84 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: estimatedRpe !== null ? deltaColor(avgRpe, estimatedRpe) : rpeColor(avgRpe), fontSize: '1.15rem', fontWeight: 700 }}>{avgRpe.toFixed(1)}</span>
                    {estimatedRpe !== null && avgRpe > estimatedRpe && <ArrowUp size={13} style={{ color: '#EF4444' }} />}
                    {estimatedRpe !== null && avgRpe < estimatedRpe && <ArrowDown size={13} style={{ color: '#00E5A0' }} />}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>RPE réel</div>
                </div>
            ) : (
              <button onClick={() => navigate('/rpe/new', { state: { sessionDate: session.date, sessionType: session.sessionType, duration: session.plannedDuration, sessionId: session.id } })}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                Saisir le RPE
                <ArrowRight size={11} />
              </button>
            )}
          </div>
        )}
        {(blockLoadUa > 0 || avgLoadPerPlayer !== null) && (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {blockLoadUa > 0 && (
              <div style={{ textAlign: 'center', minWidth: 84 }}>
                <div style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{blockLoadUa}</div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Charge estimée</div>
              </div>
            )}
            {blockLoadUa > 0 && (
              <div style={{ width: 1, height: 28, backgroundColor: '#2A2F3A', flexShrink: 0 }} />
            )}
            {avgLoadPerPlayer !== null ? (
                <div style={{ textAlign: 'center', minWidth: 84 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: blockLoadUa > 0 ? deltaColor(avgLoadPerPlayer, blockLoadUa) : '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{Math.round(avgLoadPerPlayer)}</span>
                    {blockLoadUa > 0 && avgLoadPerPlayer > blockLoadUa && <ArrowUp size={13} style={{ color: '#EF4444' }} />}
                    {blockLoadUa > 0 && avgLoadPerPlayer < blockLoadUa && <ArrowDown size={13} style={{ color: '#00E5A0' }} />}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Charge réelle</div>
                </div>
            ) : (
              blockLoadUa > 0 && (
                <span style={{ color: '#2A2F3A', fontSize: '0.72rem' }}>—</span>
              )
            )}
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Player table */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: presencesCollapsed || relevantPlayers.length === 0 ? 0 : 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check size={15} style={{ color: '#00E5A0' }} />
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Présences</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#00E5A0', fontSize: '0.8rem', fontWeight: 600 }}>{presentCount} présent{presentCount !== 1 ? 's' : ''}</span>
              {absentCount > 0 && <span style={{ color: '#EF4444', fontSize: '0.8rem', fontWeight: 600 }}>{absentCount} absent{absentCount !== 1 ? 's' : ''}</span>}
              {lateCount > 0 && <span style={{ color: '#F59E0B', fontSize: '0.8rem', fontWeight: 600 }}>{lateCount} retard{lateCount !== 1 ? 's' : ''}</span>}
            </div>
          </div>
          <button onClick={() => setPresencesCollapsed(v => !v)} title={presencesCollapsed ? 'Afficher' : 'Réduire'}
            style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
            {presencesCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
        {presencesCollapsed ? null : relevantPlayers.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: '10px 0 0' }}>Aucune donnée enregistrée pour cette séance.</p>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: 12 }}>
          {POSITIONS.map(pos => {
            const posPlayers = relevantPlayers.filter(p => p.position === pos && attMap[p.id] !== 'absent');
            return (
              <div key={pos} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #2A2F3A', borderRadius: 8, padding: 8 }}>
                <div style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', paddingBottom: 6, borderBottom: '1px solid #2A2F3A' }}>
                  {pos}
                </div>
                {posPlayers.length === 0 ? (
                  <span style={{ color: '#334155', fontSize: '0.72rem', padding: '8px 0' }}>—</span>
                ) : posPlayers.map(renderPlayerItem)}
              </div>
            );
          })}

          {/* Absents, toutes positions confondues */}
          {(() => {
            const absentPlayers = relevantPlayers.filter(p => attMap[p.id] === 'absent');
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 8 }}>
                <div style={{ color: '#EF4444', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', paddingBottom: 6, borderBottom: '1px solid rgba(239,68,68,0.25)' }}>
                  Absents
                </div>
                {absentPlayers.length === 0 ? (
                  <span style={{ color: '#334155', fontSize: '0.72rem', padding: '8px 0' }}>—</span>
                ) : absentPlayers.map(renderPlayerItem)}
              </div>
            );
          })()}
        </div>
        )}
        {!presencesCollapsed && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button onClick={() => { setAttError(''); setShowAttendance(true); }} style={{ padding: '6px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Edit size={13} /> Modifier
            </button>
          </div>
        )}
      </div>

      {/* Équipes du jour (sparring / jeu réduit) */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: teamsCollapsed ? 0 : 6, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} style={{ color: '#00E5A0' }} />
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Équipes</h2>
          </div>
          <button onClick={() => setTeamsCollapsed(v => !v)} title={teamsCollapsed ? 'Afficher' : 'Réduire'}
            style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
            {teamsCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>

        {!teamsCollapsed && (
        <>
        <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 14px' }}>
          Glissez-déposez les joueuses depuis « Effectif » vers les colonnes d'équipe. Un groupe = une répartition indépendante (ex. 3x3 puis 5x5).
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {blockDrafts.map(block => {
            const unassigned = eligiblePlayers.filter(p => !block.assign[p.id]);
            const poolOver = dragOver?.block === block.localId && dragOver.col === '__pool';
            return (
              <div key={block.localId} style={{ backgroundColor: '#14171D', border: '1px solid #2A2F3A', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                  <input value={block.label} onChange={e => renameBlock(block.localId, e.target.value)}
                    style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 700, outline: 'none', minWidth: 120 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.76rem' }}>Nombre d'équipes</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" onClick={() => setTeamCount(block.localId, block.teams.length - 1)} disabled={block.teams.length <= 2}
                          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #2A2F3A', backgroundColor: '#1E2229', color: block.teams.length <= 2 ? '#334155' : '#F1F5F9', cursor: block.teams.length <= 2 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>−</button>
                        <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', minWidth: 14, textAlign: 'center' }}>{block.teams.length}</span>
                        <button type="button" onClick={() => setTeamCount(block.localId, block.teams.length + 1)} disabled={block.teams.length >= 8}
                          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #2A2F3A', backgroundColor: '#1E2229', color: block.teams.length >= 8 ? '#334155' : '#F1F5F9', cursor: block.teams.length >= 8 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', lineHeight: 1 }}>+</button>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeBlock(block.localId)}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>

                  {/* Colonne effectif (joueuses non assignées dans ce bloc) */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver({ block: block.localId, col: '__pool' }); }}
                    onDragLeave={() => setDragOver(cur => (cur?.block === block.localId && cur.col === '__pool') ? null : cur)}
                    onDrop={e => { e.preventDefault(); const pid = e.dataTransfer.getData('text/plain'); if (pid) assignPlayer(block.localId, pid, ''); setDragOver(null); }}
                    style={{ flex: '0 0 200px', minWidth: 200, height: 300, backgroundColor: '#1A1D24', border: `1px solid ${poolOver ? '#00E5A0' : '#2A2F3A'}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span style={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.8rem' }}>Effectif</span>
                      <span style={{ color: '#475569', fontSize: '0.7rem' }}>{unassigned.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      {unassigned.map(p => <PlayerChip key={p.id} player={p} status={attMap[p.id] as TrainingAttendance['status'] | undefined} />)}
                      {unassigned.length === 0 && (
                        <span style={{ color: '#334155', fontSize: '0.72rem', textAlign: 'center', padding: '12px 0' }}>Tout le monde est assigné</span>
                      )}
                    </div>
                  </div>

                  {/* Colonnes équipes */}
                  {block.teams.map(team => {
                    const members = eligiblePlayers.filter(p => block.assign[p.id] === team.localId);
                    const isOver  = dragOver?.block === block.localId && dragOver.col === team.localId;
                    return (
                      <div key={team.localId}
                        onDragOver={e => { e.preventDefault(); setDragOver({ block: block.localId, col: team.localId }); }}
                        onDragLeave={() => setDragOver(cur => (cur?.block === block.localId && cur.col === team.localId) ? null : cur)}
                        onDrop={e => { e.preventDefault(); const pid = e.dataTransfer.getData('text/plain'); if (pid) assignPlayer(block.localId, pid, team.localId); setDragOver(null); }}
                        style={{ flex: '0 0 200px', minWidth: 200, height: 300, backgroundColor: '#1A1D24', border: `1px solid ${isOver ? team.color : team.color + '40'}`, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <input value={team.name} onChange={e => renameTeam(block.localId, team.localId, e.target.value)}
                          style={{ padding: '5px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 700, outline: 'none', flexShrink: 0 }} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {TEAM_COLORS.map(c => (
                              <button key={c} type="button" onClick={() => recolorTeam(block.localId, team.localId, c)}
                                style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: c, border: team.color === c ? '2px solid #F1F5F9' : '1px solid #3A4454', cursor: 'pointer', padding: 0 }} />
                            ))}
                          </div>
                          <span style={{ color: '#475569', fontSize: '0.7rem' }}>{members.length}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                          {members.map(p => <PlayerChip key={p.id} player={p} status={attMap[p.id] as TrainingAttendance['status'] | undefined} />)}
                          {members.length === 0 && (
                            <span style={{ color: '#334155', fontSize: '0.72rem', textAlign: 'center', padding: '12px 0' }}>Déposez des joueuses ici</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {blockDrafts.length === 0 && (
            <button type="button" onClick={addBlock}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', border: '1px dashed #2A2F3A', borderRadius: 8, padding: '20px 16px', minHeight: 60, boxSizing: 'border-box', background: 'none', textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3A4454'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2F3A'; }}>
              <Plus size={14} />
              Cliquer pour ajouter
            </button>
          )}
        </div>
        </>
        )}
        {!teamsCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            {teamsError && <span style={{ color: '#EF4444', fontSize: '0.78rem' }}>{teamsError}</span>}
            <button type="button" onClick={addBlock}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem' }}>
              <Plus size={13} /> Ajouter un groupe
            </button>
            <button type="button" onClick={handleSaveTeams} disabled={teamsSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', backgroundColor: teamsSaved ? '#1E2229' : teamsSaving ? '#1E2229' : '#00E5A0', border: teamsSaved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: teamsSaved ? '#00E5A0' : teamsSaving ? '#475569' : '#0D0F14', cursor: teamsSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
              {teamsSaved ? <><Check size={13} /> Enregistré</> : <><Save size={13} /> {teamsSaving ? 'Enregistrement…' : 'Enregistrer'}</>}
            </button>
          </div>
        )}
      </div>

      <SessionBlocks sessionId={session.id} blocks={blocks} onBlocksChange={setBlocks} />

      {/* Notes + Documents, côte à côte */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Edit size={15} style={{ color: '#00E5A0' }} />
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Notes</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {notesError && <span style={{ color: '#EF4444', fontSize: '0.78rem' }}>{notesError}</span>}
              <button type="button" onClick={handleSaveNotes} disabled={notesSaving || notesDraft === (session.notes ?? '')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', backgroundColor: notesSaved ? '#1E2229' : (notesSaving || notesDraft === (session.notes ?? '')) ? '#1E2229' : '#00E5A0', border: notesSaved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: notesSaved ? '#00E5A0' : (notesSaving || notesDraft === (session.notes ?? '')) ? '#475569' : '#0D0F14', cursor: (notesSaving || notesDraft === (session.notes ?? '')) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                {notesSaved ? <><Check size={13} /> Enregistré</> : <><Save size={13} /> {notesSaving ? 'Enregistrement…' : 'Enregistrer'}</>}
              </button>
            </div>
          </div>
          <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)}
            placeholder="Notes sur la séance…"
            style={{ width: '100%', minHeight: 70, padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <SessionDocuments sessionId={session.id} />
      </div>

      {/* Modal édition séance */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowEdit(false); }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 440, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Modifier la séance</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {editError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{editError}</span>
              </div>
            )}
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date" required value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Type *</label>
                  <select required value={editForm.sessionType} onChange={e => setEditForm(f => ({ ...f, sessionType: e.target.value }))} style={inputStyle}>
                    <option value="training">Entraînement</option>
                    <option value="match">Match</option>
                    <option value="gym">Salle</option>
                    <option value="rest">Repos</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Durée (min) *</label>
                <input type="number" required min={1} max={300} value={editForm.duration} onChange={e => setEditForm(f => ({ ...f, duration: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Notes</label>
                <input type="text" placeholder="Optionnel…" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowEdit(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={editSaving} style={{ flex: 1, padding: '10px', backgroundColor: editSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: editSaving ? '#475569' : '#0D0F14', cursor: editSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal présences */}
      {showAttendance && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAttendance(false); }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #1E2229' }}>
              <div>
                <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Présences</h2>
                <p style={{ color: '#475569', fontSize: '0.78rem', margin: '2px 0 0' }}>{fmtDateFull(session.date)}</p>
              </div>
              <button onClick={() => setShowAttendance(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
            </div>

            {attError && (
              <div style={{ padding: '10px 20px 0' }}>
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{attError}</span>
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {rosterPlayers.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>Aucun joueur dans l'effectif.</p>
              ) : rosterPlayers.map(p => {
                const status = attendance.find(a => a.playerId === p.id)?.status;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderBottom: '1px solid #1E2229' }}>
                    <PlayerAvatar player={p} size={30} />
                    <span style={{ flex: 1, minWidth: 0, color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.lastName} {p.firstName}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {(['present', 'absent', 'late'] as const).map(s => {
                        const cfg = STATUS_CFG[s];
                        const active = status === s;
                        const Icon = s === 'present' ? Check : s === 'absent' ? X : Clock;
                        return (
                          <button key={s} type="button" title={cfg.label} disabled={attSavingId === p.id}
                            onClick={() => toggleAttendance(p.id, s)}
                            style={{
                              width: 32, height: 32, borderRadius: 7,
                              border: `1px solid ${active ? cfg.color : '#2A2F3A'}`,
                              backgroundColor: active ? cfg.bg : 'transparent',
                              color: active ? cfg.color : '#475569',
                              cursor: attSavingId === p.id ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            <Icon size={14} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #1E2229', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAttendance(false)}
                style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
