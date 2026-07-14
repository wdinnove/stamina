import { useState, useEffect, useMemo, useRef, type ReactNode, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { Dumbbell, Trophy, Stethoscope, Activity, Heart, CheckSquare, ArrowRight } from 'lucide-react';
import { Badge, StatusBadge, PlayerAvatar } from '../components';
import { playersApi, medicalApi, actionsApi, wellnessApi, matchesApi, rpeApi, attendanceApi } from '../api';
import { profileApi } from '../api/profile';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import type { PlayerCrossData } from '../data/crossAnalysis';
import { WELLNESS_DIMENSIONS, wellnessScoreColor } from '../utils/wellness';
import type { Player, Action, MedicalRecord, Match, WellnessEntry } from '../data/types';
import { rpeColor, rpeLabel, computeAcwr, acwrZone } from '../utils/rpe';
import { mondayIso } from '../utils/weeklyLoad';
import { fmtDateShort } from '../utils/dateFormat';

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv');
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
interface PlayerInfo { player: Player; level: StatusLevel; label: string; detail: string; }

/**
 * Détecte un seuil bien-être franchi (bas ou haut), sur le score global ou l'une des 6
 * notes (redressée selon le sens de l'axe).
 */
function wellnessThresholdInfo(
  entry: WellnessEntry | undefined,
  compare: (v: number) => boolean,
  qualifier: string,
): { show: boolean; text: string; tooltip: string } {
  if (!entry) return { show: false, text: '', tooltip: '' };
  const dims = WELLNESS_DIMENSIONS.filter(dim => compare(dim.inverted ? 11 - entry[dim.key] : entry[dim.key]));
  const globalMatch = compare(entry.score);
  const count = dims.length + (globalMatch ? 1 : 0);

  if (count === 0) return { show: false, text: '', tooltip: '' };
  if (count === 1 && dims.length === 1) {
    const dim = dims[0];
    return { show: true, text: dim.shortLabel, tooltip: `${dim.label} ${qualifier}` };
  }
  const tooltip = globalMatch && dims.length === 0
    ? `Score global ${qualifier} (${entry.score.toFixed(1)}/10)`
    : `Plusieurs notes ${qualifier}s : ${dims.map(d => d.shortLabel).join(', ')}${globalMatch ? ' + score global' : ''}`;
  return { show: true, text: 'Bien-être', tooltip };
}

const wellnessAlertInfo = (entry: WellnessEntry | undefined) => wellnessThresholdInfo(entry, v => v < 5, 'basse');

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
  const { data: perfData } = usePerformanceData();

  const today = useMemo(() => localDate(0), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  // ACWR à la date du jour, par joueuse — dérivé de l'historique complet (perfData) pour
  // un calcul correct même en tout début de saison.
  const acwrByPlayer = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!perfData) return map;
    for (const pd of perfData.players) map.set(pd.player.id, computeAcwr(pd.rpe, today));
    return map;
  }, [perfData, today]);

  // Dernière entrée bien-être par joueuse
  const latestWellnessByPlayer = useMemo(() => {
    const map = new Map<string, WellnessEntry | undefined>();
    if (!perfData) return map;
    for (const pd of perfData.players) {
      map.set(pd.player.id, [...pd.wellness].sort((a, b) => b.date.localeCompare(a.date))[0]);
    }
    return map;
  }, [perfData]);

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
    profileApi.getCurrent().then(profile => { if (profile) setUserName(profile.firstName); });
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
      rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, from30, today),
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
        const sessions: TrainingSession[] = sessResult.map(s => ({
          id: s.id, date: s.date, planned_duration: s.plannedDuration, session_type: s.sessionType,
        }));

        const sessionDurMap = new Map(sessions.map(s => [s.id, s.planned_duration]));
        const sessionDateMap = new Map(sessions.map(s => [s.id, s.date]));

        // ── RPE — une seule requête sur 21 jours ─────────────────────────────
        const sessions21d = sessions.filter(s => s.date >= from21);
        const sessionIds21d = sessions21d.map(s => s.id);

        type RpeRow = { player_id: string; rpe: number; actual_duration: number | null; session_id: string };

        if (sessionIds21d.length > 0) {
          const rpeRows21d = await rpeApi.listRpeDetailsBySessionIds(sessionIds21d);

          const rows: RpeRow[] = rpeRows21d.map(r => ({
            player_id: r.playerId, rpe: r.rpe, actual_duration: r.actualDuration ?? null, session_id: r.sessionId,
          }));

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
              return [{ date: fmtDateShort(s.date), rpe: Math.round(e.sumRpe / e.nb * 10) / 10, load: Math.round(e.total) }];
            });
          setRpeChartData(chartPoints);

          // Alertes joueurs (basées sur 7j)
          const injuryMap = new Map(activeInjuries.map(inj => [inj.playerId, inj]));
          const { normalMax } = thresholds;
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
            label: fmtDateShort(date),
            score: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10,
          }));
        setWellnessChartData(wellPoints);

        // ── KPI saison ────────────────────────────────────────────────────────
        const kpiActive  = seasonPlayers.filter(p => p.status !== 'injured').length;
        const kpiInjured = seasonPlayers.filter(p => p.status === 'injured').length;
        const kpiLimited = seasonPlayers.filter(p => p.status === 'limited').length;
        const kpiWins    = matchesList.filter(m => m.result === 'win').length;
        const kpiLosses  = matchesList.filter(m => m.result === 'loss').length;

        const allSessRows  = await rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, undefined, today);
        const allSessIds   = allSessRows.map(s => s.id);
        const trainSessIds = allSessRows.filter(s => s.sessionType === 'training').map(s => s.id);

        const [seasonRpeRows2, seasonAttRows] = await Promise.all([
          rpeApi.listRpeDetailsBySessionIds(allSessIds),
          attendanceApi.listAttendance(trainSessIds),
        ]);

        const durMap2   = new Map(allSessRows.map(s => [s.id, s.plannedDuration]));
        const dateMap2  = new Map(allSessRows.map(s => [s.id, s.date]));
        type RpeRowSeason = { rpe: number; actual_duration: number | null; player_id: string; session_id: string };
        const seasonRpeRows: RpeRowSeason[] = seasonRpeRows2.map(r => ({
          rpe: r.rpe, actual_duration: r.actualDuration ?? null, player_id: r.playerId, session_id: r.sessionId,
        }));
        // Charge par semaine (lundi = clé) ramenée à l'effectif ayant réellement loggué cette
        // semaine-là — une simple charge totale équipe / nb de semaines (sans diviser par
        // l'effectif) comparée à un seuil PAR JOUEUR déclenchait une fausse "Surcharge" dès
        // que l'équipe dépassait quelques joueurs.
        const weekLoadMap = new Map<string, { load: number; players: Set<string> }>();
        for (const r of seasonRpeRows) {
          const d = dateMap2.get(r.session_id);
          if (!d) continue;
          const wk = mondayIso(d);
          const dur = r.actual_duration ?? durMap2.get(r.session_id) ?? 0;
          if (!weekLoadMap.has(wk)) weekLoadMap.set(wk, { load: 0, players: new Set() });
          const w = weekLoadMap.get(wk)!;
          w.load += r.rpe * dur;
          w.players.add(r.player_id);
        }
        const weeklyPerPlayerLoads = [...weekLoadMap.values()].map(w => w.load / Math.max(w.players.size, 1));
        const avgSeasonLoad = weeklyPerPlayerLoads.length
          ? Math.round(weeklyPerPlayerLoads.reduce((a, b) => a + b, 0) / weeklyPerPlayerLoads.length)
          : null;
        const avgSeasonRpe  = seasonRpeRows.length > 0
          ? Math.round(seasonRpeRows.reduce((s, r) => s + r.rpe, 0) / seasonRpeRows.length * 10) / 10
          : null;

        const presentCount = seasonAttRows.filter(a => a.status === 'present' || a.status === 'late').length;
        const kpiAttRate   = seasonAttRows.length > 0 ? Math.round(presentCount / seasonAttRows.length * 100) : null;

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

  // Infirmerie — comptes pour la carte "hero"
  const injuredCount     = players.filter(p => p.status === 'injured').length;
  const limitedCount     = players.filter(p => p.status === 'limited').length;
  const inTreatmentCount = injuries.filter(inj => !!inj.treatment?.trim()).length;
  const availablePct = players.length > 0 ? Math.round((players.length - injuredCount) / players.length * 100) : null;
  const availableColor = availablePct === null ? '#475569'
    : availablePct >= 90 ? '#00E5A0'
    : availablePct >= 75 ? '#F59E0B' : '#EF4444';

  // Bien-être équipe — carte "hero"
  const teamWellnessNow = weeklyWellness.at(-1)?.value ?? null;
  const wellnessAlertCount = players.filter(p => wellnessAlertInfo(latestWellnessByPlayer.get(p.id)).show).length;
  const teamWellnessColor = teamWellnessNow === null ? '#475569' : wellnessScoreColor(teamWellnessNow);

  // Charge physique équipe — carte "hero" (mêmes seuils que le bandeau KPI)
  const teamLoadNow = kpiStats?.avgLoad ?? null;
  const teamRpeNow  = kpiStats?.avgRpe ?? null;
  const teamLoadColor = teamLoadNow === null ? '#475569'
    : teamLoadNow > thresholds.normalMax ? '#EF4444'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? '#F97316'
    : teamLoadNow > thresholds.normalMax / 3 ? '#EAB308' : '#00E5A0';
  const teamLoadLabel = teamLoadNow === null ? '—'
    : teamLoadNow > thresholds.normalMax ? 'Surcharge'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? 'Élevée'
    : teamLoadNow > thresholds.normalMax / 3 ? 'Soutenu' : 'Normal';
  const highRiskAcwrCount = players.filter(p => acwrZone(acwrByPlayer.get(p.id) ?? null)?.label === 'Risque élevé').length;

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

      {/* 6 cartes "hero" — Matchs / Entraînements / Actions / Infirmerie / Charge physique / Bien-être */}
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 12, marginBottom: 16 }}>
        <MatchCarouselCard matches={last3Matches} wins={kpiStats?.wins ?? 0} losses={kpiStats?.losses ?? 0} onOpen={() => navigate('/matches')} />
        <SessionCarouselCard sessions={last3Sessions.filter(s => s.type !== 'match')} onOpen={() => navigate('/sessions')} />
        <ActionCarouselCard actions={topActions} players={players} today={today} onOpen={() => navigate('/actions')} />
        <HeroCard
          icon={<Stethoscope size={20} color="#EF4444" />}
          iconBg="#EF444422"
          title="Infirmerie"
          ctaLabel="Voir l'infirmerie"
          headerRight={availablePct !== null && <Badge color={availableColor} label={`${availablePct}% dispo`} size="sm" style={{ flexShrink: 0 }} />}
          borderColor={availableColor}
          stats={[
            { value: injuredCount, label: `Blessée${injuredCount > 1 ? 's' : ''}`, color: '#EF4444' },
            { value: limitedCount, label: `Limitée${limitedCount > 1 ? 's' : ''}`, color: '#F59E0B' },
            { value: inTreatmentCount, label: 'En traitement', color: '#3B82F6' },
          ]}
          onOpen={() => navigate('/medical/infirmary')}
        />
        <HeroCard
          icon={<Activity size={20} color="#8B5CF6" />}
          iconBg="#8B5CF622"
          title="Charge physique"
          ctaLabel="Voir le RPE"
          headerRight={<Badge color={teamLoadColor} label={teamLoadLabel} size="sm" style={{ flexShrink: 0 }} />}
          borderColor={teamLoadColor}
          stats={[
            { value: teamLoadNow ?? 0, label: 'UA / semaine', color: teamLoadColor },
            { value: teamRpeNow ?? 0, label: 'RPE moyen /10', color: teamRpeNow === null ? '#475569' : rpeColor(teamRpeNow) },
            { value: highRiskAcwrCount, label: 'Risque blessures', color: '#EF4444' },
          ]}
          onOpen={() => navigate('/rpe')}
        />
        <HeroCard
          icon={<Heart size={20} color="#EC4899" />}
          iconBg="#EC489922"
          title="Bien-être équipe"
          ctaLabel="Voir le bien-être"
          borderColor={teamWellnessColor}
          stats={[
            { value: teamWellnessNow ?? 0, label: 'Score moyen /10', color: teamWellnessColor },
            { value: wellnessAlertCount, label: `Joueuse${wellnessAlertCount > 1 ? 's' : ''} en alerte`, color: '#EF4444' },
          ]}
          onOpen={() => navigate('/wellness/team')}
        />
      </div>

      {/* Tableau par joueuse — vue d'ensemble à 6 notions */}
      {perfData && (
        <PlayerOverviewTable
          players={perfData.players}
          acwrByPlayer={acwrByPlayer}
          latestWellnessByPlayer={latestWellnessByPlayer}
          onOpenPlayer={id => navigate(`/players/${id}`)}
        />
      )}

    </div>
  );
}

/**
 * Coque partagée des cartes "hero" : icône ronde + titre, liseré latéral neutre (blanc),
 * contenu libre au milieu, flèche + libellé en bas à droite vers la page liée.
 * La couleur reste sur l'icône/les badges, pas sur le cadre de la carte.
 * Pensée pour occuper 1/3 d'une grille à 3 colonnes.
 */
function HeroCardShell({ icon, iconBg, title, ctaLabel, onOpen, children, footerLeft, headerRight, borderColor = '#475569' }: {
  icon: ReactNode; iconBg: string; title: string;
  ctaLabel: string; onOpen: () => void; children: ReactNode;
  /** Contenu optionnel affiché à gauche de la dernière ligne (ex. points du carrousel). */
  footerLeft?: ReactNode;
  /** Contenu optionnel affiché en haut à droite (ex. badge V/D). */
  headerRight?: ReactNode;
  /** Couleur du liseré latéral, reflétant l'état des données de la carte. */
  borderColor?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10, padding: '18px 20px', minHeight: 160,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%', backgroundColor: iconBg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <p style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>{title}</p>
        </div>
        {headerRight}
      </div>

      {children}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 6 }}>{footerLeft}</div>
        <div onClick={onOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '4px 0 4px 12px', marginRight: -4 }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.7'}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
        >
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 500 }}>{ctaLabel}</span>
          <ArrowRight size={14} color="#475569" />
        </div>
      </div>
    </div>
  );
}

/** Variante "stats" — N gros chiffres (ou libellés courts) côte à côte (ex. Infirmerie). */
function HeroCard({ icon, iconBg, title, stats, ctaLabel, onOpen, headerRight, borderColor }: {
  icon: ReactNode; iconBg: string; title: string;
  stats: { value: number | string; label: string; color: string }[];
  ctaLabel: string; onOpen: () => void;
  headerRight?: ReactNode;
  borderColor?: string;
}) {
  return (
    <HeroCardShell icon={icon} iconBg={iconBg} title={title} ctaLabel={ctaLabel} onOpen={onOpen} headerRight={headerRight} borderColor={borderColor}>
      <div style={{ display: 'flex', gap: 24 }}>
        {stats.map(s => {
          const isNumber = typeof s.value === 'number';
          return (
            <div key={s.label}>
              <div style={{
                color: isNumber && s.value === 0 ? '#475569' : s.color,
                fontSize: isNumber ? '1.7rem' : '1.1rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
                fontFamily: isNumber ? 'JetBrains Mono, monospace' : undefined,
              }}>
                {s.value}
              </div>
              <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </HeroCardShell>
  );
}

/** Navigation au doigt/souris (pointer events) pour les cartes carrousel — swipe gauche/droite. */
function useSwipeCarousel(count: number, index: number, setIndex: (i: number) => void) {
  const startX = useRef<number | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => { startX.current = e.clientX; },
    onPointerUp: (e: PointerEvent) => {
      if (startX.current === null || count <= 1) return;
      const delta = e.clientX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < 30) return;
      setIndex(delta < 0 ? (index + 1) % count : (index - 1 + count) % count);
    },
    style: { touchAction: 'pan-y' as const, userSelect: 'none' as const },
  };
}

/** Points de navigation partagés par les cartes carrousel (Matchs, Entraînements, Actions). */
function CarouselDots({ count, index, onSelect }: { count: number; index: number; onSelect: (i: number) => void }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} onClick={() => onSelect(i)} aria-label={`Élément ${i + 1}`}
          style={{
            width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
            backgroundColor: i === index ? '#CBD5E1' : '#2A2F3A',
          }} />
      ))}
    </div>
  );
}

/**
 * Piste défilante partagée par les cartes carrousel — anime le passage d'un élément à
 * l'autre (slide) au lieu d'un remplacement instantané, et gère nativement le swipe.
 */
function SlideCarousel<T>({ items, index, setIndex, renderItem }: {
  items: T[]; index: number; setIndex: (i: number) => void; renderItem: (item: T) => ReactNode;
}) {
  const swipe = useSwipeCarousel(items.length, index, setIndex);
  const clamped = Math.min(index, Math.max(items.length - 1, 0));
  return (
    <div style={{ overflow: 'hidden' }} onPointerDown={swipe.onPointerDown} onPointerUp={swipe.onPointerUp}>
      <div style={{ display: 'flex', transform: `translateX(-${clamped * 100}%)`, transition: 'transform 0.3s ease', ...swipe.style }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: '0 0 100%', minWidth: 0 }}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCarouselCard({ matches, wins, losses, onOpen }: {
  matches: Match[]; wins: number; losses: number; onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const recordColor = wins > losses ? '#00E5A0' : losses > wins ? '#EF4444' : '#94A3B8';

  return (
    <HeroCardShell icon={<Trophy size={20} color="#F59E0B" />} iconBg="#F59E0B22" title="Matchs"
      ctaLabel="Voir les matchs" onOpen={onOpen}
      footerLeft={<CarouselDots count={matches.length} index={index} onSelect={setIndex} />}
      headerRight={<Badge color={recordColor} label={`${wins}-${losses}`} size="sm" style={{ flexShrink: 0 }} />}
      borderColor={recordColor}>
      {matches.length > 0 ? (
        <SlideCarousel items={matches} index={index} setIndex={setIndex} renderItem={mm => {
          const w = mm.result === 'win';
          const c = w ? '#00E5A0' : '#EF4444';
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color: c, fontSize: '1.9rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {mm.scoreUs}–{mm.scoreThem}
                </span>
                <span style={{ color: c, fontSize: '0.72rem', fontWeight: 700 }}>{w ? 'Victoire' : 'Défaite'}</span>
              </div>
              <p style={{ color: '#475569', fontSize: '0.68rem', margin: '5px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                vs {mm.opponent} · {mm.homeAway === 'home' ? 'Domicile' : 'Extérieur'}
              </p>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucun match enregistré.</p>
      )}
    </HeroCardShell>
  );
}

function SessionCarouselCard({ sessions, onOpen }: { sessions: SessionSummary[]; onOpen: () => void }) {
  const [index, setIndex] = useState(0);
  const latestRpe = sessions[0]?.avgRpe ?? null;

  return (
    <HeroCardShell icon={<Dumbbell size={20} color="#00E5A0" />} iconBg="#00E5A022" title="Entraînements"
      ctaLabel="Voir les séances" onOpen={onOpen}
      footerLeft={<CarouselDots count={sessions.length} index={index} onSelect={setIndex} />}
      borderColor={latestRpe !== null ? rpeColor(latestRpe) : '#475569'}>
      {sessions.length > 0 ? (
        <SlideCarousel items={sessions} index={index} setIndex={setIndex} renderItem={ss => {
          const col = ss.avgRpe != null ? rpeColor(ss.avgRpe) : '#475569';
          const lbl = ss.avgRpe != null ? rpeLabel(Math.round(ss.avgRpe)) : '';
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color: col, fontSize: '1.9rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {ss.avgRpe != null ? ss.avgRpe.toFixed(1) : '—'}
                </span>
                {lbl && <span style={{ color: col, fontSize: '0.72rem', fontWeight: 700 }}>{lbl}</span>}
              </div>
              <p style={{ color: '#475569', fontSize: '0.68rem', margin: '5px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fmtWeekday(ss.date)} {fmtDateShort(ss.date)} · {SESSION_TYPE_LABELS[ss.type] ?? ss.type} · {ss.duration} min
              </p>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune séance récente.</p>
      )}
    </HeroCardShell>
  );
}

function ActionCarouselCard({ actions, players, today, onOpen }: {
  actions: Action[]; players: Player[]; today: string; onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const hasOverdue = actions.some(a => a.dueDate < today);
  const actionsBorderColor = actions.length === 0 ? '#475569' : hasOverdue ? '#EF4444' : '#00E5A0';

  return (
    <HeroCardShell icon={<CheckSquare size={20} color="#3B82F6" />} iconBg="#3B82F622" title="Actions"
      ctaLabel="Voir les tâches" onOpen={onOpen}
      footerLeft={<CarouselDots count={actions.length} index={index} onSelect={setIndex} />}
      borderColor={actionsBorderColor}>
      {actions.length > 0 ? (
        <SlideCarousel items={actions} index={index} setIndex={setIndex} renderItem={aa => {
          const isOverdue = aa.dueDate < today;
          const color = isOverdue ? '#EF4444' : '#00E5A0';
          const player = players.find(p => p.id === aa.playerId);
          return (
            <div>
              <p style={{ color: '#CBD5E1', fontSize: '0.82rem', fontWeight: 600, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {aa.title}{player ? ` · ${player.firstName} ${player.lastName[0]}.` : ''}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color, fontSize: '1.3rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {aa.dueDate.slice(5).replace('-', '/')}
                </span>
                <span style={{ color, fontSize: '0.72rem', fontWeight: 700 }}>
                  {isOverdue ? 'En retard' : 'À faire'}
                </span>
              </div>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune tâche en cours.</p>
      )}
    </HeroCardShell>
  );
}

const thBase = {
  padding: '10px 14px', textAlign: 'center' as const, color: '#475569', fontSize: '0.67rem',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600,
  borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
};
const tdBase = { padding: '10px 14px', textAlign: 'center' as const, fontSize: '0.8rem' };

/**
 * Tableau par joueuse (6 notions + identité) — statut, risque blessure (ACWR), bien-être,
 * charge récente (RPE 14j), assiduité (30j), stats matchs. Colonne joueuse fixe au scroll
 * horizontal, comme les autres tableaux de l'app.
 */
function PlayerOverviewTable({ players, acwrByPlayer, latestWellnessByPlayer, onOpenPlayer }: {
  players: PlayerCrossData[];
  acwrByPlayer: Map<string, number | null>;
  latestWellnessByPlayer: Map<string, WellnessEntry | undefined>;
  onOpenPlayer: (id: string) => void;
}) {
  const from14 = localDate(-13);
  const from30 = localDate(-29);

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th style={{ ...thBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, borderRight: '1px solid #2A2F3A' }}>Joueuse</th>
              <th style={thBase}>Statut</th>
              <th style={thBase}>Risque blessure</th>
              <th style={thBase}>Bien-être</th>
              <th style={thBase}>Charge (14j)</th>
              <th style={thBase}>Assiduité (30j)</th>
              <th style={thBase}>Stats matchs</th>
            </tr>
          </thead>
          <tbody>
            {players.map((pd, i) => {
              const p = pd.player;
              const zone = acwrZone(acwrByPlayer.get(p.id) ?? null);
              const w = latestWellnessByPlayer.get(p.id);
              const wellnessColor = w ? wellnessScoreColor(w.score) : '#475569';

              const recentRpe = pd.rpe.filter(e => e.date >= from14);
              const avgRpe = recentRpe.length
                ? Math.round(recentRpe.reduce((s, e) => s + e.rpe, 0) / recentRpe.length * 10) / 10 : null;

              const recentAtt = pd.attendance.filter(a => a.date >= from30);
              const presentPct = recentAtt.length
                ? Math.round(recentAtt.filter(a => a.status === 'present').length / recentAtt.length * 100) : null;
              const attColor = presentPct === null ? '#475569'
                : presentPct >= 90 ? '#00E5A0' : presentPct >= 75 ? '#F59E0B' : '#EF4444';

              const evalVals = pd.matchStats.map(m => m.eval).filter((v): v is number => v !== null);
              const evalAvg = evalVals.length
                ? Math.round(evalVals.reduce((s, v) => s + v, 0) / evalVals.length * 10) / 10 : null;

              const rowBg = i % 2 === 0 ? '#161920' : '#1A1E26';

              return (
                <tr key={p.id} onClick={() => onOpenPlayer(p.id)}
                  style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}
                  className="hover:!bg-white/5"
                >
                  <td style={{ ...tdBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: rowBg, borderRight: '1px solid #2A2F3A' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar player={p} size={22} />
                      <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{p.firstName} {p.lastName}</span>
                    </span>
                  </td>
                  <td style={tdBase}><StatusBadge status={p.status} size="sm" /></td>
                  <td style={tdBase}>
                    {zone ? <Badge color={zone.color} label={zone.label} size="sm" /> : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={{ ...tdBase, color: wellnessColor, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {w ? `${w.score.toFixed(1)}/10` : '—'}
                  </td>
                  <td style={{ ...tdBase, color: avgRpe === null ? '#334155' : rpeColor(avgRpe), fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {avgRpe ?? '—'}
                  </td>
                  <td style={{ ...tdBase, color: attColor, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {presentPct !== null ? `${presentPct}%` : '—'}
                  </td>
                  <td style={{ ...tdBase, color: '#CBD5E1' }}>
                    {pd.matchStats.length > 0 ? `${pd.matchStats.length} MJ · éval ${evalAvg ?? '—'}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
