import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { X, AlertCircle, Check, Minus } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { Modal, DropzoneEmptyState, EmptyState, AddButton, CategoryBadge } from '../components';
import { rpeApi } from '../api/rpe';
import { sessionBlocksApi } from '../api/sessionBlocks';
import { playersApi, teamCategoriesApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { MONTHS_FULL, DAYS_FULL, DAYS_ABBR3, DAYS_MONDAY_FIRST } from '../utils/dateFormat';
import { roundedAvg } from '../utils/avg';
import { estimatedSessionRpe } from '../utils/rpe';
import type { TrainingSession, Player, TeamCategory, TrainingAttendance } from '../data/types';

type AttendanceStatus = TrainingAttendance['status'];
/** Statut par défaut proposé à la création — un choix global pour tout l'effectif, pas un
 *  réglage par joueur : c'est la présence attendue par défaut, pas un pointage détaillé. */
type DefaultAttendanceStatus = Extract<AttendanceStatus, 'present' | 'not_expected'>;

const DEFAULT_STATUS_CFG: Record<DefaultAttendanceStatus, { label: string; color: string; bg: string; Icon: typeof Check }> = {
  present:      { label: 'Présent',    color: '#00E5A0', bg: 'rgba(0,229,160,0.15)',   Icon: Check },
  not_expected: { label: 'Non attendu', color: '#64748B', bg: 'rgba(100,116,139,0.15)', Icon: Minus },
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dow:        DAYS_ABBR3[d.getDay()],
    dowFull:    DAYS_FULL[d.getDay()],
    day:        d.getDate(),
    dayPad:     String(d.getDate()).padStart(2, '0'),
    month:      MONTHS_FULL[d.getMonth()].slice(0, 3),
    monthFull:  MONTHS_FULL[d.getMonth()],
    monthKey:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`,
  };
}

/** Date du jour au format ISO, en heure locale — même source que le champ date du formulaire.
 *  `toISOString()` donnerait la veille en soirée, et une séance créée pour aujourd'hui
 *  basculerait aussitôt dans « Passées ». */
const todayStr = () => new Date().toLocaleDateString('sv');

export default function TrainingSessionsPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate = useNavigate();

  const [sessions,         setSessions]         = useState<TrainingSession[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, { present: number; absent: number; late: number }>>({});
  const [rpeAvg,           setRpeAvg]           = useState<Record<string, number>>({});
  const [rpeEst,           setRpeEst]           = useState<Record<string, number>>({});
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');

  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const [showAdd,    setShowAdd]    = useState(false);
  const [addTab,     setAddTab]     = useState<'unique' | 'recurrente'>('unique');
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState('');
  const [addForm,    setAddForm]    = useState({ date: new Date().toLocaleDateString('sv'), categoryId: '', duration: '90', notes: '' });
  /** Statut par défaut appliqué à tout l'effectif à la création — les partenaires suivent leur
   *  propre règle (non attendu par défaut) et ne sont pas concernés par ce réglage. */
  const [addDefaultStatus, setAddDefaultStatus] = useState<DefaultAttendanceStatus>('present');

  function openAddForm() {
    setAddDefaultStatus('present');
    setShowAdd(true);
  }
  const [recForm,    setRecForm]    = useState({ days: [] as number[], startDate: new Date().toLocaleDateString('sv'), endDate: '', categoryId: '', duration: '90', notes: '' });
  const [recSaving,  setRecSaving]  = useState(false);
  const [recError,   setRecError]   = useState('');

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');
    setSessions([]);
    setAttendanceCounts({});
    setRpeAvg({});

    attendanceApi.listSessions(selected.team.id, selected.season.id)
      .then(async (sess) => {
        const sorted = [...sess].sort((a, b) => b.date.localeCompare(a.date));
        setSessions(sorted);
        if (!sorted.length) { setLoading(false); return; }

        const ids = sorted.map(s => s.id);
        const [attendance, rpeEntries, blocks] = await Promise.all([
          attendanceApi.listAttendance(ids),
          rpeApi.listBySessions(ids),
          sessionBlocksApi.listBySessions(ids),
        ]);

        // Présents et retards comptent tout le monde, partenaires d'entraînement compris :
        // ce sont des nombres de personnes, pas des taux. Un partenaire qui ne vient pas n'est
        // en revanche pas une absence — il n'était pas attendu. Un joueur marqué « non
        // attendu » ne l'est pas davantage : la colonne compte les manquements, pas les absences.
        const counts: Record<string, { present: number; absent: number; late: number }> = {};
        for (const a of attendance) {
          if (a.status === 'not_expected') continue;
          if (a.sparring && a.status === 'absent') continue;
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
          avgs[sid] = roundedAvg(vals) ?? 0;
        }
        setRpeAvg(avgs);

        const blocksBySession: Record<string, typeof blocks> = {};
        for (const b of blocks) {
          if (!blocksBySession[b.sessionId]) blocksBySession[b.sessionId] = [];
          blocksBySession[b.sessionId].push(b);
        }
        const ests: Record<string, number> = {};
        for (const [sid, blks] of Object.entries(blocksBySession)) {
          const est = estimatedSessionRpe(blks);
          if (est !== null) ests[sid] = est;
        }
        setRpeEst(ests);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id).then(setPlayers).catch(() => {});
  }, [selected?.season.id]);

  // Les catégories de séance sont propres à l'équipe. La première de la liste sert de valeur
  // par défaut aux formulaires : c'est l'ordre que le coach a réglé en configuration, pas une
  // valeur en dur — il n'y a plus de « training » garanti.
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

  // Une séance du jour reste à faire tant que la journée n'est pas finie : « À venir » part
  // d'aujourd'hui inclus. L'ordre s'inverse d'un onglet à l'autre — à venir, on lit la
  // prochaine en premier ; passées, la plus récente. `sessions` est trié décroissant, donc
  // seule la première liste se retourne.
  const today    = todayStr();
  const upcoming = sessions.filter(s => s.date >= today).reverse();
  const past     = sessions.filter(s => s.date <  today);

  // Saison terminée : plutôt qu'un onglet « À venir » vide, on ouvre sur l'historique. Le
  // choix reste celui de l'utilisateur dès qu'il clique — on ne corrige que le défaut.
  const activeTab = tab === 'upcoming' && upcoming.length === 0 && past.length > 0 ? 'past' : tab;
  const visible   = activeTab === 'upcoming' ? upcoming : past;

  // Group by month
  const grouped: { monthLabel: string; sessions: TrainingSession[] }[] = [];
  const seenMonths = new Set<string>();
  for (const s of visible) {
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
      const final = await attendanceApi.createSession({
        teamId:     selected.team.id,
        seasonId:   selected.season.id,
        date:       addForm.date,
        duration:   parseInt(addForm.duration),
        notes:      addForm.notes || undefined,
        categoryId: addForm.categoryId || undefined,
      });
      if (players.length) {
        await attendanceApi.bulkSetStatus(players.map(p => ({ sessionId: final.id, playerId: p.id })), addDefaultStatus);
      }
      setSessions(prev => [final, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setAttendanceCounts(prev => ({
        ...prev,
        [final.id]: addDefaultStatus === 'present'
          ? { present: players.length, absent: 0, late: 0 }
          : { present: 0, absent: 0, late: 0 },
      }));
      setShowAdd(false);
      setAddForm({ date: new Date().toLocaleDateString('sv'), categoryId: categories[0]?.id ?? '', duration: '90', notes: '' });
      setAddDefaultStatus('present');
      navigate(`/seances/${final.id}`);
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
        attendanceApi.createSession({ teamId: selected.team.id, seasonId: selected.season.id, date, duration: dur, notes: notes || undefined, categoryId: recForm.categoryId || undefined })
      ));
      if (players.length) {
        const entries = created.flatMap(s => players.map(p => ({ sessionId: s.id, playerId: p.id })));
        await attendanceApi.bulkSetStatus(entries, addDefaultStatus);
      }
      setSessions(prev => [...created, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setAttendanceCounts(prev => {
        const next = { ...prev };
        created.forEach(s => {
          next[s.id] = addDefaultStatus === 'present'
            ? { present: players.length, absent: 0, late: 0 }
            : { present: 0, absent: 0, late: 0 };
        });
        return next;
      });
      setShowAdd(false);
      setAddDefaultStatus('present');
      setRecForm({ days: [], startDate: new Date().toLocaleDateString('sv'), endDate: '', categoryId: categories[0]?.id ?? '', duration: '90', notes: '' });
      // Création en lot depuis l'historique : sans ça, les séances créées n'apparaissent nulle
      // part à l'écran. La séance unique, elle, ouvre directement sa fiche.
      if (dates.some(d => d.date >= todayStr())) setTab('upcoming');
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setRecSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Séances</h1>
        {selected && canEditTeamData && (
          <AddButton label="Ajouter une séance" onClick={openAddForm} />
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
        canEditTeamData ? (
          <DropzoneEmptyState label="Cliquer pour ajouter une séance" onClick={openAddForm} />
        ) : (
          <EmptyState message="Aucune séance. Seuls les rôles Admin et Éditeur peuvent en créer." size="lg" />
        )
      ) : (
        <>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#1E2229', borderRadius: 8, padding: 4, marginBottom: 14, maxWidth: 320 }}>
          {([['upcoming', 'À venir'], ['past', 'Passées']] as const).map(([key, label]) => {
            const isActive = activeTab === key;
            const count    = key === 'upcoming' ? upcoming.length : past.length;
            return (
              <button key={key} type="button" onClick={() => setTab(key)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                  backgroundColor: isActive ? '#2A2F3A' : 'transparent',
                  color: isActive ? '#F1F5F9' : '#475569' }}>
                {label} <span style={{ color: isActive ? '#94A3B8' : '#334155', fontWeight: 700 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            message={activeTab === 'upcoming' ? 'Aucune séance à venir.' : 'Aucune séance passée.'}
            size="lg" />
        ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Présents</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absents</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Retards</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Durée</th>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  <span className="hidden sm:inline">RPE estimé / réel</span>
                  <span className="sm:hidden">RPE</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <React.Fragment key={group.monthLabel}>
                  <tr>
                    <td colSpan={7} className="px-3 sm:px-5" style={{ paddingTop: 8, paddingBottom: 8, backgroundColor: '#0D0F14', borderBottom: '1px solid #1E2229', borderTop: '1px solid #2A2F3A', verticalAlign: 'middle' }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.monthLabel}</span>
                    </td>
                  </tr>
                  {group.sessions.map((session, idx) => {
                    const { dow, dayPad, monthFull } = fmtDate(session.date);
                    const counts   = attendanceCounts[session.id];
                    const avg      = rpeAvg[session.id];
                    const est      = rpeEst[session.id];
                    const isLast   = idx === group.sessions.length - 1;
                    // La prochaine séance ouvre l'onglet « À venir » : c'est la ligne qu'on
                    // vient chercher, elle se signale sans qu'on ait à lire les dates.
                    const isNext   = activeTab === 'upcoming' && session === upcoming[0];
                    const isToday  = session.date === today;
                    const rowBg    = isNext ? 'rgba(0,229,160,0.05)' : 'transparent';

                    // Couleur de l'écart réel/estimé — sans rapport avec rpeColor() de utils/rpe.ts
                    // (qui colore une valeur RPE brute 1-10), volontairement renommée pour éviter la confusion.
                    let deltaColor = '#94A3B8';
                    if (avg !== undefined && est !== undefined && est > 0) {
                      const delta = (avg - est) / est;
                      if (delta > 0.25)       deltaColor = '#EF4444';
                      else if (delta > 0.10)  deltaColor = '#F59E0B';
                      else if (delta < -0.10) deltaColor = '#3B82F6';
                      else                    deltaColor = '#00E5A0';
                    }

                    return (
                      <tr
                        key={session.id}
                        onClick={() => navigate(`/seances/${session.id}`)}
                        style={{ borderBottom: isLast ? 'none' : '1px solid #1E2229', cursor: 'pointer', backgroundColor: rowBg }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1E26'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = rowBg; }}
                      >
                        <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>{dow} </span>
                          <span style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700 }}>{dayPad} </span>
                          <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{monthFull}</span>
                          {isNext && (
                            <span style={{
                              marginLeft: 8, padding: '2px 7px', borderRadius: 4, fontSize: '0.66rem', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                              color: isToday ? '#F59E0B' : '#00E5A0',
                              backgroundColor: isToday ? 'rgba(245,158,11,0.12)' : 'rgba(0,229,160,0.12)',
                            }}>
                              {isToday ? "Aujourd'hui" : 'Prochaine'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12 }}>
                          <CategoryBadge name={session.categoryName} color={session.categoryColor}
                            style={{ fontSize: '0.71rem' }} />
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'center' }}>
                          <span style={{ color: counts?.present ? '#00E5A0' : '#334155', fontSize: '0.88rem', fontWeight: 700 }}>
                            {counts?.present ?? '—'}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'center' }}>
                          <span style={{ color: counts?.absent ? '#EF4444' : '#334155', fontSize: '0.88rem', fontWeight: 700 }}>
                            {counts?.absent ?? '—'}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, textAlign: 'center' }}>
                          <span style={{ color: counts?.late ? '#F59E0B' : '#334155', fontSize: '0.88rem', fontWeight: 700 }}>
                            {counts?.late ?? '—'}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, color: '#94A3B8', fontSize: '0.82rem' }}>
                          {session.plannedDuration} min
                        </td>
                        <td className="pl-3 pr-2.5 sm:pl-5 sm:pr-4" style={{ paddingTop: 12, paddingBottom: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#475569', fontSize: '0.82rem' }}>
                                {est !== undefined ? est.toFixed(1) : '—'}
                              </span>
                              <span style={{ color: '#334155', fontSize: '0.75rem' }}>→</span>
                              <span style={{ color: avg !== undefined ? deltaColor : '#334155', fontSize: '0.88rem', fontWeight: 700 }}>
                                {avg !== undefined ? avg.toFixed(1) : '—'}
                              </span>
                              {avg !== undefined && est !== undefined && est > 0 && (
                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: deltaColor, flexShrink: 0, display: 'inline-block' }} />
                              )}
                            </div>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}

      {/* Modal nouvelle séance */}
      {showAdd && (
        <Modal onClose={() => { setShowAdd(false); setAddError(''); setRecError(''); }} closeOnBackdropClick maxWidth={440} overlayOpacity={0.7} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Ajouter une séance</h2>
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
              <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <button type="button" onClick={() => { setShowAdd(false); setRecError(''); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
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
