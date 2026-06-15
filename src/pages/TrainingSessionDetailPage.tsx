import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock, Upload, File, FileText, Image, Video, Trash2, ExternalLink, Edit, X, AlertCircle, Plus, GripVertical, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { rpeApi } from '../api/rpe';
import { playersApi } from '../api/players';
import { documentsApi } from '../api/documents';
import { sessionBlocksApi } from '../api/sessionBlocks';
import { PlayerAvatar } from '../components';
import type { TrainingSession, Player, TrainingAttendance, SessionDocument, SessionBlock } from '../data/types';

function loadDelta(real: number, estimated: number): { Icon: React.ElementType; color: string } | null {
  if (estimated === 0) return null;
  const pct = (real - estimated) / estimated;
  if (pct >  0.08) return { Icon: TrendingUp,   color: '#EF4444' }; // +8% → au-dessus
  if (pct < -0.08) return { Icon: TrendingDown, color: '#3B82F6' }; // -8% → en dessous
  return { Icon: Minus, color: '#00E5A0' };                          // ±8% → dans la cible
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

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return '#00E5A0';
  if (rpe <= 5) return '#3B82F6';
  if (rpe <= 7) return '#F59E0B';
  return '#EF4444';
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

const BLANK_BLOCK = { duration: '15', category: 'Échauffement', intensity: 'moyenne' as SessionBlock['intensity'], label: '' };

function SessionBlocks({ sessionId, blocks, onBlocksChange }: {
  sessionId: string;
  blocks: SessionBlock[];
  onBlocksChange: (blocks: SessionBlock[]) => void;
}) {
  const [showForm,    setShowForm]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [blockError,  setBlockError]  = useState('');
  const [form,        setForm]        = useState(BLANK_BLOCK);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState(BLANK_BLOCK);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 9px', backgroundColor: '#1E2229',
    border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
    fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box',
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
      });
      onBlocksChange([...blocks, next]);
      setForm(BLANK_BLOCK);
      setShowForm(false);
    } catch (err: unknown) {
      setBlockError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(block: SessionBlock) {
    setEditingId(block.id);
    setEditForm({ duration: String(block.duration), category: block.category, intensity: block.intensity, label: block.label });
  }

  async function handleEditSave(block: SessionBlock) {
    setSaving(true);
    setBlockError('');
    try {
      const updated = await sessionBlocksApi.update(block.id, {
        duration:  parseInt(editForm.duration),
        category:  editForm.category,
        intensity: editForm.intensity,
        label:     editForm.label.trim(),
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
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Contenu de la séance
          </span>
          {blocks.length > 0 && (
            <span style={{ color: '#475569', fontSize: '0.72rem' }}>
              {totalDuration} min · {blocks.length} bloc{blocks.length > 1 ? 's' : ''} · <span style={{ color: '#F59E0B' }}>{totalLoadUa} UA</span>
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setBlockError(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', fontSize: '0.76rem', padding: '5px 10px', cursor: 'pointer' }}
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {blockError && (
        <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 10 }}>{blockError}</div>
      )}

      {/* Liste des blocs */}
      {blocks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: showForm ? 12 : 0 }}>
          {blocks.map((block, i) => {
            const intCfg = INTENSITY_CFG[block.intensity] ?? INTENSITY_CFG['moyenne'];
            const isEditing = editingId === block.id;

            return (
              <div key={block.id}
                style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: isEditing ? 10 : 0 }}>
                {isEditing ? (
                  /* Édition inline */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Durée (min)</label>
                        <input type="number" min={1} max={180} value={editForm.duration}
                          onChange={e => setEditForm(f => ({ ...f, duration: e.target.value }))}
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Catégorie</label>
                        <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                          {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Intensité</label>
                        <select value={editForm.intensity} onChange={e => setEditForm(f => ({ ...f, intensity: e.target.value as SessionBlock['intensity'] }))} style={inputStyle}>
                          {Object.entries(INTENSITY_CFG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Exercice</label>
                      <input type="text" placeholder="Nom de l'exercice…" value={editForm.label}
                        onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setEditingId(null)}
                        style={{ flex: 1, padding: '7px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.78rem' }}>
                        Annuler
                      </button>
                      <button disabled={saving} onClick={() => handleEditSave(block)}
                        style={{ flex: 1, padding: '7px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>
                        {saving ? '…' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Affichage */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ color: '#2A2F3A', flexShrink: 0 }}>
                      <GripVertical size={14} />
                    </div>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700 }}>{i + 1}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600 }}>{block.duration} min</span>
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>·</div>
                    <span style={{ color: '#94A3B8', fontSize: '0.78rem', flexShrink: 0 }}>{block.category}</span>
                    <div style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>·</div>
                    <span style={{ color: intCfg.color, backgroundColor: intCfg.bg, fontSize: '0.68rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                      {intCfg.label}
                    </span>
                    <span style={{ color: '#F59E0B', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>{block.loadUa} UA</span>
                    <span style={{ color: '#F1F5F9', fontSize: '0.82rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{block.label}</span>
                    <button onClick={() => openEdit(block)}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                      <Edit size={12} />
                    </button>
                    <button onClick={() => handleDelete(block.id)}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                      <Trash2 size={12} />
                    </button>
                  </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Durée (min) *</label>
              <input type="number" required min={1} max={180} value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Catégorie *</label>
              <select required value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {BLOCK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Intensité *</label>
              <select required value={form.intensity} onChange={e => setForm(f => ({ ...f, intensity: e.target.value as SessionBlock['intensity'] }))} style={inputStyle}>
                {Object.entries(INTENSITY_CFG).map(([val, cfg]) => <option key={val} value={val}>{cfg.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ color: '#475569', fontSize: '0.7rem', display: 'block', marginBottom: 3 }}>Exercice *</label>
            <input type="text" required placeholder="Nom de l'exercice…" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button type="button" onClick={() => { setShowForm(false); setForm(BLANK_BLOCK); }}
              style={{ flex: 1, padding: '8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.82rem' }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, padding: '8px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
              {saving ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}

      {blocks.length === 0 && !showForm && (
        <div style={{ border: '1px dashed #2A2F3A', borderRadius: 8, padding: '16px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer' }}
          onClick={() => setShowForm(true)}>
          Aucun bloc — cliquer pour ajouter le contenu de la séance
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
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Documents
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: uploading ? '#475569' : '#94A3B8', fontSize: '0.76rem', padding: '5px 10px', cursor: uploading ? 'default' : 'pointer' }}
        >
          <Upload size={12} />
          {uploading ? 'Upload…' : 'Ajouter'}
        </button>
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
          style={{ border: `1px dashed ${dragOver ? '#00E5A0' : '#2A2F3A'}`, borderRadius: 8, padding: '20px 16px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
        >
          Glisser-déposer ou cliquer pour ajouter un fichier
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
              + Ajouter un fichier
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
      <button onClick={() => navigate('/sessions')}
        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Toutes les séances
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h1 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1.25rem' }}>{fmtDateFull(session.date)}</h1>
          <button onClick={openEdit} style={{ padding: '6px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Edit size={13} /> Modifier
          </button>
        </div>
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
        {session.notes && (
          <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '8px 0 0', fontStyle: 'italic' }}>{session.notes}</p>
        )}
      </div>

      {/* KPI chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { value: presentCount, label: 'Présents',   color: '#00E5A0', show: true },
          { value: absentCount,  label: 'Absents',    color: '#EF4444', show: absentCount > 0 },
          { value: lateCount,    label: 'Retards',    color: '#F59E0B', show: lateCount > 0 },
        ].filter(k => k.show).map(k => (
          <div key={k.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 72 }}>
            <div style={{ color: k.color, fontSize: '1.15rem', fontWeight: 700 }}>{k.value}</div>
            <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>{k.label}</div>
          </div>
        ))}
        {(estimatedRpe !== null || avgRpe !== null) && (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {estimatedRpe !== null && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#F59E0B', fontSize: '1.15rem', fontWeight: 700 }}>{estimatedRpe.toFixed(1)}</div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>RPE estimé</div>
              </div>
            )}
            {estimatedRpe !== null && (
              <div style={{ width: 1, height: 28, backgroundColor: '#2A2F3A', flexShrink: 0 }} />
            )}
            {avgRpe !== null ? (() => {
              const d = estimatedRpe !== null ? loadDelta(avgRpe, estimatedRpe) : null;
              return (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{avgRpe.toFixed(1)}</span>
                    {d && <d.Icon size={13} style={{ color: d.color }} />}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Moy. joueurs</div>
                </div>
              );
            })() : (
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
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#F59E0B', fontSize: '1.15rem', fontWeight: 700 }}>{blockLoadUa}</div>
                <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Charge est.</div>
              </div>
            )}
            {blockLoadUa > 0 && (
              <div style={{ width: 1, height: 28, backgroundColor: '#2A2F3A', flexShrink: 0 }} />
            )}
            {avgLoadPerPlayer !== null ? (() => {
              const d = blockLoadUa > 0 ? loadDelta(avgLoadPerPlayer, blockLoadUa) : null;
              return (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{Math.round(avgLoadPerPlayer)}</span>
                    {d && <d.Icon size={13} style={{ color: d.color }} />}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Moy. joueurs</div>
                </div>
              );
            })() : (
              blockLoadUa > 0 && (
                <span style={{ color: '#2A2F3A', fontSize: '0.72rem' }}>—</span>
              )
            )}
          </div>
        )}
      </div>

      <SessionBlocks sessionId={session.id} blocks={blocks} onBlocksChange={setBlocks} />

      {/* Player table */}
      {relevantPlayers.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune donnée enregistrée pour cette séance.</p>
      ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                {[
                  { label: 'Joueur',      hide: false },
                  { label: 'Présence',    hide: false },
                  { label: 'RPE',         hide: false },
                  { label: 'Durée eff.',  hide: true  },
                  { label: 'Charge',      hide: true  },
                ].map(({ label, hide }, i) => (
                  <th key={label} className={hide ? 'hidden md:table-cell' : ''} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'center', color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relevantPlayers.map((player, i) => {
                const attStatus = attMap[player.id] as TrainingAttendance['status'] | undefined;
                const rpe       = rpeMap[player.id];
                const dur       = rpe?.actualDuration ?? session.plannedDuration;
                const load      = rpe ? rpe.rpe * dur : null;
                const statusCfg = attStatus ? STATUS_CFG[attStatus] : null;

                return (
                  <tr key={player.id} onClick={() => navigate(`/players/${player.id}`)} style={{ borderBottom: i < relevantPlayers.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="hidden md:block"><PlayerAvatar player={player} size={28} /></div>
                        <div>
                          <div style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>
                            {player.lastName} {player.firstName[0]}.
                          </div>
                          <div style={{ color: '#475569', fontSize: '0.7rem' }}>#{player.number} · {player.position}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {statusCfg
                        ? <span style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}>{statusCfg.label}</span>
                        : <span style={{ color: '#2A2F3A', fontSize: '0.72rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {rpe
                        ? <span style={{ color: rpeColor(rpe.rpe), fontSize: '0.92rem', fontWeight: 700 }}>{rpe.rpe}</span>
                        : <span style={{ color: '#2A2F3A' }}>—</span>}
                    </td>
                    <td className="hidden md:table-cell" style={{ padding: '10px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                      {rpe ? `${dur} min` : '—'}
                    </td>
                    <td className="hidden md:table-cell" style={{ padding: '10px 16px', textAlign: 'center', color: load ? '#F1F5F9' : '#2A2F3A', fontSize: '0.82rem', fontWeight: load ? 600 : 400 }}>
                      {load !== null ? load : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SessionDocuments sessionId={session.id} />

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
    </div>
  );
}
