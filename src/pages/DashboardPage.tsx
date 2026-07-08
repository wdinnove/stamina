import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Clock, Users, Activity, Trophy, Zap, Heart, Dumbbell } from 'lucide-react';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';
import { PlayerAvatar, Card, CardTitle, ChargeRpeComboChart } from '../components';
import { categoryConfig } from '../data/config';
import { playersApi, medicalApi, actionsApi, wellnessApi, matchesApi } from '../api';
import { supabase } from '../api/client';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, Action, MedicalRecord, Match } from '../data/types';
import { rpeColor } from '../utils/rpe';

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv');
}
function fmtShort(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}
function fmtWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' });
}

interface TrainingSession { id: string; date: string; planned_duration: number; session_type?: string }
interface SessionSummary  { id: string; date: string; duration: number; load: number | null; avgRpe: number | null; nbPlayers: number; type: string }
interface WeekStat { label: string; value: number | null }

type StatusLevel = 'injured' | 'rpe_overload' | 'wellness_bad' | 'limited' | 'rpe_medium' | 'wellness_medium' | 'ok';
const LEVEL_PRIORITY: Record<StatusLevel, number> = {
  injured: 0, rpe_overload: 1, wellness_bad: 2, limited: 3, rpe_medium: 4, wellness_medium: 5, ok: 6,
};
const LEVEL_COLOR: Record<StatusLevel, string> = {
  injured: '#EF4444', rpe_overload: '#EF4444', wellness_bad: '#EF4444',
  limited: '#F59E0B', rpe_medium: '#F59E0B', wellness_medium: '#F59E0B',
  ok: '#00E5A0',
};
interface PlayerInfo { player: Player; level: StatusLevel; label: string; detail: string; }


// ── Mini bar chart inline ─────────────────────────────────────────────────────
function WeekBars({ weeks, unit, fill }: { weeks: WeekStat[]; unit: string; fill?: boolean }) {
  const maxVal = Math.max(...weeks.map(w => w.value ?? 0), 1);

  const getColor = (value: number | null, idx: number): string => {
    if (value === null) return '#2A2F3A';
    if (unit !== 'UA') return value >= 7 ? '#00E5A0' : value >= 5 ? '#F59E0B' : '#EF4444';
    // Charge : surcharge si sem. courante >> moyenne des sem. précédentes
    if (idx === weeks.length - 1) {
      const prevs = weeks.slice(0, -1).filter(w => w.value !== null);
      if (prevs.length > 0) {
        const prevAvg = prevs.reduce((s, w) => s + (w.value ?? 0), 0) / prevs.length;
        if (prevAvg > 0 && value > prevAvg * 1.5) return '#EF4444';
        if (prevAvg > 0 && value > prevAvg * 1.25) return '#F59E0B';
      }
    }
    return '#3B82F6';
  };

  const lastColor = getColor(weeks.at(-1)?.value ?? null, weeks.length - 1);
  const isOverload = unit === 'UA' && (lastColor === '#EF4444' || lastColor === '#F59E0B');

  return (
    <div style={fill ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}>
      {isOverload && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.62rem', fontWeight: 700, color: lastColor, backgroundColor: `${lastColor}15`, border: `1px solid ${lastColor}30`, borderRadius: 4, padding: '2px 7px', marginBottom: 10 }}>
          ⚠ Surcharge détectée
        </span>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: fill ? 'stretch' : 'flex-end', flex: fill ? 1 : undefined, minHeight: fill ? 0 : undefined }}>
        {weeks.map(({ label, value }, idx) => {
          const pct   = value !== null ? Math.round(value / maxVal * 100) : 0;
          const color = getColor(value, idx);
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ color: value !== null ? color : '#334155', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                {value !== null
                  ? unit === 'UA'
                    ? value > 999 ? `${Math.round(value / 1000 * 10) / 10}k` : String(Math.round(value))
                    : value.toFixed(1)
                  : '—'}
              </span>
              <div style={{ width: '100%', flex: fill ? 1 : undefined, height: fill ? undefined : 32, minHeight: 0, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', height: `${pct}%`, minHeight: value !== null && value > 0 ? 3 : 0,
                  backgroundColor: color, borderRadius: 4, opacity: 0.75,
                }} />
              </div>
              <span style={{ color: '#475569', fontSize: '0.62rem', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          );
        })}
        {!fill && (
          <div style={{ flexShrink: 0, alignSelf: 'flex-end', paddingBottom: 18 }}>
            <span style={{ color: '#2A2F3A', fontSize: '0.6rem' }}>{unit}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Entraînement', match: 'Match', gym: 'Gym', rest: 'Repos',
};
const SESSION_TYPE_COLORS: Record<string, string> = {
  training: '#00E5A0', match: '#EF4444', gym: '#F59E0B', rest: '#3B82F6',
};
// ── Page principale ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { selected, loading: teamLoading, thresholds } = useTeamSeason();

  const today = useMemo(() => localDate(0), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  const [userName,        setUserName]        = useState('');
  const [players,         setPlayers]         = useState<Player[]>([]);
  const [injuries,        setInjuries]        = useState<MedicalRecord[]>([]);
  const [actions,         setActions]         = useState<Action[]>([]);
  const [playerInfos,     setPlayerInfos]     = useState<PlayerInfo[]>([]);
  const [last3Matches,    setLast3Matches]    = useState<Match[]>([]);
  const [last3Sessions,   setLast3Sessions]   = useState<SessionSummary[]>([]);
  const [rpeChartData,    setRpeChartData]    = useState<{ date: string; rpe: number; load: number }[]>([]);
  const [weeklyLoad,      setWeeklyLoad]      = useState<WeekStat[]>([]);
  const [weeklyWellness,    setWeeklyWellness]    = useState<WeekStat[]>([]);
  const [wellnessChartData, setWellnessChartData] = useState<{ date: string; label: string; score: number }[]>([]);
  const [weeklyComboData,   setWeeklyComboData]   = useState<{ date: string; load: number; rpe: number }[]>([]);
  const [chargeView,        setChargeView]        = useState<'session' | 'week'>('session');
  const [kpiStats,          setKpiStats]          = useState<{
    active: number; injured: number; limited: number;
    attendanceRate: number | null;
    wins: number; losses: number;
    avgLoad: number | null; avgRpe: number | null;
  } | null>(null);
  const [loading,         setLoading]         = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('first_name').eq('id', user.id).single()
        .then(({ data }) => { if (data) setUserName(data.first_name ?? ''); });
    });
  }, []);

  useEffect(() => {
    if (!selected || teamLoading) return;
    setLoading(true);
    setPlayers([]);
    setInjuries([]);
    setActions([]);
    setPlayerInfos([]);
    setLast3Matches([]);
    setLast3Sessions([]);
    setRpeChartData([]);
    setWeeklyLoad([]);
    setWeeklyWellness([]);
    setWellnessChartData([]);
    setWeeklyComboData([]);
    setKpiStats(null);

    const from30 = localDate(-30);
    const from21 = localDate(-20); // fenêtre 3 semaines glissantes
    const from7  = localDate(-7);

    // Périodes hebdomadaires (7j glissants × 3)
    const WEEKS = [
      { label: 'S-2', from: localDate(-20), to: localDate(-14) },
      { label: 'S-1', from: localDate(-13), to: localDate(-7)  },
      { label: 'Sem.', from: localDate(-6),  to: today          },
    ];

    Promise.all([
      playersApi.listBySeason(selected.season.id),
      medicalApi.getActiveInjuries(),
      actionsApi.list({ teamId: selected.team.id }),
      supabase
        .from('training_sessions')
        .select('id, date, planned_duration, session_type')
        .eq('team_id', selected.team.id)
        .eq('season_id', selected.season.id)
        .gte('date', from30)
        .lte('date', today)
        .order('date', { ascending: true }),
      wellnessApi.list({ from: from21, to: today }), // 3 semaines
      matchesApi.listBySeason(selected.team.id, selected.season.id),
    ])
      .then(async ([seasonPlayers, activeInjuries, allActions, sessResult, wellnessEntries, matchesList]) => {
        // Matchs
        setLast3Matches(matchesList.slice(0, 3));

        setPlayers(seasonPlayers);
        setInjuries(activeInjuries);

        const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));
        setActions(
          allActions
            .filter(a => a.status !== 'done' && seasonPlayerIds.has(a.playerId))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        );

        // Séances
        const sessions = (sessResult.data ?? []) as TrainingSession[];

        const sessionDurMap = new Map(sessions.map(s => [s.id, s.planned_duration]));
        const sessionDateMap = new Map(sessions.map(s => [s.id, s.date]));

        // ── RPE — une seule requête sur 21 jours ─────────────────────────────
        const sessions21d = sessions.filter(s => s.date >= from21);
        const sessionIds21d = sessions21d.map(s => s.id);

        type RpeRow = { player_id: string; rpe: number; actual_duration: number | null; session_id: string };

        if (sessionIds21d.length > 0) {
          const { data: rpeRows21d } = await supabase
            .from('rpe_entries')
            .select('player_id, rpe, actual_duration, session_id')
            .in('session_id', sessionIds21d);

          const rows = (rpeRows21d ?? []) as RpeRow[];

          // RPE moyen 7j (pour KPI card)
          const sessionIds7d = sessions.filter(s => s.date >= from7).map(s => s.id);
          const ids7dSet = new Set(sessionIds7d);
          // UA par joueur 7j (pour alertes)
          const playerUaMap = new Map<string, number>();
          for (const r of rows.filter(r => ids7dSet.has(r.session_id))) {
            const dur = r.actual_duration ?? sessionDurMap.get(r.session_id) ?? 0;
            playerUaMap.set(r.player_id, (playerUaMap.get(r.player_id) ?? 0) + r.rpe * dur);
          }

          // Charge hebdomadaire équipe (somme rpe×dur par semaine)
          const loadWeeks: WeekStat[] = WEEKS.map(w => {
            const load = rows.reduce((sum, r) => {
              const d = sessionDateMap.get(r.session_id);
              if (!d || d < w.from || d > w.to) return sum;
              const dur = r.actual_duration ?? sessionDurMap.get(r.session_id) ?? 0;
              return sum + r.rpe * dur;
            }, 0);
            return { label: w.label, value: load > 0 ? Math.round(load) : null };
          });
          setWeeklyLoad(loadWeeks);

          // Combo semaine (charge + RPE moyen) pour le graphique vue semaine
          const weeklyCombo = WEEKS.map(w => {
            const weekRows = rows.filter(r => {
              const d = sessionDateMap.get(r.session_id);
              return d !== undefined && d >= w.from && d <= w.to;
            });
            const load = weekRows.reduce((s, r) => {
              const dur = r.actual_duration ?? sessionDurMap.get(r.session_id) ?? 0;
              return s + r.rpe * dur;
            }, 0);
            const rpeVals = weekRows.map(r => r.rpe);
            const avgRpe = rpeVals.length
              ? Math.round(rpeVals.reduce((s, v) => s + v, 0) / rpeVals.length * 10) / 10
              : 0;
            return { date: w.label, load: Math.round(load), rpe: avgRpe };
          }).filter(w => w.load > 0);
          setWeeklyComboData(weeklyCombo);

          // 3 dernières séances avec charge
          const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
          const sessionLoadMap = new Map<string, { total: number; sumRpe: number; nb: number }>();
          for (const r of rows) {
            if (!sessionLoadMap.has(r.session_id)) sessionLoadMap.set(r.session_id, { total: 0, sumRpe: 0, nb: 0 });
            const entry = sessionLoadMap.get(r.session_id)!;
            const dur = r.actual_duration ?? sessionDurMap.get(r.session_id) ?? 0;
            entry.total  += r.rpe * dur;
            entry.sumRpe += r.rpe;
            entry.nb     += 1;
          }
          setLast3Sessions(recentSessions.map(s => {
            const e = sessionLoadMap.get(s.id);
            return {
              id: s.id, date: s.date, duration: s.planned_duration, type: s.session_type ?? 'training',
              load:    e ? Math.round(e.total) : null,
              avgRpe:  e ? Math.round(e.sumRpe / e.nb * 10) / 10 : null,
              nbPlayers: e?.nb ?? 0,
            };
          }));

          // Graphique RPE linéaire (par séance, ordre chronologique)
          const chartPoints = sessions21d
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .flatMap(s => {
              const e = sessionLoadMap.get(s.id);
              if (!e || e.nb === 0) return [];
              return [{ date: fmtShort(s.date), rpe: Math.round(e.sumRpe / e.nb * 10) / 10, load: Math.round(e.total) }];
            });
          setRpeChartData(chartPoints);

          // Alertes joueurs (basées sur 7j)
          const injuryMap = new Map(activeInjuries.map(inj => [inj.playerId, inj]));
          const { lightMax, normalMax } = thresholds;
          const latestWellMap = new Map<string, { score: number; date: string }>();
          for (const w of wellnessEntries) {
            const ex = latestWellMap.get(w.playerId);
            if (!ex || w.date > ex.date) latestWellMap.set(w.playerId, w);
          }
          const infos: PlayerInfo[] = seasonPlayers.map(player => {
            const inj     = injuryMap.get(player.id);
            const ua      = playerUaMap.get(player.id) ?? 0;
            const wellness = latestWellMap.get(player.id);
            if (player.status === 'injured') return { player, level: 'injured', label: inj?.description ?? 'Blessé', detail: inj?.rtpDate ? `RTP ${inj.rtpDate.slice(5).replace('-', '/')}` : 'En cours' };
            if (player.status === 'limited') return { player, level: 'limited', label: inj?.description ?? 'Limité', detail: inj ? 'Limité' : '' };
            if (ua > normalMax) return { player, level: 'rpe_overload', label: 'Surcharge RPE', detail: `${Math.round(ua)} UA` };
            if (wellness && wellness.score < 5) return { player, level: 'wellness_bad', label: 'Bien-être dégradé', detail: `${wellness.score.toFixed(1)}/10` };
            if (ua > normalMax / 2) return { player, level: 'rpe_medium', label: 'Charge élevée', detail: `${Math.round(ua)} UA` };
            if (wellness && wellness.score < 7) return { player, level: 'wellness_medium', label: 'Bien-être moyen', detail: `${wellness.score.toFixed(1)}/10` };
            return { player, level: 'ok', label: 'En forme', detail: '' };
          });
          infos.sort((a, b) => LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level]);
          setPlayerInfos(infos);
        } else {
          setWeeklyLoad(WEEKS.map(w => ({ label: w.label, value: null })));
          const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
          setLast3Sessions(recentSessions.map(s => ({ id: s.id, date: s.date, duration: s.planned_duration, type: s.session_type ?? 'training', load: null, avgRpe: null, nbPlayers: 0 })));
          const injuryMap = new Map(activeInjuries.map(inj => [inj.playerId, inj]));
          const latestWellMap = new Map<string, { score: number; date: string }>();
          for (const w of wellnessEntries) {
            const ex = latestWellMap.get(w.playerId);
            if (!ex || w.date > ex.date) latestWellMap.set(w.playerId, w);
          }
          const infos: PlayerInfo[] = seasonPlayers.map(player => {
            const inj = injuryMap.get(player.id);
            const wellness = latestWellMap.get(player.id);
            if (player.status === 'injured') return { player, level: 'injured', label: inj?.description ?? 'Blessé', detail: inj?.rtpDate ? `RTP ${inj.rtpDate.slice(5).replace('-', '/')}` : 'En cours' };
            if (player.status === 'limited') return { player, level: 'limited', label: inj?.description ?? 'Limité', detail: '' };
            if (wellness && wellness.score < 5) return { player, level: 'wellness_bad', label: 'Bien-être dégradé', detail: `${wellness.score.toFixed(1)}/10` };
            if (wellness && wellness.score < 7) return { player, level: 'wellness_medium', label: 'Bien-être moyen', detail: `${wellness.score.toFixed(1)}/10` };
            return { player, level: 'ok', label: 'En forme', detail: '' };
          });
          infos.sort((a, b) => LEVEL_PRIORITY[a.level] - LEVEL_PRIORITY[b.level]);
          setPlayerInfos(infos);
        }

        // ── Wellness hebdomadaire ─────────────────────────────────────────────
        const wellWeeks: WeekStat[] = WEEKS.map(w => {
          const entries = wellnessEntries.filter(e => e.date >= w.from && e.date <= w.to);
          const score = entries.length > 0
            ? Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length * 10) / 10
            : null;
          return { label: w.label, value: score };
        });
        setWeeklyWellness(wellWeeks);

        // Bien-être par séance (moyenne journalière)
        const dailyWellMap = new Map<string, number[]>();
        for (const w of wellnessEntries) {
          if (!dailyWellMap.has(w.date)) dailyWellMap.set(w.date, []);
          dailyWellMap.get(w.date)!.push(w.score);
        }
        const wellPoints = [...dailyWellMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, scores]) => ({
            date,
            label: fmtShort(date),
            score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10,
          }));
        setWellnessChartData(wellPoints);

        // ── KPI saison ────────────────────────────────────────────────────────
        const kpiActive  = seasonPlayers.filter(p => p.status !== 'injured').length;
        const kpiInjured = seasonPlayers.filter(p => p.status === 'injured').length;
        const kpiLimited = seasonPlayers.filter(p => p.status === 'limited').length;
        const kpiWins    = matchesList.filter(m => m.result === 'win').length;
        const kpiLosses  = matchesList.filter(m => m.result === 'loss').length;

        const { data: allSessRaw } = await supabase
          .from('training_sessions')
          .select('id, date, planned_duration, session_type')
          .eq('team_id', selected.team.id)
          .eq('season_id', selected.season.id)
          .lte('date', today);
        type SessRow = { id: string; date: string; planned_duration: number; session_type: string };
        const allSessRows  = (allSessRaw ?? []) as SessRow[];
        const allSessIds   = allSessRows.map(s => s.id);
        const trainSessIds = allSessRows.filter(s => s.session_type === 'training').map(s => s.id);

        const [{ data: seasonRpeRaw }, { data: seasonAttRaw }] = await Promise.all([
          allSessIds.length > 0
            ? supabase.from('rpe_entries').select('rpe, actual_duration, session_id').in('session_id', allSessIds)
            : Promise.resolve({ data: [] }),
          trainSessIds.length > 0
            ? supabase.from('training_attendance').select('status').in('session_id', trainSessIds)
            : Promise.resolve({ data: [] }),
        ]);

        const durMap2   = new Map(allSessRows.map(s => [s.id, s.planned_duration]));
        const dateMap2  = new Map(allSessRows.map(s => [s.id, s.date]));
        type RpeRowSeason = { rpe: number; actual_duration: number | null; session_id: string };
        const seasonRpeRows = (seasonRpeRaw ?? []) as RpeRowSeason[];
        const totalSeasonLoad = seasonRpeRows.reduce((s, r) => {
          const dur = r.actual_duration ?? durMap2.get(r.session_id) ?? 0;
          return s + r.rpe * dur;
        }, 0);
        // Charge par semaine (lundi = clé)
        const weekLoadMap = new Map<string, number>();
        for (const r of seasonRpeRows) {
          const d = dateMap2.get(r.session_id);
          if (!d) continue;
          const dt = new Date(d + 'T12:00:00');
          const day = dt.getDay();
          dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
          const wk = dt.toLocaleDateString('sv');
          const dur = r.actual_duration ?? durMap2.get(r.session_id) ?? 0;
          weekLoadMap.set(wk, (weekLoadMap.get(wk) ?? 0) + r.rpe * dur);
        }
        const nbWeeks = weekLoadMap.size;
        const avgSeasonLoad = nbWeeks > 0 ? Math.round(totalSeasonLoad / nbWeeks) : null;
        const avgSeasonRpe  = seasonRpeRows.length > 0
          ? Math.round(seasonRpeRows.reduce((s, r) => s + r.rpe, 0) / seasonRpeRows.length * 10) / 10
          : null;

        const attRows = (seasonAttRaw ?? []) as { status: string }[];
        const presentCount = attRows.filter(a => a.status === 'present' || a.status === 'late').length;
        const kpiAttRate   = attRows.length > 0 ? Math.round(presentCount / attRows.length * 100) : null;

        setKpiStats({
          active: kpiActive, injured: kpiInjured, limited: kpiLimited,
          attendanceRate: kpiAttRate,
          wins: kpiWins, losses: kpiLosses,
          avgLoad: avgSeasonLoad, avgRpe: avgSeasonRpe,
        });

        setLoading(false);
      })
      .catch(err => { console.error('[Dashboard]', err); setLoading(false); });
  }, [selected, teamLoading]);

  // Actions : 3 items max, retard en premier
  const topActions = [
    ...actions.filter(a => a.dueDate < today),
    ...actions.filter(a => a.dueDate >= today),
  ].slice(0, 3);

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;
  if (!selected) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Sélectionnez une équipe et une saison dans la barre du haut pour afficher le dashboard.</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: '0 0 2px' }}>{userName ? `Bonjour ${userName}` : 'Bonjour'}</h1>
        <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>{todayLabel} · {selected.team.name}</p>
      </div>

      {/* KPI saison */}
      {kpiStats && (() => {
        const { active, injured, limited, attendanceRate, wins, losses, avgLoad, avgRpe } = kpiStats;
        const { normalMax } = thresholds;
        const loadColor = avgLoad === null ? '#475569'
          : avgLoad > normalMax ? '#EF4444'
          : avgLoad > normalMax * 2 / 3 ? '#F97316'
          : avgLoad > normalMax / 3 ? '#EAB308' : '#00E5A0';
        const loadLabel = avgLoad === null ? null
          : avgLoad > normalMax ? 'Surcharge'
          : avgLoad > normalMax * 2 / 3 ? 'Élevée'
          : avgLoad > normalMax / 3 ? 'Soutenu' : 'Normal';
        const attColor = attendanceRate === null ? '#475569'
          : attendanceRate >= 80 ? '#00E5A0' : attendanceRate >= 60 ? '#F59E0B' : '#EF4444';
        const activeColor = active >= 10 ? '#00E5A0' : active >= 8 ? '#F59E0B' : '#EF4444';
        const kpis = [
          {
            label: 'Effectif',
            value: <span style={{ color: activeColor, fontFamily: 'JetBrains Mono, monospace' }}>{active}</span>,
            sub: <>{injured > 0 && <span style={{ color: '#EF4444' }}>{injured} blessé{injured > 1 ? 's' : ''}</span>}{injured > 0 && limited > 0 && ' · '}{limited > 0 && <span style={{ color: '#F59E0B' }}>{limited} limité{limited > 1 ? 's' : ''}</span>}{injured === 0 && limited === 0 && <span style={{ color: '#00E5A0' }}>Tous disponibles</span>}</>,
            accent: activeColor,
            href: '/roster',
          },
          {
            label: 'Bilan matchs',
            value: <span style={{ fontFamily: 'JetBrains Mono, monospace' }}><span style={{ color: '#00E5A0' }}>{wins}V</span><span style={{ color: '#475569', margin: '0 4px' }}>·</span><span style={{ color: '#EF4444' }}>{losses}D</span></span>,
            sub: <span style={{ color: '#475569' }}>{wins + losses} match{wins + losses > 1 ? 's' : ''}</span>,
            accent: wins > losses ? '#00E5A0' : wins < losses ? '#EF4444' : '#475569',
            href: '/matches',
          },
          {
            label: 'Charge moy / semaine',
            value: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ color: loadColor, fontFamily: 'JetBrains Mono, monospace' }}>{avgLoad !== null ? avgLoad.toLocaleString('fr') : '—'}</span>
              {loadLabel && <span style={{ backgroundColor: loadColor + '22', color: loadColor, fontSize: '0.58rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{loadLabel}</span>}
            </span>,
            sub: <span style={{ color: '#475569' }}>UA · saison</span>,
            accent: loadColor,
            href: '/rpe',
          },
          {
            label: 'RPE moyen',
            value: <span style={{ color: avgRpe !== null ? rpeColor(avgRpe) : '#475569', fontFamily: 'JetBrains Mono, monospace' }}>{avgRpe !== null ? avgRpe : '—'}</span>,
            sub: <span style={{ color: '#475569' }}>/ 10 · saison</span>,
            accent: avgRpe !== null ? rpeColor(avgRpe) : '#475569',
            href: '/rpe',
          },
        ];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 8, marginBottom: 12 }}>
            {kpis.map(({ label, value, sub, accent, href }) => (
              <div key={label} onClick={() => navigate(href)} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1A1E26'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#161920'}
              >
                <p style={{ color: '#475569', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{label}</p>
                <p style={{ color: '#F1F5F9', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
                <p style={{ margin: 0, fontSize: '0.68rem' }}>{sub}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Ligne 1 : Effectif */}
      {!loading && playerInfos.length > 0 && (() => {
        const alertCount = playerInfos.filter(i => i.level !== 'ok').length;
        return (
          <Card style={{ marginBottom: 12 }}>
            <CardTitle
              icon={<Users size={12} color="#3B82F6" />}
              mb={12}
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {alertCount > 0 && (
                    <span style={{ color: '#F59E0B', fontSize: '0.68rem', fontWeight: 600 }}>
                      {alertCount} alerte{alertCount > 1 ? 's' : ''}
                    </span>
                  )}
                  <button onClick={() => navigate('/roster')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
                    Voir tout <ArrowRight size={10} />
                  </button>
                </div>
              }
            >Effectif</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-4" style={{ gap: 4 }}>
              {playerInfos.map(({ player, level, label, detail }) => {
                const col      = LEVEL_COLOR[level];
                const isOk     = level === 'ok';
                const isAlert  = level === 'injured' || level === 'rpe_overload' || level === 'wellness_bad';
                const isWarn   = level === 'limited' || level === 'rpe_medium' || level === 'wellness_medium';
                const border   = isAlert || isWarn
                  ? `${isAlert ? 2 : 1.5}px solid ${col}60`
                  : '1px solid #3A4150';
                return (
                  <div key={player.id} onClick={() => navigate(`/players/${player.id}`, { state: { from: '/dashboard' } })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', border, borderRadius: 5, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1E2229'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: col, flexShrink: 0, opacity: isOk ? 0.25 : 1 }} />
                    <PlayerAvatar player={player} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#CBD5E1', fontSize: '0.78rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                        {player.firstName ?? '?'} {player.lastName?.[0] ?? '?'}.
                      </p>
                    </div>
                    {!isOk && (
                      <span style={{ color: col, fontSize: '0.62rem', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45%' }}>
                        {label}{detail ? ` · ${detail}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* Ligne 2 : Séances | Matchs | Actions */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 12, marginBottom: 12 }}>

          {/* 3 dernières séances */}
          <Card>
            <CardTitle
              icon={<Dumbbell size={12} color="#00E5A0" />}
              mb={12}
              right={<button onClick={() => navigate('/sessions')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Voir tout <ArrowRight size={10} /></button>}
            >Séances récentes</CardTitle>
            {last3Sessions.length === 0 ? (
              <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune séance récente.</p>
            ) : (
              last3Sessions.map((s, idx) => {
                const typeColor = SESSION_TYPE_COLORS[s.type] ?? '#475569';
                const rpeCol    = s.avgRpe !== null ? rpeColor(s.avgRpe) : '#334155';
                return (
                  <div key={s.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: idx < last3Sessions.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.7'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
                    onClick={() => navigate(`/sessions/${s.id}`)}
                  >
                    <div style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: typeColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#CBD5E1', fontSize: '0.78rem', fontWeight: 500, margin: '0 0 2px', whiteSpace: 'nowrap' }}>
                        {fmtWeekday(s.date)} {fmtShort(s.date)}
                        {s.date === today && <span style={{ color: '#00E5A0', fontSize: '0.6rem', marginLeft: 5, fontWeight: 700 }}>Auj.</span>}
                      </p>
                      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: typeColor, fontSize: '0.62rem', fontWeight: 700 }}>{SESSION_TYPE_LABELS[s.type] ?? s.type}</span>
                        <span style={{ color: '#2A2F3A', fontSize: '0.6rem' }}>·</span>
                        <span style={{ color: '#334155', fontSize: '0.62rem' }}>{s.duration} min</span>
                      </p>
                    </div>
                    {s.avgRpe !== null ? (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: rpeCol, fontSize: '1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                          {s.avgRpe.toFixed(1)}
                        </div>
                        <div style={{ color: '#334155', fontSize: '0.58rem', marginTop: 2 }}>RPE /10</div>
                      </div>
                    ) : (
                      <span style={{ color: '#2A2F3A', fontSize: '0.72rem' }}>—</span>
                    )}
                  </div>
                );
              })
            )}
          </Card>

          {/* 3 derniers matchs */}
          <Card>
            <CardTitle
              icon={<Trophy size={12} color="#F59E0B" />}
              mb={12}
              right={<button onClick={() => navigate('/matches')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Voir tout <ArrowRight size={10} /></button>}
            >Derniers matchs</CardTitle>
            {last3Matches.length === 0 ? (
              <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucun match enregistré.</p>
            ) : (
              last3Matches.map((match, idx) => {
                const win = match.result === 'win';
                const matchColor = win ? '#00E5A0' : '#EF4444';
                return (
                  <div key={match.id} onClick={() => navigate(`/matches/${match.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: idx < last3Matches.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.7'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
                  >
                    <div style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: matchColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#CBD5E1', fontSize: '0.78rem', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        vs {match.opponent}
                      </p>
                      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: matchColor, fontSize: '0.62rem', fontWeight: 700 }}>{win ? 'Victoire' : 'Défaite'}</span>
                        <span style={{ color: '#2A2F3A', fontSize: '0.6rem' }}>·</span>
                        <span style={{ color: '#334155', fontSize: '0.62rem' }}>{match.homeAway === 'home' ? 'Dom.' : 'Ext.'} · {fmtShort(match.date)}</span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: '#F1F5F9', fontSize: '1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                        {match.scoreUs}–{match.scoreThem}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </Card>

          {/* Actions — 3 items max */}
          <Card>
            <CardTitle
              icon={<Clock size={12} color="#fb923c" />}
              mb={12}
              right={<button onClick={() => navigate('/actions')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Voir tout <ArrowRight size={10} /></button>}
            >Tâches</CardTitle>
            {topActions.length === 0 ? (
              <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune tâche en cours.</p>
            ) : (
              topActions.map((action, idx) => {
                const player  = players.find(p => p.id === action.playerId);
                const cat     = categoryConfig[action.category];
                const overdue = action.dueDate < today;
                const barColor = overdue ? '#EF4444' : cat.color;
                return (
                  <div key={action.id} onClick={() => navigate('/actions')}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: idx < topActions.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.7'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
                  >
                    <div style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: barColor, flexShrink: 0 }} />
                    {player && <PlayerAvatar player={player} size={22} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#CBD5E1', fontSize: '0.78rem', fontWeight: 500, margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {action.title}
                      </p>
                      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: cat.color, fontSize: '0.62rem', fontWeight: 700 }}>{cat.label}</span>
                        {overdue && <>
                          <span style={{ color: '#2A2F3A', fontSize: '0.6rem' }}>·</span>
                          <span style={{ color: '#EF4444', fontSize: '0.62rem', fontWeight: 700 }}>En retard</span>
                        </>}
                      </p>
                    </div>
                    <span style={{ color: overdue ? '#EF4444' : '#334155', fontSize: '0.65rem', flexShrink: 0, fontWeight: overdue ? 700 : 400 }}>
                      {action.dueDate.slice(5).replace('-', '/')}
                    </span>
                  </div>
                );
              })
            )}
          </Card>
        </div>
      )}

    </div>
  );
}
