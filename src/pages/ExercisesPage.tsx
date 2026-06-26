import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, X, AlertCircle, BookOpen, Bold, Italic, List, ListOrdered, Upload } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { exercisesApi } from '../api/exercises';
import { notifyOrg } from '../api/notifications';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Exercise } from '../data/types';

export const EXERCISE_CATEGORIES = [
  'Échauffement', 'Jeu réduit', 'Jeu rapide', 'Tirs', 'Technique',
  'Physique', 'Tactique', 'Retour au calme', 'Autre',
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/* ── Barre d'outils + éditeur TipTap ──────────────────────────────────────── */
function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: [
          'min-height:100px',
          'padding:9px 11px',
          'outline:none',
          'color:#F1F5F9',
          'font-size:0.85rem',
          'line-height:1.55',
          'font-family:inherit',
        ].join(';'),
      },
    },
  });

  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, title: string, children: React.ReactNode) => (
    <button type="button" onClick={onClick} title={title}
      style={{
        background: active ? 'rgba(0,229,160,0.15)' : 'none',
        border: 'none', borderRadius: 4, cursor: 'pointer', padding: '4px 6px',
        color: active ? '#00E5A0' : '#94A3B8', display: 'flex', alignItems: 'center',
      }}>
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 6, backgroundColor: '#1E2229', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid #2A2F3A', flexWrap: 'wrap' }}>
        {btn(editor.isActive('bold'),        () => editor.chain().focus().toggleBold().run(),        'Gras',          <Bold size={13} />)}
        {btn(editor.isActive('italic'),      () => editor.chain().focus().toggleItalic().run(),      'Italique',      <Italic size={13} />)}
        {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'Liste',         <List size={13} />)}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Liste numérotée', <ListOrdered size={13} />)}
      </div>
      {/* Editor area */}
      <EditorContent editor={editor} />
      <style>{`
        .ProseMirror p { margin: 0 0 6px; }
        .ProseMirror p:last-child { margin: 0; }
        .ProseMirror ul { margin: 4px 0; padding-left: 20px; list-style-type: disc; }
        .ProseMirror ol { margin: 4px 0; padding-left: 20px; list-style-type: decimal; }
        .ProseMirror li { margin: 2px 0; display: list-item; }
        .ProseMirror strong { color: #F1F5F9; }
      `}</style>
    </div>
  );
}

/* ── Rendu HTML (liste) ───────────────────────────────────────────────────── */
function RichText({ html }: { html?: string }) {
  if (!html || html === '<p></p>') return null;
  return (
    <>
      <div className="exercise-desc" dangerouslySetInnerHTML={{ __html: html }} />
      <style>{`
        .exercise-desc { color:#64748B; font-size:0.78rem; line-height:1.5; }
        .exercise-desc p { margin:0 0 4px; }
        .exercise-desc p:last-child { margin:0; }
        .exercise-desc ul { margin:2px 0; padding-left:16px; list-style-type:disc; }
        .exercise-desc ol { margin:2px 0; padding-left:16px; list-style-type:decimal; }
        .exercise-desc li { display:list-item; margin:1px 0; }
        .exercise-desc strong { color:#94A3B8; }
      `}</style>
    </>
  );
}

/* ── Catégorie badge ──────────────────────────────────────────────────────── */
const CAT_COLORS: Record<string, string> = {
  'Échauffement':    '#F59E0B',
  'Jeu réduit':      '#3B82F6',
  'Jeu rapide':      '#06B6D4',
  'Tirs':            '#8B5CF6',
  'Technique':       '#00E5A0',
  'Physique':        '#EF4444',
  'Tactique':        '#F97316',
  'Retour au calme': '#94A3B8',
  'Autre':           '#475569',
};

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const color = CAT_COLORS[category] ?? '#475569';
  return (
    <span style={{ color, backgroundColor: color + '18', fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>
      {category}
    </span>
  );
}

/* ── Image picker (upload fichier) ───────────────────────────────────────── */
function ImagePicker({ currentUrl, onSelect }: { currentUrl: string; onSelect: (file: File | null, remove: boolean) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setCleared(false);
    onSelect(f, false);
  }

  function clear() {
    setPreview(null);
    setCleared(true);
    if (ref.current) ref.current.value = '';
    onSelect(null, true);
  }

  const shown = cleared ? null : (preview ?? (currentUrl || null));

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {shown ? (
        <div style={{ position: 'relative' }}>
          <img src={shown} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid #2A2F3A', display: 'block', maxHeight: 180, objectFit: 'contain', background: '#0D0F14' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => ref.current?.click()}
              style={{ padding: '3px 9px', background: 'rgba(13,15,20,0.88)', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>
              Changer
            </button>
            <button type="button" onClick={clear}
              style={{ padding: '3px 7px', background: 'rgba(13,15,20,0.88)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          style={{ width: '100%', padding: '20px', background: '#1E2229', border: '2px dashed #2A2F3A', borderRadius: 8, color: '#475569', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A4049'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; }}>
          <Upload size={20} />
          <span style={{ fontSize: '0.78rem' }}>Cliquer pour choisir une image</span>
        </button>
      )}
    </div>
  );
}

/* ── Modal form (avec éditeur) ───────────────────────────────────────────── */
function ExerciseModal({
  editing, onClose, onSaved, teamId,
}: {
  editing: Exercise | null;
  onClose: () => void;
  onSaved: (ex: Exercise, isNew: boolean) => void;
  teamId?: string;
}) {
  const [name,        setName]        = useState(editing?.name ?? '');
  const [category,    setCategory]    = useState(editing?.category ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormError('');
    const plain = description.replace(/<[^>]+>/g, '').trim();
    try {
      if (editing) {
        let imageUrlPatch: string | undefined;
        if (imageFile) {
          imageUrlPatch = await exercisesApi.uploadImage(editing.id, imageFile);
          if (editing.imageUrl) exercisesApi.deleteImageByUrl(editing.imageUrl).catch(() => {});
        } else if (removeImage) {
          imageUrlPatch = '';
          if (editing.imageUrl) exercisesApi.deleteImageByUrl(editing.imageUrl).catch(() => {});
        }
        const updated = await exercisesApi.update(editing.id, {
          name: name.trim(), description: plain ? description : undefined,
          imageUrl: imageUrlPatch, category: category || undefined,
        });
        onSaved(updated, false);
      } else {
        const created = await exercisesApi.create({
          name: name.trim(), description: plain ? description : undefined,
          category: category || undefined, teamId,
        });
        if (imageFile) {
          const imageUrl = await exercisesApi.uploadImage(created.id, imageFile);
          const withImg = await exercisesApi.update(created.id, { imageUrl });
          onSaved(withImg, true);
        } else {
          onSaved(created, true);
        }
      }
      onClose();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 500, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
            {editing ? "Modifier l'exercice" : 'Nouvel exercice'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>

        {formError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Nom *</label>
            <input required type="text" placeholder="Nom de l'exercice…" value={name}
              onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
          </div>

          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Catégorie</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
              <option value="">— Aucune —</option>
              {EXERCISE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Description</label>
            <RichEditor value={description} onChange={setDescription} />
          </div>

          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Image</label>
            <ImagePicker
              currentUrl={editing?.imageUrl ?? ''}
              onSelect={(f, rm) => { setImageFile(f); setRemoveImage(rm); }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function ExercisesPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [showModal,  setShowModal]  = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setExercises([]);
    exercisesApi.list({ teamId: selected.team.id })
      .then(setExercises)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  function handleSaved(ex: Exercise, isNew: boolean) {
    setExercises(prev =>
      (isNew ? [...prev, ex] : prev.map(e => e.id === ex.id ? ex : e))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    notifyOrg(isNew ? 'exercise_added' : 'exercise_updated', ex.name, ex.category ?? undefined, 'exercise', ex.id);
  }

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    (ex.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (ex.description ?? '').replace(/<[^>]+>/g, '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={20} color="#00E5A0" />
          <h1 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Exercices</h1>
          {exercises.length > 0 && (
            <span style={{ color: '#475569', fontSize: '0.78rem', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 20, padding: '2px 10px' }}>
              {exercises.length}
            </span>
          )}
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 7, color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360, width: '100%' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
        <input type="text" placeholder="Rechercher…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 32 }} />
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {error && <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ border: '1px dashed #2A2F3A', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
          <BookOpen size={32} color="#2A2F3A" style={{ marginBottom: 10 }} />
          <div style={{ color: '#475569', fontSize: '0.85rem' }}>
            {search ? 'Aucun exercice trouvé' : 'Aucun exercice — cliquer sur Ajouter pour commencer'}
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', width: 150 }}>Catégorie</th>
                <th className="hidden sm:table-cell" style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ex, i) => {
                const desc = ex.description ? ex.description.replace(/<[^>]+>/g, '').trim() : '';
                return (
                  <tr key={ex.id}
                    onClick={() => navigate(`/exercises/${ex.id}`)}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1E26'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>{ex.name}</span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <CategoryBadge category={ex.category} />
                    </td>
                    <td className="hidden sm:table-cell" style={{ padding: '12px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: '#475569', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                          {desc || '—'}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M5 3l4 4-4 4" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal create */}
      {showModal && (
        <ExerciseModal
          editing={null}
          onClose={() => setShowModal(false)}
          onSaved={(ex, isNew) => { handleSaved(ex, isNew); if (isNew) navigate(`/exercises/${ex.id}`); }}
          teamId={selected?.team.id}
        />
      )}
    </div>
  );
}
