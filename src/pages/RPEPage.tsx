import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { computeWeeklyUa, getWeekTier, WEEK_TIERS } from '../utils/weeklyLoad';
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { Save, Check, TrendingUp, Zap, ArrowDown, ArrowUp, Activity } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi } from '../api/rpe';
import { notifyOrg } from '../api/notifications';
import { attendanceApi } from '../api';
import type { TrainingSession } from '../data/types';
import { supabase } from '../api/client';
import { StatusBadge, PlayerAvatar } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, RPEEntry, SessionType } from '../data/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rpeColorScale = (v: number) => {
  if (v <= 3) return '#00E5A0';
  if (v <= 5) return '#22d3ee';
  if (v <= 6) return '#F59E0B';
  if (v <= 8) return '#fb923c';
  return '#EF4444';
};

const rpeLabel = (v: number) => {
  const labels: Record<number, string> = {
    1: 'Très facile', 2: 'Facile', 3: 'Modéré', 4: 'Assez difficile', 5: 'Difficile',
    6: 'Difficile+', 7: 'Très difficile', 8: 'Intense', 9: 'Très intense', 10: 'Maximal',
  };
  return labels[v] ?? '';
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Entraînement',
  match:    'Match',
  gym:      'Gym',
  rest:     'Repos',
};

const SESSION_TYPE_COLORS: Record<string, string> = {
  training: '#00E5A0',
  match:    '#EF4444',
  gym:      '#F59E0B',
  rest:     '#3B82F6',
};

function todayStr(): string {
  return new Date().toLocaleDateString('sv');
}

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
function fmtDateShort(iso: string): string {
  const [, mm, dd] = iso.split('-');
  return `${dd}/${mm}`;
}

function computeAcwr(history: RPEEntry[]): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const ref = new Date(sorted[sorted.length - 1].date);
  const load = (days: number) => {
    const cutoff = new Date(ref);
    cutoff.setDate(cutoff.getDate() - days);
    const entries = sorted.filter(e => new Date(e.date) >= cutoff);
    if (!entries.length) return 0;
    return entries.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0) / days;
  };
  const chronic = load(28);
  if (!chronic) return null;
  return Math.round((load(7) / chronic) * 100) / 100;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7j' | '30j' | 'saison';

interface TeamChartDay {
  label: string;
  date: string;
  avg: number;
  max: number | null;
  min: number | null;
}

interface TeamSessionRow {
  id: string;
  date: string;
  type: SessionType;
  duration: number;
  nbPlayers: number;
  avg: number;
  max: number;
  min: number;
  totalLoad: number;
}

interface PlayerRank {
  playerId: string;
  name: string;
  nbSessions: number;
  avgRpe: number;
  maxRpe: number;
  totalLoad: number;
}

interface TeamKpis {
  sessions: number;
  avg: number;
  max: number;
  min: number;
  totalLoad: number;
}

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

// ─── Mini stat card (team history KPIs) ──────────────────────────────────────

function StatCard({ label, value, unit, color, icon }: { label: string; value: string | number; unit?: string; color: string; icon: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${color}`, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ color: '#F1F5F9', fontSize: '1.4rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ color: '#475569', fontSize: '0.78rem' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'collective' | 'individual' | 'team_history';

const TAB_SLUGS: Record<string, Tab> = {
  new:          'collective',
  individual:   'individual',
  team:         'team_history',
};

export default function RPEPage() {
  const { selected } = useTeamSeason();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'collective';
  const setActiveTab = (t: Tab) => {
    if (t === 'individual') {
      const first = roster[0]?.id;
      navigate(first ? `/rpe/individual/${first}` : '/rpe/individual', { replace: true });
    } else if (t === 'team_history' && selected) {
      navigate(`/rpe/team/${selected.team.id}`, { replace: true });
    } else {
      navigate('/rpe/new', { replace: true });
    }
  };

  // ── Roster
  const [roster, setRoster]               = useState<Player[]>([]);
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
  const rosterRef = useRef<Player[]>([]);

  // ── Individual tab state
  const selectedPlayerId = activeTab === 'individual' ? (urlId ?? null) : null;
  const setSelectedPlayerId = (id: string) => navigate(`/rpe/individual/${id}`, { replace: true });
  const [history, setHistory]                   = useState<RPEEntry[]>([]);
  const [loadingHistory, setLoadingHistory]     = useState(false);
  const [historyVersion, setHistoryVersion]     = useState(0);
  const [individualFilter, setIndividualFilter] = useState<'all' | SessionType>('all');

  // ── Team history tab state
  const [teamPeriod, setTeamPeriod]             = useState<Period>('30j');
  const [teamChartData, setTeamChartData]       = useState<TeamChartDay[]>([]);
  const [teamSessionRows, setTeamSessionRows]   = useState<TeamSessionRow[]>([]);
  const [playerRanking, setPlayerRanking]       = useState<PlayerRank[]>([]);
  const [teamKpis, setTeamKpis]                 = useState<TeamKpis | null>(null);
  const [typeStats, setTypeStats]               = useState<Record<string, { count: number; avgRpe: number; totalLoad: number }>>({});
  const [loadingTeamHistory, setLoadingTeamHistory] = useState(false);
  const [teamHistoryError, setTeamHistoryError]     = useState<string | null>(null);

  // ── Load roster when season changes
  useEffect(() => {
    if (!selected) { setRoster([]); rosterRef.current = []; return; }
    setLoadingRoster(true);
    playersApi.listBySeason(selected.season.id)
      .then(players => {
        setRoster(players);
        rosterRef.current = players;
        setRpeValues(Object.fromEntries(players.map(p => [p.id, null])));
        if (players.length > 0 && activeTab === 'individual' && !urlId) {
          navigate(`/rpe/individual/${players[0].id}`, { replace: true });
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

  // ── Load team history
  useEffect(() => {
    if (activeTab !== 'team_history' || !selected) return;
    setLoadingTeamHistory(true);
    setTeamHistoryError(null);

    const today = todayStr();
    let fromDate: string | null = null;
    let toDate: string = today;
    let allDates: string[] | null = null;

    if (teamPeriod === 'saison') {
      fromDate = selected.season.startDate;
      toDate   = selected.season.endDate;
    } else {
      const n = teamPeriod === '7j' ? 7 : 30;
      const dates = Array.from({ length: n }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (n - 1 - i));
        return d.toLocaleDateString('sv');
      });
      fromDate = dates[0];
      allDates = dates;
    }

    let q = supabase
      .from('training_sessions')
      .select('id, date, session_type, planned_duration')
      .eq('team_id', selected.team.id)
      .eq('season_id', selected.season.id)
      .lte('date', toDate)
      .order('date', { ascending: true });
    if (fromDate) q = q.gte('date', fromDate);

    q.then(async ({ data: sessionsData, error: sessErr }) => {
      if (sessErr) {
        setTeamHistoryError(sessErr.message);
        setLoadingTeamHistory(false);
        return;
      }
      const sessions = (sessionsData ?? []) as Array<{ id: string; date: string; session_type: string; planned_duration: number }>;
      const sessionIds = sessions.map(s => s.id);
      const sessionMap = new Map(sessions.map(s => [s.id, s]));

      if (sessionIds.length === 0) {
        setTeamChartData([]);
        setTeamSessionRows([]);
        setPlayerRanking([]);
        setTeamKpis(null);
        setTypeStats({});
        setLoadingTeamHistory(false);
        return;
      }

      const { data: rpeData, error: rpeErr } = await supabase
        .from('rpe_entries')
        .select('rpe, player_id, session_id')
        .in('session_id', sessionIds);
      if (rpeErr) {
        setTeamHistoryError(rpeErr.message);
        setLoadingTeamHistory(false);
        return;
      }
      const rpeRows = (rpeData ?? []) as Array<{ rpe: number; player_id: string; session_id: string }>;

      // ── Per-session aggregation
      const entriesBySession = new Map<string, Array<{ rpe: number; player_id: string }>>();
      rpeRows.forEach(r => {
        if (!entriesBySession.has(r.session_id)) entriesBySession.set(r.session_id, []);
        entriesBySession.get(r.session_id)!.push(r);
      });

      const sessionRows: TeamSessionRow[] = sessions
        .filter(s => (entriesBySession.get(s.id)?.length ?? 0) > 0)
        .map(s => {
          const vals = (entriesBySession.get(s.id) ?? []).map(e => e.rpe);
          const avg  = vals.reduce((a, b) => a + b, 0) / vals.length;
          return {
            id:         s.id,
            date:       s.date,
            type:       s.session_type as SessionType,
            duration:   s.planned_duration,
            nbPlayers:  vals.length,
            avg:        Math.round(avg * 10) / 10,
            max:        Math.max(...vals),
            min:        Math.min(...vals),
            totalLoad:  Math.round(vals.reduce((a, b) => a + b, 0) * s.planned_duration),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      // ── Global KPIs
      const allVals = rpeRows.map(r => r.rpe);
      const globalLoad = sessionRows.reduce((s, r) => s + r.totalLoad, 0);
      setTeamKpis({
        sessions:  sessionRows.length,
        avg:       allVals.length ? Math.round(allVals.reduce((s, v) => s + v, 0) / allVals.length * 10) / 10 : 0,
        max:       allVals.length ? Math.max(...allVals) : 0,
        min:       allVals.length ? Math.min(...allVals) : 0,
        totalLoad: globalLoad,
      });

      // ── Chart data (by date)
      const rpeByDate = new Map<string, number[]>();
      rpeRows.forEach(r => {
        const s = sessionMap.get(r.session_id);
        if (!s) return;
        if (!rpeByDate.has(s.date)) rpeByDate.set(s.date, []);
        rpeByDate.get(s.date)!.push(r.rpe);
      });

      const chartDays = allDates ?? [...rpeByDate.keys()].sort();
      setTeamChartData(chartDays.map(dateStr => {
        const vals = rpeByDate.get(dateStr) ?? [];
        return {
          label: fmtDateShort(dateStr),
          date:  dateStr,
          avg:   vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : 0,
          max:   vals.length ? Math.max(...vals) : null,
          min:   vals.length ? Math.min(...vals) : null,
        };
      }));

      setTeamSessionRows(sessionRows);

      // ── Player ranking
      const playerMap = new Map<string, { rpes: number[]; sessions: Set<string>; load: number }>();
      rpeRows.forEach(r => {
        if (!playerMap.has(r.player_id)) playerMap.set(r.player_id, { rpes: [], sessions: new Set(), load: 0 });
        const p = playerMap.get(r.player_id)!;
        p.rpes.push(r.rpe);
        p.sessions.add(r.session_id);
        p.load += r.rpe * (sessionMap.get(r.session_id)?.planned_duration ?? 0);
      });

      const ranking: PlayerRank[] = Array.from(playerMap.entries()).map(([playerId, data]) => {
        const player = rosterRef.current.find(p => p.id === playerId);
        const avg    = data.rpes.reduce((s, v) => s + v, 0) / data.rpes.length;
        return {
          playerId,
          name:       player ? `${player.lastName} ${player.firstName[0]}.` : '—',
          nbSessions: data.sessions.size,
          avgRpe:     Math.round(avg * 10) / 10,
          maxRpe:     Math.max(...data.rpes),
          totalLoad:  Math.round(data.load),
        };
      }).sort((a, b) => b.avgRpe - a.avgRpe);

      setPlayerRanking(ranking);

      // ── Type distribution
      const typeMap = new Map<string, { count: number; rpes: number[]; totalLoad: number }>();
      sessionRows.forEach(s => {
        if (!typeMap.has(s.type)) typeMap.set(s.type, { count: 0, rpes: [], totalLoad: 0 });
        const t = typeMap.get(s.type)!;
        t.count++;
        t.totalLoad += s.totalLoad;
      });
      rpeRows.forEach(r => {
        const s = sessionMap.get(r.session_id);
        if (!s) return;
        typeMap.get(s.session_type)?.rpes.push(r.rpe);
      });

      const typeResult: Record<string, { count: number; avgRpe: number; totalLoad: number }> = {};
      typeMap.forEach((v, k) => {
        typeResult[k] = {
          count:     v.count,
          avgRpe:    v.rpes.length ? Math.round(v.rpes.reduce((s, r) => s + r, 0) / v.rpes.length * 10) / 10 : 0,
          totalLoad: v.totalLoad,
        };
      });
      setTypeStats(typeResult);
      setLoadingTeamHistory(false);
    }).catch(err => {
      setTeamHistoryError(err?.message ?? 'Erreur inattendue');
      setLoadingTeamHistory(false);
    });
  }, [activeTab, selected, teamPeriod]);

  // ── Derived (collective tab)
  const activeEntries = Object.entries(rpeValues).filter(([, v]) => v !== null) as [string, number][];
  const avgRpe        = activeEntries.length ? Math.round(activeEntries.reduce((s, [, v]) => s + v, 0) / activeEntries.length * 10) / 10 : 0;
  const estimatedLoad = Math.round(avgRpe * duration);

  const selSession     = linkedSessions.find(s => s.id === existingSessionId) ?? null;
  const selDate        = selSession ? new Date(selSession.date + 'T12:00:00') : null;
  const selTypeColor   = selSession ? (SESSION_TYPE_COLORS as Record<string, string>)[selSession.sessionType as string] ?? '#94A3B8' : '#94A3B8';
  const MONTHS_RPE     = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const DAYS_RPE       = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const nextSession    = linkedSessions.filter(s => s.date >= todayStr()).at(-1) ?? null;

  const filtered     = individualFilter === 'all' ? history : history.filter((e: RPEEntry) => e.sessionType === individualFilter);
  const sessionTypes = [...new Set(history.map((e: RPEEntry) => e.sessionType))] as SessionType[];
  const chartData    = [...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((e: RPEEntry) => ({
    date:  fmtDate(e.date),
    rpe:   e.rpe,
    load:  Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
  }));
  const lastRPE      = filtered[0];
  const avgRPE       = filtered.length ? Math.round(filtered.reduce((s: number, e: RPEEntry) => s + e.rpe, 0) / filtered.length * 10) / 10 : null;
  const totalLoad    = filtered.reduce((s: number, e: RPEEntry) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
  const RPE_LABELS: Record<number, string> = { 1: 'Très facile', 2: 'Facile', 3: 'Modéré', 4: 'Assez difficile', 5: 'Difficile', 6: 'Difficile+', 7: 'Très difficile', 8: 'Intense', 9: 'Très intense', 10: 'Maximal' };

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
      notifyOrg('rpe_added', `RPE saisi — ${activeEntries.length} joueur${activeEntries.length > 1 ? 's' : ''}`, sessionDate, 'session', savedSessionId);
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
  const acwr          = computeAcwr(history);
  const selectedPlayer = roster.find(p => p.id === selectedPlayerId);

  // ── Chart interval for team history
  const chartInterval = teamPeriod === '7j' ? 0 : teamPeriod === '30j' ? 4 : Math.max(0, Math.floor((teamChartData.length) / 8) - 1);

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Perception de l'Effort (RPE)</h1>
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#475569' }}>
          Sélectionnez une équipe et une saison dans la barre du haut.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>RPE</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['collective', 'individual', 'team_history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {tab === 'collective'
                ? <><span className="hidden sm:inline">Nouvelle séance</span><span className="sm:hidden">Séance</span></>
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
            <div
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
              onClick={e => { if (e.target === e.currentTarget) setShowSessionPicker(false); }}
            >
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                      <p style={{ color: '#475569', fontSize: '0.82rem', margin: '0 0 6px' }}>Aucune séance plannifiée.</p>
                      <p style={{ color: '#334155', fontSize: '0.75rem', margin: 0 }}>Ajoutez des séances depuis la page Présences.</p>
                    </div>
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
              </div>
            </div>
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
                  <span style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Charge estimée</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ color: '#00E5A0', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{avgRpe}</span>
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
                  <span style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Charge estimée</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{ color: '#00E5A0', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{avgRpe}</span>
                    <span style={{ color: '#475569' }}>× {duration} =</span>
                    <span style={{ color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{estimatedLoad} UA</span>
                  </span>
                </div>
              </div>
            )}

            {/* Placeholder quand rien n'est sélectionné et pas en mode manuel */}
            {!existingSessionId && !manualMode && (
              <div style={{ backgroundColor: '#161920', border: '1px dashed #2A2F3A', borderRadius: 8, padding: '48px', textAlign: 'center', marginBottom: 16 }}>
                <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 16px' }}>Aucune séance sélectionnée</p>
                <button
                  onClick={() => setShowSessionPicker(true)}
                  style={{ padding: '9px 22px', backgroundColor: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 6, color: '#00E5A0', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,229,160,0.12)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0,229,160,0.06)'; }}
                >
                  Choisir une séance
                </button>
              </div>
            )}

            {(existingSessionId || manualMode) && (
              loadingRoster ? (
                <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement du roster…</div>
              ) : roster.length === 0 ? (
                <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
                  Aucun joueur dans le roster pour cette saison. Ajoutez des joueurs depuis <em>Mon Roster</em>.
                </div>
              ) : (
                <>
                  <style>{`
                    @media (max-width: 767px) {
                      .rpe-row { flex-wrap: wrap !important; padding: 10px 12px !important; }
                      .rpe-player-col { width: auto !important; flex: 1 !important; }
                      .rpe-value-col { display: none !important; }
                      .rpe-buttons { width: 100% !important; flex: none !important; margin-top: 6px !important; }
                      .rpe-buttons > button { flex: 1 !important; }
                    }
                  `}</style>
                  <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', display: 'flex', gap: 12 }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 150, flexShrink: 0 }}>Joueur</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>RPE</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 130, textAlign: 'right', flexShrink: 0 }}>Valeur</span>
                    </div>
                    {roster.map(player => {
                      const val = rpeValues[player.id] ?? null;
                      const rpeBtn = (v: number) => (
                        <button key={v}
                          onClick={() => setRpeValues(prev => ({ ...prev, [player.id]: prev[player.id] === v ? null : v }))}
                          style={{ height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColorScale(v) : '#2A2F3A', backgroundColor: val === v ? rpeColorScale(v) + '22' : 'transparent', color: val === v ? rpeColorScale(v) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}>
                          {v}
                        </button>
                      );
                      return (
                        <div key={player.id} className="rpe-row" style={{ borderBottom: '1px solid #1E2229', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                          <div className="rpe-player-col" onClick={() => navigate(`/players/${player.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: 150, flexShrink: 0, cursor: 'pointer' }}>
                            <div className="hidden md:block"><PlayerAvatar player={player} size={26} /></div>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.lastName} {player.firstName[0]}.</span>
                              <div style={{ marginTop: 1 }}><StatusBadge status={player.status} size="sm" /></div>
                            </div>
                          </div>
                          <div className="rpe-buttons" style={{ flex: 1, display: 'flex', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                            {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                              <button key={v}
                                onClick={() => setRpeValues(prev => ({ ...prev, [player.id]: prev[player.id] === v ? null : v }))}
                                style={{ flex: 1, height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColorScale(v) : '#2A2F3A', backgroundColor: val === v ? rpeColorScale(v) + '22' : 'transparent', color: val === v ? rpeColorScale(v) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}>
                                {v}
                              </button>
                            ))}
                          </div>
                          <div className="rpe-value-col" style={{ width: 130, textAlign: 'right', flexShrink: 0 }}>
                            {val !== null
                              ? <span style={{ color: rpeColorScale(val), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{val} — {rpeLabel(val)}</span>
                              : <span style={{ color: '#334155', fontSize: '0.78rem' }}>—</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
                    {saveError && <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{saveError}</span>}
                    <button onClick={handleSave} disabled={activeEntries.length === 0 || saving}
                      style={{ padding: '10px 24px', backgroundColor: saved ? '#1E2229' : activeEntries.length === 0 ? '#1A1F27' : '#00E5A0', border: saved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: saved ? '#00E5A0' : activeEntries.length === 0 ? '#334155' : '#0D0F14', cursor: activeEntries.length === 0 || saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                      {saved ? <><Check size={15} /> Enregistré !</> : <><Save size={15} /> {saving ? 'Enregistrement…' : `Enregistrer (${activeEntries.length})`}</>}
                    </button>
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
          <div style={{ marginBottom: 24 }}>
            <select value={selectedPlayerId ?? ''} onChange={e => setSelectedPlayerId(e.target.value)}
              style={{ padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}>
              {roster.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
            </select>
          </div>


          {loadingHistory ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement…</div>
          ) : history.length === 0 && selectedPlayerId ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
              Aucune donnée RPE pour {selectedPlayer?.firstName} {selectedPlayer?.lastName}.
            </div>
          ) : history.length > 0 ? (
            <>
                {/* Filtres par type */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                  {(['all', ...sessionTypes] as ('all' | SessionType)[]).map(f => {
                    const active = individualFilter === f;
                    const label  = f === 'all' ? 'Tout' : SESSION_TYPE_LABELS[f];
                    const color  = f === 'all' ? '#94A3B8' : SESSION_TYPE_COLORS[f];
                    return (
                      <button key={f} onClick={() => setIndividualFilter(f)}
                        style={{ padding: '5px 12px', borderRadius: 5, fontSize: '0.78rem', cursor: 'pointer', backgroundColor: active ? color + '18' : '#1E2229', border: `1px solid ${active ? color : '#2A2F3A'}`, color: active ? color : '#94A3B8', fontWeight: active ? 600 : 400 }}>
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* KPIs */}
                {(() => {
                  const weeklyUa  = computeWeeklyUa(history);
                  const weekTier  = weeklyUa > 0 ? getWeekTier(weeklyUa) : null;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
                      {[
                        { label: 'Dernière RPE',  value: lastRPE ? String(lastRPE.rpe) : '—', sub: lastRPE ? RPE_LABELS[lastRPE.rpe] : '', color: lastRPE ? rpeColorScale(lastRPE.rpe) : '#F1F5F9' },
                        { label: 'RPE moyenne',   value: avgRPE !== null ? String(avgRPE) : '—', sub: `sur ${filtered.length} séance${filtered.length > 1 ? 's' : ''}`, color: avgRPE !== null ? rpeColorScale(avgRPE) : '#F1F5F9' },
                        { label: 'Charge totale', value: totalLoad > 0 ? String(totalLoad) : '—', sub: 'UA (RPE × min)', color: '#F1F5F9' },
                        { label: 'Séances',       value: String(filtered.length), sub: 'enregistrées', color: '#F1F5F9' },
                      ].map(kpi => (
                        <div key={kpi.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
                          <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{kpi.label}</p>
                          <p style={{ color: kpi.color, fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</p>
                          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>{kpi.sub}</p>
                        </div>
                      ))}
                      {/* Charge semaine */}
                      <div style={{ backgroundColor: '#161920', border: `1px solid ${weekTier ? weekTier.color + '44' : '#2A2F3A'}`, borderRadius: 8, padding: '14px 16px' }}>
                        <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Charge semaine</p>
                        <p style={{ color: weekTier ? weekTier.color : '#475569', fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                          {weeklyUa > 0 ? weeklyUa : '—'}
                        </p>
                        {weekTier ? (
                          <span style={{ color: weekTier.color, backgroundColor: weekTier.bg, fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 3, display: 'inline-block', marginTop: 4 }}>{weekTier.label}</span>
                        ) : (
                          <p style={{ color: '#2A2F3A', fontSize: '0.72rem', margin: '3px 0 0' }}>aucune séance cette semaine</p>
                        )}
                        <p style={{ color: '#2A2F3A', fontSize: '0.65rem', margin: '6px 0 0' }}>
                          {WEEK_TIERS.map(t => `${t.label} ${t.ref}`).join(' · ')}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Charts côte à côte */}
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>
                  <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>Évolution RPE</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} />
                        <YAxis domain={[0, 10]} tick={{ fill: '#475569', fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <ReferenceLine y={7} stroke="#EF444440" strokeDasharray="4 4" />
                        <ReferenceLine y={5} stroke="#F59E0B40" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="rpe" name="RPE" stroke="#00E5A0" dot={{ fill: '#00E5A0', r: 3 }} strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>Charge (UA)</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="load" name="Charge" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tableau historique */}
                <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2F3A' }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Historique des séances</p>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Type', 'RPE', 'Ressenti', 'Durée', 'Charge', 'Équipe'].map(h => (
                            <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(e => {
                          const dur  = e.actualDuration ?? e.plannedDuration;
                          return (
                            <tr key={e.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                              onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                              onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                              <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                              <td style={{ padding: '9px 14px' }}><span style={{ color: SESSION_TYPE_COLORS[e.sessionType], fontSize: '0.75rem', fontWeight: 600 }}>{SESSION_TYPE_LABELS[e.sessionType]}</span></td>
                              <td style={{ padding: '9px 14px' }}><span style={{ color: rpeColorScale(e.rpe), fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{e.rpe}</span></td>
                              <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem' }}>{RPE_LABELS[e.rpe] ?? '—'}</td>
                              <td style={{ padding: '9px 14px', color: '#F1F5F9', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{dur} min</td>
                              <td style={{ padding: '9px 14px', color: '#F1F5F9', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{e.rpe * dur} UA</td>
                              <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem' }}>{e.teamName ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
          ) : null}
        </div>
      )}

      {/* ══ TEAM HISTORY ════════════════════════════════════════════════════ */}
      {activeTab === 'team_history' && (
        <div>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16, gap: 4 }}>
            <span style={{ color: '#475569', fontSize: '0.78rem', marginRight: 8 }}>Période :</span>
            {(['7j', '30j', 'saison'] as const).map(p => (
              <button key={p} onClick={() => setTeamPeriod(p)}
                style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid', borderColor: teamPeriod === p ? '#00E5A0' : '#2A2F3A', backgroundColor: teamPeriod === p ? 'rgba(0,229,160,0.08)' : 'transparent', color: teamPeriod === p ? '#00E5A0' : '#94A3B8', cursor: 'pointer', fontSize: '0.78rem', fontWeight: teamPeriod === p ? 600 : 400, transition: 'all 0.15s' }}>
                {p === 'saison' ? 'Saison' : p}
              </button>
            ))}
          </div>

          {loadingTeamHistory ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '60px 0', textAlign: 'center' }}>Chargement…</div>
          ) : teamHistoryError ? (
            <div style={{ backgroundColor: '#1E1215', border: '1px solid #EF444440', borderRadius: 8, padding: '20px 24px', color: '#EF4444', fontSize: '0.85rem' }}>
              Erreur lors du chargement : {teamHistoryError}
            </div>
          ) : !teamKpis || teamKpis.sessions === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '60px 0', textAlign: 'center' }}>
              Aucune séance RPE enregistrée sur cette période.
              {teamPeriod !== 'saison' && <><br /><button onClick={() => setTeamPeriod('saison')} style={{ marginTop: 10, background: 'none', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', padding: '5px 12px', fontSize: '0.78rem' }}>Voir toute la saison</button></>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* KPI strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5" style={{ gap: 12 }}>
                <StatCard label="Séances" value={teamKpis.sessions} color="#3B82F6" icon={<Activity size={14} />} />
                <StatCard label="RPE moyen" value={teamKpis.avg} unit="/ 10" color="#00E5A0" icon={<TrendingUp size={14} />} />
                <StatCard label="RPE max" value={teamKpis.max} unit="/ 10" color="#EF4444" icon={<ArrowUp size={14} />} />
                <StatCard label="RPE min" value={teamKpis.min} unit="/ 10" color="#3B82F6" icon={<ArrowDown size={14} />} />
                <StatCard label="Charge totale" value={teamKpis.totalLoad.toLocaleString('fr')} unit="UA" color="#F59E0B" icon={<Zap size={14} />} />
              </div>

              {/* Main chart: avg + max + min */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ color: '#F1F5F9', margin: '0 0 4px' }}>Charge collective — RPE par séance</h3>
                    <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>Moyenne, maximum et minimum par jour</p>
                  </div>
                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00E5A0' }}>
                      <span style={{ width: 10, height: 10, backgroundColor: '#00E5A0', borderRadius: 2, display: 'inline-block' }} />
                      Moy
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#EF4444' }}>
                      <span style={{ width: 20, height: 2, backgroundColor: '#EF4444', display: 'inline-block', borderRadius: 1 }} />
                      Max
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#3B82F6' }}>
                      <span style={{ width: 20, height: 2, backgroundColor: '#3B82F6', display: 'inline-block', borderRadius: 1 }} />
                      Min
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={teamChartData} barSize={teamPeriod === '7j' ? 28 : 14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="label" interval={chartInterval} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={8} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Seuil 8', fill: '#EF4444', fontSize: 10, position: 'insideTopRight' }} />
                    <Bar dataKey="avg" fill="#00E5A0" radius={[3, 3, 0, 0]} fillOpacity={0.75} name="RPE moy" />
                    <Line type="monotone" dataKey="max" stroke="#EF4444" strokeWidth={1.5} dot={{ fill: '#EF4444', r: 2 }} connectNulls={false} name="Max" />
                    <Line type="monotone" dataKey="min" stroke="#3B82F6" strokeWidth={1.5} dot={{ fill: '#3B82F6', r: 2 }} connectNulls={false} name="Min" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Player ranking + Type distribution */}
              <div className="grid grid-cols-1 md:grid-cols-[1fr_280px]" style={{ gap: 16 }}>

                {/* Player ranking */}
                <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2F3A' }}>
                    <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem' }}>Classement joueurs — RPE moyen</h3>
                  </div>
                  <div style={{ padding: '8px 20px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '28px 1fr 60px 60px 60px 90px', gap: 8, alignItems: 'center' }}>
                    {['#', 'Joueur', 'Séan.', 'Moy', 'Max', 'Charge'].map(h => (
                      <span key={h} style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {playerRanking.map((p, idx) => (
                    <div key={p.playerId} style={{ padding: '10px 20px', borderBottom: '1px solid #1E2229', display: 'grid', gridTemplateColumns: '28px 1fr 60px 60px 60px 90px', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: idx < 3 ? '#F59E0B' : '#475569', fontSize: '0.78rem', fontWeight: idx < 3 ? 700 : 400, fontFamily: 'JetBrains Mono, monospace' }}>
                        {idx + 1}
                      </span>
                      <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{p.nbSessions}</span>
                      <span style={{ color: rpeColorScale(p.avgRpe), fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace' }}>{p.avgRpe}</span>
                      <span style={{ color: rpeColorScale(p.maxRpe), fontWeight: 600, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{p.maxRpe}</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{p.totalLoad.toLocaleString('fr')} UA</span>
                    </div>
                  ))}
                </div>

                {/* Type distribution */}
                <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2F3A' }}>
                    <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem' }}>Répartition par type</h3>
                  </div>
                  <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(['training', 'match', 'gym', 'rest'] as const)
                      .filter(t => typeStats[t])
                      .map(t => {
                        const stat  = typeStats[t]!;
                        const color = SESSION_TYPE_COLORS[t];
                        const maxCount = Math.max(...Object.values(typeStats).map(s => s.count));
                        return (
                          <div key={t}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                <span style={{ color: '#F1F5F9', fontSize: '0.82rem' }}>{SESSION_TYPE_LABELS[t]}</span>
                              </div>
                              <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>{stat.count} séance{stat.count > 1 ? 's' : ''}</span>
                            </div>
                            {/* Bar */}
                            <div style={{ height: 4, backgroundColor: '#1E2229', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(stat.count / maxCount) * 100}%`, backgroundColor: color, borderRadius: 2, opacity: 0.7 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#475569', fontSize: '0.72rem' }}>RPE moy</span>
                              <span style={{ color: rpeColorScale(stat.avgRpe), fontSize: '0.75rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{stat.avgRpe}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Sessions table */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #2A2F3A' }}>
                  <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem' }}>Détail des séances</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ padding: '8px 20px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '100px 130px 70px 60px 60px 60px 60px 100px', gap: 8, minWidth: 640 }}>
                    {['Date', 'Type', 'Durée', 'Joueurs', 'Moy', 'Max', 'Min', 'Charge (UA)'].map(h => (
                      <span key={h} style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                    ))}
                  </div>
                  {teamSessionRows.map(s => (
                    <div key={s.id} style={{ padding: '9px 20px', borderBottom: '1px solid #1E2229', display: 'grid', gridTemplateColumns: '100px 130px 70px 60px 60px 60px 60px 100px', gap: 8, alignItems: 'center', minWidth: 640 }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(s.date)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: SESSION_TYPE_COLORS[s.type], flexShrink: 0 }} />
                        <span style={{ color: '#F1F5F9', fontSize: '0.8rem' }}>{SESSION_TYPE_LABELS[s.type] ?? s.type}</span>
                      </div>
                      <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{s.duration} min</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.nbPlayers}</span>
                      <span style={{ color: rpeColorScale(s.avg), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.avg}</span>
                      <span style={{ color: rpeColorScale(s.max), fontWeight: 600, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.max}</span>
                      <span style={{ color: rpeColorScale(s.min), fontWeight: 600, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.min}</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.totalLoad.toLocaleString('fr')}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
