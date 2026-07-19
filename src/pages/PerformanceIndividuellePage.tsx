import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Activity, ShieldAlert, BarChart2, Heart, CheckSquare, UserCheck, Ambulance } from 'lucide-react';
import { rpeApi, wellnessApi, statsApi, actionsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import {
  Card, CardTitle, EmptyState, PlayerSelect, PlayerHero, HeroCard, HeroCardShell, Badge,
  PlayerMedicalOverview, ChargeRpeComboChart, PlayerTrendHero,
  DateRangeCard, useDateRange, PlayerDynStatTab, PlayerCompareByMatch, PlayerCompareBySeason, PlayerCompareByPlayer, PlayerStatsPanel, PlayerLoadPanel, WellnessPomsPanel,
  CorrelationsPanel, RiskAlertsList, RiskVerdictCard, ResponsiveTabNav,
} from '../components';
import { daysBetween } from '../components/MedicalCard';
import { FilterField, filterControlStyle } from '../components/FilterField';
import type { DatePreset } from '../components/DateRangeCard';
import { rpeColor, rpeLabel, computeAcwr, acwrZone, computeTsb, tsbZone, ALERT_TITLE_PLAIN, CHARGE_ZONE_PLAIN } from '../utils/rpe';
import { wellnessScoreColor, wellnessAvg, wellnessTier } from '../utils/wellness';
import { mondayIso, getWeekTier } from '../utils/weeklyLoad';
import { fmtDate, fmtDateWithDay } from '../utils/dateFormat';
import { evalColor } from '../data';
import { playerNameFull } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import { detectRiskAlerts, type PlayerCrossData } from '../data/crossAnalysis';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat, Action } from '../data/types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

const avg = (vals: number[]): number | null =>
  vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;

type Tab = 'overview' | 'stats-basic' | 'stats-advanced' | 'dynamic' | 'compare-match' | 'compare-season' | 'compare-player'
         | 'load' | 'rpe' | 'wellness' | 'medical' | 'correlations';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':           'overview',
  'statistiques':           'stats-basic',
  'statistiques-brutes':    'stats-basic',
  'statistiques-avancees':  'stats-advanced',
  'statistiques-par-saison':'stats-basic',
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
  'risque-blessure':        'load', // ancien onglet, absorbé dans "Charge physique" — conservé pour ne pas casser les liens existants
};
const TAB_GROUPS: { label?: string; tabs: { key: Tab; slug: string; label: string }[] }[] = [
  { tabs: [{ key: 'overview', slug: 'vue-ensemble', label: "Vue d'ensemble" }] },
  { label: 'Statistiques', tabs: [
    { key: 'stats-basic',    slug: 'statistiques-brutes',   label: 'Brutes' },
    { key: 'stats-advanced', slug: 'statistiques-avancees', label: 'Avancées' },
  ] },
  { label: 'Suivi', tabs: [
    { key: 'load',     slug: 'charge-physique',  label: 'Charge physique' },
    { key: 'rpe',      slug: 'rpe',              label: 'RPE' },
    { key: 'wellness', slug: 'bien-etre',        label: 'Bien-être' },
    { key: 'medical',  slug: 'medical',          label: 'Médical' },
  ] },
  { label: 'Comparer', tabs: [
    { key: 'dynamic',         slug: 'par-periode', label: 'Par période' },
    { key: 'compare-match',   slug: 'par-match',   label: 'Par match' },
    { key: 'compare-season',  slug: 'par-saison',  label: 'Par saison' },
    { key: 'compare-player',  slug: 'par-joueur',  label: 'Par joueur' },
  ] },
  { label: 'Analyse', tabs: [
    { key: 'correlations', slug: 'correlations', label: 'Corrélations' },
  ] },
];

// Préréglage de période appliqué à la première arrivée sur chaque onglet (cf. useDateRange —
// ne se réapplique pas à un simple changement d'onglet, seulement quand seasonStart/seasonEnd
// changent, ex. saison/équipe différente choisie dans la TopBar). Actuellement identique partout,
// mais gérable indépendamment onglet par onglet si un besoin de préréglage différent apparaît.
const TAB_DEFAULT_PRESET: Record<Tab, DatePreset> = {
  overview: 'saison', 'stats-basic': 'saison', 'stats-advanced': 'saison',
  dynamic: 'saison', 'compare-match': 'saison', 'compare-season': 'saison', 'compare-player': 'saison',
  load: 'saison', rpe: 'saison', wellness: 'saison', medical: 'saison', correlations: 'saison',
};

export default function PerformanceIndividuellePage() {
  const { id, tab: tabSlug } = useParams<{ id?: string; tab?: string }>();
  const navigate = useNavigate();
  const { selected, options, thresholds, statThresholds } = useTeamSeason();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'overview';
  const setActiveTab = (slug: string) => { if (id) navigate(`/performance-individuelle/${id}/${slug}`, { replace: true }); };

  // ── Données équipe (roster + saison courante), partagées par corrélations/médical/KPIs ──
  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
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
  const [rpe, setRpe] = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamMatchStat>>(new Map());
  const [actions, setActions] = useState<Action[]>([]);
  const [loadComboView, setLoadComboView] = useState<'session' | 'week'>('week');
  const [rpeDisplay, setRpeDisplay] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      rpeApi.listPlayerHistory(id),
      wellnessApi.getByPlayer(id),
      actionsApi.getByPlayer(id),
    ]).then(([rpeData, wellnessData, actionsData]) => {
      setRpe(rpeData);
      setWellness(wellnessData);
      setActions(actionsData);
    });
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
    statsApi.listTeamStatsByMatchIds(matchIdsKey.split(',')).then(teamStats => {
      setTeamStatsMap(new Map(teamStats.map(t => [t.matchId!, t])));
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
  const wellAvgP   = pd ? wellnessAvg(pd.wellness.filter(w => inRange(w.date)).map(w => Number(w.score))) : null;
  const wellAvgAll = pd ? wellnessAvg(pd.wellness.map(w => Number(w.score))) : null;
  const matchesInRange = pd ? pd.matchStats.filter(m => inRange(m.date)) : [];
  const avgMinP  = avg(matchesInRange.map(m => m.min ?? 0));
  const evalAvgP = avg(matchesInRange.filter(m => m.eval !== null).map(m => Number(m.eval)));
  const attP = pd ? pd.attendance.filter(a => inRange(a.date)) : [];
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;

  const allInjuries = pd ? [...pd.medical].filter(m => m.type === 'injury').sort((a, b) => b.date.localeCompare(a.date)) : [];
  const currentInjury = allInjuries.find(m => m.status === 'active') ?? null;
  const lastInjury = allInjuries[0] ?? null;
  const seasonInjuryCount = selected?.season.startDate
    ? allInjuries.filter(m => m.date >= selected.season.startDate).length
    : allInjuries.length;
  const seasonInjuryDays = allInjuries
    .filter(m => (!selected?.season.startDate || m.date >= selected.season.startDate) && (!selected?.season.endDate || m.date <= selected.season.endDate))
    .reduce((s, m) => s + (m.rtpDate ? daysBetween(m.date, m.rtpDate) : 0), 0);
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
  const loadWeekBuckets = useMemo(() => {
    const byWeek = new Map<string, { load: number; rpes: number[] }>();
    rpeFiltered.forEach(e => {
      const wk = mondayIso(e.date);
      if (!byWeek.has(wk)) byWeek.set(wk, { load: 0, rpes: [] });
      const w = byWeek.get(wk)!;
      w.load += e.rpe * (e.actualDuration ?? e.plannedDuration);
      w.rpes.push(e.rpe);
    });
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, w]) => ({ week, load: w.load, rpe: Math.round(w.rpes.reduce((s, v) => s + v, 0) / w.rpes.length * 10) / 10 }));
  }, [rpeFiltered]);
  const loadWeekCombo = loadWeekBuckets.map(b => ({ date: fmtDate(b.week), load: Math.round(b.load), rpe: b.rpe }));
  const injuryMarkWeeks = new Set(loadWeekBuckets.map(b => b.week));
  const injuryMarkLabels = allInjuries
    .filter(inj => injuryMarkWeeks.has(mondayIso(inj.date)))
    .map(inj => fmtDate(mondayIso(inj.date)));

  // Charge moyenne/semaine + RPE moyen sur la période filtrée (même donnée que le graphe).
  const avgWeeklyLoad = loadWeekBuckets.length
    ? Math.round(loadWeekBuckets.reduce((s, b) => s + b.load, 0) / loadWeekBuckets.length) : null;
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
  if (loading) return <div className="p-4 md:p-6" style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;
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

          {activeTab !== 'dynamic' && activeTab !== 'stats-basic' && activeTab !== 'stats-advanced' && activeTab !== 'medical'
            && activeTab !== 'compare-match' && activeTab !== 'compare-season' && activeTab !== 'compare-player' && (
            <DateRangeCard
              from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
              onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
              onFrom={dateRange.setFrom} onTo={dateRange.setTo}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 12, marginBottom: 16 }}>
          <HeroCard
            icon={<BarChart2 size={20} color="#3B82F6" />} iconBg="#3B82F622"
            title="Statistiques"
            ctaLabel="Voir les stats" onOpen={() => setActiveTab('statistiques-brutes')}
            borderColor={evalAvgP !== null ? evalColor(evalAvgP, statThresholds) : '#475569'}
            stats={[
              { value: avgMinP ?? 0, label: 'Min / match', color: '#F1F5F9' },
              { value: evalAvgP ?? 0, label: 'Éval moyenne', color: evalAvgP !== null ? evalColor(evalAvgP, statThresholds) : '#475569', decimals: 1 },
            ]}
          />
          <HeroCard
            icon={<UserCheck size={20} color="#06B6D4" />} iconBg="#06B6D622"
            title="Présences"
            borderColor={presencePct !== null ? (presencePct >= 85 ? '#00E5A0' : presencePct >= 70 ? '#F59E0B' : '#EF4444') : '#475569'}
            stats={[
              { value: presencePct ?? 0, label: 'Présence %', color: presencePct !== null ? (presencePct >= 85 ? '#00E5A0' : presencePct >= 70 ? '#F59E0B' : '#EF4444') : '#475569' },
              { value: attP.length, label: 'Séances', color: '#F1F5F9' },
            ]}
          />
          <HeroCard
            icon={<CheckSquare size={20} color="#F59E0B" />} iconBg="#F59E0B22"
            title="Actions à faire"
            ctaLabel="Voir les actions"
            onOpen={() => navigate('/actions', { state: { playerId: id, playerName: playerNameFull(pd.player), from: `/performance-individuelle/${id}/vue-ensemble` } })}
            borderColor={openActions === 0 ? '#00E5A0' : '#F59E0B'}
            stats={[
              { value: openActions, label: 'À faire', color: openActions === 0 ? '#475569' : '#F59E0B' },
              { value: doneActions, label: 'Faites', color: '#00E5A0' },
            ]}
          />
          <HeroCardShell
            icon={<ShieldAlert size={20} color={atRiskNow ? '#EF4444' : '#00E5A0'} />} iconBg={atRiskNow ? '#EF444422' : '#00E5A022'}
            title="Risque blessure"
            ctaLabel="Voir le risque" onOpen={() => setActiveTab('charge-physique')}
            borderColor={atRiskNow ? '#EF4444' : '#00E5A0'}
          >
            <div style={{ color: atRiskNow ? '#EF4444' : '#00E5A0', fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>
              {atRiskNow ? 'À risque' : 'RAS'}
            </div>
            <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5 }}>
              {atRiskNow ? 'Blessure active ou charge à surveiller' : 'Aucun facteur de risque identifié'}
            </div>
          </HeroCardShell>
          <HeroCardShell
            icon={<Activity size={20} color="#8B5CF6" />} iconBg="#8B5CF622"
            title="RPE moyen"
            ctaLabel="Voir la charge" onOpen={() => setActiveTab('rpe')}
            borderColor={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569'}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ color: rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                {rpeAvgP !== null ? fmt1(rpeAvgP) : '—'}
              </div>
              {rpeAvgP !== null && <div style={{ color: rpeColor(rpeAvgP), fontSize: '0.85rem', fontWeight: 700 }}>{rpeLabel(Math.round(rpeAvgP))}</div>}
            </div>
            <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5 }}>RPE moyen /10</div>
          </HeroCardShell>
          <HeroCardShell
            icon={<Heart size={20} color="#EC4899" />} iconBg="#EC489922"
            title="Bien-être"
            ctaLabel="Voir le bien-être" onOpen={() => setActiveTab('bien-etre')}
            borderColor={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#475569'}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={{ color: wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#475569', fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                {wellAvgP !== null ? fmt1(wellAvgP) : '—'}
              </div>
              {wellAvgP !== null && <div style={{ color: wellnessTier(wellAvgP).color, fontSize: '0.85rem', fontWeight: 700 }}>{wellnessTier(wellAvgP).label}</div>}
            </div>
            <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5 }}>Score moyen /10</div>
          </HeroCardShell>
        </div>
        </>
      )}

      {/* ══ STATISTIQUES ════════════════════════════════════════════════════ */}
      {(activeTab === 'stats-basic' || activeTab === 'stats-advanced') && (
        <PlayerStatsPanel
          key={`${id}-${selected?.season.id ?? ''}`}
          view={activeTab === 'stats-basic' ? 'basic' : 'advanced'}
          seasonGroupedStats={seasonGroupedStats}
          currentSeasonLabel={selected?.season.label}
          currentTeamId={selected?.team.id}
          teamStatsMap={teamStatsMap}
          statThresholds={statThresholds}
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
        rpe.length === 0
          ? <EmptyState message={`Aucune donnée RPE pour ${playerNameFull(pd.player)}.`} />
          : <PlayerLoadPanel history={rpe} filtered={rpeFiltered} thresholds={thresholds} showSeasonDiff={showSeasonDiff} display={rpeDisplay} onDisplayChange={setRpeDisplay} />
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
                label: latestRedAlert ? (ALERT_TITLE_PLAIN[latestRedAlert.title] ?? latestRedAlert.title) : 'Aucun signal d\'alerte récent',
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
                  value: avgWeeklyLoad !== null && avgWeeklyLoad > 0 ? `${avgWeeklyLoad.toLocaleString('fr')} UA` : '—',
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
                  label: 'Charge récente vs habituelle',
                  value: acwr !== null ? acwr.toFixed(2) : '—',
                  sub: acwrZ ? <Badge color={acwrZ.color} size="sm" label={acwrZ.label} style={{ fontSize: '0.62rem' }} /> : 'Historique insuffisant (28j)',
                  color: acwrZ ? acwrZ.color : undefined,
                },
                {
                  label: 'Fraîcheur',
                  value: <>{tsb > 0 ? '+' : ''}{tsb.toFixed(1)}</>,
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
