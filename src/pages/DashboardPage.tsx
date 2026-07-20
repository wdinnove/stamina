import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Dumbbell, Trophy, Stethoscope, Activity, Heart, CheckSquare, BarChart2, Users } from 'lucide-react';
import { Badge, StatusBadge, PlayerAvatar, MiniStatCard } from '../components';
import { playersApi, actionsApi, matchesApi, rpeApi } from '../api';
import { staffApi } from '../api/staff';
import { profileApi } from '../api/profile';
import { supabase } from '../api/client';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import { detectRiskAlerts, type PlayerCrossData } from '../data/crossAnalysis';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';
import { wellnessAvg, aggregateTeamWellnessDaily, wellnessTier, worstWellnessAxis, type WellnessAxisAlert } from '../utils/wellness';
import { playerNameShort, playerNameFull } from '../utils/playerName';
import type { Player, Action, Match } from '../data/types';
import { rpeColor, rpeLabel, computeAcwr, acwrZone, avgRpe } from '../utils/rpe';
import { averageWeeklyLoad } from '../utils/weeklyLoad';
import { fmtDate } from '../utils/dateFormat';
import { evalColor } from '../data';

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv');
}
interface TrainingSession { id: string; date: string; planned_duration: number; session_type?: string }
interface SessionSummary  { id: string; date: string; duration: number; load: number | null; avgRpe: number | null; nbPlayers: number; type: string }

// ── Page principale ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { selected, loading: teamLoading, thresholds } = useTeamSeason();
  const { data: perfData, loading: perfLoading } = usePerformanceData();

  const today = useMemo(() => localDate(0), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  // ACWR à la date du jour, par joueur — dérivé de l'historique RPE toutes saisons confondues
  // (allTimeRpe) pour un calcul correct même en tout début de saison.
  const acwrByPlayer = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!perfData) return map;
    for (const pd of perfData.players) map.set(pd.player.id, computeAcwr(pd.allTimeRpe, today));
    return map;
  }, [perfData, today]);

  // Statut "à risque maintenant" — plus lisible que la seule zone ACWR : combine blessure active,
  // zone de charge à risque et alertes rouges récentes (mêmes règles que RiskAlertsList/PlayerOverviewTable).
  const recentAlerts = useMemo(
    () => perfData ? detectRiskAlerts(perfData.players, localDate(-14), today, thresholds) : [],
    [perfData, today, thresholds],
  );
  const redAlertPlayerIds = useMemo(
    () => new Set(recentAlerts.filter(a => a.level === 'red').map(a => a.playerId)),
    [recentAlerts],
  );

  // Bien-être par joueur sur la saison entière : score moyen de TOUTES les entrées (pas juste
  // la dernière saisie) et pire écart d'axe (< 5, "ressenti") observé sur la saison.
  const wellnessStatsByPlayer = useMemo(() => {
    const map = new Map<string, { avgScore: number | null; worstDim: WellnessAxisAlert | null }>();
    if (!perfData) return map;
    for (const pd of perfData.players) {
      map.set(pd.player.id, {
        avgScore: wellnessAvg(pd.wellness.map(w => w.score)),
        worstDim: worstWellnessAxis(pd.wellness),
      });
    }
    return map;
  }, [perfData]);

  // Bien-être équipe — mêmes fonctions que la page Bien-être / Historique équipe
  // (agrégat quotidien puis moyenne des jours) pour rester cohérent avec cette page.
  const teamWellnessNow = useMemo(() => {
    if (!perfData) return null;
    const allEntries = perfData.players.flatMap(pd => pd.wellness);
    const daily = aggregateTeamWellnessDaily(allEntries);
    return wellnessAvg(daily.map(e => e.score));
  }, [perfData]);

  const [userName,        setUserName]        = useState('');
  const [players,         setPlayers]         = useState<Player[]>([]);
  const [actions,         setActions]         = useState<Action[]>([]);
  const [myStaffId,       setMyStaffId]       = useState<string | null>(null);
  const [last3Matches,    setLast3Matches]    = useState<Match[]>([]);
  const [last3Sessions,   setLast3Sessions]   = useState<SessionSummary[]>([]);
  const [kpiStats,          setKpiStats]          = useState<{
    avgLoadSeason: number | null; avgRpeSeason: number | null;
  } | null>(null);
  const [loading,         setLoading]         = useState(false);

  useEffect(() => {
    profileApi.getCurrent().then(profile => { if (profile) setUserName(profile.firstName); });
  }, []);

  useEffect(() => {
    if (!selected || teamLoading) return;
    setLoading(true);
    setPlayers([]);
    setActions([]);
    setMyStaffId(null);
    setLast3Matches([]);
    setLast3Sessions([]);
    setKpiStats(null);

    const from30 = localDate(-30);

    Promise.all([
      playersApi.listBySeason(selected.season.id),
      actionsApi.list({ teamId: selected.team.id }),
      rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, from30, today),
      matchesApi.listBySeason(selected.team.id, selected.season.id),
      staffApi.listByTeam(selected.team.id),
      supabase.auth.getUser(),
    ])
      .then(async ([seasonPlayers, allActions, sessResult, matchesList, teamStaff, { data: { user } }]) => {
        setMyStaffId(teamStaff.find(s => s.profileId === user?.id)?.id ?? null);
        // Matchs
        setLast3Matches(matchesList.slice(0, 3));

        setPlayers(seasonPlayers);

        const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));

        setActions(
          allActions
            .filter(a => a.status !== 'done' && (!a.playerId || seasonPlayerIds.has(a.playerId)))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        );

        // Séances — 3 dernières (carte Entraînements, jamais impactée par le sélecteur de plage)
        const sessions: TrainingSession[] = sessResult.map(s => ({
          id: s.id, date: s.date, planned_duration: s.plannedDuration, session_type: s.sessionType,
        }));
        const sessionDurMap = new Map(sessions.map(s => [s.id, s.planned_duration]));
        const sessionIds30d = sessions.map(s => s.id);
        const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

        if (sessionIds30d.length > 0) {
          const rpeRows30d = await rpeApi.listRpeDetailsBySessionIds(sessionIds30d);
          const sessionLoadMap = new Map<string, { total: number; sumRpe: number; nb: number }>();
          for (const r of rpeRows30d) {
            if (!sessionLoadMap.has(r.sessionId)) sessionLoadMap.set(r.sessionId, { total: 0, sumRpe: 0, nb: 0 });
            const entry = sessionLoadMap.get(r.sessionId)!;
            const dur = r.actualDuration ?? sessionDurMap.get(r.sessionId) ?? 0;
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
        } else {
          setLast3Sessions(recentSessions.map(s => ({ id: s.id, date: s.date, duration: s.planned_duration, type: s.session_type ?? 'training', load: null, avgRpe: null, nbPlayers: 0 })));
        }

        const allSessRows = await rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, undefined, today);
        const allSessIds  = allSessRows.map(s => s.id);
        const seasonRpeRows2 = await rpeApi.listRpeDetailsBySessionIds(allSessIds);

        const durMap2  = new Map(allSessRows.map(s => [s.id, s.plannedDuration]));
        const dateMap2 = new Map(allSessRows.map(s => [s.id, s.date]));
        type RpeRowSeason = { rpe: number; actual_duration: number | null; player_id: string; session_id: string };
        const seasonRpeRows: RpeRowSeason[] = seasonRpeRows2.map(r => ({
          rpe: r.rpe, actual_duration: r.actualDuration ?? null, player_id: r.playerId, session_id: r.sessionId,
        }));

        // Charge/RPE équipe — moyenne sur toute la saison. Même fonction averageWeeklyLoad
        // (bucket semaine réel, ÷ joueurs distincts, moyenne sur les semaines actives) que
        // RPEPage/useTeamRpeHistory/PlayerLoadPanel, pour rester cohérent partout dans l'app.
        const avgLoadSeason = averageWeeklyLoad(seasonRpeRows.map(r => ({
          date: dateMap2.get(r.session_id) ?? '',
          playerId: r.player_id,
          rpe: r.rpe,
          actualDuration: r.actual_duration ?? undefined,
          plannedDuration: durMap2.get(r.session_id) ?? 0,
        })).filter(r => r.date));
        const avgRpeSeason = avgRpe(seasonRpeRows.map(r => r.rpe));

        setKpiStats({ avgLoadSeason, avgRpeSeason });

        setLoading(false);
      })
      .catch(err => { console.error('[Dashboard]', err); setLoading(false); });
  }, [selected, teamLoading]);

  // Actions assignées à moi (staff connecté) — carte "hero"
  const myActions = myStaffId ? actions.filter(a => a.assignedTo === myStaffId) : [];
  const myOverdueActions = myActions.filter(a => a.dueDate < today);
  const myActionsColor = myActions.length === 0 ? '#475569' : myOverdueActions.length > 0 ? '#EF4444' : '#00E5A0';
  const myActionsSubtitle = myOverdueActions.length > 0
    ? `${myOverdueActions.length} en retard`
    : myActions[0]?.title ?? 'Aucune tâche en cours';

  // Infirmerie — carte "hero" : nombre de blessés (statut injured uniquement, pas limité)
  const injuredCount = players.filter(p => p.status === 'injured').length;
  const injuredColor = injuredCount > 0 ? '#EF4444' : '#00E5A0';

  // Dernier match / dernier entraînement — cartes "hero"
  const lastMatch = last3Matches[0] ?? null;
  const lastMatchColor = lastMatch ? (lastMatch.result === 'win' ? '#00E5A0' : '#EF4444') : '#475569';
  const lastMatchScore = lastMatch ? `${lastMatch.result === 'win' ? 'Victoire' : 'Défaite'} ${lastMatch.scoreUs}-${lastMatch.scoreThem}` : '—';
  const lastMatchSubtitle = lastMatch
    ? `vs ${lastMatch.opponent} · ${lastMatch.homeAway === 'home' ? 'Domicile' : 'Extérieur'}`
    : 'Aucun match enregistré';

  const lastSession = last3Sessions.filter(s => s.type !== 'match')[0] ?? null;
  const lastSessionColor = lastSession?.avgRpe != null ? rpeColor(lastSession.avgRpe) : '#475569';
  const lastSessionLabel = lastSession?.avgRpe != null ? rpeLabel(Math.round(lastSession.avgRpe)) : '—';
  const lastSessionSubtitle = lastSession
    ? `${fmtDate(lastSession.date)} · ${lastSession.duration} min`
    : 'Aucune séance récente';

  // Bien-être équipe — carte "hero" : score moyen + nb de joueurs sous le seuil d'alerte
  const wellnessAlertCount = [...wellnessStatsByPlayer.values()].filter(s => s.avgScore !== null && s.avgScore < 5).length;
  const teamWellnessTier = teamWellnessNow === null ? null : wellnessTier(teamWellnessNow);
  const teamWellnessColor = teamWellnessTier?.color ?? '#475569';
  const teamWellnessLabel = teamWellnessTier?.label ?? '—';
  const teamWellnessSubtitle = teamWellnessNow !== null
    ? `${teamWellnessNow.toFixed(1)}/10 · ${wellnessAlertCount} joueur${wellnessAlertCount > 1 ? 's' : ''} en alerte`
    : 'Aucune donnée sur la période';

  // Charge physique équipe — carte "hero" : moyenne sur la saison entière
  const teamLoadNow = kpiStats?.avgLoadSeason ?? null;
  const teamRpeNow  = kpiStats?.avgRpeSeason ?? null;
  const teamLoadColor = teamLoadNow === null ? '#475569'
    : teamLoadNow > thresholds.normalMax ? '#EF4444'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? '#F97316'
    : teamLoadNow > thresholds.normalMax / 3 ? '#EAB308' : '#00E5A0';
  const teamLoadLabel = teamLoadNow === null ? '—'
    : teamLoadNow > thresholds.normalMax ? 'Surcharge'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? 'Élevée'
    : teamLoadNow > thresholds.normalMax / 3 ? 'Soutenue' : 'Normale';
  const teamLoadSubtitle = teamLoadNow !== null
    ? `${Math.round(teamLoadNow)} UA/semaine${teamRpeNow !== null ? ` · RPE ${teamRpeNow.toFixed(1)}/10` : ''}`
    : 'Aucune donnée sur la période';

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;
  if (!selected) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Sélectionnez une équipe et une saison dans la barre du haut pour afficher le dashboard.</p>
    </div>
  );

  // Un seul loader tant que TOUTES les sources ne sont pas prêtes (chargement principal +
  // hook croisement perf) — évite l'incohérence visuelle de cards qui apparaissent l'une après l'autre.
  if (loading || perfLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: '0 0 2px' }}>{userName ? `Bonjour ${userName}` : 'Bonjour'}</h1>
        <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>{todayLabel} · {selected.team.name}</p>
      </div>

      {/* 6 cartes compactes — Matchs / Entraînements / Actions / Infirmerie / Charge physique / Bien-être */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 10, marginBottom: 16 }}>
        <MiniStatCard
          icon={<Trophy size={18} color="#F59E0B" />}
          iconBg="#F59E0B22"
          title="Matchs"
          value={lastMatchScore}
          valueColor={lastMatchColor}
          subtitle={lastMatchSubtitle}
          borderColor={lastMatchColor}
          onOpen={() => navigate(lastMatch ? `/matches/${lastMatch.id}` : '/matches')}
        />
        <MiniStatCard
          icon={<Dumbbell size={18} color="#00E5A0" />}
          iconBg="#00E5A022"
          title="Entraînements"
          value={lastSessionLabel}
          valueColor={lastSessionColor}
          subtitle={lastSessionSubtitle}
          borderColor={lastSessionColor}
          onOpen={() => navigate('/sessions')}
        />
        <MiniStatCard
          icon={<CheckSquare size={18} color="#3B82F6" />}
          iconBg="#3B82F622"
          title="Actions"
          value={`${myActions.length} à faire`}
          valueColor={myActionsColor}
          subtitle={myActionsSubtitle}
          borderColor={myActionsColor}
          onOpen={() => navigate('/actions')}
        />
        <MiniStatCard
          icon={<Stethoscope size={18} color="#EF4444" />}
          iconBg="#EF444422"
          title="Infirmerie"
          value={`${injuredCount} blessé${injuredCount > 1 ? 's' : ''}`}
          valueColor={injuredColor}
          subtitle={`sur ${players.length} joueur${players.length > 1 ? 's' : ''}`}
          borderColor={injuredColor}
          onOpen={() => navigate('/performance-collective/medical')}
        />
        <MiniStatCard
          icon={<Activity size={18} color="#8B5CF6" />}
          iconBg="#8B5CF622"
          title="Charge physique"
          value={teamLoadLabel}
          valueColor={teamLoadColor}
          subtitle={teamLoadSubtitle}
          borderColor={teamLoadColor}
          onOpen={() => navigate('/performance-collective/charge-physique')}
        />
        <MiniStatCard
          icon={<Heart size={18} color="#EC4899" />}
          iconBg="#EC489922"
          title="Bien-être"
          value={teamWellnessLabel}
          valueColor={teamWellnessColor}
          subtitle={teamWellnessSubtitle}
          borderColor={teamWellnessColor}
          onOpen={() => navigate('/performance-collective/bien-etre')}
        />
      </div>

      {/* 2 cartes d'accès aux analyses détaillées */}
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10, marginBottom: 16 }}>
        <MiniStatCard
          icon={<BarChart2 size={18} color="#3B82F6" />}
          iconBg="#3B82F622"
          title="Analyse collective"
          value="Vue d'ensemble équipe"
          valueColor="#F1F5F9"
          subtitle="Charge, RPE, bien-être et risque à l'échelle de l'équipe"
          borderColor="#3B82F6"
          onOpen={() => navigate('/performance-collective/vue-ensemble')}
        />
        <MiniStatCard
          icon={<Users size={18} color="#8B5CF6" />}
          iconBg="#8B5CF622"
          title="Analyse individuelle"
          value="Fiche joueur détaillée"
          valueColor="#F1F5F9"
          subtitle="Statistiques, charge, bien-être et risque par joueur"
          borderColor="#8B5CF6"
          onOpen={() => navigate('/performance-individuelle')}
        />
      </div>

      {/* Tableau par joueur — vue d'ensemble à 6 notions */}
      {perfData && (
        <PlayerOverviewTable
          players={perfData.players}
          acwrByPlayer={acwrByPlayer}
          wellnessStatsByPlayer={wellnessStatsByPlayer}
          redAlertPlayerIds={redAlertPlayerIds}
          onOpenPlayer={id => navigate(`/performance-individuelle/${id}/vue-ensemble`)}
        />
      )}

    </div>
  );
}

const thBase = {
  padding: '10px 14px', textAlign: 'center' as const, color: '#475569', fontSize: '0.67rem',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600,
  borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
};
const thSortable = { ...thBase, cursor: 'pointer' as const, userSelect: 'none' as const };
const tdBase = { padding: '10px 14px', textAlign: 'center' as const, fontSize: '0.8rem', verticalAlign: 'middle' as const };

const STATUS_SORT_RANK: Record<Player['status'], number> = {
  injured: 0, limited: 1, suspended: 2, unavailable: 3, active: 4,
};

/**
 * Tableau par joueur (identité + 6 notions) — statut, risque blessure (ACWR), RPE, bien-être
 * (score moyen), alerte bien-être (pire axe <5 observé) et éval moyen (RPE, bien-être et éval
 * calculés sur la saison entière). Colonne joueur fixe au scroll horizontal, comme les autres
 * tableaux de l'app.
 */
type OverviewSortKey = 'name' | 'status' | 'risk' | 'rpe' | 'wellness' | 'attention' | 'eval';
type SortDir = 'asc' | 'desc';

function PlayerOverviewTable({ players, acwrByPlayer, wellnessStatsByPlayer, redAlertPlayerIds, onOpenPlayer }: {
  players: PlayerCrossData[];
  acwrByPlayer: Map<string, number | null>;
  wellnessStatsByPlayer: Map<string, { avgScore: number | null; worstDim: WellnessAxisAlert | null }>;
  /** Joueurs avec une alerte rouge récente (mêmes règles que la carte Charge physique / RiskAlertsList). */
  redAlertPlayerIds: Set<string>;
  onOpenPlayer: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<OverviewSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: OverviewSortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const arrow = (key: OverviewSortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const rows = players.map(pd => {
    const p = pd.player;
    const acwr = acwrByPlayer.get(p.id) ?? null;
    const zone = acwrZone(acwr);
    const stat = wellnessStatsByPlayer.get(p.id);
    const avgScore = stat?.avgScore ?? null;
    const wellnessColor = avgScore !== null ? wellnessTier(avgScore).color : '#475569';
    const weakDim = stat?.worstDim ?? null;

    const avgRpe = pd.rpe.length
      ? Math.round(pd.rpe.reduce((s, e) => s + e.rpe, 0) / pd.rpe.length * 10) / 10 : null;

    const evalVals = pd.matchStats.map(m => m.eval).filter((v): v is number => v !== null);
    const evalAvg = evalVals.length
      ? Math.round(evalVals.reduce((s, v) => s + v, 0) / evalVals.length * 10) / 10 : null;

    const hasActiveInjury = pd.medical.some(m => m.type === 'injury' && m.status === 'active');
    const atRiskNow = hasActiveInjury
      || zone?.label === 'Risque modéré' || zone?.label === 'Risque élevé'
      || redAlertPlayerIds.has(p.id);

    return { p, avgScore, wellnessColor, weakDim, avgRpe, evalAvg, atRiskNow };
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((x, y) => {
    switch (sortKey) {
      case 'name':      return `${x.p.lastName} ${x.p.firstName}`.localeCompare(`${y.p.lastName} ${y.p.firstName}`) * dir;
      case 'status':    return (STATUS_SORT_RANK[x.p.status] - STATUS_SORT_RANK[y.p.status]) * dir;
      case 'risk':      return (Number(x.atRiskNow) - Number(y.atRiskNow)) * dir;
      case 'rpe':       return ((x.avgRpe ?? -Infinity) - (y.avgRpe ?? -Infinity)) * dir;
      case 'wellness':  return ((x.avgScore ?? -Infinity) - (y.avgScore ?? -Infinity)) * dir;
      case 'attention': return ((x.weakDim?.felt ?? Infinity) - (y.weakDim?.felt ?? Infinity)) * dir;
      case 'eval':      return ((x.evalAvg ?? -Infinity) - (y.evalAvg ?? -Infinity)) * dir;
    }
  });

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
          <thead>
            <tr>
              <th style={{ ...thSortable, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }} onClick={() => toggleSort('name')}>Joueur{arrow('name')}</th>
              <th style={thSortable} onClick={() => toggleSort('status')}>Statut{arrow('status')}</th>
              <th style={thSortable} onClick={() => toggleSort('rpe')}>RPE{arrow('rpe')}</th>
              <th style={thSortable} onClick={() => toggleSort('risk')}>Risque blessure{arrow('risk')}</th>
              <th style={thSortable} onClick={() => toggleSort('wellness')}>Bien-être{arrow('wellness')}</th>
              <th style={thSortable} onClick={() => toggleSort('attention')}>Alerte{arrow('attention')}</th>
              <th style={thSortable} onClick={() => toggleSort('eval')}>Éval{arrow('eval')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ p, avgScore, wellnessColor, weakDim, avgRpe, evalAvg, atRiskNow }, i) => {
              const rowBg = i % 2 === 0 ? '#161920' : '#1A1E26';

              return (
                <tr key={p.id} onClick={() => onOpenPlayer(p.id)}
                  style={{ height: 46, borderBottom: '1px solid #1E2229', backgroundColor: rowBg, cursor: 'pointer' }}
                  className="hover:!bg-white/5"
                >
                  <td style={{ ...tdBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: rowBg }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar player={p} size={22} />
                      <span className="md:hidden" style={{ color: '#F1F5F9', fontWeight: 600 }}>{playerNameShort(p)}</span>
                      <span className="hidden md:inline" style={{ color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{playerNameFull(p)}</span>
                    </span>
                  </td>
                  <td style={tdBase}><StatusBadge status={p.status} size="sm" /></td>
                  <td style={tdBase}>
                    {avgRpe !== null ? <Badge color={rpeColor(avgRpe)} label={rpeLabel(Math.round(avgRpe))} size="sm" /> : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={tdBase}>
                    <Badge color={atRiskNow ? '#EF4444' : '#00E5A0'} label={atRiskNow ? 'À risque' : 'RAS'} size="sm" />
                  </td>
                  <td style={tdBase}>
                    {avgScore !== null ? <Badge color={wellnessColor} label={wellnessTier(avgScore).label} size="sm" /> : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={tdBase}>
                    {weakDim && <Badge color={weakDim.color} label={weakDim.label} size="sm" />}
                  </td>
                  <td style={{ ...tdBase, color: evalAvg === null ? '#334155' : evalColor(evalAvg), fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {evalAvg ?? '—'}
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
