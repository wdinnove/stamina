import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { getWeekTier } from '../utils/weeklyLoad';
import { rpeColor, rpeLabel, computeAcwr, acwrZone, computeTsb, tsbZone, SESSION_TYPES } from '../utils/rpe';
import { roundedAvg } from '../utils/avg';
import { EMPTY_TEAM_AVERAGE } from '../utils/teamAverage';
import type { LoadEntry } from '../utils/rpe';
import { fmtDate, fmtDateShort, fmtDateWithDay } from '../utils/dateFormat';
import { fmt1 } from '../utils/format';
import {
  ComposedChart, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Save, Check, Zap, Activity, Users, Calendar, AlertTriangle, ListChecks } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi } from '../api/rpe';
import { notify } from '../api/notifications';
import { attendanceApi } from '../api';
import type { TrainingSession } from '../data/types';
import { StatusBadge, PlayerAvatar, PlayerSelect, RpeKpiCard, TeamRpeSub, ChargeRpeComboChart, TeamDisplayToggle, TeamSessionHistoryTable, RPEPlayerRankingTable, EmptyState, DateRangeCard, useDateRange, CardTitle, Modal, Badge, PlayerLoadPanel } from '../components';
import { FilterField, filterControlStyle } from '../components/FilterField';
import type { TeamDisplayMode } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import { playerNameFull } from '../utils/playerName';
import type { Player, RPEEntry, SessionType, TrainingAttendance } from '../data/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_TYPE_LABELS: Record<string, string> = Object.fromEntries(Object.entries(SESSION_TYPES).map(([k, v]) => [k, v.label]));
const SESSION_TYPE_COLORS: Record<string, string> = Object.fromEntries(Object.entries(SESSION_TYPES).map(([k, v]) => [k, v.color]));

function todayStr(): string {
  return new Date().toLocaleDateString('sv');
}

/** Nombre de jours entre la 1ère entrée et aujourd'hui (0 si aucune entrée) — sert à juger la fiabilité de l'ACWR/TSB */
function historySpanDays(entries: LoadEntry[]): number {
  if (!entries.length) return 0;
  const firstDate = [...entries.map(e => e.date)].sort()[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(firstDate + 'T00:00:00');
  return Math.floor((today.getTime() - first.getTime()) / 86400000) + 1;
}

const MIN_RELIABLE_HISTORY_DAYS = 28;

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number | null }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.filter(p => p.value !== null && p.value !== undefined).map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'collective' | 'individual' | 'team_history';

const TAB_SLUGS: Record<string, Tab> = {
  saisie:       'collective',
  joueur:       'individual',
  equipe:       'team_history',
};

export default function RPEPage() {
  const { selected, thresholds, loading: teamLoading, canEditTeamData } = useTeamSeason();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'collective';
  const setActiveTab = (t: Tab) => {
    if (t === 'individual') {
      const first = roster[0]?.id;
      navigate(first ? `/rpe/joueur/${first}` : '/rpe/joueur', { replace: true });
    } else if (t === 'team_history' && selected) {
      navigate(`/rpe/equipe/${selected.team.id}`, { replace: true });
    } else {
      navigate('/rpe/saisie', { replace: true });
    }
  };

  // ── Date range (onglets Historique joueur / Historique équipe)
  const dateRange = useDateRange(selected?.season.startDate, 45, selected?.season.endDate);

  // ── Roster
  const [roster, setRoster]               = useState<Player[]>([]);
  /** Joueurs du club hors effectif : un partenaire invité sur la séance en fait partie. */
  const [orgPlayers,   setOrgPlayers]     = useState<Player[]>([]);
  const [sessionAtt,   setSessionAtt]     = useState<TrainingAttendance[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // ── Collective tab state
  const _navState = (location.state as { sessionDate?: string; sessionType?: string; duration?: number; sessionId?: string } | null);
  const [sessionDate, setSessionDate]     = useState(_navState?.sessionDate ?? todayStr());
  const [sessionType, setSessionType]     = useState<SessionType>((_navState?.sessionType as SessionType) ?? 'training');
  const [duration, setDuration]           = useState(_navState?.duration ?? 90);
  const [rpeValues, setRpeValues]         = useState<Record<string, number | null>>({});
  const [existingSessionId, setExistingSessionId] = useState<string | null>(_navState?.sessionId ?? null);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [saveError, setSaveError]         = useState('');
  const [linkedSessions,       setLinkedSessions]       = useState<TrainingSession[]>([]);
  const [loadingLinkedSessions, setLoadingLinkedSessions] = useState(false);
  const [manualMode,          setManualMode]          = useState(false);
  const [showSessionPicker,   setShowSessionPicker]   = useState(false);
  const skipNextFindRef = useRef(false);

  // ── Individual tab state
  const selectedPlayerId = activeTab === 'individual' ? (urlId ?? null) : null;
  const setSelectedPlayerId = (id: string) => navigate(`/rpe/joueur/${id}`, { replace: true });
  const [history, setHistory]                   = useState<RPEEntry[]>([]);
  const [loadingHistory, setLoadingHistory]     = useState(false);
  const [historyVersion, setHistoryVersion]     = useState(0);
  const [indivDisplay, setIndivDisplay]         = useState<'chart' | 'table'>('chart');
  const [chargeView, setChargeView]             = useState<'session' | 'week'>('week');
  const [rpeView, setRpeView]                   = useState<'session' | 'week'>('week');
  const [teamChargeView, setTeamChargeView]     = useState<'session' | 'week'>('week');
  const [teamRpeView, setTeamRpeView]           = useState<'session' | 'week'>('week');
  const [teamComboView, setTeamComboView]       = useState<'session' | 'week'>('week');
  const [teamDisplay, setTeamDisplay]           = useState<TeamDisplayMode>('chart');

  // La liste du club sert à nommer les partenaires pointés sur la séance.
  useEffect(() => {
    playersApi.list().then(setOrgPlayers).catch(() => {});
  }, [selected?.team.id]);

  /**
   * Présences de la séance choisie : la saisie se limite aux joueurs qui étaient là.
   * Tant qu'aucune séance n'est choisie (saisie manuelle), il n'y a rien à filtrer.
   */
  useEffect(() => {
    if (!existingSessionId) { setSessionAtt([]); return; }
    attendanceApi.listAttendance([existingSessionId]).then(setSessionAtt).catch(() => setSessionAtt([]));
  }, [existingSessionId]);

  // ── Load roster when season changes
  useEffect(() => {
    if (!selected) { setRoster([]); return; }
    setLoadingRoster(true);
    playersApi.listBySeason(selected.season.id)
      .then(players => {
        setRoster(players);
        setRpeValues(Object.fromEntries(players.map(p => [p.id, null])));
        if (players.length > 0 && activeTab === 'individual') {
          if (!urlId) {
            navigate(`/rpe/joueur/${players[0].id}`, { replace: true });
          } else if (!players.some(p => p.id === urlId)) {
            // Le joueur dans l'URL n'appartient pas à l'équipe/saison sélectionnée.
            navigate('/', { replace: true });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRoster(false));
  }, [selected?.season.id]);

  // ── Load planned attendance sessions for the picker
  useEffect(() => {
    if (!selected || activeTab !== 'collective') return;
    setLoadingLinkedSessions(true);
    attendanceApi.listSessions(selected.team.id, selected.season.id)
      .then(sessions => setLinkedSessions([...sessions].sort((a, b) => b.date.localeCompare(a.date))))
      .catch(() => {})
      .finally(() => setLoadingLinkedSessions(false));
  }, [selected?.team.id, selected?.season.id, activeTab]);

  // ── Check existing session (collective tab)
  useEffect(() => {
    if (!selected) return;
    if (skipNextFindRef.current) { skipNextFindRef.current = false; return; }
    rpeApi.findSession(selected.team.id, selected.season.id, sessionDate)
      .then(async session => {
        if (session) {
          setExistingSessionId(session.id);
          setSessionType(session.sessionType);
          setDuration(session.plannedDuration);
          const existing = await rpeApi.loadEntriesForSession(session.id);
          setRpeValues(prev => Object.fromEntries(Object.keys(prev).map(id => [id, existing[id] ?? null])));
        } else {
          setExistingSessionId(null);
          setRpeValues(prev => Object.fromEntries(Object.keys(prev).map(id => [id, null])));
        }
      })
      .catch(() => {});
  }, [selected?.team.id, selected?.season.id, sessionDate]);

  // ── Load individual history
  useEffect(() => {
    if (!selectedPlayerId || !selected) return;
    setLoadingHistory(true);
    rpeApi.listPlayerHistory(selectedPlayerId)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [selectedPlayerId, selected?.season.id, historyVersion]);

  // ── Team history (chart, sessions, ranking, KPIs, moyennes saison, ACWR/TSB équipe)
  const {
    teamChartData, teamSessionRows, teamWeekRows, playerRanking, teamKpis,
    loadingTeamHistory, teamHistoryError,
    teamSeasonAvgRpe, teamSeasonAvgWeeklyLoad, teamPeriodAvgWeeklyLoad,
    teamAcwrAvg, teamFreshAvg, teamHistoryShort,
  } = useTeamRpeHistory(selected?.team.id, selected?.season.id, dateRange.from, dateRange.to, roster);

  /**
   * Joueurs à saisir. Sur une séance existante, ceux qui y étaient — effectif et partenaires
   * d'entraînement confondus, un partenaire ayant lui aussi une charge à porter.
   *
   * Le repli sur l'effectif complet quand aucune présence n'est pointée est délibéré : beaucoup
   * de séances n'ont pas d'appel, et une grille vide empêcherait purement et simplement de
   * saisir le RPE.
   */
  const gridPlayers = useMemo(() => {
    const present = new Set(
      sessionAtt.filter(a => a.status === 'present' || a.status === 'late').map(a => a.playerId),
    );
    if (present.size === 0) return roster;
    const guests = orgPlayers.filter(p => !roster.some(r => r.id === p.id));
    return [...roster, ...guests].filter(p => present.has(p.id));
  }, [roster, orgPlayers, sessionAtt]);

  const guestIds = useMemo(
    () => new Set(sessionAtt.filter(a => a.sparring).map(a => a.playerId)),
    [sessionAtt],
  );

  // ── Derived (collective tab)
  // Bornées à la grille : une valeur laissée par un joueur finalement absent ne doit pas
  // repartir à l'enregistrement.
  const activeEntries = Object.entries(rpeValues)
    .filter(([id, v]) => v !== null && gridPlayers.some(p => p.id === id)) as [string, number][];
  // Estimation à la saisie : une seule séance, une entrée par joueur — moyenne simple.
  const avgRpe        = roundedAvg(activeEntries.map(([, v]) => v)) ?? 0;
  const estimatedLoad = Math.round(avgRpe * duration);

  const selSession     = linkedSessions.find(s => s.id === existingSessionId) ?? null;
  const selDate        = selSession ? new Date(selSession.date + 'T12:00:00') : null;
  const selTypeColor   = selSession ? (SESSION_TYPE_COLORS as Record<string, string>)[selSession.sessionType as string] ?? '#94A3B8' : '#94A3B8';
  const MONTHS_RPE     = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const DAYS_RPE       = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const nextSession    = linkedSessions.filter(s => s.date >= todayStr()).at(-1) ?? null;

  const filtered     = history.filter(e =>
    (!dateRange.from || e.date >= dateRange.from) && (!dateRange.to || e.date <= dateRange.to)
  );
  const chartData    = [...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((e: RPEEntry) => ({
    date:  fmtDate(e.date),
    rpe:   e.rpe,
    load:  Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
  }));
  const lastRPE      = filtered.length ? [...filtered].sort((a: RPEEntry, b: RPEEntry) => b.date.localeCompare(a.date))[0] : undefined;
  const totalLoad    = filtered.reduce((s: number, e: RPEEntry) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);

  // ── Team saison derived values
  // Agrégation hebdo (charge ramenée à l'effectif DISTINCT de la semaine, RPE selon la règle
  // d'équipe) fournie par useTeamRpeHistory — source unique partagée avec PerformanceCollective,
  // qui en avait une copie à l'identique.
  const teamWeeklyChargePerPlayerData = teamWeekRows.map(w => ({ date: fmtDateShort(w.week), load: w.load }));
  const teamWeeklyRpeData = teamWeekRows
    .filter(w => w.rpe.value !== null)
    .map(w => ({ date: fmtDateShort(w.week), rpe: w.rpe.value! }));
  // Charge hebdo moyenne de la période — règle d'équipe (une voix par joueur), calculée par le
  // hook sur les lignes brutes. Moyenner les valeurs hebdo ci-dessus donnerait une voix par
  // SEMAINE : un joueur actif 1 semaine sur 4 n'y pèserait qu'un quart.
  const avgWeeklyLoadTeam = teamPeriodAvgWeeklyLoad.value ?? 0;
  const tierTeam = getWeekTier(avgWeeklyLoadTeam, thresholds.lightMax, thresholds.normalMax);
  const teamShowSeasonDiff = dateRange.preset !== 'saison';
  const rpeAvgTeamPeriod = teamKpis && teamKpis.sessions > 0 ? teamKpis.avg : EMPTY_TEAM_AVERAGE;

  async function pickSession(session: TrainingSession) {
    skipNextFindRef.current = true;
    setManualMode(false);
    setShowSessionPicker(false);
    setSessionDate(session.date);
    setSessionType(session.sessionType as SessionType);
    setDuration(session.plannedDuration);
    setExistingSessionId(session.id);
    const existing = await rpeApi.loadEntriesForSession(session.id);
    setRpeValues(prev => Object.fromEntries(Object.keys(prev).map(id => [id, existing[id] ?? null])));
  }

  async function handleSave() {
    if (activeEntries.length === 0 || !selected) return;
    setSaving(true);
    setSaveError('');
    try {
      const savedSessionId = await rpeApi.saveSession({
        teamId:            selected.team.id,
        seasonId:          selected.season.id,
        date:              sessionDate,
        sessionType,
        plannedDuration:   duration,
        entries:           activeEntries.map(([playerId, rpe]) => ({ playerId, rpe })),
        existingSessionId: existingSessionId ?? undefined,
      });
      setSaved(true);
      setHistoryVersion(v => v + 1);
      setTimeout(() => setSaved(false), 2500);
      notify(selected?.team.id, 'rpe_added', `RPE saisi — ${activeEntries.length} joueur${activeEntries.length > 1 ? 's' : ''}`, { body: sessionDate, entityType: 'session', entityId: savedSessionId });
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  // ── Individual chart data
  const individualChartData = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20)
    .map((e, i) => ({
      i,
      date:   fmtDate(e.date),
      rpe:    e.rpe,
      charge: e.rpe * (e.actualDuration ?? e.plannedDuration),
      type:   e.sessionType,
    }));

  const tableData     = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const sessionLoadLight  = Math.round(thresholds.lightMax  / thresholds.sessionsPerWeek);
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);
  const selectedPlayer = roster.find(p => p.id === selectedPlayerId);

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Perception de l'Effort (RPE)</h1>
        <EmptyState message="Sélectionnez une équipe et une saison dans la barre du haut." size="lg" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>RPE</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['collective', 'individual', 'team_history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {tab === 'collective'
                ? <><span className="hidden sm:inline">Nouvelle saisie</span><span className="sm:hidden">Saisie</span></>
                : tab === 'individual'
                ? <><span className="hidden sm:inline">Historique joueur</span><span className="sm:hidden">Joueur</span></>
                : <><span className="hidden sm:inline">Historique équipe</span><span className="sm:hidden">Équipe</span></>}
            </button>
          ))}
        </div>
      </div>

      {/* ══ COLLECTIVE ═══════════════════════════════════════════════════════ */}
      {activeTab === 'collective' && (
        <div>

          {/* ── Modal sélecteur de séances ── */}
          {showSessionPicker && (
            <Modal onClose={() => setShowSessionPicker(false)} closeOnBackdropClick maxWidth={420} maxHeight="80vh" style={{ overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.9rem' }}>Choisir une séance</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => nextSession && pickSession(nextSession)}
                    disabled={!nextSession}
                    style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 4, color: nextSession?.id === existingSessionId ? '#00E5A0' : nextSession ? '#94A3B8' : '#334155', cursor: nextSession ? 'pointer' : 'default', fontSize: '0.68rem', padding: '2px 8px', fontWeight: 600, borderColor: nextSession?.id === existingSessionId ? '#00E5A040' : '#2A2F3A' }}
                  >
                    Aujourd'hui
                  </button>
                  <button
                    onClick={() => setShowSessionPicker(false)}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '0 2px', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F1F5F9'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                  >×</button>
                </div>
              </div>

              {/* List */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {loadingLinkedSessions ? (
                  <div>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{ padding: '13px 14px', borderBottom: '1px solid #1E2229', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 3, height: 32, backgroundColor: '#2A2F3A', borderRadius: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: 12, width: '60%', backgroundColor: '#2A2F3A', borderRadius: 3, marginBottom: 6 }} />
                          <div style={{ height: 10, width: '40%', backgroundColor: '#1E2229', borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : linkedSessions.length === 0 ? (
                  <EmptyState message="Aucune séance planifiée." />
                ) : (
                  linkedSessions.map((s, idx) => {
                    const d = new Date(s.date + 'T12:00:00');
                    const today = todayStr();
                    const isPast = s.date < today;
                    const day = d.getDate();
                    const month = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][d.getMonth()];
                    const dow = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()];
                    const typeColor = (SESSION_TYPE_COLORS as Record<string, string>)[s.sessionType as string] ?? '#94A3B8';
                    return (
                      <button
                        key={s.id}
                        onClick={() => pickSession(s)}
                        style={{
                          width: '100%', padding: '11px 14px', textAlign: 'left', cursor: 'pointer',
                          backgroundColor: s.id === existingSessionId ? '#1E2229' : 'transparent',
                          border: 'none',
                          borderBottom: idx < linkedSessions.length - 1 ? '1px solid #1E2229' : 'none',
                          display: 'flex', alignItems: 'center', gap: 10, opacity: isPast ? 0.6 : 1,
                          transition: 'background 0.12s',
                          boxShadow: s.id === existingSessionId ? 'inset 2px 0 0 #00E5A0' : 'none',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1E2229'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = s.id === existingSessionId ? '#1E2229' : 'transparent'; }}
                      >
                        <span style={{ width: 3, height: 32, backgroundColor: typeColor, borderRadius: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 600 }}>{dow} {day} {month}</div>
                          <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 1 }}>{s.notes ? s.notes + ' · ' : ''}{s.plannedDuration} min</div>
                        </div>
                        <span style={{ color: '#334155', fontSize: '0.7rem' }}>→</span>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #2A2F3A', flexShrink: 0 }}>
                <button
                  onClick={() => { setManualMode(true); setShowSessionPicker(false); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94A3B8'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                >
                  Saisie manuelle
                </button>
              </div>
            </Modal>
          )}

          {/* ── Colonne principale (info bar + grille) ── */}
          <div>

            {/* Info bar — session sélectionnée */}
            {existingSessionId && (
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ width: 4, height: 36, backgroundColor: selTypeColor, borderRadius: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {selSession && selDate ? (
                    <>
                      <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95rem' }}>
                        {DAYS_RPE[selDate.getDay()]} {selDate.getDate()} {MONTHS_RPE[selDate.getMonth()]}
                        {selSession.notes ? <span style={{ color: '#94A3B8', fontWeight: 400 }}> — {selSession.notes}</span> : null}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: 2 }}>
                        {SESSION_TYPE_LABELS[selSession.sessionType as string] ?? selSession.sessionType} · {selSession.plannedDuration} min
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Séance chargée</div>
                  )}
                </div>
                <button
                  onClick={() => setShowSessionPicker(true)}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.78rem', padding: '4px 8px', borderRadius: 4, flexShrink: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F1F5F9'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569'; }}
                >
                  Changer
                </button>
                <div style={{ width: '100%', borderTop: '1px solid #2A2F3A', paddingTop: 10, marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charge estimée</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ color: '#00E5A0', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(avgRpe)}</span>
                    <span style={{ color: '#475569' }}>× {duration} =</span>
                    <span style={{ color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{estimatedLoad} UA</span>
                  </span>
                </div>
              </div>
            )}

            {/* Info bar — mode manuel */}
            {manualMode && (
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Date</p>
                  <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)}
                    style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }} />
                </div>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type</p>
                  <select value={sessionType} onChange={e => setSessionType(e.target.value as SessionType)}
                    style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
                    <option value="training">Entraînement</option>
                    <option value="match">Match</option>
                    <option value="gym">Gym</option>
                    <option value="rest">Repos</option>
                  </select>
                </div>
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Durée</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" value={duration} min={1} max={300} onChange={e => setDuration(Number(e.target.value))}
                      style={{ width: 64, padding: '5px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                    <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>min</span>
                  </div>
                </div>
                <button
                  onClick={() => { setManualMode(false); setShowSessionPicker(true); }}
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.78rem', marginLeft: 'auto' }}
                >
                  ← Retour à la liste
                </button>
                <div style={{ width: '100%', borderTop: '1px solid #2A2F3A', paddingTop: 10, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charge estimée</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ color: '#00E5A0', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(avgRpe)}</span>
                    <span style={{ color: '#475569' }}>× {duration} =</span>
                    <span style={{ color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{estimatedLoad} UA</span>
                  </span>
                </div>
              </div>
            )}

            {/* Placeholder quand rien n'est sélectionné et pas en mode manuel */}
            {!existingSessionId && !manualMode && (
              <div style={{ marginBottom: 16, textAlign: 'center', padding: '56px 16px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>Aucune séance sélectionnée.</p>
                <button
                  onClick={() => setShowSessionPicker(true)}
                  style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Calendar size={15} /> Sélectionner une séance
                </button>
              </div>
            )}

            {(existingSessionId || manualMode) && (
              loadingRoster ? (
                <EmptyState message="Chargement de l'effectif…" />
              ) : gridPlayers.length === 0 ? (
                <EmptyState message="Aucun joueur dans l'effectif pour cette saison." />
              ) : (
                <>
                  <style>{`
                    @media (max-width: 1023px) {
                      .rpe-row { flex-wrap: wrap !important; padding: 10px 12px !important; }
                      .rpe-player-col { width: auto !important; flex: 1 !important; order: 1 !important; }
                      .rpe-value-col { order: 2 !important; }
                      .rpe-buttons { width: 100% !important; flex: none !important; margin-top: 6px !important; order: 3 !important; }
                      .rpe-buttons > button { flex: 1 !important; }
                    }
                  `}</style>
                  <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', display: 'flex', gap: 12 }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 280, flexShrink: 0 }}>Joueur</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>RPE</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 130, textAlign: 'right', flexShrink: 0 }}>Valeur</span>
                    </div>
                    {gridPlayers.map(player => {
                      const val = rpeValues[player.id] ?? null;
                      const rpeBtn = (v: number) => (
                        <button key={v}
                          onClick={() => setRpeValues(prev => ({ ...prev, [player.id]: prev[player.id] === v ? null : v }))}
                          style={{ height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColor(v) : '#2A2F3A', backgroundColor: val === v ? rpeColor(v) + '22' : 'transparent', color: val === v ? rpeColor(v) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}>
                          {v}
                        </button>
                      );
                      return (
                        <div key={player.id} className="rpe-row" style={{ borderBottom: '1px solid #1E2229', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <div className="rpe-player-col" style={{ display: 'flex', alignItems: 'center', gap: 8, width: 280, flexShrink: 0 }}>
                            <PlayerAvatar player={player} size={26} />
                            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerNameFull(player)}</span>
                              {guestIds.has(player.id)
                                ? <span title="Partenaire d'entraînement — hors effectif"
                                    style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.12)', fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                                    Partenaire
                                  </span>
                                : <StatusBadge status={player.status} size="sm" />}
                            </div>
                          </div>
                          <div className="rpe-buttons" style={{ flex: 1, display: 'flex', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                              <button key={v} disabled={!canEditTeamData}
                                onClick={() => setRpeValues(prev => ({ ...prev, [player.id]: prev[player.id] === v ? null : v }))}
                                style={{ flex: 1, height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColor(v) : '#2A2F3A', backgroundColor: val === v ? rpeColor(v) + '22' : 'transparent', color: val === v ? rpeColor(v) : '#94A3B8', cursor: canEditTeamData ? 'pointer' : 'not-allowed', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s', opacity: canEditTeamData ? 1 : 0.5 }}>
                                {v}
                              </button>
                            ))}
                          </div>
                          <div className="rpe-value-col" style={{ width: 130, textAlign: 'right', flexShrink: 0 }}>
                            {val !== null
                              ? <span style={{ color: rpeColor(val), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{val} — {rpeLabel(val)}</span>
                              : <span style={{ color: '#334155', fontSize: '0.78rem' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                    {saveError && <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{saveError}</span>}
                    {canEditTeamData && (
                    <button onClick={handleSave} disabled={activeEntries.length === 0 || saving}
                      style={{ padding: '10px 24px', backgroundColor: saved ? '#1E2229' : activeEntries.length === 0 ? '#1A1F27' : '#00E5A0', border: saved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: saved ? '#00E5A0' : activeEntries.length === 0 ? '#334155' : '#0D0F14', cursor: activeEntries.length === 0 || saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                      {saved ? <><Check size={15} /> Enregistré !</> : <><Save size={15} /> {saving ? 'Enregistrement…' : `Enregistrer (${activeEntries.length})`}</>}
                    </button>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* ══ INDIVIDUAL ══════════════════════════════════════════════════════ */}
      {activeTab === 'individual' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <PlayerSelect players={roster} value={selectedPlayerId ?? ''} onChange={setSelectedPlayerId} style={{ minWidth: 180 }} />
          </div>

          <DateRangeCard from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
            onPreset={p => dateRange.applyPreset(p, selected?.season.startDate, selected?.season.endDate)}
            onFrom={dateRange.setFrom} onTo={dateRange.setTo}
            extra={
              <FilterField legend="Affichage">
                <select value={indivDisplay} onChange={e => setIndivDisplay(e.target.value as 'chart' | 'table')} style={filterControlStyle}>
                  <option value="chart">Graphique</option>
                  <option value="table">Tableau</option>
                </select>
              </FilterField>
            } />

          {loadingHistory ? (
            <EmptyState message="Chargement…" />
          ) : history.length === 0 && selectedPlayerId ? (
            <EmptyState message={`Aucune donnée RPE pour ${selectedPlayer ? playerNameFull(selectedPlayer) : ''}.`} />
          ) : filtered.length === 0 && history.length > 0 ? (
            <EmptyState message="Aucune donnée RPE sur la période sélectionnée." />
          ) : history.length > 0 ? (
            <PlayerLoadPanel history={history} filtered={filtered} thresholds={thresholds} showSeasonDiff={dateRange.preset !== 'saison'} display={indivDisplay} onDisplayChange={setIndivDisplay} />
          ) : null}
        </div>
      )}

      {/* ══ TEAM HISTORY ════════════════════════════════════════════════════ */}
      {activeTab === 'team_history' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
              <Users size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />
              <div style={{ width: '100%', padding: '8px 12px 8px 32px', backgroundColor: '#1E2229', border: '1px solid #00E5A050', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>
                {selected?.team.name}
              </div>
            </div>
          </div>

          <DateRangeCard from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
            onPreset={p => dateRange.applyPreset(p, selected?.season.startDate, selected?.season.endDate)}
            onFrom={dateRange.setFrom} onTo={dateRange.setTo} />

          {loadingTeamHistory ? (
            <EmptyState message="Chargement…" />
          ) : teamHistoryError ? (
            <div style={{ backgroundColor: '#1E1215', border: '1px solid #EF444440', borderRadius: 8, padding: '20px 24px', color: '#EF4444', fontSize: '0.85rem' }}>
              Erreur lors du chargement : {teamHistoryError}
            </div>
          ) : !teamKpis || teamKpis.sessions === 0 ? (
            <EmptyState message="Aucune séance RPE enregistrée sur cette période." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* KPIs période — comparés à la moyenne saison */}
              {(() => {
                const arrow = (delta: number) => {
                  const c = delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#475569';
                  const sym = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
                  return <span style={{ color: c, fontSize: '0.85rem', marginLeft: 4, fontFamily: 'JetBrains Mono, monospace' }}>{sym}</span>;
                };
                const subSeason = (delta: number, unit = '') =>
                  <span style={{ color: '#475569', fontSize: '0.67rem' }}>
                    <span style={{ color: delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#94A3B8', fontWeight: 600 }}>
                      {delta > 0 ? '+' : ''}{delta}{unit}
                    </span>
                    {' '}vs saison
                  </span>;

                const chargeDelta = teamShowSeasonDiff && avgWeeklyLoadTeam > 0 && (teamSeasonAvgWeeklyLoad.value ?? 0) > 0
                  ? avgWeeklyLoadTeam - teamSeasonAvgWeeklyLoad.value! : null;
                const rpeDelta = teamShowSeasonDiff && teamSeasonAvgRpe.value !== null && rpeAvgTeamPeriod.value !== null
                  ? Math.round((rpeAvgTeamPeriod.value - teamSeasonAvgRpe.value) * 10) / 10 : null;

                // Semaines en surcharge sur la période — réutilise teamWeeklyChargePerPlayerData
                // (déjà calculé pour le graphique), même bucket hebdo que partout ailleurs.
                const totalWeeks = teamWeeklyChargePerPlayerData.length;
                const surchargeWeeks = teamWeeklyChargePerPlayerData.filter(d => d.load >= thresholds.normalMax).length;

                const teamZone  = acwrZone(teamAcwrAvg);
                const teamFresh = teamFreshAvg !== null ? tsbZone(teamFreshAvg) : null;
                const currentNote = <span style={{ color: '#475569', fontSize: '0.62rem' }}>· à ce jour</span>;
                const shortHistoryNote = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B22', color: '#F59E0B', fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}><AlertTriangle size={10} /> Période de reprise</span>;

                return (
                  <div className="grid grid-cols-2 lg:grid-cols-3" style={{ gap: 10 }}>
                    <RpeKpiCard
                      accent={tierTeam.color}
                      label="Charge moyenne par semaine"
                      value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span>{avgWeeklyLoadTeam > 0 ? avgWeeklyLoadTeam.toLocaleString('fr') : '—'}<span style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></span>
                        <Badge color={tierTeam.color} size="sm" label={tierTeam.label} style={{ fontSize: '0.62rem' }} />
                      </span>}
                      sub={chargeDelta !== null
                        ? <>{arrow(chargeDelta)}{' '}{subSeason(chargeDelta, ' UA')}</>
                        // Moyenne non pondérée : le n rend le chiffre interprétable.
                        : teamPeriodAvgWeeklyLoad.players > 0
                          ? `${teamPeriodAvgWeeklyLoad.players} joueur${teamPeriodAvgWeeklyLoad.players > 1 ? 's' : ''}`
                          : undefined}
                    />
                    <RpeKpiCard
                      accent={rpeAvgTeamPeriod.value !== null ? rpeColor(rpeAvgTeamPeriod.value) : '#334155'}
                      label="RPE moyen de la période"
                      value={fmt1(rpeAvgTeamPeriod.value)}
                      sub={rpeDelta !== null ? <>{arrow(rpeDelta)}{' '}{subSeason(rpeDelta)}</> : <TeamRpeSub avg={rpeAvgTeamPeriod} />}
                    />
                    <RpeKpiCard
                      accent={surchargeWeeks > 0 ? '#EF4444' : '#00E5A0'}
                      label="Semaines surcharge"
                      value={<><span style={{ color: surchargeWeeks > 0 ? '#EF4444' : '#00E5A0' }}>{surchargeWeeks}</span><span style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 400 }}> / {totalWeeks}</span></>}
                      valueColor="#F1F5F9"
                      sub={totalWeeks > 0 ? `${Math.round(surchargeWeeks / totalWeeks * 100)} % des semaines` : '—'}
                    />
                    <RpeKpiCard
                      accent="#3B82F6"
                      label="Séances"
                      value={teamKpis ? teamKpis.sessions : '—'}
                      valueColor="#F1F5F9"
                      sub="sur la période sélectionnée"
                    />
                    <RpeKpiCard
                      accent={teamZone ? teamZone.color : '#334155'}
                      label="Charge récente vs habituelle"
                      value={teamAcwrAvg !== null ? teamAcwrAvg.toFixed(2) : '—'}
                      sub={teamZone
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Badge color={teamZone.color} size="sm" label={teamZone.label} style={{ fontSize: '0.62rem' }} />
                            {currentNote}
                            {teamHistoryShort && shortHistoryNote}
                          </span>
                        : 'Historique insuffisant (28j)'}
                    />
                    <RpeKpiCard
                      accent={teamFresh ? teamFresh.color : '#334155'}
                      label="Fraîcheur moyenne"
                      value={teamFreshAvg !== null ? <>{teamFreshAvg > 0 ? '+' : ''}{teamFreshAvg.toFixed(1)}</> : '—'}
                      sub={teamFresh
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Badge color={teamFresh.color} size="sm" label={teamFresh.label} style={{ fontSize: '0.62rem' }} />
                            {currentNote}
                            {teamHistoryShort && shortHistoryNote}
                          </span>
                        : '—'}
                    />
                  </div>
                );
              })()}

              <TeamDisplayToggle value={teamDisplay} onChange={setTeamDisplay} />

              {/* Graphique */}
              {teamDisplay === 'chart' && (() => {
                const sessionCombo = [...teamSessionRows].reverse().map(s => ({
                  date: fmtDateWithDay(s.date),
                  load: Math.round(s.totalLoad / Math.max(s.nbPlayers, 1)),
                  rpe:  s.avg,
                }));
                // Même agrégation hebdo que le reste de la page (et que PerformanceCollective) :
                // fournie par le hook, plus recalculée ici.
                const weekCombo = teamWeekRows
                  .filter(w => w.rpe.value !== null)
                  .map(w => ({ date: fmtDateWithDay(w.week), load: w.load, rpe: w.rpe.value! }));
                const comboData = teamComboView === 'session' ? sessionCombo : weekCombo;
                const high      = teamComboView === 'session' ? sessionLoadNormal : thresholds.normalMax;
                return (
                  <ChargeRpeComboChart
                    data={comboData}
                    view={teamComboView}
                    onViewChange={setTeamComboView}
                    high={high}
                    title="Charge UA + RPE"
                    height={360}
                  />
                );
              })()}

              {teamDisplay === 'table' && (
                <TeamSessionHistoryTable rows={teamSessionRows} sessionLoadLight={sessionLoadLight} sessionLoadNormal={sessionLoadNormal} lightMax={thresholds.lightMax} normalMax={thresholds.normalMax} />
              )}

              {teamDisplay === 'ranking' && (
                <RPEPlayerRankingTable players={playerRanking} sessionLoadLight={sessionLoadLight} sessionLoadNormal={sessionLoadNormal} lightMax={thresholds.lightMax} normalMax={thresholds.normalMax} />
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
