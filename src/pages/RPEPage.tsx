import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { computeWeeklyUa, getWeekTier } from '../utils/weeklyLoad';
import { rpeColor, rpeLabel } from '../utils/rpe';
import {
  ComposedChart, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Save, Check, Zap, Activity, BarChart2, List, Users } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi } from '../api/rpe';
import { notifyOrg } from '../api/notifications';
import { attendanceApi } from '../api';
import type { TrainingSession } from '../data/types';
import { supabase } from '../api/client';
import { StatusBadge, PlayerAvatar, RpeBarChart, ChargeBarChart, RpeKpiCard, ChargeRpeComboChart, TeamDisplayToggle, TeamSessionHistoryTable, PlayerRankingTable } from '../components';
import type { TeamDisplayMode } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, RPEEntry, SessionType, TeamSessionRow, PlayerRank } from '../data/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};
const SESSION_TYPE_LABELS: Record<string, string> = Object.fromEntries(Object.entries(SESSION_TYPES).map(([k, v]) => [k, v.label]));
const SESSION_TYPE_COLORS: Record<string, string> = Object.fromEntries(Object.entries(SESSION_TYPES).map(([k, v]) => [k, v.color]));

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
const DAY_ABBR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
function fmtDateWithDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const [, mm, dd] = iso.split('-');
  return `${DAY_ABBR[d.getDay()]} ${Number(dd)}/${Number(mm)}`;
}
function getWeekMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toLocaleDateString('sv');
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

type Period = '30j' | 'saison';

interface TeamChartDay {
  label: string;
  date: string;
  avg: number;
  max: number | null;
  min: number | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

type Tab = 'collective' | 'individual' | 'team_history';

const TAB_SLUGS: Record<string, Tab> = {
  new:          'collective',
  individual:   'individual',
  team:         'team_history',
};

export default function RPEPage() {
  const { selected, thresholds } = useTeamSeason();
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
  const [chargeView, setChargeView]             = useState<'session' | 'week'>('week');
  const [rpeView, setRpeView]                   = useState<'session' | 'week'>('session');
  const [teamChargeView, setTeamChargeView]     = useState<'session' | 'week'>('week');
  const [teamRpeView, setTeamRpeView]           = useState<'session' | 'week'>('session');
  const [teamComboView, setTeamComboView]       = useState<'session' | 'week'>('week');
  const [indivComboView, setIndivComboView]     = useState<'session' | 'week'>('session');
  const [indivDisplay, setIndivDisplay]         = useState<'chart' | 'table'>('chart');
  const [indivTableView, setIndivTableView]     = useState<'session' | 'week'>('session');
  const [teamSaisonDisplay, setTeamSaisonDisplay] = useState<TeamDisplayMode>('chart');
  const [team30jDisplay, setTeam30jDisplay]       = useState<TeamDisplayMode>('chart');
  const [teamComboView30j, setTeamComboView30j]   = useState<'session' | 'week'>('week');

  // ── Team history tab state
  const [teamPeriod, setTeamPeriod]             = useState<Period>('30j');
  const [teamChartData, setTeamChartData]       = useState<TeamChartDay[]>([]);
  const [teamSessionRows, setTeamSessionRows]   = useState<TeamSessionRow[]>([]);
  const [playerRanking, setPlayerRanking]       = useState<PlayerRank[]>([]);
  const [teamKpis, setTeamKpis]                 = useState<TeamKpis | null>(null);
  const [typeStats, setTypeStats]               = useState<Record<string, { count: number; avgRpe: number; totalLoad: number }>>({});
  const [loadingTeamHistory, setLoadingTeamHistory] = useState(false);
  const [teamHistoryError, setTeamHistoryError]     = useState<string | null>(null);
  const [teamSeasonAvgRpe, setTeamSeasonAvgRpe]     = useState<number | null>(null);

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
      const n = 30;
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
      const _3wAgo = new Date();
      _3wAgo.setDate(_3wAgo.getDate() - 21);
      const _3wAgoStr = _3wAgo.toLocaleDateString('sv');

      const playerMap = new Map<string, { rpes: number[]; sessions: Set<string>; load: number; rpes3w: number[]; load3w: number; sessions3w: Set<string> }>();
      const playerWeekLoadMap = new Map<string, Map<string, number>>();
      rpeRows.forEach(r => {
        if (!playerMap.has(r.player_id)) playerMap.set(r.player_id, { rpes: [], sessions: new Set(), load: 0, rpes3w: [], load3w: 0, sessions3w: new Set() });
        const p    = playerMap.get(r.player_id)!;
        const sess = sessionMap.get(r.session_id);
        const dur  = sess?.planned_duration ?? 0;
        p.rpes.push(r.rpe);
        p.sessions.add(r.session_id);
        p.load += r.rpe * dur;
        if (sess && sess.date >= _3wAgoStr) {
          p.rpes3w.push(r.rpe);
          p.load3w += r.rpe * dur;
          p.sessions3w.add(r.session_id);
        }
        if (sess) {
          const wk = getWeekMonday(sess.date);
          if (!playerWeekLoadMap.has(r.player_id)) playerWeekLoadMap.set(r.player_id, new Map());
          const pw = playerWeekLoadMap.get(r.player_id)!;
          pw.set(wk, (pw.get(wk) ?? 0) + r.rpe * dur);
        }
      });

      const ranking: PlayerRank[] = Array.from(playerMap.entries()).map(([playerId, data]) => {
        const player  = rosterRef.current.find(p => p.id === playerId);
        const avg     = data.rpes.reduce((s, v) => s + v, 0) / data.rpes.length;
        const avg3w   = data.rpes3w.length ? data.rpes3w.reduce((s, v) => s + v, 0) / data.rpes3w.length : null;
        const ns3w    = data.sessions3w.size;
        return {
          playerId,
          name:       player ? `${player.lastName} ${player.firstName[0]}.` : '—',
          nbSessions: data.sessions.size,
          avgRpe:     Math.round(avg * 10) / 10,
          maxRpe:     Math.max(...data.rpes),
          totalLoad:  Math.round(data.load),
          rpe3w:      avg3w !== null ? Math.round(avg3w * 10) / 10 : null,
          load3w:     ns3w > 0 ? Math.round(data.load3w / ns3w) : null,
          weekLoads:  [...(playerWeekLoadMap.get(playerId)?.values() ?? [])],
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

  // ── Season-wide RPE average for team (independent of period)
  useEffect(() => {
    if (!selected) { setTeamSeasonAvgRpe(null); return; }
    supabase
      .from('training_sessions')
      .select('id')
      .eq('team_id', selected.team.id)
      .eq('season_id', selected.season.id)
      .then(async ({ data }) => {
        const ids = (data ?? []).map((s: { id: string }) => s.id);
        if (!ids.length) { setTeamSeasonAvgRpe(null); return; }
        const { data: rpe } = await supabase.from('rpe_entries').select('rpe').in('session_id', ids);
        const vals = (rpe ?? []).map((r: { rpe: number }) => r.rpe);
        if (!vals.length) { setTeamSeasonAvgRpe(null); return; }
        setTeamSeasonAvgRpe(Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length * 10) / 10);
      })
      .catch(() => {});
  }, [selected?.team.id, selected?.season.id]);

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

  const filtered     = history;
  const chartData    = [...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((e: RPEEntry) => ({
    date:  fmtDate(e.date),
    rpe:   e.rpe,
    load:  Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
  }));
  const lastRPE      = filtered.length ? [...filtered].sort((a: RPEEntry, b: RPEEntry) => b.date.localeCompare(a.date))[0] : undefined;
  const avgRPE       = filtered.length ? Math.round(filtered.reduce((s: number, e: RPEEntry) => s + e.rpe, 0) / filtered.length * 10) / 10 : null;
  const totalLoad    = filtered.reduce((s: number, e: RPEEntry) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
  const weeklyChartData = (() => {
    const m = new Map<string, number>();
    history.forEach(e => {
      const k = getWeekMonday(e.date);
      m.set(k, (m.get(k) ?? 0) + e.rpe * (e.actualDuration ?? e.plannedDuration));
    });
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, load]) => ({ date: fmtDate(d), load: Math.round(load) }));
  })();
  const weeklyRpeChartData = (() => {
    const m = new Map<string, number[]>();
    history.forEach(e => {
      const k = getWeekMonday(e.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e.rpe);
    });
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, rpes]) => ({
        date: fmtDate(d),
        rpe:  Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
      }));
  })();

  // ── Team saison derived values
  const teamWeeklyChargePerPlayerData = (() => {
    const m = new Map<string, { load: number; playerSum: number; count: number }>();
    teamSessionRows.forEach(s => {
      const k = getWeekMonday(s.date);
      if (!m.has(k)) m.set(k, { load: 0, playerSum: 0, count: 0 });
      const e = m.get(k)!;
      e.load += s.totalLoad;
      e.playerSum += s.nbPlayers;
      e.count += 1;
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([d, { load, playerSum, count }]) => ({
        date: fmtDateShort(d),
        load: Math.round(load / Math.max(playerSum / count, 1)),
      }));
  })();
  const teamWeeklyRpeData = (() => {
    const m = new Map<string, number[]>();
    teamChartData.filter(d => d.avg > 0).forEach(d => {
      const k = getWeekMonday(d.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d.avg);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([d, rpes]) => ({ date: fmtDateShort(d), rpe: Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10 }));
  })();
  const thirtyDaysAgoStr = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('sv'); })();
  const rows30jTeam = teamSessionRows.filter(s => s.date >= thirtyDaysAgoStr);
  const seasonWeeks = selected ? Math.max(1, Math.ceil((new Date(selected.season.endDate).getTime() - new Date(selected.season.startDate).getTime()) / (7 * 86400000))) : 20;
  const nPlayersTeam = playerRanking.length || 1;
  const avgWeeklyLoadSaison = teamKpis ? Math.round(teamKpis.totalLoad / nPlayersTeam / seasonWeeks) : 0;
  const tierSaison = getWeekTier(avgWeeklyLoadSaison, thresholds.lightMax, thresholds.normalMax);
  const totalLoad30jTeam = rows30jTeam.reduce((s, r) => s + r.totalLoad, 0);
  const avgWeeklyLoad30j = Math.round(totalLoad30jTeam / nPlayersTeam / 4);
  const tier30j = getWeekTier(avgWeeklyLoad30j, thresholds.lightMax, thresholds.normalMax);
  const rpe30jVals = rows30jTeam.map(s => s.avg);
  const rpe30j = rpe30jVals.length ? Math.round(rpe30jVals.reduce((s, v) => s + v, 0) / rpe30jVals.length * 10) / 10 : null;
  const avgRosterSize = teamSessionRows.length
    ? teamSessionRows.reduce((s, r) => s + r.nbPlayers, 0) / teamSessionRows.length
    : 1;
  const teamSessionLoadLight  = Math.round((thresholds.lightMax  / 3) * avgRosterSize);
  const teamSessionLoadNormal = Math.round((thresholds.normalMax / 3) * avgRosterSize);
  const teamWeekLoadLight     = Math.round(thresholds.lightMax  * avgRosterSize);
  const teamWeekLoadNormal    = Math.round(thresholds.normalMax * avgRosterSize);

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
  const acwr              = computeAcwr(history);
  const sessionLoadLight  = Math.round(thresholds.lightMax  / 3);
  const sessionLoadNormal = Math.round(thresholds.normalMax / 3);
  const selectedPlayer = roster.find(p => p.id === selectedPlayerId);
  const weekLoadTeam = (() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 6);
    const cutoffStr = cutoff.toLocaleDateString('sv');
    return teamSessionRows.filter(s => s.date >= cutoffStr).reduce((sum, s) => sum + s.totalLoad, 0);
  })();

  // ── Chart interval for team history
  const chartInterval = teamPeriod === '30j' ? 4 : Math.max(0, Math.floor((teamChartData.length) / 8) - 1);

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
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charge estimée</span>
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
                  <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charge estimée</span>
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
                          style={{ height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColor(v) : '#2A2F3A', backgroundColor: val === v ? rpeColor(v) + '22' : 'transparent', color: val === v ? rpeColor(v) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}>
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
                                style={{ flex: 1, height: 30, borderRadius: 5, border: '1px solid', borderColor: val === v ? rpeColor(v) : '#2A2F3A', backgroundColor: val === v ? rpeColor(v) + '22' : 'transparent', color: val === v ? rpeColor(v) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 16, gap: 4 }}>
            <select value={selectedPlayerId ?? ''} onChange={e => setSelectedPlayerId(e.target.value)}
              style={{ padding: '5px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 4, color: '#F1F5F9', fontSize: '0.78rem', outline: 'none', cursor: 'pointer' }}>
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
                {/* KPIs joueur — même format que équipe */}
                {(() => {
                  const avgWeeklyLoad = Math.round(totalLoad / seasonWeeks);
                  const tier          = avgWeeklyLoad > 0 ? getWeekTier(avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax) : null;

                  const h30j          = history.filter(e => e.date >= thirtyDaysAgoStr);
                  const load30j       = h30j.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
                  const avgWeekly30j  = Math.round(load30j / 4);
                  const rpe30jIndiv   = h30j.length ? Math.round(h30j.reduce((s, e) => s + e.rpe, 0) / h30j.length * 10) / 10 : null;

                  const chargeDelta   = avgWeeklyLoad > 0 && avgWeekly30j > 0 ? avgWeekly30j - avgWeeklyLoad : null;
                  const rpeDelta      = avgRPE !== null && rpe30jIndiv !== null ? Math.round((rpe30jIndiv - avgRPE) * 10) / 10 : null;

                  const surchargeWeeks = weeklyChartData.filter(w => w.load >= thresholds.normalMax).length;
                  const totalWeeks     = weeklyChartData.length;

                  const arrow = (delta: number) => {
                    const c = delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#475569';
                    return <span style={{ color: c, fontSize: '0.85rem', marginLeft: 4, fontFamily: 'JetBrains Mono, monospace' }}>{delta > 0 ? '↑' : delta < 0 ? '↓' : '='}</span>;
                  };
                  const fmt  = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
                  const todayStr2 = new Date().toLocaleDateString('sv');
                  const sub30 = (delta: number, unit = '') =>
                    <span style={{ color: '#475569', fontSize: '0.67rem' }}>
                      <span style={{ color: delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#94A3B8', fontWeight: 600 }}>
                        {delta > 0 ? '+' : ''}{delta}{unit}
                      </span>
                      {' '}du {fmt(thirtyDaysAgoStr)} au {fmt(todayStr2)}
                    </span>;

                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                      <RpeKpiCard
                        accent={tier ? tier.color : '#334155'}
                        label="Charge moyenne par semaine"
                        value={tier ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span>{avgWeeklyLoad > 0 ? avgWeeklyLoad.toLocaleString('fr') : '—'}<span style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></span>
                          <span style={{ backgroundColor: tier.color + '22', color: tier.color, fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{tier.label}</span>
                        </span> : '—'}
                        sub={chargeDelta !== null ? <>{arrow(chargeDelta)}{' '}{sub30(chargeDelta, ' UA')}</> : undefined}
                      />
                      <RpeKpiCard
                        accent={avgRPE !== null ? rpeColor(avgRPE) : '#334155'}
                        label="RPE moyen de la saison"
                        value={avgRPE !== null ? avgRPE : '—'}
                        sub={rpeDelta !== null ? <>{arrow(rpeDelta)}{' '}{sub30(rpeDelta)}</> : (avgRPE !== null ? rpeLabel(Math.round(avgRPE)) : '—')}
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
                        label="Séances totales"
                        value={filtered.length}
                        valueColor="#F1F5F9"
                        sub="toute la saison"
                      />
                    </div>
                  );
                })()}

                {/* Toggle graphique / tableau */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, backgroundColor: '#1A1E26', border: '1px solid #2A2F3A', borderRadius: 10, padding: 4 }}>
                  {([
                    { key: 'chart', label: 'Graphique', icon: BarChart2 },
                    { key: 'table', label: 'Tableau',   icon: List      },
                  ] as const).map(({ key, label, icon: Icon }) => {
                    const active = indivDisplay === key;
                    return (
                      <button key={key} onClick={() => setIndivDisplay(key)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                          padding: '9px 0', borderRadius: 7, border: active ? '1px solid #2A2F3A' : '1px solid transparent',
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                          backgroundColor: active ? '#242830' : 'transparent',
                          color: active ? '#F1F5F9' : '#475569',
                          boxShadow: active ? '0 1px 4px rgba(0,0,0,0.4)' : 'none' }}>
                        <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Graphe combiné UA + RPE joueur */}
                {indivDisplay === 'chart' && (() => {
                  const weekCombMap = new Map<string, { load: number; rpes: number[] }>();
                  history.forEach(e => {
                    const k = getWeekMonday(e.date);
                    if (!weekCombMap.has(k)) weekCombMap.set(k, { load: 0, rpes: [] });
                    const w = weekCombMap.get(k)!;
                    w.load += e.rpe * (e.actualDuration ?? e.plannedDuration);
                    w.rpes.push(e.rpe);
                  });
                  const weekCombo = [...weekCombMap.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([d, { load, rpes }]) => ({
                      date: fmtDateWithDay(d),
                      load: Math.round(load),
                      rpe:  Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
                    }));
                  const sessionCombo = [...filtered]
                    .sort((a: RPEEntry, b: RPEEntry) => a.date.localeCompare(b.date))
                    .map((e: RPEEntry) => ({
                      date: fmtDateWithDay(e.date),
                      load: Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
                      rpe:  e.rpe,
                    }));
                  const comboData = indivComboView === 'session' ? sessionCombo : weekCombo;
                  const high      = indivComboView === 'session' ? sessionLoadNormal : thresholds.normalMax;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <ChargeRpeComboChart
                        data={comboData}
                        view={indivComboView}
                        onViewChange={setIndivComboView}
                        high={high}
                        title="Charge & RPE"
                        height={320}
                      />
                    </div>
                  );
                })()}

                {/* Tableau historique */}
                {indivDisplay === 'table' && (() => {
                  const loadT1 = Math.round(sessionLoadNormal / 3);
                  const loadT2 = Math.round(sessionLoadNormal * 2 / 3);
                  const loadCfg = (ua: number) => ua >= sessionLoadNormal
                    ? { color: '#EF4444', label: 'Surcharge' }
                    : ua >= loadT2 ? { color: '#F97316', label: 'Élevée' }
                    : ua >= loadT1 ? { color: '#EAB308', label: 'Soutenu' }
                    : { color: '#00E5A0', label: 'Normal' };

                  // Agrégation semaine
                  const weekMap = new Map<string, { rpes: number[]; totalLoad: number; totalDur: number; dates: string[]; teams: Set<string> }>();
                  filtered.forEach(e => {
                    const k = getWeekMonday(e.date);
                    if (!weekMap.has(k)) weekMap.set(k, { rpes: [], totalLoad: 0, totalDur: 0, dates: [], teams: new Set() });
                    const w = weekMap.get(k)!;
                    const dur = e.actualDuration ?? e.plannedDuration;
                    w.rpes.push(e.rpe);
                    w.totalLoad += e.rpe * dur;
                    w.totalDur  += dur;
                    w.dates.push(e.date);
                    if (e.teamName) w.teams.add(e.teamName);
                  });
                  const weekRows = [...weekMap.entries()]
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([, { rpes, totalLoad, totalDur, dates, teams }]) => {
                      const sorted = [...dates].sort();
                      return {
                        dateFrom:  sorted[0],
                        dateTo:    sorted[sorted.length - 1],
                        avgRpe:    Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
                        totalLoad: Math.round(totalLoad),
                        totalDur,
                        teamLabel: [...teams].join(', ') || '—',
                      };
                    });

                  return (
                    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Historique des séances</p>
                        <div style={{ display: 'flex', gap: 2, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, padding: 2 }}>
                          {(['session', 'week'] as const).map(v => (
                            <button key={v} onClick={() => setIndivTableView(v)}
                              style={{ padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.68rem',
                                backgroundColor: indivTableView === v ? '#2A2F3A' : 'transparent',
                                color: indivTableView === v ? '#F1F5F9' : '#475569', transition: 'all 0.12s' }}>
                              {v === 'session' ? 'Séance' : 'Semaine'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        {indivTableView === 'session' ? (
                          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '20%' }} />
                              <col /><col /><col /><col /><col /><col />
                            </colgroup>
                            <thead>
                              <tr>
                                {['Date', 'Type', 'Équipe', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
                                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(e => {
                                const dur     = e.actualDuration ?? e.plannedDuration;
                                const load    = e.rpe * dur;
                                const rpeC    = rpeColor(e.rpe);
                                const typeCfg = SESSION_TYPES[e.sessionType] ?? SESSION_TYPES.training;
                                const lCfg    = loadCfg(load);
                                return (
                                  <tr key={e.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                                    <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDateWithDay(e.date)}</td>
                                    <td style={{ padding: '9px 14px' }}>
                                      <span style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{typeCfg.label}</span>
                                    </td>
                                    <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem' }}>{e.teamName ?? '—'}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{dur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ color: rpeC, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{e.rpe}</span></td>
                                    <td style={{ padding: '9px 14px', color: lCfg.color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{load.toLocaleString('fr')}</td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ backgroundColor: lCfg.color + '20', color: lCfg.color, fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{lCfg.label}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                            <colgroup>
                              <col style={{ width: '20%' }} />
                              <col /><col /><col /><col /><col /><col />
                            </colgroup>
                            <thead>
                              <tr>
                                {['Date', 'Type', 'Équipe', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
                                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {weekRows.map(w => {
                                const lCfg = loadCfg(w.totalLoad);
                                const rpeC = rpeColor(w.avgRpe);
                                const dateLabel = w.dateFrom === w.dateTo
                                  ? fmtDateWithDay(w.dateFrom)
                                  : `${fmtDateWithDay(w.dateFrom)} → ${fmtDateWithDay(w.dateTo)}`;
                                return (
                                  <tr key={w.dateFrom} style={{ borderBottom: '1px solid #2A2F3A22' }}
                                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                                    <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{dateLabel}</td>
                                    <td style={{ padding: '9px 14px' }}>
                                      <span style={{ backgroundColor: '#3B82F622', color: '#3B82F6', fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>Semaine</span>
                                    </td>
                                    <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{w.teamLabel}</td>
                                    <td style={{ padding: '9px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.totalDur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ color: rpeC, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{w.avgRpe}</span></td>
                                    <td style={{ padding: '9px 14px', color: lCfg.color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{w.totalLoad.toLocaleString('fr')}</td>
                                    <td style={{ padding: '9px 14px' }}><span style={{ backgroundColor: lCfg.color + '20', color: lCfg.color, fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{lCfg.label}</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })()}
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
            {(['30j', 'saison'] as const).map(p => (
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
          ) : teamPeriod === 'saison' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* KPIs saison */}
              {(() => {
                const arrow = (delta: number) => {
                  const c = delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#475569';
                  const sym = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
                  return <span style={{ color: c, fontSize: '0.85rem', marginLeft: 4, fontFamily: 'JetBrains Mono, monospace' }}>{sym}</span>;
                };
                const fmt = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
                const today30 = new Date().toLocaleDateString('sv');
                const sub30 = (delta: number, unit = '') =>
                  <span style={{ color: '#475569', fontSize: '0.67rem' }}>
                    <span style={{ color: delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#94A3B8', fontWeight: 600 }}>
                      {delta > 0 ? '+' : ''}{delta}{unit}
                    </span>
                    {' '}du {fmt(thirtyDaysAgoStr)} au {fmt(today30)}
                  </span>;

                const chargeDelta = avgWeeklyLoad30j > 0 && avgWeeklyLoadSaison > 0
                  ? avgWeeklyLoad30j - avgWeeklyLoadSaison : null;
                const rpeDelta = teamSeasonAvgRpe !== null && rpe30j !== null
                  ? Math.round((rpe30j - teamSeasonAvgRpe) * 10) / 10 : null;

                // Semaines en surcharge
                const weekLoadMap = new Map<string, { load: number; playerSum: number; count: number }>();
                teamSessionRows.forEach(s => {
                  const k = getWeekMonday(s.date);
                  if (!weekLoadMap.has(k)) weekLoadMap.set(k, { load: 0, playerSum: 0, count: 0 });
                  const w = weekLoadMap.get(k)!;
                  w.load      += s.totalLoad;
                  w.playerSum += s.nbPlayers;
                  w.count++;
                });
                const totalWeeks = weekLoadMap.size;
                const surchargeWeeks = [...weekLoadMap.values()].filter(w => {
                  const avgPlayers = w.playerSum / w.count;
                  return avgPlayers > 0 && (w.load / avgPlayers) >= thresholds.normalMax;
                }).length;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    <RpeKpiCard
                      accent={tierSaison.color}
                      label="Charge moyenne par semaine"
                      value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span>{avgWeeklyLoadSaison > 0 ? avgWeeklyLoadSaison.toLocaleString('fr') : '—'}<span style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></span>
                        <span style={{ backgroundColor: tierSaison.color + '22', color: tierSaison.color, fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{tierSaison.label}</span>
                      </span>}
                      sub={chargeDelta !== null ? <>{arrow(chargeDelta)}{' '}{sub30(chargeDelta, ' UA')}</> : undefined}
                    />
                    <RpeKpiCard
                      accent={teamSeasonAvgRpe !== null ? rpeColor(teamSeasonAvgRpe) : '#334155'}
                      label="RPE moyen de la saison"
                      value={teamSeasonAvgRpe !== null ? teamSeasonAvgRpe : '—'}
                      sub={rpeDelta !== null ? <>{arrow(rpeDelta)}{' '}{sub30(rpeDelta)}</> : (teamSeasonAvgRpe !== null ? rpeLabel(Math.round(teamSeasonAvgRpe)) : '—')}
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
                      label="Séances totales"
                      value={teamKpis ? teamKpis.sessions : '—'}
                      valueColor="#F1F5F9"
                      sub="toute la saison"
                    />
                  </div>
                );
              })()}

              <TeamDisplayToggle value={teamSaisonDisplay} onChange={setTeamSaisonDisplay} />

              {/* Graphique */}
              {teamSaisonDisplay === 'chart' && (() => {
                const sessionCombo = [...teamSessionRows].reverse().map(s => ({
                  date: fmtDateWithDay(s.date),
                  load: Math.round(s.totalLoad / Math.max(s.nbPlayers, 1)),
                  rpe:  s.avg,
                }));
                const weekCombMap = new Map<string, { load: number; playerSum: number; count: number; rpes: number[] }>();
                teamSessionRows.forEach(s => {
                  const k = getWeekMonday(s.date);
                  if (!weekCombMap.has(k)) weekCombMap.set(k, { load: 0, playerSum: 0, count: 0, rpes: [] });
                  const e = weekCombMap.get(k)!;
                  e.load += s.totalLoad; e.playerSum += s.nbPlayers; e.count += 1;
                  if (s.avg > 0) e.rpes.push(s.avg);
                });
                const weekCombo = [...weekCombMap.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([d, { load, playerSum, count, rpes }]) => ({
                    date: fmtDateWithDay(d),
                    load: Math.round(load / Math.max(playerSum / count, 1)),
                    rpe:  rpes.length ? Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10 : 0,
                  }))
                  .filter(d => d.rpe > 0);
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

              {teamSaisonDisplay === 'table' && (
                <TeamSessionHistoryTable rows={teamSessionRows} sessionLoadNormal={sessionLoadNormal} />
              )}

              {teamSaisonDisplay === 'ranking' && (
                <PlayerRankingTable players={playerRanking} sessionLoadNormal={sessionLoadNormal} normalMax={thresholds.normalMax} />
              )}

            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* KPIs 30j */}
              {(() => {
                const arrow = (delta: number) => {
                  const c = delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#475569';
                  const sym = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
                  return <span style={{ color: c, fontSize: '0.85rem', marginLeft: 4, fontFamily: 'JetBrains Mono, monospace' }}>{sym}</span>;
                };
                const fmt30 = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
                const today30str = new Date().toLocaleDateString('sv');
                const sub30j = (delta: number, unit = '') =>
                  <span style={{ color: '#475569', fontSize: '0.67rem' }}>
                    <span style={{ color: delta > 0 ? '#EF4444' : delta < 0 ? '#00E5A0' : '#94A3B8', fontWeight: 600 }}>
                      {delta > 0 ? '+' : ''}{delta}{unit}
                    </span>
                    {' '}du {fmt30(thirtyDaysAgoStr)} au {fmt30(today30str)}
                  </span>;

                // Charge moy par semaine sur 30j
                const weekLoadMap30j = new Map<string, { load: number; playerSum: number; count: number }>();
                rows30jTeam.forEach(s => {
                  const k = getWeekMonday(s.date);
                  if (!weekLoadMap30j.has(k)) weekLoadMap30j.set(k, { load: 0, playerSum: 0, count: 0 });
                  const w = weekLoadMap30j.get(k)!;
                  w.load += s.totalLoad; w.playerSum += s.nbPlayers; w.count++;
                });
                const totalWeeks30j = weekLoadMap30j.size;
                const surchargeWeeks30j = [...weekLoadMap30j.values()].filter(w => {
                  const avgPlayers = w.playerSum / w.count;
                  return avgPlayers > 0 && (w.load / avgPlayers) >= thresholds.normalMax;
                }).length;
                const weekLoads30j = [...weekLoadMap30j.values()].map(w => {
                  const avg = w.playerSum / w.count;
                  return avg > 0 ? Math.round(w.load / avg) : 0;
                });
                const avgWeekLoad30jVal = weekLoads30j.length
                  ? Math.round(weekLoads30j.reduce((s, v) => s + v, 0) / weekLoads30j.length)
                  : 0;
                const tier30jKpi = getWeekTier(avgWeekLoad30jVal, thresholds.lightMax, thresholds.normalMax);

                // RPE moyen 30j
                const rpe30jAvg = rpe30j;

                // Comparaison vs saison (pour sous-titres)
                const chargeDelta30j = avgWeekLoad30jVal > 0 && avgWeeklyLoadSaison > 0
                  ? avgWeekLoad30jVal - avgWeeklyLoadSaison : null;
                const rpeDelta30j = teamSeasonAvgRpe !== null && rpe30jAvg !== null
                  ? Math.round((rpe30jAvg - teamSeasonAvgRpe) * 10) / 10 : null;

                const nbSeances30j = rows30jTeam.length;

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                    <RpeKpiCard
                      accent={tier30jKpi.color}
                      label="Charge moyenne par semaine"
                      value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span>{avgWeekLoad30jVal > 0 ? avgWeekLoad30jVal.toLocaleString('fr') : '—'}<span style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></span>
                        <span style={{ backgroundColor: tier30jKpi.color + '22', color: tier30jKpi.color, fontSize: '0.62rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>{tier30jKpi.label}</span>
                      </span>}
                      sub={chargeDelta30j !== null ? <>{arrow(chargeDelta30j)}{' '}{sub30j(chargeDelta30j, ' UA')}</> : undefined}
                    />
                    <RpeKpiCard
                      accent={rpe30jAvg !== null ? rpeColor(rpe30jAvg) : '#334155'}
                      label="RPE moyen de la période"
                      value={rpe30jAvg !== null ? rpe30jAvg : '—'}
                      sub={rpeDelta30j !== null ? <>{arrow(rpeDelta30j)}{' '}{sub30j(rpeDelta30j)}</> : (rpe30jAvg !== null ? rpeLabel(Math.round(rpe30jAvg)) : '—')}
                    />
                    <RpeKpiCard
                      accent={surchargeWeeks30j > 0 ? '#EF4444' : '#00E5A0'}
                      label="Semaines surcharge"
                      value={<><span style={{ color: surchargeWeeks30j > 0 ? '#EF4444' : '#00E5A0' }}>{surchargeWeeks30j}</span><span style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 400 }}> / {totalWeeks30j}</span></>}
                      valueColor="#F1F5F9"
                      sub={totalWeeks30j > 0 ? `${Math.round(surchargeWeeks30j / totalWeeks30j * 100)} % des semaines` : '—'}
                    />
                    <RpeKpiCard
                      accent="#3B82F6"
                      label="Séances totales"
                      value={nbSeances30j}
                      valueColor="#F1F5F9"
                      sub="sur les 30 derniers jours"
                    />
                  </div>
                );
              })()}

              <TeamDisplayToggle value={team30jDisplay} onChange={setTeam30jDisplay} />

              {/* Graphique 30j */}
              {team30jDisplay === 'chart' && (() => {
                const sessionCombo30j = [...rows30jTeam].reverse().map(s => ({
                  date: fmtDateWithDay(s.date),
                  load: Math.round(s.totalLoad / Math.max(s.nbPlayers, 1)),
                  rpe:  s.avg,
                }));
                const weekCombMap30j = new Map<string, { load: number; playerSum: number; count: number; rpes: number[] }>();
                rows30jTeam.forEach(s => {
                  const k = getWeekMonday(s.date);
                  if (!weekCombMap30j.has(k)) weekCombMap30j.set(k, { load: 0, playerSum: 0, count: 0, rpes: [] });
                  const e = weekCombMap30j.get(k)!;
                  e.load += s.totalLoad; e.playerSum += s.nbPlayers; e.count += 1;
                  if (s.avg > 0) e.rpes.push(s.avg);
                });
                const weekCombo30j = [...weekCombMap30j.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([d, { load, playerSum, count, rpes }]) => ({
                    date: fmtDateWithDay(d),
                    load: Math.round(load / Math.max(playerSum / count, 1)),
                    rpe:  rpes.length ? Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10 : 0,
                  }))
                  .filter(d => d.rpe > 0);
                const comboData30j = teamComboView30j === 'session' ? sessionCombo30j : weekCombo30j;
                const high30j      = teamComboView30j === 'session' ? sessionLoadNormal : thresholds.normalMax;
                return (
                  <ChargeRpeComboChart
                    data={comboData30j}
                    view={teamComboView30j}
                    onViewChange={setTeamComboView30j}
                    high={high30j}
                    title="Charge UA + RPE — 30 derniers jours"
                    height={360}
                  />
                );
              })()}

              {team30jDisplay === 'table' && (
                <TeamSessionHistoryTable rows={rows30jTeam} sessionLoadNormal={sessionLoadNormal} title="Historique séances — 30j" />
              )}

              {team30jDisplay === 'ranking' && (
                <PlayerRankingTable players={playerRanking} sessionLoadNormal={sessionLoadNormal} normalMax={thresholds.normalMax} />
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
