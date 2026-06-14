import { useState, useEffect } from 'react';
import { Plus, X, AlertCircle, UserCheck, UserPlus, Calendar, Clock, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { staffApi } from '../api/staff';
import { meetingsApi } from '../api/meetings';
import { supabase } from '../api/client';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { StaffMember, StaffMeeting } from '../data/types';

const ROLES = [
  { value: 'coach',         label: 'Coach' },
  { value: 'kine',          label: 'Kinésithérapeute' },
  { value: 'medecin',       label: 'Médecin' },
  { value: 'prep_physique', label: 'Préparateur physique' },
  { value: 'assistant',     label: 'Assistant' },
  { value: 'autre',         label: 'Autre' },
];

const roleLabel = (role: string) =>
  ROLES.find(r => r.value === role)?.label ?? role;

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

const emptyForm    = { firstName: '', lastName: '', role: 'coach' };
const emptyMeeting = { title: '', date: TODAY, time: '10:00', notes: '' };

export default function StaffPage() {
  const { selected } = useTeamSeason();
  const [staff,     setStaff]     = useState<StaffMember[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [inviting,     setInviting]     = useState<StaffMember | null>(null);
  const [inviteForm,   setInviteForm]   = useState({ email: '', password: '' });
  const [inviteError,  setInviteError]  = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);

  const [meetings,      setMeetings]      = useState<StaffMeeting[]>([]);
  const [meetingsError, setMeetingsError] = useState('');
  const [showMeetForm,  setShowMeetForm]  = useState(false);
  const [meetForm,      setMeetForm]      = useState(emptyMeeting);
  const [meetSaving,    setMeetSaving]    = useState(false);
  const [meetFormError, setMeetFormError] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [showPast,      setShowPast]      = useState(false);
  const [editingMeeting,  setEditingMeeting]  = useState<StaffMeeting | null>(null);
  const [editNotes,       setEditNotes]       = useState('');
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');
    staffApi.listByTeam(selected.team.id)
      .then(setStaff)
      .catch(err => setError(err?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  useEffect(() => {
    if (!selected) return;
    setMeetingsError('');
    meetingsApi.listByTeam(selected.team.id)
      .then(setMeetings)
      .catch(err => setMeetingsError(err?.message ?? String(err)));
  }, [selected?.team.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!form.firstName || !form.lastName || !form.role) {
      setFormError('Tous les champs sont obligatoires.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const created = await staffApi.create({
        teamId:    selected.team.id,
        firstName: form.firstName,
        lastName:  form.lastName,
        role:      form.role,
      });
      setStaff(prev => [...prev, created].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setShowForm(false);
      setForm(emptyForm);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setFormError('');
    setForm(emptyForm);
  }

  function closeInvite() {
    setInviting(null);
    setInviteForm({ email: '', password: '' });
    setInviteError('');
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviting) return;
    if (!inviteForm.email || !inviteForm.password) {
      setInviteError('Email et mot de passe obligatoires.');
      return;
    }
    setInviteSaving(true);
    setInviteError('');
    try {
      // Récupère l'organization_id de l'utilisateur courant
      const { data: { user: me } } = await supabase.auth.getUser();
      if (!me) throw new Error('Non authentifié.');
      const { data: myProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', me.id)
        .single();
      if (profileErr) throw profileErr;

      const { data, error } = await supabase.auth.signUp({
        email:    inviteForm.email,
        password: inviteForm.password,
        options:  {
          data: {
            first_name:      inviting.firstName,
            last_name:       inviting.lastName,
            role:            inviting.role,
            organization_id: myProfile.organization_id,
          },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Aucun utilisateur retourné.');
      // identities vides = email déjà utilisé (Supabase renvoie un faux objet pour éviter l'énumération)
      if (!data.user.identities || data.user.identities.length === 0) {
        throw new Error('Cet email est déjà associé à un compte existant.');
      }

      // Crée le profil manuellement via fonction SECURITY DEFINER
      const { error: rpcErr } = await supabase.rpc('upsert_staff_profile', {
        p_id:              data.user.id,
        p_organization_id: myProfile.organization_id,
        p_first_name:      inviting.firstName,
        p_last_name:       inviting.lastName,
        p_role:            inviting.role,
      });
      if (rpcErr) throw rpcErr;

      await staffApi.linkProfile(inviting.id, data.user.id);
      setStaff(prev => prev.map(s => s.id === inviting.id ? { ...s, profileId: data.user!.id } : s));
      closeInvite();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setInviteSaving(false);
    }
  }

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
    } catch (err: unknown) {
      setMeetFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setMeetSaving(false);
    }
  }

  async function confirmAndDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const snapshot = meetings;
    setMeetings(prev => prev.filter(m => m.id !== id));
    try { await meetingsApi.delete(id); }
    catch { setMeetings(snapshot); }
  }

  function openEditNotes(m: StaffMeeting) {
    setEditingMeeting(m);
    setEditNotes(m.notes ?? '');
    setEditError('');
  }

  async function handleEditNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMeeting) return;
    setEditSaving(true);
    setEditError('');
    try {
      await meetingsApi.updateNotes(editingMeeting.id, editNotes);
      setMeetings(prev => prev.map(m => m.id === editingMeeting.id ? { ...m, notes: editNotes || undefined } : m));
      setEditingMeeting(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    } finally {
      setEditSaving(false);
    }
  }

  function toggleNotes(id: string) {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const upcomingMeetings = meetings.filter(m => m.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pastMeetings     = meetings.filter(m => m.date < TODAY).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Staff</h1>
        {selected && (
          <button
            onClick={() => setShowForm(true)}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /><span className="hidden md:inline">Ajouter un membre</span>
          </button>
        )}
      </div>

      {!selected && (
        <p style={{ color: '#475569', textAlign: 'center', padding: '48px 0' }}>Sélectionnez une équipe pour voir le staff.</p>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{error}</span>
        </div>
      )}

      {selected && loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {selected && !loading && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          {/* Header — desktop only */}
          <div className="hidden md:flex" style={{ gap: 16, padding: '10px 20px', borderBottom: '1px solid #2A2F3A' }}>
            <span style={{ flex: 1, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</span>
            <span style={{ width: 180, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rôle</span>
            <span style={{ width: 120, color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Compte app</span>
          </div>

          {staff.length === 0 && (
            <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0, fontSize: '0.88rem' }}>
              Aucun membre du staff. Ajoutez-en un avec le bouton ci-dessus.
            </p>
          )}

          {staff.map((member, idx) => (
            <div
              key={member.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 20px',
                borderBottom: idx < staff.length - 1 ? '1px solid #1E2229' : 'none',
              }}
            >
              {/* Nom + initiales + rôle (mobile) */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#94A3B8', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.lastName} {member.firstName}
                  </p>
                  <p className="md:hidden" style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '2px 0 0' }}>
                    {roleLabel(member.role)}
                  </p>
                </div>
              </div>

              {/* Rôle — desktop only */}
              <span className="hidden md:block" style={{ width: 180, color: '#94A3B8', fontSize: '0.82rem', flexShrink: 0 }}>{roleLabel(member.role)}</span>

              {/* Compte app */}
              <div style={{ width: 120, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                {member.profileId ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00E5A0', fontSize: '0.75rem', fontWeight: 600 }}>
                    <UserCheck size={14} /> Lié
                  </span>
                ) : (
                  <button
                    onClick={() => setInviting(member)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.75rem', background: 'none', border: '1px solid #2A2F3A', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    <UserPlus size={13} /> Créer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Planning de réunions ─────────────────────────────────────── */}
      {selected && !loading && (
        <div style={{ marginTop: 40 }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h1 style={{ color: '#F1F5F9', margin: 0 }}>Planning de réunions</h1>
            <button
              onClick={() => setShowMeetForm(true)}
              style={{ padding: '7px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Plus size={13} /><span className="hidden md:inline">Planifier</span>
            </button>
          </div>

          {meetingsError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{meetingsError}</span>
            </div>
          )}

          {/* Liste unifiée — à venir (vert) puis passées (gris) */}
          {meetings.length === 0 ? (
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
                const isExpanded = expandedNotes.has(m.id);
                const accent = isToday ? '#F59E0B' : isUpcoming ? '#00E5A0' : '#475569';
                return (
                  <div key={m.id} style={{
                    backgroundColor: '#161920',
                    border: `1px solid ${isToday ? 'rgba(245,158,11,0.25)' : isUpcoming ? '#252B36' : '#1A1F28'}`,
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex',
                  }}>
                    {/* Date badge */}
                    <div style={{ width: 76, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '18px 0', borderRight: '1px solid #1E2229', gap: 3 }}>
                      <span style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{fd.dow}</span>
                      <span style={{ color: accent, fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{fd.day}</span>
                      <span style={{ color: isUpcoming ? '#94A3B8' : '#475569', fontSize: '0.72rem', fontWeight: 600 }}>{fd.month}</span>
                    </div>
                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</p>
                          {isToday && <span style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0 }}>Aujourd'hui</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => openEditNotes(m)}
                            style={{ background: 'none', border: `1px solid ${isUpcoming ? '#2A2F3A' : '#252B36'}`, color: isUpcoming ? '#94A3B8' : '#475569', cursor: 'pointer', fontSize: '0.73rem', padding: '4px 10px', borderRadius: 6, lineHeight: '18px', fontWeight: 500 }}
                            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = accent; el.style.color = accent; if (isUpcoming) el.style.backgroundColor = 'rgba(0,229,160,0.06)'; }}
                            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = isUpcoming ? '#2A2F3A' : '#252B36'; el.style.color = isUpcoming ? '#94A3B8' : '#475569'; el.style.backgroundColor = 'transparent'; }}>
                            <span className="hidden sm:inline">Compte rendu</span>
                            <span className="sm:hidden">CR</span>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(m.id)}
                            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748B', fontSize: '0.75rem' }}>
                        <Clock size={11} /> {m.time.slice(0, 5)}
                      </span>
                      {m.notes && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1E2229' }}>
                          <button
                            onClick={() => toggleNotes(m.id)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#475569', fontSize: '0.72rem' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {isExpanded ? 'Masquer les notes' : 'Voir les notes'}
                          </button>
                          {isExpanded && (
                            <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '8px 0 0', padding: '10px 12px', backgroundColor: '#0D0F14', borderRadius: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.notes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal création de compte */}
      {inviting && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Créer un compte</h2>
              <button onClick={closeInvite} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '0 0 18px' }}>
              Pour <strong style={{ color: '#F1F5F9' }}>{inviting.firstName} {inviting.lastName}</strong> — un email de confirmation sera envoyé.
            </p>

            {inviteError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{inviteError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleInvite}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email *</label>
                <input
                  type="email" required autoFocus
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  placeholder="marie.dupont@club.fr"
                />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Mot de passe temporaire *</label>
                <input
                  type="password" required
                  value={inviteForm.password}
                  onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                  style={inputStyle}
                  placeholder="8 caractères minimum"
                  minLength={8}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={closeInvite} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={inviteSaving} style={{ flex: 1, padding: '10px', backgroundColor: inviteSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: inviteSaving ? '#475569' : '#0D0F14', cursor: inviteSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {inviteSaving ? 'Création…' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 380 }}>
            <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1.05rem' }}>Supprimer la réunion ?</h2>
            <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '0 0 24px' }}>
              {meetings.find(m => m.id === confirmDeleteId)?.title} — cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmAndDelete} style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifier le compte rendu */}
      {editingMeeting && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Compte rendu</h2>
              <button onClick={() => setEditingMeeting(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '0 0 18px' }}>
              {editingMeeting.title} — {editingMeeting.date.slice(8)}/{editingMeeting.date.slice(5, 7)}/{editingMeeting.date.slice(0, 4)} à {editingMeeting.time.slice(0, 5)}
            </p>

            {editError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{editError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleEditNotes}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Notes / Compte rendu</label>
                <textarea
                  autoFocus
                  placeholder="Ordre du jour, décisions, notes…"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 140, fontFamily: 'Inter, sans-serif' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setEditingMeeting(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={editSaving} style={{ flex: 1, padding: '10px', backgroundColor: editSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: editSaving ? '#475569' : '#0D0F14', cursor: editSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
                <textarea placeholder="Ordre du jour, décisions, notes…" value={meetForm.notes} onChange={e => setMeetForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 88, fontFamily: 'Inter, sans-serif' }} />
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

      {/* Modal ajout */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Nouveau membre du staff</h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom *</label>
                  <input
                    type="text" required autoFocus
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    style={inputStyle}
                    placeholder="Marie"
                  />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom *</label>
                  <input
                    type="text" required
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    style={inputStyle}
                    placeholder="Dupont"
                  />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Rôle *</label>
                <select
                  required
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={inputStyle}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={closeForm} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Création…' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
