import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2, AlertCircle, Bold, Italic, List, ListOrdered, X, Upload } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { exercisesApi } from '../api/exercises';
import type { Exercise } from '../data/types';

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

const EXERCISE_CATEGORIES = [
  'Échauffement', 'Jeu réduit', 'Jeu rapide', 'Tirs', 'Technique',
  'Physique', 'Tactique', 'Retour au calme', 'Autre',
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: [
          'min-height:100px', 'padding:9px 11px', 'outline:none',
          'color:#F1F5F9', 'font-size:0.85rem', 'line-height:1.55', 'font-family:inherit',
        ].join(';'),
      },
    },
  });
  if (!editor) return null;
  const btn = (active: boolean, onClick: () => void, title: string, children: React.ReactNode) => (
    <button type="button" onClick={onClick} title={title}
      style={{ background: active ? 'rgba(0,229,160,0.15)' : 'none', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '4px 6px', color: active ? '#00E5A0' : '#94A3B8', display: 'flex', alignItems: 'center' }}>
      {children}
    </button>
  );
  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 6, backgroundColor: '#1E2229', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid #2A2F3A' }}>
        {btn(editor.isActive('bold'),        () => editor.chain().focus().toggleBold().run(),        'Gras',            <Bold size={13} />)}
        {btn(editor.isActive('italic'),      () => editor.chain().focus().toggleItalic().run(),      'Italique',        <Italic size={13} />)}
        {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'Liste',           <List size={13} />)}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Liste numérotée', <ListOrdered size={13} />)}
      </div>
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

function RichContent({ html }: { html?: string }) {
  if (!html || html === '<p></p>') return <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune description.</span>;
  return (
    <>
      <div className="ex-detail-desc" dangerouslySetInnerHTML={{ __html: html }} />
      <style>{`
        .ex-detail-desc { color:#94A3B8; font-size:0.88rem; line-height:1.6; }
        .ex-detail-desc p { margin:0 0 8px; }
        .ex-detail-desc p:last-child { margin:0; }
        .ex-detail-desc ul { margin:4px 0; padding-left:18px; list-style-type:disc; }
        .ex-detail-desc ol { margin:4px 0; padding-left:18px; list-style-type:decimal; }
        .ex-detail-desc li { display:list-item; margin:2px 0; }
        .ex-detail-desc strong { color:#F1F5F9; }
      `}</style>
    </>
  );
}

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
          <img src={shown} alt="" style={{ width: '100%', borderRadius: 8, border: '1px solid #2A2F3A', display: 'block', maxHeight: 200, objectFit: 'contain', background: '#0D0F14' }} />
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

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exercise,   setExercise]   = useState<Exercise | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showEdit,   setShowEdit]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delError,   setDelError]   = useState('');

  // Edit form state
  const [name,        setName]        = useState('');
  const [category,    setCategory]    = useState('');
  const [description, setDescription] = useState('');
  const [imageFile,   setImageFile]   = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    exercisesApi.getById(id)
      .then(ex => {
        if (!ex) { setError('Exercice introuvable.'); return; }
        setExercise(ex);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function openEdit() {
    if (!exercise) return;
    setName(exercise.name);
    setCategory(exercise.category ?? '');
    setDescription(exercise.description ?? '');
    setImageFile(null);
    setRemoveImage(false);
    setFormError('');
    setShowEdit(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!exercise || !name.trim()) return;
    setSaving(true);
    setFormError('');
    const plain = description.replace(/<[^>]+>/g, '').trim();
    try {
      let imageUrlPatch: string | undefined;
      if (imageFile) {
        imageUrlPatch = await exercisesApi.uploadImage(exercise.id, imageFile);
        if (exercise.imageUrl) exercisesApi.deleteImageByUrl(exercise.imageUrl).catch(() => {});
      } else if (removeImage) {
        imageUrlPatch = '';
        if (exercise.imageUrl) exercisesApi.deleteImageByUrl(exercise.imageUrl).catch(() => {});
      }
      const updated = await exercisesApi.update(exercise.id, {
        name:        name.trim(),
        description: plain ? description : undefined,
        imageUrl:    imageUrlPatch,
        category:    category || undefined,
      });
      setExercise(updated);
      setShowEdit(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!exercise) return;
    setDeleting(true);
    setDelError('');
    try {
      await exercisesApi.remove(exercise.id);
      navigate('/exercises');
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Erreur');
      setDeleting(false);
    }
  }

  if (loading) return (
    <div className="p-4 md:p-6" style={{ display: 'flex', justifyContent: 'center', padding: '48px 0', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !exercise) return (
    <div className="p-4 md:p-6" style={{ maxWidth: 960, margin: '0 auto' }}>
      <p style={{ color: '#EF4444', fontSize: '0.85rem' }}>{error || 'Exercice introuvable.'}</p>
    </div>
  );

  const catColor = exercise.category ? (CAT_COLORS[exercise.category] ?? '#475569') : null;

  return (
    <div className="p-4 md:p-6">
      {/* Header — pleine largeur */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button onClick={() => navigate('/exercises')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
          <ArrowLeft size={15} /> Tous les exercices
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={openEdit}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.78rem' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}>
            <Pencil size={12} /> Modifier
          </button>
          <button onClick={() => { setDelError(''); setShowDelete(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: '0.78rem' }}>
            <Trash2 size={12} /> Supprimer
          </button>
        </div>
      </div>

      {/* Contenu — container centré */}
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* Card détail */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h1 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{exercise.name}</h1>
          {catColor && (
            <span style={{ color: catColor, backgroundColor: catColor + '18', fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
              {exercise.category}
            </span>
          )}
        </div>

        <div style={{ borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Description</p>
          <RichContent html={exercise.description} />
        </div>

        {exercise.imageUrl && (
          <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16, textAlign: 'center' }}>
            <img src={exercise.imageUrl} alt={exercise.name}
              style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, border: '1px solid #2A2F3A', display: 'inline-block', objectFit: 'contain' }} />
          </div>
        )}
      </div>

      </div>{/* fin container centré */}

      {/* Modal édition */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowEdit(false); }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 500, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Modifier l'exercice</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Nom *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
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
                  key={showEdit ? exercise.id : 'closed'}
                  currentUrl={exercise.imageUrl ?? ''}
                  onSelect={(f, rm) => { setImageFile(f); setRemoveImage(rm); }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowEdit(false)}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {showDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 380, padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer cet exercice ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
              <strong style={{ color: '#F1F5F9' }}>{exercise.name}</strong> sera supprimé.
            </p>
            <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 16px' }}>
              Les blocs de séances liés conserveront leur libellé mais perdront le lien.
            </p>
            {delError && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 12 }}>{delError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowDelete(false)}
                style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
