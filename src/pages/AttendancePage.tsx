import { useState, useEffect, useRef } from 'react';
import { X, Check, Clock, Minus, AlertCircle, Trash2 } from 'lucide-react';
import { EmptyState, Modal, DropzoneEmptyState, AddButton } from '../components';
import { attendanceApi, playersApi, rpeApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { MONTHS_ABBR3, DAYS_ABBR3, DAYS_FULL, DAYS_MONDAY_FIRST } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { Player, TrainingSession, TrainingAttendance } from '../data/types';
import { notify } from '../api/notifications';
import { LAYER } from '../styles/layers';

type AttendanceStatus = TrainingAttendance['status'];

const STATUS = {
  present:      { label: 'Présent',     color: '#00E5A0', bg: 'rgba(0,229,160,0.15)',   Icon: Check  },
  absent:       { label: 'Absent',      color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   Icon: X      },
  late:         { label: 'Retard',      color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  Icon: Clock  },
  // Gris volontaire : « non attendu » n'est pas un degré entre présent et absent, c'est une
  // ligne hors calcul. La couleur ne doit pas le ranger sur la même échelle.
  not_expected: { label: 'Non attendu', color: '#64748B', bg: 'rgba(100,116,139,0.15)', Icon: Minus  },
} as const;

const TODAY = new Date().toISOString().slice(0, 10);

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return { dow: DAYS_ABBR3[d.getDay()], day: d.getDate(), month: MONTHS_ABBR3[d.getMonth()] };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const NAME_W = 200;
const CELL_W = 76;

export default function AttendancePage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const popoverRef        = useRef<HTMLDivElement>(null);

  const [players,       setPlayers]       = useState<Player[]>([]);
  const [sessions,      setSessions]      = useState<TrainingSession[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [rpeMap,        setRpeMap]        = useState<Record<string, number>>({});
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  const [activeCell,          setActiveCell]          = useState<{ sessionId: string; playerId: string; x: number; y: number } | null>(null);
  /** Joueurs de l'organisation hors effectif, candidats à une invitation. */
  const [orgPlayers,    setOrgPlayers]    = useState<Player[]>([]);
  /** Invités affichés : ceux déjà pointés sur une séance, plus ceux qu'on vient
   *  d'ajouter et qui n'ont encore aucun statut — sans ça, un invité choisi disparaîtrait
   *  de la grille avant même qu'on ait pu la pointer. */
  const [guestIds,      setGuestIds]      = useState<string[]>([]);
  const [showGuestPick, setShowGuestPick] = useState(false);
  const [confirmGuest,  setConfirmGuest]  = useState<Player | null>(null);
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

    const playersPromise = playersApi.listBySeason(season.id);
    const sessionsPromise = attendanceApi.listSessions(team.id, season.id);
    // La RLS des joueurs est cadrée par organisation : cette liste est déjà celle du club.
    const orgPromise = playersApi.list();

    Promise.all([playersPromise, sessionsPromise, orgPromise])
      .then(([pl, ss, org]) => {
        setPlayers(pl);
        setSessions(ss);
        setOrgPlayers(org);
        const ids = ss.map(s => s.id);
        return Promise.all([
          attendanceApi.listAttendance(ids),
          rpeApi.listRpeBySessionIds(ids),
        ]);
      })
      .then(([att, rpeRows]) => {
        const map: Record<string, AttendanceStatus> = {};
        att.forEach(r => { map[`${r.sessionId}:${r.playerId}`] = r.status; });
        setAttendanceMap(map);
        setGuestIds([...new Set(att.filter(r => r.sparring).map(r => r.playerId))]);

        const groups: Record<string, number[]> = {};
        rpeRows.forEach(r => { (groups[r.sessionId] ??= []).push(r.rpe); });
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

  function handleCellClick(e: React.MouseEvent, sessionId: string, playerId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popW = 300;
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 8));
    setActiveCell({ sessionId, playerId, x, y: rect.bottom + 6 });
  }

  async function applyStatus(status: AttendanceStatus | null) {
    if (!activeCell) return;
    const { sessionId, playerId } = activeCell;
    const sparring = !players.some(p => p.id === playerId);
    const key = `${sessionId}:${playerId}`;
    const prev = attendanceMap[key];
    setAttendanceMap(m => { const n = { ...m }; if (status) n[key] = status; else delete n[key]; return n; });
    setActiveCell(null);
    try {
      if (status === null) await attendanceApi.deleteAttendance(sessionId, playerId);
      else await attendanceApi.setAttendance({ sessionId, playerId, status, sparring });
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
    const removed = snapshot.find(s => s.id === id);
    try {
      await attendanceApi.deleteSession(id);
      notify(selected?.team.id, 'session_updated', `Séance annulée${removed ? ` — ${removed.date}` : ''}`, { entityType: 'session' });
    } catch { setSessions(snapshot); }
  }

  /** Invités, dans l'ordre de la liste du club — jamais un joueur de l'effectif. */
  const guests = orgPlayers.filter(p => guestIds.includes(p.id) && !players.some(r => r.id === p.id));
  const invitable = orgPlayers.filter(p => !players.some(r => r.id === p.id) && !guestIds.includes(p.id));

  /**
   * Retire un invité de la grille. Ses pointages sur les séances affichées partent avec
   * elle : sans ça, elle reviendrait au rechargement, puisque c'est justement l'existence
   * d'un pointage `sparring` qui la fait apparaître. Ses RPE, eux, restent — la séance a bien
   * eu lieu pour elle, et sa charge n'appartient pas à cette équipe.
   */
  async function removeGuest(playerId: string) {
    const marked = sessions.filter(s => attendanceMap[`${s.id}:${playerId}`]);
    setGuestIds(prev => prev.filter(id => id !== playerId));
    setAttendanceMap(m => {
      const n = { ...m };
      marked.forEach(s => delete n[`${s.id}:${playerId}`]);
      return n;
    });
    setConfirmGuest(null);
    for (const s of marked) {
      await attendanceApi.deleteAttendance(s.id, playerId).catch(() => {});
    }
  }

  /** Confirmation seulement s'il y a quelque chose à perdre. */
  function askRemoveGuest(player: Player) {
    const marked = sessions.some(s => attendanceMap[`${s.id}:${player.id}`]);
    if (marked) setConfirmGuest(player);
    else removeGuest(player.id);
  }

  function isPresent(sessionId: string, playerId: string): boolean {
    const st = attendanceMap[`${sessionId}:${playerId}`];
    return st === 'present' || st === 'late';
  }

  /**
   * Nombre de joueurs sur le terrain : effectif et invités confondus. Le taux de présence
   * d'équipe, lui, ne regarde que l'effectif (cf. `sessionPct`) — un invité n'a pas à faire
   * bouger un chiffre qui mesure l'assiduité de l'équipe.
   */
  function sessionTotal(sessionId: string): number {
    return players.filter(p => isPresent(sessionId, p.id)).length
         + guests.filter(p => isPresent(sessionId, p.id)).length;
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
  /**
   * Taux de présence de la séance, sur l'effectif ATTENDU : un joueur marqué « non attendu »
   * sort du dénominateur. Une séance où la moitié de l'effectif était en sélection ne doit pas
   * s'afficher à 50 %.
   */
  function sessionPct(sessionId: string) {
    const expected = players.filter(p => attendanceMap[`${sessionId}:${p.id}`] !== 'not_expected');
    if (!expected.length) return null;
    const present = expected.filter(p => isPresent(sessionId, p.id)).length;
    return Math.round((present / expected.length) * 100);
  }

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0, gap: 12 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Présences</h1>
        {selected && canEditTeamData && (
          <AddButton label="Ajouter une séance" onClick={() => setShowAddForm(true)} />
        )}
      </div>

      {!selected && <EmptyState message="Sélectionnez une équipe et une saison dans la barre du haut." size="lg" />}

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
        canEditTeamData ? (
          <DropzoneEmptyState label="Cliquer pour ajouter une séance" onClick={() => setShowAddForm(true)} />
        ) : (
          <EmptyState message="Aucune séance. Seuls les rôles Admin et Éditeur peuvent en ajouter." size="lg" />
        )
      )}

      {/* ── Grille ──────────────────────────────────────────────────────────── */}
      {selected && !loading && sessions.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 160px)', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10 }}>
          <style>{`@media (max-width: 767px) { .att-name-col { width: 110px !important; } }`}</style>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: NAME_W + sessions.length * CELL_W }}>
            <colgroup>
              <col className="att-name-col" style={{ width: NAME_W }} />
              {sessions.map(s => <col key={s.id} style={{ width: CELL_W }} />)}
            </colgroup>

            {/* ── En-tête séances ── */}
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 3, backgroundColor: '#161920',
                  borderBottom: '1px solid #2A2F3A',
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
                  backgroundColor: '#0D0F14', borderBottom: '1px solid #2A2F3A',
                  padding: '7px 16px', whiteSpace: 'nowrap',
                }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
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
                    borderBottom: '1px solid #1E2229',
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
                        <span className="hidden md:inline">{playerNameFull(p)}</span>
                        <span className="md:hidden">{playerNameShort(p)}</span>
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
                        onClick={canEditTeamData ? (e => handleCellClick(e, s.id, p.id)) : undefined}
                        style={{
                          borderBottom: '1px solid #1E2229', borderRight: '1px solid #1E2229',
                          height: 48, textAlign: 'center', cursor: canEditTeamData ? 'pointer' : 'default',
                          backgroundColor: cfg ? cfg.bg : 'transparent',
                          opacity: canEditTeamData ? 1 : 0.75,
                        }}
                        onMouseEnter={e => { if (canEditTeamData && !cfg) (e.currentTarget as HTMLElement).style.backgroundColor = '#1E2229'; }}
                        onMouseLeave={e => { if (!cfg) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      >
                        {cfg && <cfg.Icon size={16} style={{ color: cfg.color, display: 'block', margin: '0 auto' }} />}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* ── Partenaires d'entraînement ──
                  Même grille que l'effectif : ils se pointent séance par séance, un invité
                  pouvant venir un mardi et pas le suivant. Le liseré orange les distingue au
                  premier coup d'œil de l'effectif, dont ils ne partagent aucun chiffre. */}
              {(guests.length > 0 || canEditTeamData) && (
                <tr>
                  <td colSpan={sessions.length + 1} style={{
                    backgroundColor: '#13171E', borderTop: '1px solid #2A2F3A', borderBottom: '1px solid #1E2229',
                    padding: '6px 16px', whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', left: 0, width: 'fit-content' }}>
                      <span style={{ color: '#F59E0B', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Partenaires
                      </span>
                      {canEditTeamData && invitable.length > 0 && (
                        <button onClick={() => setShowGuestPick(true)}
                          style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 8px' }}>
                          + Inviter un joueur
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {guests.map(p => (
                <tr key={p.id}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    backgroundColor: '#13171E', borderBottom: '1px solid #1E2229',
                    borderLeft: '2px solid #F59E0B',
                    padding: '0 16px', height: 48, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 500 }}>
                        <span className="hidden md:inline">{playerNameFull(p)}</span>
                        <span className="md:hidden">{playerNameShort(p)}</span>
                      </span>
                      {canEditTeamData && (
                        <button onClick={() => askRemoveGuest(p)} title="Retirer des partenaires"
                          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', padding: 2 }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                  {sessions.map(s => {
                    const status = attendanceMap[`${s.id}:${p.id}`];
                    const cfg = status ? STATUS[status] : null;
                    return (
                      <td
                        key={s.id}
                        onClick={canEditTeamData ? (e => handleCellClick(e, s.id, p.id)) : undefined}
                        style={{
                          borderBottom: '1px solid #1E2229', borderRight: '1px solid #1E2229',
                          height: 48, textAlign: 'center', cursor: canEditTeamData ? 'pointer' : 'default',
                          backgroundColor: cfg ? cfg.bg : 'transparent',
                          opacity: canEditTeamData ? 1 : 0.75,
                        }}
                      >
                        {cfg && <cfg.Icon size={16} style={{ color: cfg.color, display: 'block', margin: '0 auto' }} />}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* ── Ligne stats présence ── */}
              <tr>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  backgroundColor: '#0D0F14', borderTop: '1px solid #2A2F3A',
                  padding: '8px 16px',
                }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Présence</span>
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
            position: 'fixed', left: activeCell.x, top: activeCell.y, zIndex: LAYER.dropdown,
            backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 10,
            padding: '6px', display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {(['present', 'absent', 'late', 'not_expected'] as const).map(s => {
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

      {/* ── Choix d'un partenaire ── */}
      {showGuestPick && (
        <Modal maxWidth={420} scrollOverlay={false} style={{ padding: 20 }} onClose={() => setShowGuestPick(false)} closeOnBackdropClick>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 6px', fontSize: '0.98rem' }}>Inviter un joueur</h3>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 14px', lineHeight: 1.5 }}>
            Un partenaire d'entraînement occupe le terrain et peut porter un RPE, qui compte dans
            sa charge à lui. Il n'entre dans aucune statistique de cette équipe.
          </p>
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {invitable.map(p => (
              <button key={p.id} onClick={() => { setGuestIds(prev => [...prev, p.id]); setShowGuestPick(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', textAlign: 'left',
                  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6,
                  color: '#F1F5F9', cursor: 'pointer', fontSize: '0.84rem',
                }}>
                {playerNameFull(p)}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Confirmation retrait d'un partenaire ── */}
      {confirmGuest && (
        <Modal maxWidth={380} scrollOverlay={false} style={{ padding: 24 }} onClose={() => setConfirmGuest(null)}>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Retirer {playerNameFull(confirmGuest)} ?</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.84rem', margin: '0 0 16px', lineHeight: 1.5 }}>
            Ses pointages sur les séances affichées seront effacés. Ses RPE déjà saisis restent
            dans sa charge.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmGuest(null)}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={() => removeGuest(confirmGuest.id)} className="btn-danger"
              style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
              Retirer
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal confirmation suppression séance ── */}
      {confirmDeleteSession && (
        <Modal maxWidth={380} scrollOverlay={false} style={{ padding: '28px' }} onClose={() => setConfirmDeleteSession(null)}>
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
              className="btn-danger"
              style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal nouvelle séance ── */}
      {showAddForm && (
        <Modal maxWidth={480} scrollOverlay={false} style={{ padding: '28px' }} onClose={closeAddForm}>
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
                              {DAYS_MONDAY_FIRST.map(d => (
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
        </Modal>
      )}
    </div>
  );
}
