import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { X, Check, Clock, Minus, AlertCircle } from 'lucide-react';
import { EmptyState, Modal, DropzoneEmptyState, AddButton } from '../components';
import { attendanceApi, playersApi, rpeApi, teamCategoriesApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { MONTHS_ABBR3, DAYS_ABBR3, DAYS_FULL, DAYS_MONDAY_FIRST } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { Player, TrainingSession, TrainingAttendance, TeamCategory } from '../data/types';
import { LAYER } from '../styles/layers';

type AttendanceStatus = TrainingAttendance['status'];

const STATUS = {
  present:      { label: 'Présent',     color: '#00E5A0', bg: 'rgba(0,229,160,0.15)',   Icon: Check  },
  absent:       { label: 'Absent',      color: '#EF4444', bg: 'rgba(239,68,68,0.15)',   Icon: X      },
  late:         { label: 'Retard',      color: '#F59E0B', bg: 'rgba(245,158,11,0.15)',  Icon: Clock  },
  // Gris volontaire : « non attendu » n'est pas un degré entre présent et absent, c'est une
  // ligne hors calcul. La couleur ne doit pas le ranger sur la même échelle.
  // Libellé raccourci (vs. « Non attendu » ailleurs) : les 4 boutons du popover partagent la
  // même largeur, sur une seule ligne — le texte le plus long dicte celle des trois autres.
  not_expected: { label: 'Non prévu', color: '#64748B', bg: 'rgba(100,116,139,0.15)', Icon: Minus  },
} as const;

/** Statut par défaut proposé à la création — un choix global pour tout l'effectif, pas un
 *  réglage par joueur : c'est la présence attendue par défaut, pas un pointage détaillé. */
type DefaultAttendanceStatus = Extract<AttendanceStatus, 'present' | 'not_expected'>;

const DEFAULT_STATUS_CFG: Record<DefaultAttendanceStatus, { label: string; color: string; bg: string; Icon: typeof Check }> = {
  present:      { label: 'Présent',    color: '#00E5A0', bg: 'rgba(0,229,160,0.15)',   Icon: Check },
  not_expected: { label: 'Non attendu', color: '#64748B', bg: 'rgba(100,116,139,0.15)', Icon: Minus },
};

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
const CELL_W = 44;

export default function AttendancePage() {
  const navigate = useNavigate();
  const { selected, canEditTeamData } = useTeamSeason();
  const popoverRef        = useRef<HTMLDivElement>(null);

  const [players,       setPlayers]       = useState<Player[]>([]);
  const [sessions,      setSessions]      = useState<TrainingSession[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [rpeMap,        setRpeMap]        = useState<Record<string, number>>({});
  const [categories,    setCategories]    = useState<TeamCategory[]>([]);
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

  // ── Modale d'ajout de séance — mêmes champs/comportement que celle de la page Séances
  // (TrainingSessionsPage) : c'est la référence, les deux doivent rester identiques.
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTab,      setAddTab]      = useState<'unique' | 'recurrente'>('unique');
  const [addSaving,   setAddSaving]   = useState(false);
  const [addError,    setAddError]    = useState('');
  const [addForm,     setAddForm]     = useState({ date: TODAY, categoryId: '', duration: '90', notes: '' });
  /** Statut par défaut appliqué à tout l'effectif à la création — les partenaires suivent leur
   *  propre règle (non attendu par défaut) et ne sont pas concernés par ce réglage. */
  const [addDefaultStatus, setAddDefaultStatus] = useState<DefaultAttendanceStatus>('present');

  const [recForm,    setRecForm]    = useState({ days: [] as number[], startDate: TODAY, endDate: '', categoryId: '', duration: '90', notes: '' });
  const [recSaving,  setRecSaving]  = useState(false);
  const [recError,   setRecError]   = useState('');

  function openAddForm() {
    setAddDefaultStatus('present');
    setShowAddForm(true);
  }

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');

    const { team, season } = selected;

    const playersPromise = playersApi.listBySeason(season.id);
    const sessionsPromise = attendanceApi.listSessions(team.id, season.id);
    // La RLS des joueurs est cadrée par organisation : cette liste est déjà celle du club.
    // Départs compris — un partenaire déjà pointé sur une séance passée doit garder son nom
    // résolu ici (cf. `guests`) ; c'est `invitable`, plus bas, qui exclut les joueurs partis
    // du vivier proposé pour un NOUVEL invité.
    const orgPromise = playersApi.list({ includeLeft: true });

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

  // Catégories de séance de l'équipe — mêmes source et défaut que TrainingSessionsPage.
  useEffect(() => {
    if (!selected) { setCategories([]); return; }
    teamCategoriesApi.list(selected.team.id, 'session')
      .then(list => {
        setCategories(list);
        const first = list[0]?.id ?? '';
        setAddForm(f => f.categoryId ? f : { ...f, categoryId: first });
        setRecForm(f => f.categoryId ? f : { ...f, categoryId: first });
      })
      .catch(() => setCategories([]));
  }, [selected?.team.id]);

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
    const popW = 272;
    const x = Math.max(8, Math.min(rect.left + rect.width / 2 - popW / 2, window.innerWidth - popW - 8));
    // Estimation de la hauteur du popover (mesurer le DOM demanderait un premier rendu hors
    // écran) : en cellule basse, il n'y a pas la place en dessous, on l'ouvre au-dessus.
    const popH = 82;
    const openAbove = rect.bottom + 6 + popH > window.innerHeight;
    const y = openAbove ? Math.max(8, rect.top - popH - 6) : rect.bottom + 6;
    setActiveCell({ sessionId, playerId, x, y });
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
    if (!selected) return;
    setAddSaving(true);
    setAddError('');
    try {
      const created = await attendanceApi.createSession({
        teamId:     selected.team.id,
        seasonId:   selected.season.id,
        date:       addForm.date,
        duration:   parseInt(addForm.duration),
        notes:      addForm.notes || undefined,
        categoryId: addForm.categoryId || undefined,
      });
      if (players.length) {
        await attendanceApi.bulkSetStatus(players.map(p => ({ sessionId: created.id, playerId: p.id })), addDefaultStatus);
        setAttendanceMap(prev => {
          const next = { ...prev };
          players.forEach(p => { next[`${created.id}:${p.id}`] = addDefaultStatus; });
          return next;
        });
      }
      // Un partenaire déjà invité sur la grille part sur « non prévu » — à la coche de le
      // pointer présent, plutôt que de laisser une case vide à corriger séance par séance.
      if (guests.length) {
        await attendanceApi.bulkSetStatus(guests.map(g => ({ sessionId: created.id, playerId: g.id })), 'not_expected', true);
        setAttendanceMap(prev => {
          const next = { ...prev };
          guests.forEach(g => { next[`${created.id}:${g.id}`] = 'not_expected'; });
          return next;
        });
      }
      setSessions(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      closeAddForm();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setAddSaving(false);
    }
  }

  /** Invités, dans l'ordre de la liste du club — jamais un joueur de l'effectif. */
  const guests = orgPlayers.filter(p => guestIds.includes(p.id) && !players.some(r => r.id === p.id));
  const invitable = orgPlayers.filter(p => !players.some(r => r.id === p.id) && !guestIds.includes(p.id) && !p.leftDate);

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
    setRecError('');
    setAddTab('unique');
    setAddForm({ date: TODAY, categoryId: categories[0]?.id ?? '', duration: '90', notes: '' });
    setAddDefaultStatus('present');
    setRecForm({ days: [], startDate: TODAY, endDate: '', categoryId: categories[0]?.id ?? '', duration: '90', notes: '' });
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
        attendanceApi.createSession({ teamId: selected.team.id, seasonId: selected.season.id, date, duration: dur, notes: notes || undefined, categoryId: recForm.categoryId || undefined })
      ));
      if (players.length) {
        const entries = created.flatMap(s => players.map(p => ({ sessionId: s.id, playerId: p.id })));
        await attendanceApi.bulkSetStatus(entries, addDefaultStatus);
        setAttendanceMap(prev => {
          const next = { ...prev };
          created.forEach(s => { players.forEach(p => { next[`${s.id}:${p.id}`] = addDefaultStatus; }); });
          return next;
        });
      }
      if (guests.length) {
        const guestEntries = created.flatMap(s => guests.map(g => ({ sessionId: s.id, playerId: g.id })));
        await attendanceApi.bulkSetStatus(guestEntries, 'not_expected', true);
        setAttendanceMap(prev => {
          const next = { ...prev };
          created.forEach(s => { guests.forEach(g => { next[`${s.id}:${g.id}`] = 'not_expected'; }); });
          return next;
        });
      }
      setSessions(prev => [...prev, ...created].sort((a, b) => a.date.localeCompare(b.date)));
      closeAddForm();
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setRecSaving(false);
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
          <AddButton label="Ajouter une séance" onClick={openAddForm} />
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
          <DropzoneEmptyState label="Cliquer pour ajouter une séance" onClick={openAddForm} />
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
                      <div
                        onClick={() => navigate(`/seances/${s.id}`)}
                        title="Ouvrir la séance"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', borderRadius: 6, padding: '2px 4px', margin: '-2px -4px' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1E2229')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{fd.dow}</span>
                        <span style={{ color: isToday ? '#F59E0B' : '#F1F5F9', fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{fd.day}</span>
                        <span style={{ color: '#94A3B8', fontSize: '0.65rem', fontWeight: 600 }}>{fd.month}</span>
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
            padding: '6px', display: 'flex', gap: 4,
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
                  padding: '8px 4px', boxSizing: 'border-box',
                  background: isActive ? cfg.bg : 'none',
                  border: `1px solid ${isActive ? cfg.color : '#2A2F3A'}`,
                  borderRadius: 8, cursor: 'pointer', width: 62, flexShrink: 0,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = '#252B36'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                <cfg.Icon size={18} style={{ color: cfg.color }} />
                <span style={{ color: isActive ? cfg.color : '#94A3B8', fontSize: '0.64rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{cfg.label}</span>
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

      {/* ── Modal nouvelle séance — identique à celle de la page Séances (TrainingSessionsPage,
          référence) ── */}
      {showAddForm && (
        <Modal onClose={closeAddForm} closeOnBackdropClick maxWidth={440} overlayOpacity={0.7} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Ajouter une séance</h2>
            <button onClick={closeAddForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
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

          {/* Statut par défaut de l'effectif — partagé entre les deux onglets, un seul choix
              pour tout le monde, pas un réglage par joueur. Les partenaires ne sont pas
              concernés : ils suivent leur propre règle (non attendu par défaut). */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>
              Présences par défaut
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['present', 'not_expected'] as const).map(s => {
                const cfg = DEFAULT_STATUS_CFG[s];
                const active = addDefaultStatus === s;
                return (
                  <button key={s} type="button" onClick={() => setAddDefaultStatus(s)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                      border: `1px solid ${active ? cfg.color : '#2A2F3A'}`,
                      backgroundColor: active ? cfg.bg : '#1E2229',
                      color: active ? cfg.color : '#94A3B8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      fontSize: '0.8rem', fontWeight: active ? 700 : 500,
                    }}>
                    <cfg.Icon size={13} /> {cfg.label}
                  </button>
                );
              })}
            </div>
            <p style={{ color: '#475569', fontSize: '0.7rem', margin: '4px 0 0' }}>
              S'applique à tout l'effectif — les partenaires ne sont pas concernés.
            </p>
          </div>

          {addTab === 'unique' ? (
            <>
              {addError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                  <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{addError}</span>
                </div>
              )}
              <form onSubmit={handleAddSession} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
                    <input type="date" required value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Catégorie</label>
                    <select value={addForm.categoryId} onChange={e => setAddForm(f => ({ ...f, categoryId: e.target.value }))} style={inputStyle}>
                      <option value="">Sans catégorie</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                  <button type="button" onClick={closeAddForm} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
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
                    {DAYS_MONDAY_FIRST.map(d => (
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
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Catégorie</label>
                  <select value={recForm.categoryId} onChange={e => setRecForm(f => ({ ...f, categoryId: e.target.value }))} style={inputStyle}>
                    <option value="">Sans catégorie</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
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
                  <button type="button" onClick={closeAddForm} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                  <button type="submit" disabled={recSaving} style={{ flex: 1, padding: '10px', backgroundColor: recSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: recSaving ? '#475569' : '#0D0F14', cursor: recSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                    {recSaving ? 'Création…' : 'Créer tout'}
                  </button>
                </div>
              </form>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
