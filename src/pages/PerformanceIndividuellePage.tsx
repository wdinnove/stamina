import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Activity, ShieldAlert, BarChart2, Heart, CheckSquare, UserCheck, Ambulance } from 'lucide-react';
import { statsApi, actionsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import { usePlayerAllTimeHistory } from '../hooks/usePlayerAllTimeHistory';
import { useArchetypes } from '../hooks/useArchetypes';
import {
  Card, CardTitle, EmptyState, PlayerSelect, PlayerHero, MiniStatCard, Badge,
  PlayerMedicalOverview, ChargeRpeComboChart, PlayerTrendHero,
  DateRangeCard, useDateRange, PlayerDynStatTab, PlayerCompareByMatch, PlayerCompareBySeason, PlayerCompareByPlayer, PlayerStatsPanel, PlayerLoadPanel, WellnessPomsPanel,
  CorrelationsPanel, RiskAlertsList, RiskVerdictCard, ResponsiveTabNav, ObjectivesPanel, PlayerArchetypesPanel, LoadingSteps,
  MbtiPlayerPanel, PlayerNotesPanel
} from '../components';
import { sumInjuryDays } from '../utils/medical';
import { FilterField, filterControlStyle } from '../components/FilterField';
import { roundedAvg } from '../utils/avg';
import type { DatePreset } from '../components/DateRangeCard';
import { rpeColor, rpeLabel, computeAcwr, acwrZone, computeTsb, tsbZone, ALERT_TITLE_PLAIN, CHARGE_ZONE_PLAIN } from '../utils/rpe';
import { wellnessScoreColor, wellnessTier } from '../utils/wellness';
import { presenceRate, presenceColor } from '../utils/attendance';
import { mondayIso, getWeekTier, weeklyLoadBuckets, averageWeeklyLoad } from '../utils/weeklyLoad';
import { fmtDate, fmtDateWithDay } from '../utils/dateFormat';
import { evalColor } from '../data';
import { playerNameFull } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import { detectRiskAlerts, type PlayerCrossData } from '../data/crossAnalysis';
import type { MatchStat, TeamMatchStat, Action } from '../data/types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

const avg = (vals: number[]): number | null =>
  vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;

type Tab = 'overview' | 'stats-basic' | 'stats-advanced' | 'dynamic' | 'compare-match' | 'compare-season' | 'compare-player'
         | 'load' | 'rpe' | 'wellness' | 'medical' | 'correlations' | 'objectives' | 'archetypes' | 'mbti' | 'notes';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':           'overview',
  'statistiques':           'stats-basic',
  'statistiques-brutes':    'stats-basic',
  'statistiques-avancees':  'stats-advanced',
  'dynamique':              'dynamic',
  'forme':                  'overview', // ancien onglet "Tendances" — son hero de forme vit désormais sur la Vue d'ensemble
  'tendances':              'dynamic', // ancien alias — "Par période" (période vs saison)
  'par-periode':            'dynamic',
  'par-match':              'compare-match',
  'par-saison':             'compare-season',
  'par-joueur':             'compare-player',
  'charge-physique':        'load',
  'rpe':                    'rpe',
  'bien-etre':              'wellness',
  'correlations':           'correlations',
  'medical':                'medical',
  'objectifs':              'objectives',
  'archetypes':             'archetypes',
  'personnalite':           'mbti',
  'suivi-mental':           'notes',
  'risque-blessure':        'load', // ancien onglet, absorbé dans "Charge physique" — conservé pour ne pas casser les liens existants
};
const TAB_GROUPS: { label?: string; tabs: { key: Tab; slug: string; label: string }[] }[] = [
  { tabs: [{ key: 'overview', slug: 'vue-ensemble', label: "Vue d'ensemble" }] },
  { label: 'Suivi', tabs: [
    { key: 'load',      slug: 'charge-physique',  label: 'Charge physique' },
    { key: 'rpe',       slug: 'rpe',              label: 'RPE' },
    { key: 'wellness',  slug: 'bien-etre',        label: 'Bien-être' },
    { key: 'medical',   slug: 'medical',          label: 'Médical' },
  ] },
  { label: 'Mental', tabs: [
    { key: 'mbti',  slug: 'personnalite', label: 'Personnalité' },
    { key: 'notes', slug: 'suivi-mental', label: 'Suivi' },
  ] },
  { label: 'Statistiques', tabs: [
    { key: 'stats-basic',    slug: 'statistiques-brutes',   label: 'Brutes' },
    { key: 'stats-advanced', slug: 'statistiques-avancees', label: 'Avancées' },
  ] },
  { label: 'Analyse', tabs: [
    { key: 'objectives',   slug: 'objectifs',    label: 'Objectifs' },
    { key: 'correlations', slug: 'correlations', label: 'Corrélations' },
    { key: 'archetypes',   slug: 'archetypes',   label: 'Archétypes (bêta)' },
  ] },
  { label: 'Comparer', tabs: [
    { key: 'dynamic',         slug: 'par-periode', label: 'Par période' },
    { key: 'compare-match',   slug: 'par-match',   label: 'Par match' },
    { key: 'compare-season',  slug: 'par-saison',  label: 'Par saison' },
    { key: 'compare-player',  slug: 'par-joueur',  label: 'Par joueur' },
  ] },
];

// Préréglage de période appliqué à la première arrivée sur chaque onglet (cf. useDateRange —
// ne se réapplique pas à un simple changement d'onglet, seulement quand seasonStart/seasonEnd
// changent, ex. saison/équipe différente choisie dans la TopBar). Actuellement identique partout,
// mais gérable indépendamment onglet par onglet si un besoin de préréglage différent apparaît.
const TAB_DEFAULT_PRESET: Record<Tab, DatePreset> = {
  overview: 'saison', 'stats-basic': 'saison', 'stats-advanced': 'saison',
  dynamic: 'saison', 'compare-match': 'saison', 'compare-season': 'saison', 'compare-player': 'saison',
  load: 'saison', rpe: 'saison', wellness: 'saison', medical: 'saison', correlations: 'saison', objectives: 'saison',
  archetypes: 'saison', mbti: 'saison', notes: 'saison',
};

export default function PerformanceIndividuellePage() {
  const { id, tab: tabSlug } = useParams<{ id?: string; tab?: string }>();
  const navigate = useNavigate();
  const { selected, options, thresholds, statThresholds } = useTeamSeason();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'overview';
  const setActiveTab = (slug: string) => { if (id) navigate(`/performance-individuelle/${id}/${slug}`, { replace: true }); };

  // ── Données équipe (roster + saison courante), partagées par corrélations/médical/KPIs ──
  const { data, loading, doneSteps, seasonStart, seasonEnd } = usePerformanceData();
  const roster = data?.players ?? [];
  const pd: PlayerCrossData | undefined = roster.find(p => p.player.id === id);

  useEffect(() => {
    if (loading || roster.length === 0) return;
    if (!id) {
      navigate(`/performance-individuelle/${roster[0].player.id}/vue-ensemble`, { replace: true });
    } else if (!pd) {
      // Le joueur n'appartient pas à l'équipe/saison sélectionnée (ex. changement d'équipe dans la TopBar).
      navigate('/', { replace: true });
    }
  }, [loading, id, roster.length, !!pd]);

  // ── Données joueur all-time (dynamique / charge physique / bien-être / statistiques) ──
  const { rpe, wellness } = usePlayerAllTimeHistory(id);
  // Chargé une fois par équipe/saison (pas par joueur) — évite de relancer le calcul de tout
  // l'effectif à chaque changement de joueur via le sélecteur.
  const { reports: archetypeReports, loading: archetypesLoading, error: archetypesError } = useArchetypes(selected?.team.id, selected?.season.id);
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamMatchStat>>(new Map());
  const [actions, setActions] = useState<Action[]>([]);
  const [loadComboView, setLoadComboView] = useState<'session' | 'week'>('week');
  const [rpeDisplay, setRpeDisplay] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    if (!id) return;
    actionsApi.getByPlayer(id).then(setActions);
    statsApi.getPlayerStatsGroupedBySeason(id).then(setSeasonGroupedStats);
  }, [id]);

  useEffect(() => {
    if (!id || !selected) return;
    setMatchStats([]);
    statsApi.getPlayerStatsBySeason(id, selected.season.id).then(setMatchStats);
  }, [id, selected]);

  // Fetch sur tout l'historique du joueur (toutes saisons/équipes confondues), pour que
  // teamStatsMap couvre les entrées nécessaires quel que soit le sélecteur saison/équipe
  // choisi dans PlayerStatsPanel (Brutes/Avancées).
  const matchIdsKey = useMemo(
    () => seasonGroupedStats.flatMap(g => g.stats).map(s => s.matchId).filter((mid): mid is string => !!mid).sort().join(','),
    [seasonGroupedStats],
  );
  useEffect(() => {
    if (!matchIdsKey) { setTeamStatsMap(new Map()); return; }
    const matchIds = matchIdsKey.split(',');
    Promise.all([
      statsApi.listTeamStatsByMatchIds(matchIds),
      // Minutes de TOUT l'effectif (pas seulement ce joueur) sur ces matchs — corrige usagePct
      // par la part de minutes jouées (calcPlayerAdvancedForMatch), sinon ce fetch dédié à
      // l'historique multi-saisons du joueur reste silencieusement sur l'ancienne formule.
      statsApi.getTeamMinutesByMatchIds(matchIds),
    ]).then(([teamStats, teamMinutesByMatchId]) => {
      setTeamStatsMap(new Map(teamStats.map(t => [t.matchId!, { ...t, teamMinutes: teamMinutesByMatchId.get(t.matchId!) }])));
    });
  }, [matchIdsKey]);

  // ── Plage de dates (charge physique / bien-être / corrélations) ──
  const dateRange = useDateRange(seasonStart, TAB_DEFAULT_PRESET[activeTab], seasonEnd);
  const { from, to } = dateRange;
  const showSeasonDiff = dateRange.preset !== 'saison';

  const rpeFiltered = useMemo(() => rpe.filter(e => (!from || e.date >= from) && (!to || e.date <= to)), [rpe, from, to]);

  const wellnessInRange = useMemo(() => from ? wellness.filter(e => e.date >= from && e.date <= to) : wellness, [wellness, from, to]);
  const wellnessSeasonEntries = useMemo(
    () => seasonStart ? wellness.filter(e => e.date >= seasonStart && (!seasonEnd || e.date <= seasonEnd)) : wellness,
    [wellness, seasonStart, seasonEnd],
  );

  // Risque blessure : toujours en temps réel, indépendant du filtre de date de la page.
  // "Zones à risque" couvre toute la saison ; "à risque maintenant" ne regarde que les 21
  // derniers jours, sinon un pic de charge déjà résorbé reste signalé pendant des semaines.
  const riskTo = isoDaysAgo(0);
  const alerts = useMemo(
    () => pd && selected ? detectRiskAlerts([pd], selected.season.startDate, riskTo, thresholds) : [],
    [pd, selected?.season.startDate, riskTo, thresholds.lightMax, thresholds.normalMax],
  );
  const recentFrom = isoDaysAgo(21);
  const recentAlerts = useMemo(
    () => pd ? detectRiskAlerts([pd], recentFrom, riskTo, thresholds) : [],
    [pd, recentFrom, riskTo, thresholds.lightMax, thresholds.normalMax],
  );

  // ── Vue d'ensemble : KPIs joueur (ex-PerformancePlayerPage) ──────────────
  const inRange = (d: string) => d >= from && d <= to;
  const rpeAvgP   = pd ? avg(pd.rpe.filter(e => inRange(e.date)).map(e => e.rpe)) : null;
  const rpeAvgAll = pd ? avg(pd.rpe.map(e => e.rpe)) : null;
  const wellAvgP   = pd ? roundedAvg(pd.wellness.filter(w => inRange(w.date)).map(w => Number(w.score))) : null;
  const wellAvgAll = pd ? roundedAvg(pd.wellness.map(w => Number(w.score))) : null;
  const matchesInRange = pd ? pd.matchStats.filter(m => inRange(m.date)) : [];
  const avgMinP  = avg(matchesInRange.map(m => m.min ?? 0));
  const evalAvgP = avg(matchesInRange.filter(m => m.eval !== null).map(m => Number(m.eval)));
  // Périmètre mono-joueur : son propre taux de présence.
  const attendanceInRange = pd ? pd.attendance.filter(a => inRange(a.date)) : [];
  const presencePct = presenceRate(attendanceInRange);

  const allInjuries = pd ? [...pd.medical].filter(m => m.type === 'injury').sort((a, b) => b.date.localeCompare(a.date)) : [];
  const currentInjury = allInjuries.find(m => m.status === 'active') ?? null;
  const lastInjury = allInjuries[0] ?? null;
  const seasonInjuryCount = selected?.season.startDate
    ? allInjuries.filter(m => m.date >= selected.season.startDate).length
    : allInjuries.length;
  // Jours constatés pour une blessure clôturée, prévus pour une active (cf. utils/medical).
  const seasonInjuryDays = sumInjuryDays(allInjuries
    .filter(m => (!selected?.season.startDate || m.date >= selected.season.startDate) && (!selected?.season.endDate || m.date <= selected.season.endDate))
  ).days;
  const acwr = computeAcwr(rpe, isoDaysAgo(0));
  const acwrZ = acwrZone(acwr);
  const redAlerts = recentAlerts.filter(a => a.level === 'red');
  const latestRedAlert = redAlerts.length ? [...redAlerts].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
  const atRiskNow = !!currentInjury || acwrZ?.label === 'Risque modéré' || acwrZ?.label === 'Risque élevé' || !!latestRedAlert;

  // Fraîcheur (TSB) — reste en temps réel indépendamment du filtre (même logique que le verdict de
  // risque, qui a besoin de tout l'historique pour être fiable, pas juste la période affichée).
  const tsb = computeTsb(rpe) ?? 0;
  const freshZ = tsbZone(tsb);
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);
  // Graphe Charge & RPE — suit le filtre de dates de la page (pas de fenêtre fixe) ; le graphe
  // devient scrollable horizontalement (cf. ChargeRpeComboChart) si la période choisie contient
  // beaucoup de séances/semaines, plutôt que de tout tasser dans la largeur disponible.
  const loadSessionCombo = useMemo(() => [...rpeFiltered]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: fmtDateWithDay(e.date), load: Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)), rpe: e.rpe })),
  [rpeFiltered]);
  const loadWeekBuckets = useMemo(() => weeklyLoadBuckets(rpeFiltered), [rpeFiltered]);
  const loadWeekCombo = loadWeekBuckets.map(b => ({ date: fmtDate(b.week), load: Math.round(b.load), rpe: b.avgRpe ?? 0 }));
  const injuryMarkWeeks = new Set(loadWeekBuckets.map(b => b.week));
  const injuryMarkLabels = allInjuries
    .filter(inj => injuryMarkWeeks.has(mondayIso(inj.date)))
    .map(inj => fmtDate(mondayIso(inj.date)));

  // Charge moyenne/semaine + RPE moyen sur la période filtrée (même donnée que le graphe).
  // Périmètre mono-joueur : moyenne sur SES semaines actives (cf. averageWeeklyLoad).
  const avgWeeklyLoad = averageWeeklyLoad(rpeFiltered);
  const weekTier = avgWeeklyLoad !== null && avgWeeklyLoad > 0
    ? getWeekTier(avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax) : null;
  const rpeAvgRecent = rpeFiltered.length
    ? Math.round(rpeFiltered.reduce((s, e) => s + e.rpe, 0) / rpeFiltered.length * 10) / 10 : null;

  const openActions = actions.filter(a => a.status !== 'done').length;
  const doneActions = actions.filter(a => a.status === 'done').length;

  const playerSelect = (
    <PlayerSelect
      players={roster.map(p => p.player)}
      value={id ?? ''}
      onChange={pid => navigate(`/performance-individuelle/${pid}/${tabSlug ?? 'vue-ensemble'}`)}
    />
  );
  if (loading) return <LoadingSteps done={doneSteps} />;
  if (!roster.length) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 20px' }}>Performance individuelle</h1>
        <Card><EmptyState message="Aucun joueur dans l'effectif de cette saison." /></Card>
      </div>
    );
  }
  if (!pd) return null;

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Performance individuelle</h1>
        {playerSelect}
      </div>

      <PlayerHero player={pd.player} />

      {/* gap plus petit en pile mobile (aligné sur l'espacement entre cards, 14px) qu'en ligne
          desktop (20px, entre la sidebar et le contenu) — sinon l'écart Menu→Filtres ressort
          nettement plus grand que les autres écarts entre cards. */}
      <div className="flex flex-col lg:flex-row gap-3.5 lg:gap-5" style={{ alignItems: 'flex-start' }}>

        <ResponsiveTabNav groups={TAB_GROUPS} activeKey={activeTab} onSelect={setActiveTab} />

        {/* ── Contenu de l'onglet ── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

          {activeTab !== 'dynamic' && activeTab !== 'medical' && activeTab !== 'objectives' && activeTab !== 'archetypes'
            && activeTab !== 'mbti' && activeTab !== 'notes'
            && activeTab !== 'compare-match' && activeTab !== 'compare-season' && activeTab !== 'compare-player' && (
            <DateRangeCard
              from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
              onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
              onFrom={dateRange.setFrom} onTo={dateRange.setTo}
              min={seasonStart} max={seasonEnd}
              extra={activeTab === 'rpe' ? (
                <FilterField legend="Affichage">
                  <select value={rpeDisplay} onChange={e => setRpeDisplay(e.target.value as 'chart' | 'table')} style={filterControlStyle}>
                    <option value="chart">Graphique</option>
                    <option value="table">Tableau</option>
                  </select>
                </FilterField>
              ) : undefined}
            />
          )}

          {/* ══ VUE D'ENSEMBLE ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
        <div style={{ marginBottom: 16 }}>
          <PlayerTrendHero pd={pd} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3" style={{ gap: 10, marginBottom: 16 }}>
          <MiniStatCard
            icon={<BarChart2 size={18} color="#3B82F6" />} iconBg="#3B82F622"
            title="Statistiques"
            value={evalAvgP !== null ? fmt1(evalAvgP) : '—'}
            valueColor={evalAvgP !== null ? evalColor(evalAvgP, statThresholds) : '#475569'}
            subtitle={`${avgMinP ?? 0} min / match`}
            borderColor={evalAvgP !== null ? evalColor(evalAvgP, statThresholds) : '#475569'}
            onOpen={() => setActiveTab('statistiques-brutes')}
          />
          <MiniStatCard
            icon={<UserCheck size={18} color="#06B6D4" />} iconBg="#06B6D622"
            title="Présences"
            value={presencePct !== null ? `${presencePct}%` : '—'}
            valueColor={presenceColor(presencePct)}
            subtitle={`${attendanceInRange.length} séance${attendanceInRange.length > 1 ? 's' : ''}`}
            borderColor={presenceColor(presencePct)}
          />
          <MiniStatCard
            icon={<CheckSquare size={18} color="#F59E0B" />} iconBg="#F59E0B22"
            title="Actions"
            value={`${openActions} à faire`}
            valueColor={openActions === 0 ? '#00E5A0' : '#F59E0B'}
            subtitle={`${doneActions} faite${doneActions > 1 ? 's' : ''}`}
            borderColor={openActions === 0 ? '#00E5A0' : '#F59E0B'}
            onOpen={() => navigate('/taches', { state: { playerId: id, playerName: playerNameFull(pd.player), from: `/performance-individuelle/${id}/vue-ensemble` } })}
          />
          <MiniStatCard
            icon={<ShieldAlert size={18} color={atRiskNow ? '#EF4444' : '#00E5A0'} />} iconBg={atRiskNow ? '#EF444422' : '#00E5A022'}
            title="Risque blessure"
            value={atRiskNow ? 'À risque' : 'RAS'}
            valueColor={atRiskNow ? '#EF4444' : '#00E5A0'}
            subtitle={atRiskNow ? 'Blessure active ou charge à surveiller' : 'Aucun facteur de risque identifié'}
            borderColor={atRiskNow ? '#EF4444' : '#00E5A0'}
            onOpen={() => setActiveTab('charge-physique')}
          />
          <MiniStatCard
            icon={<Activity size={18} color="#8B5CF6" />} iconBg="#8B5CF622"
            title="RPE moyen"
            value={rpeAvgP !== null ? `${fmt1(rpeAvgP)}/10` : '—'}
            valueColor={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569'}
            subtitle={rpeAvgP !== null ? rpeLabel(Math.round(rpeAvgP)) : undefined}
            borderColor={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569'}
            onOpen={() => setActiveTab('rpe')}
          />
          <MiniStatCard
            icon={<Heart size={18} color="#EC4899" />} iconBg="#EC489922"
            title="Bien-être"
            value={wellAvgP !== null ? `${fmt1(wellAvgP)}/10` : '—'}
            valueColor={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#475569'}
            subtitle={wellAvgP !== null ? wellnessTier(wellAvgP).label : undefined}
            borderColor={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#475569'}
            onOpen={() => setActiveTab('bien-etre')}
          />
        </div>
        </>
      )}

      {/* ══ STATISTIQUES ════════════════════════════════════════════════════ */}
      {(activeTab === 'stats-basic' || activeTab === 'stats-advanced') && (
        <PlayerStatsPanel
          key={`${id}-${selected?.season.id ?? ''}`}
          view={activeTab === 'stats-basic' ? 'basic' : 'advanced'}
          seasonGroupedStats={seasonGroupedStats}
          teamStatsMap={teamStatsMap}
          statThresholds={statThresholds}
          from={from}
          to={to}
        />
      )}

      {/* ══ COMPARER : PAR PÉRIODE ═══════════════════════════════════════════ */}
      {activeTab === 'dynamic' && (
        <PlayerDynStatTab rpe={rpe} wellness={wellness} matchStats={matchStats} seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate} teamStatsMap={teamStatsMap} />
      )}

      {/* ══ COMPARER : PAR MATCH ═════════════════════════════════════════════ */}
      {activeTab === 'compare-match' && (
        <PlayerCompareByMatch matchStats={matchStats} rpe={rpe} wellness={wellness} teamStatsMap={teamStatsMap} statThresholds={statThresholds} />
      )}

      {/* ══ COMPARER : PAR SAISON ════════════════════════════════════════════ */}
      {activeTab === 'compare-season' && (
        <PlayerCompareBySeason seasonGroupedStats={seasonGroupedStats} rpe={rpe} wellness={wellness} teamStatsMap={teamStatsMap} currentSeasonId={selected?.season.id} currentTeamId={selected?.team.id} />
      )}

      {/* ══ COMPARER : PAR JOUEUR ════════════════════════════════════════════ */}
      {activeTab === 'compare-player' && (
        <PlayerCompareByPlayer currentPlayerId={pd.player.id} roster={roster} seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate} />
      )}

      {/* ══ RPE ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'rpe' && (
        <div>
          {rpe.length === 0
            ? <EmptyState message={`Aucune donnée RPE pour ${playerNameFull(pd.player)}.`} />
            : <PlayerLoadPanel history={rpe} filtered={rpeFiltered} thresholds={thresholds} showSeasonDiff={showSeasonDiff} display={rpeDisplay} onDisplayChange={setRpeDisplay} />}
        </div>
      )}

      {/* ══ BIEN-ÊTRE ═══════════════════════════════════════════════════════ */}
      {activeTab === 'wellness' && (
        wellnessInRange.length === 0 ? (
          <EmptyState message={`Aucune saisie bien-être pour ${playerNameFull(pd.player)} sur la période sélectionnée.`} />
        ) : (
          <WellnessPomsPanel
            entries={wellnessInRange}
            seasonEntries={wellnessSeasonEntries}
            showSeasonDiff={showSeasonDiff}
            subjectLabel={pd.player.firstName}
          />
        )
      )}

      {/* ══ CORRÉLATIONS ════════════════════════════════════════════════════ */}
      {activeTab === 'correlations' && (
        <CorrelationsPanel
          roster={roster} team={data ?? undefined} from={from} to={to} thresholds={thresholds}
          defaultSubjectId={id ?? ''}
        />
      )}

      {/* ══ OBJECTIFS ════════════════════════════════════════════════════════ */}
      {activeTab === 'objectives' && (
        <ObjectivesPanel playerId={pd.player.id} scope={{ player: pd }} seasonStart={seasonStart} seasonEnd={seasonEnd} />
      )}

      {/* ══ ARCHÉTYPES (BÊTA) ═══════════════════════════════════════════════ */}
      {activeTab === 'archetypes' && (
        <PlayerArchetypesPanel playerId={pd.player.id} reports={archetypeReports} loading={archetypesLoading} error={archetypesError} />
      )}

      {/* ══ PERSONNALITÉ (questionnaire MBTI) ═══════════════════════════════ */}
      {activeTab === 'mbti' && (
        <MbtiPlayerPanel key={pd.player.id} player={pd.player} teamId={selected?.team.id} />
      )}

      {/* ══ SUIVI MENTAL (notes du staff) ═══════════════════════════════════ */}
      {activeTab === 'notes' && (
        <PlayerNotesPanel
          key={pd.player.id}
          playerId={pd.player.id}
          roster={roster.map(p => p.player)}
          teamId={selected?.team.id}
          seasonId={selected?.season.id}
        />
      )}

      {/* ══ MÉDICAL ══════════════════════════════════════════════════════════ */}
      {activeTab === 'medical' && (
        <PlayerMedicalOverview
          key={pd.player.id}
          player={pd.player}
          playerId={pd.player.id}
          currentInjury={currentInjury}
          lastInjury={lastInjury}
          seasonInjuryCount={seasonInjuryCount}
          seasonInjuryDays={seasonInjuryDays}
        />
      )}

      {/* ══ CHARGE PHYSIQUE (synthèse RPE × ACWR × Fraîcheur × Risque × Historique blessure) ══ */}
      {activeTab === 'load' && (
        <div>
          {/* Verdict — à risque maintenant */}
          <RiskVerdictCard
            title="Risque de blessure — maintenant"
            atRisk={atRiskNow}
            verdictLabel={atRiskNow ? 'À risque' : 'Pas de risque identifié'}
            style={{ marginBottom: 14 }}
            factors={[
              {
                id: 'injury',
                active: !!currentInjury,
                label: currentInjury ? 'Blessure active en cours' : 'Aucune blessure active',
              },
              {
                id: 'acwr',
                active: acwrZ?.label === 'Risque modéré' || acwrZ?.label === 'Risque élevé',
                label: acwrZ ? (CHARGE_ZONE_PLAIN[acwrZ.label] ?? acwrZ.label) : 'Historique de charge insuffisant',
              },
              {
                id: 'alert',
                active: !!latestRedAlert,
                label: `${latestRedAlert ? (ALERT_TITLE_PLAIN[latestRedAlert.title] ?? latestRedAlert.title) : 'Aucun signal d\'alerte récent'} (21 j)`,
              },
            ]}
          />

          {/* Charge & RPE — avec marqueurs de blessure pour visualiser la corrélation charge/blessure */}
          <div style={{ marginBottom: 14 }}>
            <ChargeRpeComboChart
              data={loadComboView === 'session' ? loadSessionCombo : loadWeekCombo}
              view={loadComboView}
              onViewChange={setLoadComboView}
              high={loadComboView === 'session' ? sessionLoadNormal : thresholds.normalMax}
              title="Charge & RPE"
              height={260}
              markLabels={loadComboView === 'week' ? injuryMarkLabels : undefined}
              statItems={[
                {
                  label: 'Charge moyenne / semaine',
                  value: avgWeeklyLoad !== null && avgWeeklyLoad > 0
                    ? <>{avgWeeklyLoad.toLocaleString('fr')} <span title="Unité Arbitraire = RPE × durée de la séance (minutes)">UA</span></>
                    : '—',
                  sub: weekTier ? <Badge color={weekTier.color} size="sm" label={weekTier.label} style={{ fontSize: '0.62rem' }} /> : undefined,
                  color: weekTier ? weekTier.color : undefined,
                },
                {
                  label: 'RPE moyen',
                  value: rpeAvgRecent !== null ? fmt1(rpeAvgRecent) : '—',
                  sub: rpeAvgRecent !== null ? <Badge color={rpeColor(rpeAvgRecent)} size="sm" label={rpeLabel(Math.round(rpeAvgRecent))} style={{ fontSize: '0.62rem' }} /> : undefined,
                  color: rpeAvgRecent !== null ? rpeColor(rpeAvgRecent) : undefined,
                },
                {
                  label: 'Charge récente vs habituelle (à ce jour)',
                  value: acwr !== null
                    ? <span title="Charge des 7 derniers jours ÷ charge des 28 derniers jours. 1.0 = charge habituelle, au-dessus = charge inhabituellement élevée.">{acwr.toFixed(2)}</span>
                    : '—',
                  sub: acwrZ ? <Badge color={acwrZ.color} size="sm" label={acwrZ.label} style={{ fontSize: '0.62rem' }} /> : 'Historique insuffisant (28j)',
                  color: acwrZ ? acwrZ.color : undefined,
                },
                {
                  label: 'Fraîcheur (à ce jour)',
                  value: <span title="Écart entre la forme récente et la forme habituelle. Positif = plus frais, négatif = plus fatigué que d'habitude.">{tsb > 0 ? '+' : ''}{tsb.toFixed(1)}</span>,
                  sub: <Badge color={freshZ.color} size="sm" label={freshZ.label} style={{ fontSize: '0.62rem' }} />,
                  color: freshZ.color,
                },
              ]}
            />
          </div>

          <RiskAlertsList alerts={alerts} hidePlayerName collapsible />
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
