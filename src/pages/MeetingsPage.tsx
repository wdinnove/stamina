import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, X, AlertCircle, Calendar, Clock, ChevronRight } from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from '../components/RichTextEditor';
import type { StaffMeeting } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const TODAY = new Date().toISOString().slice(0, 10);

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const DAYS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
function fmtMeetDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return { day: d.getDate(), month: MONTHS_FR[d.getMonth()], dow: DAYS_FR[d.getDay()] };
}

const emptyMeeting = { title: '', date: TODAY, time: '10:00', notes: '' };

export default function MeetingsPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();

  const [meetings,      setMeetings]      = useState<StaffMeeting[]>([]);
  const [meetingsError, setMeetingsError] = useState('');
  const [showMeetForm,  setShowMeetForm]  = useState(false);
  const [meetForm,      setMeetForm]      = useState(emptyMeeting);
  const [meetSaving,    setMeetSaving]    = useState(false);
  const [meetFormError, setMeetFormError] = useState('');

  useEffect(() => {
    if (!selected) return;
    setMeetings([]);
    setMeetingsError('');
    meetingsApi.listByTeam(selected.team.id)
      .then(setMeetings)
      .catch(err => setMeetingsError(err?.message ?? String(err)));
  }, [selected?.team.id]);

  async function handleMeetingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!meetForm.title || !meetForm.date || !meetForm.time) {
      setMeetFormError('Titre, date et heure sont obligatoires.');
      return;
    }
    setMeetSaving(true);
    setMeetFormError('');
    try {
      const created = await meetingsApi.create({
        teamId: selected.team.id,
        title:  meetForm.title,
        date:   meetForm.date,
        time:   meetForm.time,
        notes:  meetForm.notes || undefined,
      });
      setMeetings(prev => [created, ...prev].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)));
      setShowMeetForm(false);
      setMeetForm(emptyMeeting);
      notifyOrg('meeting_added', meetForm.title, `${meetForm.date} à ${meetForm.time}`, 'meeting', created.id);
    } catch (err: unknown) {
      setMeetFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setMeetSaving(false);
    }
  }

  const upcomingMeetings = meetings.filter(m => m.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pastMeetings     = meetings.filter(m => m.date < TODAY).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Réunions</h1>
        {selected && (
          <button
            onClick={() => setShowMeetForm(true)}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /><span className="hidden md:inline">Planifier</span>
          </button>
        )}
      </div>

      {!selected && (
        <p style={{ color: '#475569', textAlign: 'center', padding: '48px 0' }}>Sélectionnez une équipe pour voir le planning.</p>
      )}

      {selected && meetingsError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{meetingsError}</span>
        </div>
      )}

      {selected && (
        meetings.length === 0 ? (
          <div style={{ backgroundColor: '#161920', border: '1px dashed #2A2F3A', borderRadius: 8, padding: '28px', textAlign: 'center' }}>
            <Calendar size={22} style={{ color: '#2A2F3A', display: 'block', margin: '0 auto 8px' }} />
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune réunion planifiée.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...upcomingMeetings, ...pastMeetings].map(m => {
              const fd = fmtMeetDate(m.date);
              const isUpcoming = m.date >= TODAY;
              const isToday = m.date === TODAY;
              const accent = isToday ? '#F59E0B' : isUpcoming ? '#00E5A0' : '#475569';
              return (
                <div key={m.id}
                  onClick={() => navigate(`/meetings/${m.id}`)}
                  style={{
                    backgroundColor: '#161920',
                    border: `1px solid ${isToday ? 'rgba(245,158,11,0.25)' : isUpcoming ? '#252B36' : '#1A1F28'}`,
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderRightColor = '#3B3F4A')}
                  onMouseLeave={e => (e.currentTarget.style.borderRightColor = isToday ? 'rgba(245,158,11,0.25)' : isUpcoming ? '#252B36' : '#1A1F28')}
                >
                  <div style={{ width: 76, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 0', borderRight: '1px solid #1E2229', gap: 3 }}>
                    <span style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{fd.dow}</span>
                    <span style={{ color: accent, fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{fd.day}</span>
                    <span style={{ color: isUpcoming ? '#94A3B8' : '#475569', fontSize: '0.72rem', fontWeight: 600 }}>{fd.month}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                        {isToday && <span style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Aujourd'hui</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontSize: '0.75rem' }}>
                          <Clock size={11} /> {m.time.slice(0, 5)}
                        </span>
                        {m.notes && <span style={{ color: '#334155', fontSize: '0.72rem' }}>· Compte rendu disponible</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} color="#2A2F3A" style={{ flexShrink: 0 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modal planifier une réunion */}
      {showMeetForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Planifier une réunion</h2>
              <button onClick={() => { setShowMeetForm(false); setMeetFormError(''); setMeetForm(emptyMeeting); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {meetFormError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{meetFormError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleMeetingSubmit}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Titre *</label>
                <input type="text" required autoFocus placeholder="Ex : Réunion hebdo staff" value={meetForm.title} onChange={e => setMeetForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                  <input type="date" required value={meetForm.date} onChange={e => setMeetForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Heure *</label>
                  <input type="time" required value={meetForm.time} onChange={e => setMeetForm(f => ({ ...f, time: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Compte rendu / Notes</label>
                <RichTextEditor value={meetForm.notes} onChange={html => setMeetForm(f => ({ ...f, notes: html }))} placeholder="Ordre du jour, décisions, notes…" minHeight={88} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => { setShowMeetForm(false); setMeetFormError(''); setMeetForm(emptyMeeting); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={meetSaving} style={{ flex: 1, padding: '10px', backgroundColor: meetSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: meetSaving ? '#475569' : '#0D0F14', cursor: meetSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {meetSaving ? 'Enregistrement…' : 'Planifier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
