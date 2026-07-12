import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, X, AlertCircle, BookOpen, Bold, Italic, List, ListOrdered, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { exercisesApi } from '../api/exercises';
import { sanitizeHtml } from '../utils/sanitize';
import { exerciseCategoriesApi } from '../api/exerciseCategories';
import { notifyOrg } from '../api/notifications';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { ExerciseImagePicker, ExerciseDocumentPicker, type ExerciseImagePickerItem, Modal, Badge } from '../components';
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from '../utils/socialVideo';
import type { Exercise, ExerciseImage, ExerciseCategory } from '../data/types';

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
          'flex:1',
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
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 6, backgroundColor: '#1E2229', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid #2A2F3A', flexWrap: 'wrap', flexShrink: 0 }}>
        {btn(editor.isActive('bold'),        () => editor.chain().focus().toggleBold().run(),        'Gras',          <Bold size={13} />)}
        {btn(editor.isActive('italic'),      () => editor.chain().focus().toggleItalic().run(),      'Italique',      <Italic size={13} />)}
        {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'Liste',         <List size={13} />)}
        {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'Liste numérotée', <ListOrdered size={13} />)}
      </div>
      {/* Editor area */}
      <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
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
      <div className="exercise-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
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
function CategoryBadge({ name, color }: { name?: string; color?: string }) {
  if (!name) return null;
  const c = color ?? '#475569';
  return (
    <Badge color={c} bg={c + '18'} label={name} size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
  );
}

/* ── En-tête de section (modale) ──────────────────────────────────────────── */
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

/* ── Modal form (avec éditeur) ───────────────────────────────────────────── */
function ExerciseModal({
  editing, onClose, onSaved, teamId, categories,
}: {
  editing: Exercise | null;
  onClose: () => void;
  onSaved: (ex: Exercise, isNew: boolean) => void;
  teamId?: string;
  categories: ExerciseCategory[];
}) {
  const [name,        setName]        = useState(editing?.name ?? '');
  const [categoryId,  setCategoryId]  = useState(editing?.categoryId ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [consignes,   setConsignes]   = useState(editing?.consignes ?? '');
  const [videoUrl,    setVideoUrl]    = useState(editing?.videoUrl ?? '');
  const [saving,      setSaving]      = useState(false);
  const [formError,   setFormError]   = useState('');

  // Images : persistées immédiatement en édition, en attente jusqu'à la création
  const [images,        setImages]        = useState<ExerciseImage[]>([]);
  const [pendingImages, setPendingImages]  = useState<{ file: File; previewUrl: string }[]>([]);
  const [imageBusy,     setImageBusy]     = useState(false);

  // Document PDF : même logique que les images
  const [documentUrl,  setDocumentUrl]  = useState(editing?.documentUrl ?? '');
  const [documentName, setDocumentName] = useState(editing?.documentName ?? '');
  const [pendingDocumentFile, setPendingDocumentFile] = useState<File | null>(null);
  const [docBusy, setDocBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    exercisesApi.listImages(editing.id).then(setImages).catch(() => {});
  }, [editing?.id]);

  const videoPlatform = videoUrl.trim() ? detectSocialPlatform(videoUrl) : null;
  const videoInvalid = videoUrl.trim() !== '' && !videoPlatform;

  const imageItems: ExerciseImagePickerItem[] = editing
    ? images.map(img => ({ key: img.id, url: img.url }))
    : pendingImages.map((p, i) => ({ key: String(i), url: p.previewUrl }));

  async function handleAddImages(files: File[]) {
    if (!editing) {
      setPendingImages(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))]);
      return;
    }
    setImageBusy(true);
    setFormError('');
    try {
      for (const file of files) {
        const url = await exercisesApi.uploadImage(editing.id, file);
        const img = await exercisesApi.addImage(editing.id, url, images.length);
        setImages(prev => [...prev, img]);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur upload image');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage(key: string) {
    if (!editing) {
      setPendingImages(prev => prev.filter((_, i) => String(i) !== key));
      return;
    }
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
    if (!editing) {
      setPendingDocumentFile(file);
      setDocumentName(file.name);
      return;
    }
    setDocBusy(true);
    setFormError('');
    try {
      const { url, name: docName } = await exercisesApi.uploadDocument(editing.id, file);
      if (documentUrl) exercisesApi.deleteDocumentByUrl(documentUrl).catch(() => {});
      const updated = await exercisesApi.update(editing.id, { documentUrl: url, documentName: docName });
      setDocumentUrl(updated.documentUrl ?? '');
      setDocumentName(updated.documentName ?? '');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur upload document');
    } finally {
      setDocBusy(false);
    }
  }

  async function handleDocumentRemove() {
    if (!editing) {
      setPendingDocumentFile(null);
      setDocumentName('');
      return;
    }
    setDocBusy(true);
    setFormError('');
    try {
      if (documentUrl) await exercisesApi.deleteDocumentByUrl(documentUrl);
      await exercisesApi.update(editing.id, { documentUrl: '', documentName: '' });
      setDocumentUrl('');
      setDocumentName('');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur suppression document');
    } finally {
      setDocBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || videoInvalid) return;
    setSaving(true);
    setFormError('');
    const plain = description.replace(/<[^>]+>/g, '').trim();
    const plainConsignes = consignes.replace(/<[^>]+>/g, '').trim();
    try {
      if (editing) {
        const updated = await exercisesApi.update(editing.id, {
          name: name.trim(), description: plain ? description : undefined,
          consignes: plainConsignes ? consignes : undefined,
          categoryId: categoryId || undefined, videoUrl: videoUrl.trim(),
        });
        onSaved(updated, false);
      } else {
        const created = await exercisesApi.create({
          name: name.trim(), description: plain ? description : undefined,
          consignes: plainConsignes ? consignes : undefined,
          categoryId: categoryId || undefined, teamId, videoUrl: videoUrl.trim() || undefined,
        });
        for (let i = 0; i < pendingImages.length; i++) {
          const url = await exercisesApi.uploadImage(created.id, pendingImages[i].file);
          await exercisesApi.addImage(created.id, url, i);
        }
        if (pendingDocumentFile) {
          const { url, name: docName } = await exercisesApi.uploadDocument(created.id, pendingDocumentFile);
          const withDoc = await exercisesApi.update(created.id, { documentUrl: url, documentName: docName });
          onSaved(withDoc, true);
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
    <Modal maxWidth={640} scrollOverlay={false} style={{ padding: '24px' }} onClose={onClose} closeOnBackdropClick>
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Informations générales */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="exercise-form-row">
              <div style={{ flex: 2 }}>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Nom *</label>
                <input required type="text" placeholder="Nom de l'exercice…" value={name}
                  onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Catégorie</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
                  <option value="">— Aucune —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Déroulement</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RichEditor value={description} onChange={setDescription} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Objectifs</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RichEditor value={consignes} onChange={setConsignes} />
                </div>
              </div>
            </div>
          </div>

          {/* Médias */}
          <div style={{ borderTop: '1px solid #2A2F3A', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel icon={<ImageIcon size={13} color="#00E5A0" />}>Médias</SectionLabel>

            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Images</label>
              <ExerciseImagePicker items={imageItems} onAdd={handleAddImages} onRemove={handleRemoveImage} disabled={imageBusy} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 }}>Document PDF</label>
                <ExerciseDocumentPicker
                  fileName={documentName || undefined}
                  fileUrl={documentUrl || undefined}
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
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
              Annuler
            </button>
            <button type="submit" disabled={saving || videoInvalid}
              style={{ flex: 1, padding: '10px', backgroundColor: (saving || videoInvalid) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (saving || videoInvalid) ? '#475569' : '#0D0F14', cursor: (saving || videoInvalid) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>

        <style>{`
          .exercise-form-row { display: flex; gap: 12px; }
          @media (max-width: 520px) {
            .exercise-form-row { flex-direction: column; }
          }
        `}</style>
    </Modal>
  );
}

/* ── Page principale ─────────────────────────────────────────────────────── */
export default function ExercisesPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();
  const [exercises,      setExercises]      = useState<Exercise[]>([]);
  const [categories,     setCategories]     = useState<ExerciseCategory[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal,      setShowModal]      = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setExercises([]);
    exercisesApi.list({ teamId: selected.team.id })
      .then(setExercises)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  useEffect(() => {
    if (!selected) return;
    exerciseCategoriesApi.list(selected.team.id).then(setCategories).catch(() => {});
  }, [selected?.team.id]);

  function handleSaved(ex: Exercise, isNew: boolean) {
    setExercises(prev =>
      (isNew ? [...prev, ex] : prev.map(e => e.id === ex.id ? ex : e))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    notifyOrg(isNew ? 'exercise_added' : 'exercise_updated', ex.name, ex.categoryName ?? undefined, 'exercise', ex.id);
  }

  const filtered = exercises.filter(ex =>
    (categoryFilter === '' || ex.categoryId === categoryFilter) &&
    (
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      (ex.categoryName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (ex.description ?? '').replace(/<[^>]+>/g, '').toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Exercices</h1>
        </div>
        <button onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 7, color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
          <Plus size={15} /><span className="hidden sm:inline">Ajouter</span>
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row" style={{ gap: 10, marginBottom: 20, width: '100%' }}>
        <div className="w-full sm:flex-[2_1_240px]" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input type="text" placeholder="Rechercher…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, width: '100%' }} />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="w-full sm:flex-[1_1_180px]" style={inputStyle}>
          <option value="">Toutes les catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 360 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th className="px-3 sm:px-5 w-[58%] sm:w-[280px]" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</th>
                <th className="px-3 sm:px-5 w-[38%] sm:w-[140px]" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</th>
                <th className="hidden lg:table-cell" style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Déroulement</th>
                <th className="hidden sm:table-cell sm:w-[110px] sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Médias</th>
                <th className="pr-2 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, width: 24 }}></th>
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
                    <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'left', overflow: 'hidden' }}>
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{ex.name}</span>
                    </td>
                    <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'left', overflow: 'hidden' }}>
                      <CategoryBadge name={ex.categoryName} color={ex.categoryColor} />
                    </td>
                    <td className="hidden lg:table-cell" style={{ padding: '12px 20px', textAlign: 'left' }}>
                      <span style={{ color: '#475569', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {desc || '—'}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span title="Images" style={{ display: 'flex' }}>
                          <ImageIcon size={14} color={(ex.imageCount ?? 0) > 0 ? '#00E5A0' : '#2A2F3A'} />
                        </span>
                        <span title="Document PDF" style={{ display: 'flex' }}>
                          <FileText size={14} color={ex.documentUrl ? '#00E5A0' : '#2A2F3A'} />
                        </span>
                        <span title="Lien vidéo" style={{ display: 'flex' }}>
                          <Video size={14} color={ex.videoUrl ? '#00E5A0' : '#2A2F3A'} />
                        </span>
                      </div>
                    </td>
                    <td className="pr-2 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M5 3l4 4-4 4" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
          categories={categories}
        />
      )}
    </div>
  );
}
