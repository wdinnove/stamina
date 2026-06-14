import { useState, useEffect, useRef } from 'react';
import { Plus, X, Check, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '../api/client';
import { attendanceApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, TrainingSession, TrainingAttendance } from '../data/types';

type AttendanceStatus = TrainingAttendance['status'];

const STATUS = {
  present: { label: 'Présent', color: '#00E5A0', bg: 'rgba(0,229,160,0.15)', Icon: Check  },
  absent:  { label: 'Absent',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)',  Icon: X     },
  late:    { label: 'Retard',  color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', Icon: Clock },
} as const;

const TODAY = new Date().toISOString().slice(0, 10);
const DAYS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const DAYS_FULL_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lun→Dim
const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return { dow: DAYS_FR[d.getDay()], day: d.getDate(), month: MONTHS_FR[d.getMonth()] };
}

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id:                row.id                 as string,
    firstName:         row.first_name         as string,
    lastName:          row.last_name          as string,
    number:            row.number             as number,
    position:          row.position           as Player['position'],
    secondaryPosition: row.secondary_position as Player['position'] | undefined,
    organizationId:    row.organization_id    as string,
    status:            row.status             as Player['status'],
    nationality:       row.nationality        as string,
    birthDate:         row.birth_date         as string,
    height:            row.height_cm          as number | undefined,
    weight:            row.weight_kg          as number | undefined,
    hand:              row.hand               as Player['hand'],
    contractEnd:       row.contract_end       as string | undefined,
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const NAME_W = 200;
const CELL_W = 76;

export default function AttendancePage() {
  const { selected } = useTeamSeason();
  const popoverRef        = useRef<HTMLDivElement>(null);
  const partnerPopoverRef = useRef<HTMLDivElement>(null);

  const [players,       setPlayers]       = useState<Player[]>([]);
  const [sessions,      setSessions]      = useState<TrainingSession[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [rpeMap,        setRpeMap]        = useState<Record<string, number>>({});
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const [activeCell,          setActiveCell]          = useState<{ sessionId: string; playerId: string; x: number; y: number } | null>(null);
  const [partnerPopover,      setPartnerPopover]      = useState<{ sessionId: string; x: number; y: number } | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<TrainingSession | null>(null);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [newDate,      setNewDate]      = useState(TODAY);
  const [newDuration,  setNewDuration]  = useState('90');
  const [newNotes,     setNewNotes]     = useState('');
  const [addSaving,    setAddSaving]    = useState(false);
  const [addError,     setAddError]     = useState('');

  const [addTab,        setAddTab]        = useState<'single' | 'recurring'>('single');
  const [recurSlots,    setRecurSlots]    = useState<Array<{ dayOfWeek: number; notes: string }>>([{ dayOfWeek: 2, notes: '' }]);
  const [recurFrom,     setRecurFrom]     = useState(TODAY);
  const [recurTo,       setRecurTo]       = useState('');
  const [recurDuration, setRecurDuration] = useState('90');
  const [recurSaving,   setRecurSaving]   = useState(false);
  const [recurError,    setRecurError]    = useState('');
  const [recurProgress, setRecurProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');

    const { team, season } = selected;

    const playersPromise = supabase
      .from('player_season')
      .select('players(*)')
      .eq('season_id', season.id)
      .then(({ data, error: e }) => {
        if (e) throw e;
        return (data ?? [])
          .map(r => (r.players as Record<string, unknown> | null))
          .filter((p): p is Record<string, unknown> => p !== null)
          .map(toPlayer)
          .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
      });

    const sessionsPromise = attendanceApi.listSessions(team.id, season.id);

    Promise.all([playersPromise, sessionsPromise])
      .then(([pl, ss]) => {
        setPlayers(pl);
        setSessions(ss);
        const ids = ss.map(s => s.id);
        return Promise.all([
          attendanceApi.listAttendance(ids),
          ids.length
            ? supabase.from('rpe_entries').select('session_id, rpe').in('session_id', ids).then(r => (r.data ?? []) as Array<{ session_id: string; rpe: number }>)
            : Promise.resolve([] as Array<{ session_id: string; rpe: number }>),
        ]);
      })
      .then(([att, rpeRows]) => {
        const map: Record<string, AttendanceStatus> = {};
        att.forEach(r => { map[`${r.sessionId}:${r.playerId}`] = r.status; });
        setAttendanceMap(map);

        const groups: Record<string, number[]> = {};
        rpeRows.forEach(r => { (groups[r.session_id] ??= []).push(r.rpe); });
        const avgs: Record<string, number> = {};
        Object.entries(groups).forEach(([sid, rpes]) => {
          avgs[sid] = Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length * 10) / 10;
        });
        setRpeMap(avgs);
      })
      .catch(err => setError(err?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  useEffect(() => {
    if (!activeCell) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setActiveCell(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeCell]);

  useEffect(() => {
    if (!partnerPopover) return;
    const handler = (e: MouseEvent) => {
      if (partnerPopoverRef.current && !partnerPopoverRef.current.contains(e.target as Node)) setPartnerPopover(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [partnerPopover]);

  function handleCellClick(e: React.MouseEvent, sessionId: string, playerId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popW = 232;
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 8));
    setActiveCell({ sessionId, playerId, x, y: rect.bottom + 6 });
  }

  async function applyStatus(status: AttendanceStatus | null) {
    if (!activeCell) return;
    const { sessionId, playerId } = activeCell;
    const key = `${sessionId}:${playerId}`;
    const prev = attendanceMap[key];
    setAttendanceMap(m => { const n = { ...m }; if (status) n[key] = status; else delete n[key]; return n; });
    setActiveCell(null);
    try {
      if (status === null) await attendanceApi.deleteAttendance(sessionId, playerId);
      else await attendanceApi.setAttendance({ sessionId, playerId, status });
    } catch {
      setAttendanceMap(m => { const n = { ...m }; if (prev) n[key] = prev; else delete n[key]; return n; });
    }
  }

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !newDate) return;
    setAddSaving(true);
    setAddError('');
    try {
      const created = await attendanceApi.createSession({
        teamId:   selected.team.id,
        seasonId: selected.season.id,
        date:     newDate,
        duration: parseInt(newDuration, 10) || 90,
        notes:    newNotes || undefined,
      });
      if (players.length) {
        await attendanceApi.bulkSetPresent(players.map(p => ({ sessionId: created.id, playerId: p.id })));
        setAttendanceMap(prev => {
          const next = { ...prev };
          players.forEach(p => { next[`${created.id}:${p.id}`] = 'present'; });
          return next;
        });
      }
      setSessions(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAddForm(false);
      setNewDate(TODAY);
      setNewDuration('90');
      setNewNotes('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setAddSaving(false);
    }
  }

  async function deleteSession(id: string) {
    const snapshot = sessions;
    setSessions(prev => prev.filter(s => s.id !== id));
    setAttendanceMap(m => {
      const n = { ...m };
      Object.keys(n).forEach(k => { if (k.startsWith(id + ':')) delete n[k]; });
      return n;
    });
    try { await attendanceApi.deleteSession(id); }
    catch { setSessions(snapshot); }
  }

  function handlePartnerCellClick(e: React.MouseEvent, sessionId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popW = 140;
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 8));
    setPartnerPopover({ sessionId, x, y: rect.bottom + 6 });
  }

  async function updatePartners(sessionId: string, delta: number) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const newCount = Math.max(0, session.partnerCount + delta);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, partnerCount: newCount } : s));
    try {
      await attendanceApi.updatePartnerCount(sessionId, newCount);
    } catch {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, partnerCount: session.partnerCount } : s));
    }
  }

  function sessionTotal(sessionId: string): number {
    const session = sessions.find(s => s.id === sessionId);
    const presentPlayers = players.filter(p => {
      const st = attendanceMap[`${sessionId}:${p.id}`];
      return st === 'present' || st === 'late';
    }).length;
    return presentPlayers + (session?.partnerCount ?? 0);
  }

  function closeAddForm() {
    setShowAddForm(false);
    setAddError('');
    setAddTab('single');
    setRecurSlots([{ dayOfWeek: 2, notes: '' }]);
    setRecurFrom(TODAY);
    setRecurTo('');
    setRecurProgress(null);
    setRecurError('');
  }

  function generateRecurringDates(): Array<{ date: string; notes: string }> {
    if (!recurFrom || !recurTo) return [];
    const results: Array<{ date: string; notes: string }> = [];
    const end = new Date(recurTo + 'T12:00:00');
    const cur = new Date(recurFrom + 'T12:00:00');
    while (cur <= end) {
      for (const slot of recurSlots) {
        if (cur.getDay() === slot.dayOfWeek) {
          results.push({ date: cur.toISOString().slice(0, 10), notes: slot.notes });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
    return results.sort((a, b) => a.date.localeCompare(b.date) || a.notes.localeCompare(b.notes));
  }

  async function handleAddRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const dates = generateRecurringDates();
    if (!dates.length) { setRecurError('Aucune séance à créer avec ces paramètres.'); return; }
    setRecurSaving(true);
    setRecurError('');
    setRecurProgress({ done: 0, total: dates.length });
    try {
      const created: TrainingSession[] = [];
      for (const { date, notes } of dates) {
        const s = await attendanceApi.createSession({
          teamId:   selected.team.id,
          seasonId: selected.season.id,
          date,
          duration: parseInt(recurDuration, 10) || 90,
          notes: notes || undefined,
        });
        created.push(s);
        setRecurProgress(p => p ? { ...p, done: p.done + 1 } : null);
      }
      if (players.length && created.length) {
        const entries = created.flatMap(s => players.map(p => ({ sessionId: s.id, playerId: p.id })));
        await attendanceApi.bulkSetPresent(entries);
        setAttendanceMap(prev => {
          const next = { ...prev };
          created.forEach(s => { players.forEach(p => { next[`${s.id}:${p.id}`] = 'present'; }); });
          return next;
        });
      }
      setSessions(prev => [...prev, ...created].sort((a, b) => a.date.localeCompare(b.date)));
      closeAddForm();
    } catch (err: unknown) {
      setRecurError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setRecurSaving(false);
      setRecurProgress(null);
    }
  }

  // Stats présence par séance
  function sessionPct(sessionId: string) {
    if (!players.length) return null;
    const present = players.filter(p => {
      const s = attendanceMap[`${sessionId}:${p.id}`];
      return s === 'present' || s === 'late';
    }).length;
    return Math.round((present / players.length) * 100);
  }

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0, gap: 12 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Présences</h1>
        {selected && (
          <button
            onClick={() => setShowAddForm(true)}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            <Plus size={16} /><span className="hidden md:inline">Ajouter une séance</span>
          </button>
        )}
      </div>

      {!selected && <p style={{ color: '#475569', textAlign: 'center', padding: '48px 0' }}>Sélectionnez une équipe.</p>}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, flexShrink: 0 }}>
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

      {selected && !loading && sessions.length === 0 && (
        <div style={{ backgroundColor: '#161920', border: '1px dashed #2A2F3A', borderRadius: 10, padding: '48px', textAlign: 'center' }}>
          <p style={{ color: '#475569', fontSize: '0.88rem', margin: '0 0 14px' }}>Aucune séance enregistrée.</p>
          <button onClick={() => setShowAddForm(true)} style={{ padding: '8px 16px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem' }}>
            Ajouter la première séance
          </button>
        </div>
      )}

      {/* ── Grille ──────────────────────────────────────────────────────────── */}
      {selected && !loading && sessions.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10 }}>
          <style>{`@media (max-width: 767px) { .att-name-col { width: 110px !important; } }`}</style>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: NAME_W + sessions.length * CELL_W }}>
            <colgroup>
              <col className="att-name-col" style={{ width: NAME_W }} />
              {sessions.map(s => <col key={s.id} style={{ width: CELL_W }} />)}
            </colgroup>

            {/* ── En-tête séances ── */}
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#161920',
                  borderBottom: '1px solid #2A2F3A', borderRight: '1px solid #2A2F3A',
                  padding: '12px 16px', textAlign: 'left',
                }}>
                  <span style={{ color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Joueur · {players.length}
                  </span>
                </th>
                {sessions.map(s => {
                  const fd = fmtDate(s.date);
                  const isToday = s.date === TODAY;
                  return (
                    <th key={s.id} style={{
                      borderBottom: '1px solid #2A2F3A', borderRight: '1px solid #1E2229',
                      padding: '8px 4px 10px', textAlign: 'center', backgroundColor: '#161920',
                      position: 'relative',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{fd.dow}</span>
                        <span style={{ color: isToday ? '#F59E0B' : '#F1F5F9', fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{fd.day}</span>
                        <span style={{ color: '#94A3B8', fontSize: '0.65rem', fontWeight: 600 }}>{fd.month}</span>
                        {s.notes && <span style={{ color: '#475569', fontSize: '0.58rem', marginTop: 1, maxWidth: CELL_W - 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes}</span>}
                        {rpeMap[s.id] !== undefined && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, marginTop: 1,
                            color: rpeMap[s.id] <= 5 ? '#00E5A0' : rpeMap[s.id] <= 7 ? '#F59E0B' : '#EF4444',
                          }}>
                            RPE {rpeMap[s.id]}
                          </span>
                        )}
                        {/* Supprimer séance */}
                        <button
                          onClick={() => setConfirmDeleteSession(s)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '2px', marginTop: 2, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#334155')}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Lignes joueurs ── */}
            <tbody>
              {/* ── Ligne total ── */}
              <tr>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 2,
                  backgroundColor: '#0D0F14', borderBottom: '1px solid #2A2F3A', borderRight: '1px solid #2A2F3A',
                  padding: '7px 16px', whiteSpace: 'nowrap',
                }}>
                  <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
                </td>
                {sessions.map(s => {
                  const total = sessionTotal(s.id);
                  return (
                    <td key={s.id} style={{
                      borderBottom: '1px solid #2A2F3A', borderRight: '1px solid #1E2229',
                      backgroundColor: '#0D0F14', textAlign: 'center', padding: '7px 4px',
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#F1F5F9' }}>
                        {total > 0 ? total : <span style={{ color: '#334155' }}>—</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {players.map((p, idx) => (
                <tr key={p.id}>
                  {/* Nom — sticky */}
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    backgroundColor: idx % 2 === 0 ? '#161920' : '#13171E',
                    borderBottom: '1px solid #1E2229', borderRight: '1px solid #2A2F3A',
                    padding: '0 16px', height: 48, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="hidden md:flex" style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#94A3B8', fontSize: '0.65rem', fontWeight: 700,
                      }}>
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 500 }}>
                        {p.lastName}<span className="hidden md:inline"> {p.firstName}</span>
                      </span>
                    </div>
                  </td>

                  {/* Cellules présence */}
                  {sessions.map(s => {
                    const status = attendanceMap[`${s.id}:${p.id}`];
                    const cfg = status ? STATUS[status] : null;
                    return (
                      <td
                        key={s.id}
                        onClick={e => handleCellClick(e, s.id, p.id)}
                        style={{
                          borderBottom: '1px solid #1E2229', borderRight: '1px solid #1E2229',
                          height: 48, textAlign: 'center', cursor: 'pointer',
                          backgroundColor: cfg ? cfg.bg : 'transparent',
                        }}
                        onMouseEnter={e => { if (!cfg) (e.currentTarget as HTMLElement).style.backgroundColor = '#1E2229'; }}
                        onMouseLeave={e => { if (!cfg) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      >
                        {cfg && <cfg.Icon size={16} style={{ color: cfg.color, display: 'block', margin: '0 auto' }} />}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* ── Ligne partenaires ── */}
              <tr>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 2,
                  backgroundColor: '#13171E', borderTop: '1px solid #2A2F3A', borderBottom: '1px solid #1E2229', borderRight: '1px solid #2A2F3A',
                  padding: '0 16px', height: 44, whiteSpace: 'nowrap',
                }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.82rem', fontWeight: 500 }}>Partenaires</span>
                </td>
                {sessions.map(s => {
                  const count = s.partnerCount;
                  return (
                    <td
                      key={s.id}
                      onClick={e => handlePartnerCellClick(e, s.id)}
                      style={{
                        borderTop: '1px solid #2A2F3A', borderBottom: '1px solid #1E2229', borderRight: '1px solid #1E2229',
                        backgroundColor: '#13171E', textAlign: 'center', height: 44,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1E26'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#13171E'; }}
                    >
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: count > 0 ? '#F59E0B' : '#334155' }}>
                        {count > 0 ? count : '+'}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* ── Ligne stats présence ── */}
              <tr>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  backgroundColor: '#0D0F14', borderTop: '1px solid #2A2F3A', borderRight: '1px solid #2A2F3A',
                  padding: '8px 16px',
                }}>
                  <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Présence</span>
                </td>
                {sessions.map(s => {
                  const pct = sessionPct(s.id);
                  return (
                    <td key={s.id} style={{
                      borderTop: '1px solid #2A2F3A', borderRight: '1px solid #1E2229',
                      backgroundColor: '#0D0F14', textAlign: 'center', padding: '8px 4px',
                    }}>
                      {pct !== null && (
                        <span style={{
                          fontSize: '0.78rem', fontWeight: 700,
                          color: pct >= 80 ? '#00E5A0' : pct >= 50 ? '#F59E0B' : '#EF4444',
                        }}>
                          {pct}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Popover statut ── */}
      {activeCell && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', left: activeCell.x, top: activeCell.y, zIndex: 1000,
            backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 10,
            padding: '6px', display: 'flex', gap: 4,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {(['present', 'absent', 'late'] as const).map(s => {
            const cfg = STATUS[s];
            const isActive = attendanceMap[`${activeCell.sessionId}:${activeCell.playerId}`] === s;
            return (
              <button
                key={s}
                onClick={() => applyStatus(isActive ? null : s)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '10px 14px',
                  background: isActive ? cfg.bg : 'none',
                  border: `1px solid ${isActive ? cfg.color : '#2A2F3A'}`,
                  borderRadius: 8, cursor: 'pointer', minWidth: 68,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '#252B36'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                <cfg.Icon size={18} style={{ color: cfg.color }} />
                <span style={{ color: isActive ? cfg.color : '#94A3B8', fontSize: '0.68rem', fontWeight: 600 }}>{cfg.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Popover partenaires ── */}
      {partnerPopover && (() => {
        const session = sessions.find(s => s.id === partnerPopover.sessionId);
        const count = session?.partnerCount ?? 0;
        return (
          <div
            ref={partnerPopoverRef}
            style={{
              position: 'fixed', left: partnerPopover.x, top: partnerPopover.y, zIndex: 1000,
              backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 10,
              padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <button
              onClick={() => updatePartners(partnerPopover.sessionId, -1)}
              disabled={count === 0}
              style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: count === 0 ? '#334155' : '#94A3B8', cursor: count === 0 ? 'not-allowed' : 'pointer', width: 28, height: 28, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >−</button>
            <span style={{ color: '#F1F5F9', fontSize: '1.1rem', fontWeight: 800, minWidth: 24, textAlign: 'center' }}>{count}</span>
            <button
              onClick={() => updatePartners(partnerPopover.sessionId, +1)}
              style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', width: 28, height: 28, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#F59E0B'; (e.currentTarget as HTMLElement).style.color = '#F59E0B'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
            >+</button>
          </div>
        );
      })()}

      {/* ── Modal confirmation suppression séance ── */}
      {confirmDeleteSession && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 380 }}>
            <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1.05rem' }}>Supprimer la séance ?</h2>
            <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '0 0 24px' }}>
              {fmtDate(confirmDeleteSession.date).dow} {fmtDate(confirmDeleteSession.date).day} {fmtDate(confirmDeleteSession.date).month}
              {confirmDeleteSession.notes ? ` — ${confirmDeleteSession.notes}` : ''} · Cette action supprimera aussi toutes les présences enregistrées.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDeleteSession(null)}
                style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={() => { deleteSession(confirmDeleteSession.id); setConfirmDeleteSession(null); }}
                style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nouvelle séance ── */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Nouvelle séance</h2>
              <button onClick={closeAddForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, backgroundColor: '#0D0F14', padding: 4, borderRadius: 8 }}>
              {(['single', 'recurring'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAddTab(tab)}
                  style={{
                    flex: 1, padding: '7px 10px',
                    backgroundColor: addTab === tab ? '#1E2229' : 'transparent',
                    border: `1px solid ${addTab === tab ? '#2A2F3A' : 'transparent'}`,
                    borderRadius: 6, color: addTab === tab ? '#F1F5F9' : '#475569',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: addTab === tab ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'single' ? 'Séance unique' : 'Séances récurrentes'}
                </button>
              ))}
            </div>

            {/* ── Tab : Séance unique ── */}
            {addTab === 'single' && (
              <>
                {addError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                    <AlertCircle size={13} style={{ color: '#EF4444' }} />
                    <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{addError}</span>
                  </div>
                )}
                <form onSubmit={handleAddSession} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                    <input type="date" required autoFocus value={newDate} onChange={e => setNewDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Durée prévue (min) *</label>
                    <input type="number" required min={1} max={300} value={newDuration} onChange={e => setNewDuration(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
                    <input type="text" placeholder="Ex : Entraînement matin" value={newNotes} onChange={e => setNewNotes(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={closeAddForm} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                    <button type="submit" disabled={addSaving} style={{ flex: 1, padding: '10px', backgroundColor: addSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: addSaving ? '#475569' : '#0D0F14', cursor: addSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                      {addSaving ? 'Création…' : 'Ajouter'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Tab : Séances récurrentes ── */}
            {addTab === 'recurring' && (() => {
              const preview = recurFrom && recurTo ? generateRecurringDates().length : 0;
              return (
                <>
                  {recurError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                      <AlertCircle size={13} style={{ color: '#EF4444' }} />
                      <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{recurError}</span>
                    </div>
                  )}
                  <form onSubmit={handleAddRecurring} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Créneaux */}
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 8 }}>Créneaux hebdomadaires *</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {recurSlots.map((slot, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={slot.dayOfWeek}
                              onChange={e => setRecurSlots(prev => prev.map((s, j) => j === i ? { ...s, dayOfWeek: Number(e.target.value) } : s))}
                              style={{ ...inputStyle, width: 140, flexShrink: 0 }}
                            >
                              {DAYS_FULL_ORDER.map(d => (
                                <option key={d} value={d}>{DAYS_FULL[d]}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Label (ex: Soir)"
                              value={slot.notes}
                              onChange={e => setRecurSlots(prev => prev.map((s, j) => j === i ? { ...s, notes: e.target.value } : s))}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            {recurSlots.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setRecurSlots(prev => prev.filter((_, j) => j !== i))}
                                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                              >
                                <X size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setRecurSlots(prev => [...prev, { dayOfWeek: 2, notes: '' }])}
                        style={{ marginTop: 8, background: 'none', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', padding: '6px 12px', fontSize: '0.78rem', width: '100%' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#00E5A0'; (e.currentTarget as HTMLElement).style.color = '#00E5A0'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                      >
                        + Ajouter un créneau
                      </button>
                    </div>

                    {/* Période */}
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Période *</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="date" required value={recurFrom} onChange={e => setRecurFrom(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                        <span style={{ color: '#475569', fontSize: '0.78rem', flexShrink: 0 }}>→</span>
                        <input type="date" required value={recurTo} min={recurFrom} onChange={e => setRecurTo(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      </div>
                    </div>

                    {/* Durée */}
                    <div>
                      <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Durée prévue (min) *</label>
                      <input type="number" required min={1} max={300} value={recurDuration} onChange={e => setRecurDuration(e.target.value)} style={inputStyle} />
                    </div>

                    {/* Preview */}
                    {recurFrom && recurTo && (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        backgroundColor: preview > 0 ? 'rgba(0,229,160,0.08)' : 'rgba(239,68,68,0.08)',
                        border: `1px solid ${preview > 0 ? 'rgba(0,229,160,0.2)' : 'rgba(239,68,68,0.2)'}`,
                        color: preview > 0 ? '#00E5A0' : '#EF4444',
                        fontSize: '0.82rem', fontWeight: 600,
                      }}>
                        {preview > 0
                          ? `${preview} séance${preview > 1 ? 's' : ''} vont être créées`
                          : 'Aucune séance dans cette période avec ces jours'}
                      </div>
                    )}

                    {/* Progress */}
                    {recurProgress && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 4, backgroundColor: '#1E2229', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', backgroundColor: '#00E5A0', borderRadius: 2, width: `${Math.round((recurProgress.done / recurProgress.total) * 100)}%`, transition: 'width 0.2s' }} />
                        </div>
                        <span style={{ color: '#94A3B8', fontSize: '0.78rem', flexShrink: 0 }}>{recurProgress.done}/{recurProgress.total}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button type="button" onClick={closeAddForm} disabled={recurSaving} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recurSaving ? '#475569' : '#F1F5F9', cursor: recurSaving ? 'not-allowed' : 'pointer' }}>Annuler</button>
                      <button type="submit" disabled={recurSaving || preview === 0} style={{ flex: 2, padding: '10px', backgroundColor: recurSaving || preview === 0 ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: recurSaving || preview === 0 ? '#475569' : '#0D0F14', cursor: recurSaving || preview === 0 ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                        {recurSaving ? `Création… (${recurProgress?.done ?? 0}/${recurProgress?.total ?? preview})` : preview > 0 ? `Créer ${preview} séance${preview > 1 ? 's' : ''}` : 'Créer'}
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
