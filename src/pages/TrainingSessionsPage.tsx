import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, Plus, X, AlertCircle } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { rpeApi } from '../api/rpe';
import { playersApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { notifyOrg } from '../api/notifications';
import type { TrainingSession, Player } from '../data/types';

const DAYS_FULL_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const SESSION_TYPE_OPTIONS = [
  { value: 'training', label: 'Entraînement' },
  { value: 'match',    label: 'Match' },
  { value: 'gym',      label: 'Salle' },
  { value: 'rest',     label: 'Repos' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dow:        DAYS_FR[d.getDay()],
    day:        d.getDate(),
    month:      MONTHS_FR[d.getMonth()].slice(0, 3),
    monthKey:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`,
  };
}

export default function TrainingSessionsPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();

  const [sessions,         setSessions]         = useState<TrainingSession[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, { present: number; absent: number; late: number }>>({});
  const [rpeAvg,           setRpeAvg]           = useState<Record<string, number>>({});
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');

  const [players, setPlayers] = useState<Player[]>([]);

  const [showAdd,    setShowAdd]    = useState(false);
  const [addTab,     setAddTab]     = useState<'unique' | 'recurrente'>('unique');
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState('');
  const [addForm,    setAddForm]    = useState({ date: new Date().toLocaleDateString('sv'), sessionType: 'training', duration: '90', notes: '' });
  const [recForm,    setRecForm]    = useState({ days: [] as number[], startDate: new Date().toLocaleDateString('sv'), endDate: '', duration: '90', notes: '' });
  const [recSaving,  setRecSaving]  = useState(false);
  const [recError,   setRecError]   = useState('');

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');

    attendanceApi.listSessions(selected.team.id, selected.season.id)
      .then(async (sess) => {
        const sorted = [...sess].sort((a, b) => b.date.localeCompare(a.date));
        setSessions(sorted);
        if (!sorted.length) { setLoading(false); return; }

        const ids = sorted.map(s => s.id);
        const [attendance, rpeEntries] = await Promise.all([
          attendanceApi.listAttendance(ids),
          rpeApi.listBySessions(ids),
        ]);

        const counts: Record<string, { present: number; absent: number; late: number }> = {};
        for (const a of attendance) {
          if (!counts[a.sessionId]) counts[a.sessionId] = { present: 0, absent: 0, late: 0 };
          counts[a.sessionId][a.status]++;
        }
        setAttendanceCounts(counts);

        const bySession: Record<string, number[]> = {};
        for (const e of rpeEntries) {
          if (!bySession[e.sessionId]) bySession[e.sessionId] = [];
          bySession[e.sessionId].push(e.rpe);
        }
        const avgs: Record<string, number> = {};
        for (const [sid, vals] of Object.entries(bySession)) {
          avgs[sid] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
        setRpeAvg(avgs);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id).then(setPlayers).catch(() => {});
  }, [selected?.season.id]);

  // Group by month
  const grouped: { monthLabel: string; sessions: TrainingSession[] }[] = [];
  const seenMonths = new Set<string>();
  for (const s of sessions) {
    const { monthKey, monthLabel } = fmtDate(s.date);
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      grouped.push({ monthLabel, sessions: [] });
    }
    grouped[grouped.length - 1].sessions.push(s);
  }

  function generateRecurringDates(days: number[], startDate: string, endDate: string, notes: string): { date: string; notes: string }[] {
    const result: { date: string; notes: string }[] = [];
    if (!days.length || !startDate || !endDate) return result;
    const end = new Date(endDate + 'T12:00:00');
    const cur = new Date(startDate + 'T12:00:00');
    while (cur <= end) {
      if (days.includes(cur.getDay())) result.push({ date: cur.toISOString().split('T')[0], notes });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAddSaving(true);
    setAddError('');
    try {
      const created = await attendanceApi.createSession({
        teamId:   selected.team.id,
        seasonId: selected.season.id,
        date:     addForm.date,
        duration: parseInt(addForm.duration),
        notes:    addForm.notes || undefined,
      });
      const final = addForm.sessionType !== 'training'
        ? await attendanceApi.updateSession(created.id, { sessionType: addForm.sessionType })
        : created;
      if (players.length) {
        await attendanceApi.bulkSetPresent(players.map(p => ({ sessionId: final.id, playerId: p.id })));
      }
      setSessions(prev => [final, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setAttendanceCounts(prev => ({
        ...prev,
        [final.id]: { present: players.length, absent: 0, late: 0 },
      }));
      setShowAdd(false);
      notifyOrg('session_added', `Séance du ${addForm.date}`, `${addForm.duration}min`, 'session', final.id);
      setAddForm({ date: new Date().toLocaleDateString('sv'), sessionType: 'training', duration: '90', notes: '' });
      navigate(`/sessions/${final.id}`);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setAddSaving(false);
    }
  }

  async function handleAddRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const dates = generateRecurringDates(recForm.days, recForm.startDate, recForm.endDate, recForm.notes);
    if (!dates.length) { setRecError('Aucune date générée avec ces paramètres.'); return; }
    setRecSaving(true);
    setRecError('');
    try {
      const dur = parseInt(recForm.duration);
      const created = await Promise.all(dates.map(({ date, notes }) =>
        attendanceApi.createSession({ teamId: selected.team.id, seasonId: selected.season.id, date, duration: dur, notes: notes || undefined })
      ));
      if (players.length) {
        const entries = created.flatMap(s => players.map(p => ({ sessionId: s.id, playerId: p.id })));
        await attendanceApi.bulkSetPresent(entries);
      }
      setSessions(prev => [...created, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setAttendanceCounts(prev => {
        const next = { ...prev };
        created.forEach(s => { next[s.id] = { present: players.length, absent: 0, late: 0 }; });
        return next;
      });
      setShowAdd(false);
      notifyOrg('session_added', `${created.length} séance${created.length > 1 ? 's' : ''} créée${created.length > 1 ? 's' : ''}`, `${recForm.duration}min`, 'session');
      setRecForm({ days: [], startDate: new Date().toLocaleDateString('sv'), endDate: '', duration: '90', notes: '' });
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setRecSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Séances</h1>
        {selected && (
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /><span className="hidden sm:inline">Nouvelle séance</span>
          </button>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune séance enregistrée pour cette saison.</p>
      ) : (
        grouped.map(group => (
          <div key={group.monthLabel} style={{ marginBottom: 28 }}>
            <div style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {group.monthLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {group.sessions.map(session => {
                const { dow, day, month } = fmtDate(session.date);
                const typeCfg = SESSION_TYPES[session.sessionType] ?? SESSION_TYPES.training;
                const counts  = attendanceCounts[session.id];
                const avg     = rpeAvg[session.id];

                return (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '11px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B3F4A')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}
                  >
                    <div style={{ minWidth: 46, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{dow}</div>
                      <div style={{ color: '#F1F5F9', fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.1 }}>{day}</div>
                      <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>{month}</div>
                    </div>

                    <div style={{ width: 1, height: 32, backgroundColor: '#2A2F3A', flexShrink: 0 }} />

                    <span style={{ color: typeCfg.color, backgroundColor: typeCfg.bg, fontSize: '0.71rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
                      {typeCfg.label}
                    </span>

                    <span style={{ color: '#94A3B8', fontSize: '0.8rem', flexShrink: 0 }}>
                      {session.plannedDuration} min
                    </span>

                    <div style={{ flex: 1 }} />

                    {counts && (
                      <div className="hidden sm:flex" style={{ gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {counts.present > 0 && <span style={{ color: '#00E5A0', fontSize: '0.76rem' }}>{counts.present} prés.</span>}
                        {counts.absent  > 0 && <span style={{ color: '#EF4444',  fontSize: '0.76rem' }}>{counts.absent} abs.</span>}
                        {counts.late    > 0 && <span style={{ color: '#F59E0B',  fontSize: '0.76rem' }}>{counts.late} retard</span>}
                      </div>
                    )}

                    {avg !== undefined && (
                      <div className="hidden sm:block" style={{ textAlign: 'right', flexShrink: 0, minWidth: 54 }}>
                        <div style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase' }}>RPE moy.</div>
                        <div style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700 }}>{avg.toFixed(1)}</div>
                      </div>
                    )}

                    <ChevronRight size={14} color="#2A2F3A" style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Modal nouvelle séance */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setAddError(''); setRecError(''); } }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 440, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Nouvelle séance</h2>
              <button onClick={() => { setShowAdd(false); setAddError(''); setRecError(''); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#1E2229', borderRadius: 8, padding: 4, marginBottom: 18 }}>
              {(['unique', 'recurrente'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => { setAddTab(tab); setAddError(''); setRecError(''); }}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                    backgroundColor: addTab === tab ? '#2A2F3A' : 'transparent',
                    color: addTab === tab ? '#F1F5F9' : '#475569' }}>
                  {tab === 'unique' ? 'Séance unique' : 'Récurrentes'}
                </button>
              ))}
            </div>

            {addTab === 'unique' ? (
              <>
                {addError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                    <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                    <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{addError}</span>
                  </div>
                )}
                <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                      <input type="date" required value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Type *</label>
                      <select required value={addForm.sessionType} onChange={e => setAddForm(f => ({ ...f, sessionType: e.target.value }))} style={inputStyle}>
                        {SESSION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Durée (min) *</label>
                    <input type="number" required min={1} max={300} value={addForm.duration} onChange={e => setAddForm(f => ({ ...f, duration: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Notes</label>
                    <input type="text" placeholder="Optionnel…" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={() => { setShowAdd(false); setAddError(''); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                    <button type="submit" disabled={addSaving} style={{ flex: 1, padding: '10px', backgroundColor: addSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: addSaving ? '#475569' : '#0D0F14', cursor: addSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                      {addSaving ? 'Création…' : 'Créer'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                {recError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                    <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                    <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{recError}</span>
                  </div>
                )}
                <form onSubmit={handleAddRecurring} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Jours *</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {DAYS_FULL_ORDER.map(d => (
                        <button key={d} type="button"
                          onClick={() => setRecForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            borderColor: recForm.days.includes(d) ? '#00E5A0' : '#2A2F3A',
                            backgroundColor: recForm.days.includes(d) ? 'rgba(0,229,160,0.12)' : '#1E2229',
                            color: recForm.days.includes(d) ? '#00E5A0' : '#94A3B8' }}>
                          {DAYS_FULL[d].slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Du *</label>
                      <input type="date" required value={recForm.startDate} onChange={e => setRecForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Au *</label>
                      <input type="date" required value={recForm.endDate} onChange={e => setRecForm(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Durée (min) *</label>
                    <input type="number" required min={1} max={300} value={recForm.duration} onChange={e => setRecForm(f => ({ ...f, duration: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Notes</label>
                    <input type="text" placeholder="Optionnel…" value={recForm.notes} onChange={e => setRecForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
                  </div>
                  {recForm.days.length > 0 && recForm.startDate && recForm.endDate && (
                    <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>
                      {generateRecurringDates(recForm.days, recForm.startDate, recForm.endDate, '').length} séance(s) seront créées
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={() => { setShowAdd(false); setRecError(''); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                    <button type="submit" disabled={recSaving} style={{ flex: 1, padding: '10px', backgroundColor: recSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: recSaving ? '#475569' : '#0D0F14', cursor: recSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                      {recSaving ? 'Création…' : 'Créer tout'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
