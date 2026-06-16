import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, X, AlertCircle, BookOpen, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { exercisesApi } from '../api/exercises';
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

/* ── Modal form (avec éditeur) ───────────────────────────────────────────── */
function ExerciseModal({
  editing, onClose, onSaved,
}: {
  editing: Exercise | null;
  onClose: () => void;
  onSaved: (ex: Exercise, isNew: boolean) => void;
}) {
  const [name,        setName]        = useState(editing?.name ?? '');
  const [category,    setCategory]    = useState(editing?.category ?? '');
  const [imageUrl,    setImageUrl]    = useState(editing?.imageUrl ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setFormError('');
    const plain = description.replace(/<[^>]+>/g, '').trim();
    const payload = {
      name:        name.trim(),
      description: plain ? description : undefined,
      imageUrl:    imageUrl.trim() || undefined,
      category:    category || undefined,
    };
    try {
      if (editing) {
        const updated = await exercisesApi.update(editing.id, payload);
        onSaved(updated, false);
      } else {
        const created = await exercisesApi.create(payload);
        onSaved(created, true);
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
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>URL image</label>
            <input type="url" placeholder="https://…" value={imageUrl}
              onChange={e => setImageUrl(e.target.value)} style={inputStyle} />
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
  const [exercises,  setExercises]  = useState<Exercise[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState<Exercise | null>(null);
  const [confirmDel, setConfirmDel] = useState<Exercise | null>(null);
  const [deleting,   setDeleting]   = useState(false);
  const [delError,   setDelError]   = useState('');

  useEffect(() => {
    exercisesApi.list()
      .then(setExercises)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(ex: Exercise, isNew: boolean) {
    setExercises(prev =>
      (isNew ? [...prev, ex] : prev.map(e => e.id === ex.id ? ex : e))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  async function handleDelete() {
    if (!confirmDel) return;
    setDeleting(true);
    setDelError('');
    try {
      await exercisesApi.remove(confirmDel.id);
      setExercises(prev => prev.filter(e => e.id !== confirmDel.id));
      setConfirmDel(null);
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setDeleting(false);
    }
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
        <button onClick={() => { setEditing(null); setShowModal(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 7, color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
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

      {/* List */}
      {filtered.length > 0 && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          {filtered.map((ex, i) => (
            <div key={ex.id}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: i < filtered.length - 1 ? '1px solid #1E2229' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ex.description ? 4 : 0, flexWrap: 'wrap' }}>
                  <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.9rem' }}>{ex.name}</span>
                  <CategoryBadge category={ex.category} />
                </div>
                <RichText html={ex.description} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button onClick={() => { setEditing(ex); setShowModal(true); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 6, borderRadius: 5 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                  <Edit size={15} />
                </button>
                <button onClick={() => { setConfirmDel(ex); setDelError(''); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 6, borderRadius: 5 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal create / edit */}
      {showModal && (
        <ExerciseModal
          editing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* Modal confirmation suppression */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 380, padding: '24px' }}>
            <h2 style={{ color: '#F1F5F9', margin: '0 0 10px', fontSize: '1rem', fontWeight: 700 }}>Supprimer l'exercice ?</h2>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
              <strong style={{ color: '#F1F5F9' }}>{confirmDel.name}</strong> sera supprimé.
            </p>
            <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 16px' }}>
              Les blocs de séances liés conserveront leur libellé mais perdront le lien vers la bibliothèque.
            </p>
            {delError && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 12 }}>{delError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(null)}
                style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
