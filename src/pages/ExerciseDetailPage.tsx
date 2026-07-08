import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2, AlertCircle, Bold, Italic, List, ListOrdered, X, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { exercisesApi } from '../api/exercises';
import { exerciseCategoriesApi } from '../api/exerciseCategories';
import { ExerciseImageGallery, ExerciseImagePicker, ExerciseDocumentPicker, SocialVideoEmbed, type ExerciseImagePickerItem } from '../components';
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from '../utils/socialVideo';
import type { Exercise, ExerciseImage, ExerciseCategory } from '../data/types';

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

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {icon}
      <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {children}
      </span>
    </div>
  );
}

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exercise,   setExercise]   = useState<Exercise | null>(null);
  const [images,     setImages]     = useState<ExerciseImage[]>([]);
  const [categories, setCategories] = useState<ExerciseCategory[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showEdit,   setShowEdit]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delError,   setDelError]   = useState('');

  // Edit form state
  const [name,        setName]        = useState('');
  const [categoryId,  setCategoryId]  = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl,    setVideoUrl]    = useState('');
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');
  const [imageBusy,   setImageBusy]   = useState(false);
  const [docBusy,     setDocBusy]     = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([exercisesApi.getById(id), exercisesApi.listImages(id)])
      .then(([ex, imgs]) => {
        if (!ex) { setError('Exercice introuvable.'); return; }
        setExercise(ex);
        setImages(imgs);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!exercise?.teamId) return;
    exerciseCategoriesApi.list(exercise.teamId).then(setCategories).catch(() => {});
  }, [exercise?.teamId]);

  const videoPlatform = videoUrl.trim() ? detectSocialPlatform(videoUrl) : null;
  const videoInvalid = videoUrl.trim() !== '' && !videoPlatform;

  function openEdit() {
    if (!exercise) return;
    setName(exercise.name);
    setCategoryId(exercise.categoryId ?? '');
    setDescription(exercise.description ?? '');
    setVideoUrl(exercise.videoUrl ?? '');
    setFormError('');
    setShowEdit(true);
  }

  async function handleAddImages(files: File[]) {
    if (!exercise) return;
    setImageBusy(true);
    setFormError('');
    try {
      for (const file of files) {
        const url = await exercisesApi.uploadImage(exercise.id, file);
        const img = await exercisesApi.addImage(exercise.id, url, images.length);
        setImages(prev => [...prev, img]);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur upload image');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage(key: string) {
    const img = images.find(i => i.id === key);
    if (!img) return;
    setImageBusy(true);
    setFormError('');
    try {
      await exercisesApi.removeImage(img);
      setImages(prev => prev.filter(i => i.id !== key));
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur suppression image');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleDocumentSelect(file: File) {
    if (!exercise) return;
    setDocBusy(true);
    setFormError('');
    try {
      const { url, name: docName } = await exercisesApi.uploadDocument(exercise.id, file);
      if (exercise.documentUrl) exercisesApi.deleteDocumentByUrl(exercise.documentUrl).catch(() => {});
      const updated = await exercisesApi.update(exercise.id, { documentUrl: url, documentName: docName });
      setExercise(updated);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur upload document');
    } finally {
      setDocBusy(false);
    }
  }

  async function handleDocumentRemove() {
    if (!exercise) return;
    setDocBusy(true);
    setFormError('');
    try {
      if (exercise.documentUrl) await exercisesApi.deleteDocumentByUrl(exercise.documentUrl);
      const updated = await exercisesApi.update(exercise.id, { documentUrl: '', documentName: '' });
      setExercise(updated);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur suppression document');
    } finally {
      setDocBusy(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!exercise || !name.trim() || videoInvalid) return;
    setSaving(true);
    setFormError('');
    const plain = description.replace(/<[^>]+>/g, '').trim();
    try {
      const updated = await exercisesApi.update(exercise.id, {
        name:        name.trim(),
        description: plain ? description : undefined,
        categoryId:  categoryId || undefined,
        videoUrl:    videoUrl.trim(),
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
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>{exercise.name}</h1>
          {exercise.categoryName && (
            <span style={{ color: exercise.categoryColor, backgroundColor: exercise.categoryColor + '18', fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', borderRadius: 4, flexShrink: 0 }}>
              {exercise.categoryName}
            </span>
          )}
        </div>

        <div style={{ borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Description</p>
          <RichContent html={exercise.description} />
        </div>

        {images.length > 0 && (
          <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
            <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Images</p>
            <ExerciseImageGallery images={images} alt={exercise.name} />
          </div>
        )}

        {exercise.documentUrl && (
          <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
            <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Document</p>
            <a href={exercise.documentUrl} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#F1F5F9', fontSize: '0.85rem', textDecoration: 'none' }}>
              <FileText size={15} color="#00E5A0" />
              {exercise.documentName || 'Document PDF'}
              <ExternalLink size={13} color="#475569" />
            </a>
          </div>
        )}

        {exercise.videoUrl && detectSocialPlatform(exercise.videoUrl) && (
          <div style={{ marginTop: 20, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
            <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Vidéo</p>
            <SocialVideoEmbed url={exercise.videoUrl} />
          </div>
        )}
      </div>

      </div>{/* fin container centré */}

      {/* Modal édition */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowEdit(false); }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 640, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
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
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* Informations générales */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="exercise-form-row">
                  <div style={{ flex: 2 }}>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Nom *</label>
                    <input required type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Catégorie</label>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
                      <option value="">— Aucune —</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Description</label>
                  <RichEditor value={description} onChange={setDescription} />
                </div>
              </div>

              {/* Médias */}
              <div style={{ borderTop: '1px solid #2A2F3A', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionLabel icon={<ImageIcon size={13} color="#00E5A0" />}>Médias</SectionLabel>

                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Images</label>
                  <ExerciseImagePicker
                    items={images.map((img): ExerciseImagePickerItem => ({ key: img.id, url: img.url }))}
                    onAdd={handleAddImages}
                    onRemove={handleRemoveImage}
                    disabled={imageBusy}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Document PDF</label>
                    <ExerciseDocumentPicker
                      fileName={exercise.documentName || undefined}
                      fileUrl={exercise.documentUrl || undefined}
                      onSelect={handleDocumentSelect}
                      onRemove={handleDocumentRemove}
                      disabled={docBusy}
                    />
                  </div>

                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Lien vidéo</label>
                    <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 5 }}>Twitter/X, Facebook, Instagram, TikTok</div>
                    <input type="url" placeholder="https://…" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={inputStyle} />
                    {videoUrl.trim() && (
                      videoPlatform
                        ? <div style={{ color: '#00E5A0', fontSize: '0.72rem', marginTop: 5 }}>Aperçu {SOCIAL_PLATFORM_LABELS[videoPlatform]} détecté</div>
                        : <div style={{ color: '#EF4444', fontSize: '0.72rem', marginTop: 5 }}>Lien non reconnu</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowEdit(false)}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving || videoInvalid}
                  style={{ flex: 1, padding: '10px', backgroundColor: (saving || videoInvalid) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (saving || videoInvalid) ? '#475569' : '#0D0F14', cursor: (saving || videoInvalid) ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>

            <style>{`
              .exercise-form-row { display: flex; gap: 12px; }
              @media (max-width: 520px) {
                .exercise-form-row { flex-direction: column; }
              }
            `}</style>
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
              <button onClick={handleDelete} disabled={deleting} className="btn-danger"
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
