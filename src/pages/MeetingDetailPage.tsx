import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Edit, Trash2, Save, X, Check, AlertCircle, Calendar, Clock } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { supabase } from '../api/client';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from '../components/RichTextEditor';
import type { StaffMeeting } from '../data/types';

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};


export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [meeting,  setMeeting]  = useState<StaffMeeting | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState('');

  const [editing,     setEditing]     = useState(false);
  const [savingMeta,  setSavingMeta]  = useState(false);
  const [metaError,   setMetaError]   = useState('');
  const [metaForm,    setMetaForm]    = useState({ title: '', date: '', time: '' });

  const [notesEdit,  setNotesEdit]  = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving,setNotesSaving]= useState(false);
  const [notesError, setNotesError] = useState('');

  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('staff_meetings').select('*').eq('id', id).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setFetchErr(error?.message ?? 'Réunion introuvable.'); setLoading(false); return; }
        const m: StaffMeeting = {
          id:        data.id,
          teamId:    data.team_id,
          title:     data.title,
          date:      data.date,
          time:      data.time,
          notes:     data.notes ?? undefined,
          createdAt: data.created_at,
        };
        setMeeting(m);
        setNotesDraft(m.notes ?? '');
        setLoading(false);
      });
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (fetchErr || !meeting) return (
    <div className="p-4 md:p-6">
      <button onClick={() => navigate('/meetings')} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Retour aux réunions
      </button>
      <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>{fetchErr || 'Réunion introuvable.'}</div>
    </div>
  );

  const TODAY = new Date().toISOString().slice(0, 10);
  const isUpcoming = meeting.date >= TODAY;
  const accent = meeting.date === TODAY ? '#F59E0B' : isUpcoming ? '#00E5A0' : '#475569';

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setMetaError('');
    try {
      const updated = await meetingsApi.update(meeting!.id, { title: metaForm.title, date: metaForm.date, time: metaForm.time });
      setMeeting(updated);
      setEditing(false);
    } catch (err: unknown) {
      setMetaError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSavingMeta(false);
    }
  }

  async function saveNotes() {
    setNotesSaving(true);
    setNotesError('');
    try {
      const updated = await meetingsApi.update(meeting!.id, { notes: notesDraft || null });
      setMeeting(updated);
      setNotesEdit(false);
    } catch (err: unknown) {
      setNotesError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setNotesSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      const title = meeting!.title;
      const id    = meeting!.id;
      await meetingsApi.delete(id);
      notifyOrg('meeting_deleted', `Réunion supprimée : ${title}`, undefined, 'meeting', id);
      navigate('/meetings');
    } catch {
      setDeleting(false);
      setConfirmDel(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <button onClick={() => navigate('/meetings')}
        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, padding: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
        onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
        <ArrowLeft size={14} /> Réunions
      </button>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Header info */}
      {!editing ? (
        <div style={{ backgroundColor: '#161920', border: `1px solid ${meeting.date === TODAY ? 'rgba(245,158,11,0.3)' : '#2A2F3A'}`, borderLeft: `4px solid ${accent}`, borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>{meeting.title}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.85rem' }}>
                  <Calendar size={14} /> {fmtDateFull(meeting.date)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.85rem' }}>
                  <Clock size={14} /> {meeting.time.slice(0, 5)}
                </span>
                {meeting.date === TODAY && (
                  <span style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8, letterSpacing: '0.05em' }}>Aujourd'hui</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button onClick={() => { setMetaForm({ title: meeting.title, date: meeting.date, time: meeting.time }); setMetaError(''); setEditing(true); }}
                style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Edit size={13} /> Modifier
              </button>
              <button onClick={() => setConfirmDel(true)}
                style={{ padding: '7px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem' }}>Modifier les informations</h2>
            <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          {metaError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{metaError}</span>
            </div>
          )}
          <form onSubmit={saveMeta} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Titre *</label>
              <input required value={metaForm.title} onChange={e => setMetaForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                <input type="date" required value={metaForm.date} onChange={e => setMetaForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Heure *</label>
                <input type="time" required value={metaForm.time} onChange={e => setMetaForm(f => ({ ...f, time: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, padding: '9px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
              <button type="submit" disabled={savingMeta} style={{ flex: 1, padding: '9px', backgroundColor: savingMeta ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: savingMeta ? '#475569' : '#0D0F14', cursor: savingMeta ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {savingMeta ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Notes / Compte rendu */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem' }}>Compte rendu / Notes</h2>
          {!notesEdit ? (
            <button onClick={() => { setNotesDraft(meeting.notes ?? ''); setNotesError(''); setNotesEdit(true); }}
              style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Edit size={12} /> Éditer
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setNotesEdit(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}><X size={12} /> Annuler</button>
              <button onClick={saveNotes} disabled={notesSaving}
                style={{ background: 'none', border: '1px solid rgba(0,229,160,0.4)', borderRadius: 6, color: '#00E5A0', cursor: notesSaving ? 'not-allowed' : 'pointer', fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                {notesSaving ? <><Save size={12} /> Enregistrement…</> : <><Check size={12} /> Enregistrer</>}
              </button>
            </div>
          )}
        </div>

        {notesEdit ? (
          <div style={{ padding: '16px 20px' }}>
            {notesError && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 8 }}>{notesError}</div>}
            <RichTextEditor
              value={notesDraft}
              onChange={setNotesDraft}
              placeholder="Ordre du jour, décisions, points importants…"
              minHeight={280}
            />
          </div>
        ) : meeting.notes ? (
          <div
            className="rich-display"
            style={{ padding: '16px 20px', color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: meeting.notes }}
          />
        ) : (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p style={{ color: '#334155', fontSize: '0.85rem', margin: 0 }}>Aucun compte rendu. Cliquez sur "Éditer" pour en rédiger un.</p>
          </div>
        )}
      </div>

      </div>{/* fin container centré */}

      {/* Confirm delete modal */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '24px', width: '100%', maxWidth: 380 }}>
            <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1.05rem' }}>Supprimer la réunion ?</h2>
            <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '0 0 24px' }}>"{meeting.title}" sera définitivement supprimée.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
              <button onClick={confirmDelete} disabled={deleting} className="btn-danger" style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
