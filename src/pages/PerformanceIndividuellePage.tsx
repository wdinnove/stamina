import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import { Activity, Stethoscope, ShieldAlert, BarChart2, Heart, CheckSquare, ArrowRight, Menu, ChevronDown, X } from 'lucide-react';
import { rpeApi, wellnessApi, statsApi, actionsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import {
  Card, CardTitle, EmptyState, PlayerSelect, PlayerHero, Modal, Badge, RpeKpiCard,
  playerStatusColor, playerStatusLabel, PlayerMedicalView,
  DateRangeCard, useDateRange, PlayerDynStatTab, PlayerStatsPanel, PlayerLoadPanel, WellnessPomsPanel,
  IndicatorSelect, CrossTimelineChart, CorrelationCard, RiskAlertsList, ChargeRpeComboChart,
} from '../components';
import { daysBetween } from '../components/MedicalCard';
import { computeTsb, tsbZone, rpeColor, computeAcwr, acwrZone } from '../utils/rpe';
import { wellnessScoreColor, WELLNESS_DIMENSIONS, wellnessDimColor, wellnessAvg } from '../utils/wellness';
import { mondayIso as getWeekMonday } from '../utils/weeklyLoad';
import { fmtDate, fmtDateWithDay } from '../utils/dateFormat';
import { priorityConfig } from '../data/config';
import { evalColor } from '../data';
import { playerNameFull } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import {
  playerViewIndicators, indicatorByKey, getSeries, correlateIndicators, detectRiskAlerts, injuryEpisodes,
  type CrossScope, type PlayerCrossData, type IndicatorDef, type LagMode,
} from '../data/crossAnalysis';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat, Action } from '../data/types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

const avg = (vals: number[]): number | null =>
  vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;

function MiniKpi({ title, sub, value, base, unit, color }: {
  title: string; sub: string; value: number | string | null;
  base?: number | string | null; unit?: string; color: string;
}) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 8 }}>{sub}</div>
      {value !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            {unit && <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{unit}</span>}
          </div>
          {base !== undefined && base !== null && (
            <div style={{ fontSize: '0.7rem', marginTop: 5, color: '#475569' }}>moy. saison : {base}{unit}</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: '0.8rem', color: '#475569' }}>—</div>
      )}
    </div>
  );
}

function IndicatorControls({ indicators, aKey, bKey, onA, onB }: {
  indicators: IndicatorDef[]; aKey: string; bKey: string;
  onA: (k: string) => void; onB: (k: string) => void;
}) {
  return (
    <Card style={{ padding: '10px 14px', marginBottom: 14 }}>
      <div className="flex flex-col md:flex-row md:items-center" style={{ gap: 10 }}>
        <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
          Croiser
        </span>
        <IndicatorSelect indicators={indicators} value={aKey} onChange={onA} excludeKey={bKey} />
        <span style={{ color: '#475569', fontWeight: 700, textAlign: 'center', flexShrink: 0 }}>×</span>
        <IndicatorSelect indicators={indicators} value={bKey} onChange={onB} excludeKey={aKey} />
      </div>
    </Card>
  );
}

type Tab = 'overview' | 'stats-basic' | 'stats-advanced' | 'dynamic' | 'load' | 'wellness' | 'medical' | 'risk' | 'correlations';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':           'overview',
  'statistiques':           'stats-basic',
  'statistiques-brutes':    'stats-basic',
  'statistiques-avancees':  'stats-advanced',
  'statistiques-par-saison':'stats-basic',
  'dynamique':              'dynamic',
  'tendances':              'dynamic',
  'charge-physique':        'load',
  'bien-etre':              'wellness',
  'correlations':           'correlations',
  'medical':                'medical',
  'risque-blessure':        'risk',
};
const TAB_GROUPS: { label?: string; tabs: { key: Tab; slug: string; label: string }[] }[] = [
  { tabs: [{ key: 'overview', slug: 'vue-ensemble', label: "Vue d'ensemble" }] },
  { label: 'Statistiques', tabs: [
    { key: 'stats-basic',    slug: 'statistiques-brutes',   label: 'Brutes' },
    { key: 'stats-advanced', slug: 'statistiques-avancees', label: 'Avancées' },
  ] },
  { label: 'Suivi athlète', tabs: [
    { key: 'load',     slug: 'charge-physique',  label: 'Charge physique' },
    { key: 'wellness', slug: 'bien-etre',        label: 'Bien-être' },
    { key: 'medical',  slug: 'medical',          label: 'Médical' },
    { key: 'risk',     slug: 'risque-blessure',  label: 'Risque blessure' },
  ] },
  { label: 'Analyse', tabs: [
    { key: 'correlations', slug: 'correlations', label: 'Corrélations' },
    { key: 'dynamic',      slug: 'tendances',     label: 'Tendances' },
  ] },
];

/** Liste verticale des sections/onglets — partagée entre la sidebar desktop et la modale mobile. */
function TabNavList({ activeTab, onSelect }: { activeTab: Tab; onSelect: (slug: string) => void }) {
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {TAB_GROUPS.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <div style={{ padding: '6px 10px 4px', color: '#475569', fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {group.label}
            </div>
          )}
          <div className="flex flex-col" style={{ gap: 2 }}>
            {group.tabs.map(t => (
              <button key={t.key} onClick={() => onSelect(t.slug)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.83rem', whiteSpace: 'nowrap',
                  backgroundColor: activeTab === t.key ? 'rgba(0,229,160,0.08)' : 'transparent',
                  color: activeTab === t.key ? '#00E5A0' : '#94A3B8',
                  fontWeight: activeTab === t.key ? 600 : 400,
                  borderLeft: activeTab === t.key ? '2px solid #00E5A0' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PerformanceIndividuellePage() {
  const { id, tab: tabSlug } = useParams<{ id?: string; tab?: string }>();
  const navigate = useNavigate();
  const { selected, thresholds, statThresholds } = useTeamSeason();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'overview';
  const setActiveTab = (slug: string) => { if (id) navigate(`/performance-individuelle/${id}/${slug}`, { replace: true }); };

  // ── Données équipe (roster + saison courante), partagées par corrélations/médical/KPIs ──
  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
  const roster = data?.players ?? [];
  const pd: PlayerCrossData | undefined = roster.find(p => p.player.id === id);

  useEffect(() => {
    if (!loading && !id && roster.length > 0) {
      navigate(`/performance-individuelle/${roster[0].player.id}/vue-ensemble`, { replace: true });
    }
  }, [loading, id, roster.length]);

  // ── Données joueur all-time (dynamique / charge physique / bien-être / statistiques) ──
  const [rpe, setRpe] = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamMatchStat>>(new Map());
  const [actions, setActions] = useState<Action[]>([]);
  const [comboView, setComboView] = useState<'session' | 'week'>('session');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const dateRange = useDateRange(seasonStart, 'saison', seasonEnd);
  const { from, to } = dateRange;
  const showSeasonDiff = dateRange.preset !== 'saison';

  const rpeFiltered = useMemo(() => rpe.filter(e => (!from || e.date >= from) && (!to || e.date <= to)), [rpe, from, to]);

  const wellnessInRange = useMemo(() => from ? wellness.filter(e => e.date >= from && e.date <= to) : wellness, [wellness, from, to]);
  const wellnessSeasonEntries = useMemo(
    () => seasonStart ? wellness.filter(e => e.date >= seasonStart && (!seasonEnd || e.date <= seasonEnd)) : wellness,
    [wellness, seasonStart, seasonEnd],
  );

  // ── Corrélations (ex-PerformancePlayerPage) ───────────────────────────────
  const [aKey, setAKey] = useState('loadUa');
  const [bKey, setBKey] = useState('eval');
  const [lagDays, setLagDays] = useState<LagMode>('week');
  const indicators = useMemo(playerViewIndicators, []);
  const aDef = indicatorByKey(aKey) ?? indicators[0];
  const bDef = indicatorByKey(bKey) ?? indicators[1];
  const scope: CrossScope = useMemo(() => pd ? { player: pd, team: data ?? undefined } : {}, [pd, data]);
  const seriesA = useMemo(() => pd ? getSeries(aDef, scope, from, to) : [], [scope, aDef, from, to, pd]);
  const seriesB = useMemo(() => pd ? getSeries(bDef, scope, from, to) : [], [scope, bDef, from, to, pd]);
  const corr = useMemo(
    () => pd ? correlateIndicators(aDef, bDef, scope, from, to, lagDays) : null,
    [scope, aDef, bDef, from, to, lagDays, pd],
  );
  const alerts = useMemo(
    () => pd ? detectRiskAlerts([pd], from, to, thresholds) : [],
    [pd, from, to, thresholds.lightMax, thresholds.normalMax],
  );
  const injuries = useMemo(() => pd ? injuryEpisodes(pd.medical, from, to) : [], [pd, from, to]);

  // ── Vue d'ensemble : KPIs joueur (ex-PerformancePlayerPage) ──────────────
  const inRange = (d: string) => d >= from && d <= to;
  // allTimeRpe (pas pd.rpe, borné à la saison) : le TSB a besoin de tout l'historique pour
  // être fiable en tout début de saison.
  const tsbNow = pd ? computeTsb(pd.allTimeRpe) : null;
  const tsbNowZone = tsbNow !== null ? tsbZone(tsbNow) : null;
  const rpeAvgP   = pd ? avg(pd.rpe.filter(e => inRange(e.date)).map(e => e.rpe)) : null;
  const rpeAvgAll = pd ? avg(pd.rpe.map(e => e.rpe)) : null;
  const wellAvgP   = pd ? wellnessAvg(pd.wellness.filter(w => inRange(w.date)).map(w => Number(w.score))) : null;
  const wellAvgAll = pd ? wellnessAvg(pd.wellness.map(w => Number(w.score))) : null;
  const evalAvgP   = pd ? avg(pd.matchStats.filter(m => m.eval !== null && inRange(m.date)).map(m => Number(m.eval))) : null;
  const evalAvgAll = pd ? avg(pd.matchStats.filter(m => m.eval !== null).map(m => Number(m.eval))) : null;
  const attP = pd ? pd.attendance.filter(a => inRange(a.date)) : [];
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;

  // ── Vue d'ensemble : cards résumé (ex-PlayerHubPage) ──────────────────────
  const thStyle: React.CSSProperties = { padding: '6px 8px', color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '7px 8px', color: '#94A3B8', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' };

  const seasonRows = useMemo(() => [...seasonGroupedStats]
    .sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel))
    .map(g => {
      const ss = g.stats;
      const n  = ss.length;
      const sum = (k: keyof MatchStat) => ss.reduce((a, m) => a + (((m[k] as number) || 0)), 0);
      const avgK = (k: keyof MatchStat) => n > 0 ? Math.round((sum(k) / n) * 10) / 10 : 0;
      const withEval = ss.filter(s => s.eval !== null);
      const evalAvgS  = withEval.length > 0 ? Math.round(withEval.reduce((a, s) => a + (s.eval ?? 0), 0) / withEval.length * 10) / 10 : null;
      const withPm = ss.filter(s => s.plusMinus !== null);
      const pmAvg  = withPm.length > 0 ? Math.round(withPm.reduce((a, s) => a + (s.plusMinus ?? 0), 0) / withPm.length * 10) / 10 : null;
      const fg2m = sum('fg2m'), fg2a = sum('fg2a');
      const fg3m = sum('fg3m'), fg3a = sum('fg3a');
      const ftm  = sum('ftm'),  fta  = sum('fta');
      const ro   = sum('ro'),   rd   = sum('rd');
      return {
        seasonId: g.seasonId, seasonLabel: g.seasonLabel, teamName: g.teamName, n,
        starters: ss.filter(s => s.starter).length,
        avgMin: avgK('min'), avgPts: avgK('pts'),
        fg2m, fg2a, fg2Pct: fg2a > 0 ? Math.round((fg2m / fg2a) * 100) : null,
        fg3m, fg3a, fg3Pct: fg3a > 0 ? Math.round((fg3m / fg3a) * 100) : null,
        ftm, fta, ftPct: fta > 0 ? Math.round((ftm / fta) * 100) : null,
        avgRo: avgK('ro'), avgRd: avgK('rd'), avgRt: n > 0 ? Math.round((ro + rd) / n * 10) / 10 : 0,
        avgPd: avgK('pd'), avgCt: avgK('ct'),
        avgInt: avgK('intercepts'), avgBp: avgK('bp'),
        evalAvg: evalAvgS, pmAvg,
      };
    }), [seasonGroupedStats]);

  const weekComboMap = new Map<string, { load: number; rpes: number[] }>();
  rpeFiltered.forEach(e => {
    const k = getWeekMonday(e.date);
    if (!weekComboMap.has(k)) weekComboMap.set(k, { load: 0, rpes: [] });
    const w = weekComboMap.get(k)!;
    w.load += e.rpe * (e.actualDuration ?? e.plannedDuration);
    w.rpes.push(e.rpe);
  });
  const weekCombo = [...weekComboMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, { load, rpes }]) => ({
      date: fmtDateWithDay(d),
      load: Math.round(load),
      rpe:  Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
    }));
  const sessionCombo = [...rpeFiltered]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date: fmtDateWithDay(e.date),
      load: Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
      rpe:  e.rpe,
    }));
  const comboData = comboView === 'session' ? sessionCombo : weekCombo;
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);
  const comboHigh = comboView === 'session' ? sessionLoadNormal : thresholds.normalMax;

  const wellnessScoreAvgP = wellnessAvg(wellnessInRange.map(e => e.score));
  const radarColor = wellnessScoreColor(wellnessScoreAvgP ?? 5);
  const radarData = WELLNESS_DIMENSIONS.map(dim => {
    const avgV = wellnessAvg(wellnessInRange.map(e => e[dim.key] as number)) ?? 0;
    return { dim: dim.shortLabel, value: avgV, fullMark: 10, inverted: dim.inverted };
  });

  const allInjuries = pd ? [...pd.medical].filter(m => m.type === 'injury').sort((a, b) => b.date.localeCompare(a.date)) : [];
  const currentInjury = allInjuries.find(m => m.status === 'active') ?? null;
  const previousInjury = allInjuries.find(m => m.id !== currentInjury?.id) ?? null;
  const lastInjury = allInjuries[0] ?? null;
  const seasonInjuryCount = selected?.season.startDate
    ? allInjuries.filter(m => m.date >= selected.season.startDate).length
    : allInjuries.length;
  const seasonInjuryDays = allInjuries
    .filter(m => (!selected?.season.startDate || m.date >= selected.season.startDate) && (!selected?.season.endDate || m.date <= selected.season.endDate))
    .reduce((s, m) => s + (m.rtpDate ? daysBetween(m.date, m.rtpDate) : 0), 0);
  const acwr = computeAcwr(rpe, isoDaysAgo(0));
  const acwrZ = acwrZone(acwr);
  const atRiskNow = !!currentInjury || acwrZ?.label === 'Risque modéré' || acwrZ?.label === 'Risque élevé' || alerts.some(a => a.level === 'red');

  const today = isoDaysAgo(0);
  const openActions = actions.filter(a => a.status !== 'done').length;
  const upcomingTasks = [...actions]
    .filter(a => a.status !== 'done' && a.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const pastTasks = [...actions]
    .filter(a => a.status === 'done' || a.dueDate < today)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 3);

  const playerSelect = (
    <PlayerSelect
      players={roster.map(p => p.player)}
      value={id ?? ''}
      onChange={pid => navigate(`/performance-individuelle/${pid}/${tabSlug ?? 'vue-ensemble'}`)}
    />
  );
  const activeTabLabel = TAB_GROUPS.flatMap(g => g.tabs).find(t => t.key === activeTab)?.label ?? '';
  const selectTabAndClose = (slug: string) => { setActiveTab(slug); setMobileNavOpen(false); };

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

      <div className="flex flex-col lg:flex-row" style={{ gap: 20, alignItems: 'flex-start' }}>

        {/* ── Sous-menu mobile : bouton → modale de sélection ── */}
        <div className="w-full lg:hidden">
          <button onClick={() => setMobileNavOpen(true)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 8, border: '1px solid #2A2F3A', backgroundColor: '#161920',
            color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Menu size={16} style={{ color: '#00E5A0' }} />
              {activeTabLabel}
            </span>
            <ChevronDown size={16} style={{ color: '#64748B' }} />
          </button>
        </div>

        {mobileNavOpen && (
          <Modal onClose={() => setMobileNavOpen(false)} closeOnBackdropClick maxWidth={300} align="flex-start" style={{ marginTop: 60 }}>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>Sections</span>
                <button onClick={() => setMobileNavOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
                  <X size={18} />
                </button>
              </div>
              <TabNavList activeTab={activeTab} onSelect={selectTabAndClose} />
            </div>
          </Modal>
        )}

        {/* ── Menu vertical d'onglets (desktop) ── */}
        <nav className="hidden lg:block lg:w-[200px]" style={{ flexShrink: 0, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 6 }}>
          <TabNavList activeTab={activeTab} onSelect={setActiveTab} />
        </nav>

        {/* ── Contenu de l'onglet ── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

          {activeTab !== 'dynamic' && activeTab !== 'stats-basic' && activeTab !== 'stats-advanced' && activeTab !== 'medical' && (
            <DateRangeCard
              from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
              onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
              onFrom={dateRange.setFrom} onTo={dateRange.setTo}
            />
          )}

          {/* ══ VUE D'ENSEMBLE ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 12 }}>
          <MiniKpi title="État actuel" sub="TSB · fraîcheur du jour"
            value={tsbNow !== null ? `${tsbNow > 0 ? '+' : ''}${tsbNow}` : null}
            color={tsbNowZone?.color ?? '#94A3B8'} />
          <MiniKpi title="RPE moyen" sub="Période sélectionnée"
            value={rpeAvgP !== null ? fmt1(rpeAvgP) : null} base={rpeAvgAll !== null ? fmt1(rpeAvgAll) : null} unit="/10"
            color={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#94A3B8'} />
          <MiniKpi title="Bien-être" sub="Période sélectionnée"
            value={wellAvgP !== null ? fmt1(wellAvgP) : null} base={wellAvgAll !== null ? fmt1(wellAvgAll) : null} unit="/10"
            color={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#94A3B8'} />
          <MiniKpi title="Éval. match" sub="Période sélectionnée"
            value={evalAvgP} base={evalAvgAll}
            color={evalColor(evalAvgP, statThresholds)} />
          <MiniKpi title="Présence" sub={attP.length ? `${presentP}/${attP.length} séances` : 'Aucune séance'}
            value={presencePct} unit="%"
            color={presencePct !== null ? (presencePct >= 85 ? '#00E5A0' : presencePct >= 70 ? '#F59E0B' : '#EF4444') : '#94A3B8'} />
        </div>

        <Card style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => setActiveTab('statistiques-brutes')}>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />}
            right={<ArrowRight size={13} style={{ color: '#475569' }} />}>
            Statistiques — saison par saison
          </CardTitle>
          {seasonRows.length === 0 ? (
            <EmptyState message="Aucune statistique enregistrée." size="sm" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Saison</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Équipe</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>MJ</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Tit</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Min</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Pts</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>2PT</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>2PT%</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>3PT</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>3PT%</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>LF</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>LF%</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>RO</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>RD</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>RT</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Pd</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Ct</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Int</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Bp</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Éval</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>±</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonRows.map(r => (
                    <tr key={r.seasonId} style={{ borderBottom: '1px solid #1E2229' }}>
                      <td style={{ ...tdStyle, fontFamily: 'inherit', color: '#F1F5F9', fontWeight: 600 }}>{r.seasonLabel}</td>
                      <td style={{ ...tdStyle, fontFamily: 'inherit' }}>{r.teamName || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9', fontWeight: 700 }}>{r.n}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.starters}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgMin}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9', fontWeight: 800 }}>{r.avgPts}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg2m}/{r.fg2a}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg2Pct !== null ? `${r.fg2Pct}%` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg3m}/{r.fg3a}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg3Pct !== null ? `${r.fg3Pct}%` : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.ftm}/{r.fta}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.ftPct  !== null ? `${r.ftPct}%`  : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgRo}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgRd}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9' }}>{r.avgRt}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgPd}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgCt}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgInt}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgBp}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: r.evalAvg !== null ? 700 : 400, color: r.evalAvg !== null ? evalColor(r.evalAvg, statThresholds) : '#475569' }}>{r.evalAvg ?? '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: r.pmAvg === null ? '#475569' : r.pmAvg > 0 ? '#00E5A0' : r.pmAvg < 0 ? '#EF4444' : '#94A3B8' }}>{r.pmAvg !== null ? (r.pmAvg > 0 ? `+${r.pmAvg}` : r.pmAvg) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
          <Card style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => setActiveTab('charge-physique')}>
            <CardTitle icon={<Activity size={12} style={{ color: '#3B82F6' }} />}
              right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {rpeAvgP !== null && <span style={{ color: rpeColor(rpeAvgP), fontWeight: 700, fontSize: '0.78rem' }}>RPE moy. {fmt1(rpeAvgP)}</span>}
                <ArrowRight size={13} style={{ color: '#475569' }} />
              </div>}>
              RPE — période sélectionnée
            </CardTitle>
            {rpeFiltered.length === 0 ? (
              <EmptyState message="Aucune donnée RPE sur la période." size="sm" />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                <ChargeRpeComboChart
                  data={comboData}
                  view={comboView}
                  onViewChange={setComboView}
                  high={comboHigh}
                  title="Charge et RPE"
                  height={220}
                />
              </div>
            )}
          </Card>

          <Card style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => setActiveTab('bien-etre')}>
            <CardTitle icon={<Heart size={12} style={{ color: '#F472B6' }} />}
              right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#475569', fontSize: '0.7rem' }}>{wellnessInRange.length} saisie{wellnessInRange.length > 1 ? 's' : ''}</span>
                <ArrowRight size={13} style={{ color: '#475569' }} />
              </div>}>
              Bien-être — POMS
            </CardTitle>
            {wellnessInRange.length === 0 ? (
              <EmptyState message="Aucune saisie bien-être sur la période." size="sm" />
            ) : (
              <div style={{ position: 'relative', flex: '1 1 220px', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="68%" margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                    <PolarGrid stroke="#2A2F3A" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.1} strokeWidth={2}
                      dot={(props: { cx: number; cy: number; index: number }) => {
                        const point = radarData[props.index];
                        if (!point) return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} />;
                        const color = wellnessDimColor(point.value, point.inverted);
                        return <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={color} stroke="#161920" strokeWidth={2} />;
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ color: radarColor, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{fmt1(wellnessScoreAvgP)}</div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
          <Card style={{ cursor: 'pointer' }} onClick={() => setActiveTab('medical')}>
            <CardTitle icon={<Stethoscope size={12} style={{ color: '#EF4444' }} />}
              right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {acwrZ && <span style={{ color: acwrZ.color, fontWeight: 700, fontSize: '0.78rem' }}>ACWR {acwr} · {acwrZ.label}</span>}
                <ArrowRight size={13} style={{ color: '#475569' }} />
              </div>}>
              Médical
            </CardTitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Blessure en cours</span>
                {currentInjury ? (
                  <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '0.8rem', textAlign: 'right' }}>{currentInjury.location || currentInjury.description}</span>
                ) : (
                  <span style={{ color: '#00E5A0', fontWeight: 600, fontSize: '0.8rem' }}>Aucune</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Dernière blessure</span>
                {previousInjury ? (
                  <span style={{ color: '#F1F5F9', fontSize: '0.8rem', textAlign: 'right' }}>{previousInjury.location || previousInjury.description} · {fmtDate(previousInjury.date)}</span>
                ) : (
                  <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Blessures cette saison</span>
                <span style={{ color: seasonInjuryCount === 0 ? '#00E5A0' : seasonInjuryCount === 1 ? '#F59E0B' : '#EF4444', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{seasonInjuryCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>ACWR (risque de blessure)</span>
                <span style={{ color: acwrZ?.color ?? '#475569', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{acwr !== null ? acwr : '—'}</span>
              </div>
            </div>
          </Card>

          <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/actions', { state: { playerId: id, playerName: playerNameFull(pd.player), from: `/performance-individuelle/${id}/vue-ensemble` } })}>
            <CardTitle icon={<CheckSquare size={12} style={{ color: '#F59E0B' }} />}
              right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: openActions === 0 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.78rem' }}>{openActions} en cours</span>
                <ArrowRight size={13} style={{ color: '#475569' }} />
              </div>}>
              Tâches
            </CardTitle>

            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
              <div>
                <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>À venir</div>
                {upcomingTasks.length === 0 ? (
                  <span style={{ color: '#334155', fontSize: '0.78rem' }}>Aucune tâche à venir</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {upcomingTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: priorityConfig[t.priority].color, flexShrink: 0 }} />
                        <span style={{ color: '#F1F5F9', fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{fmtDate(t.dueDate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Passées</div>
                {pastTasks.length === 0 ? (
                  <span style={{ color: '#334155', fontSize: '0.78rem' }}>Aucune tâche passée</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pastTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.status === 'done' ? '#00E5A0' : '#EF4444', flexShrink: 0 }} />
                        <span style={{ color: t.status === 'done' ? '#94A3B8' : '#F1F5F9', fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                        <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{fmtDate(t.dueDate)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
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

      {/* ══ DYNAMIQUE ═══════════════════════════════════════════════════════ */}
      {activeTab === 'dynamic' && (
        <PlayerDynStatTab rpe={rpe} wellness={wellness} matchStats={matchStats} seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate} teamStatsMap={teamStatsMap} />
      )}

      {/* ══ CHARGE PHYSIQUE ═════════════════════════════════════════════════ */}
      {activeTab === 'load' && (
        rpe.length === 0
          ? <EmptyState message={`Aucune donnée RPE pour ${playerNameFull(pd.player)}.`} />
          : <PlayerLoadPanel history={rpe} filtered={rpeFiltered} thresholds={thresholds} showSeasonDiff={showSeasonDiff} />
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
        <>
          <IndicatorControls indicators={indicators} aKey={aKey} bKey={bKey} onA={setAKey} onB={setBKey} />
          <Card style={{ marginBottom: 14 }}>
            <CardTitle icon={<Activity size={12} style={{ color: '#00E5A0' }} />} mb={10}>
              Chronologie croisée
            </CardTitle>
            <CrossTimelineChart
              a={{ def: aDef, points: seriesA }} b={{ def: bDef, points: seriesB }}
              from={from} to={to} injuries={injuries} loadThresholds={thresholds}
            />
          </Card>
          <CorrelationCard a={aDef} b={bDef} result={corr} lagDays={lagDays} onLagChange={setLagDays} />
        </>
      )}

      {/* ══ MÉDICAL ══════════════════════════════════════════════════════════ */}
      {activeTab === 'medical' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10, marginBottom: 14 }}>
            <RpeKpiCard
              accent={playerStatusColor[pd.player.status]}
              label="Statut"
              value={playerStatusLabel[pd.player.status]}
              sub={pd.player.status === 'active' ? '-' : (currentInjury?.description ?? '-')}
            />
            <RpeKpiCard
              accent={lastInjury ? '#EF4444' : '#475569'}
              label="Dernière blessure"
              value={lastInjury ? lastInjury.description : '—'}
              sub={lastInjury ? fmtDate(lastInjury.date) : 'Aucune blessure enregistrée'}
            />
            <RpeKpiCard
              accent={seasonInjuryCount > 0 ? '#F59E0B' : '#00E5A0'}
              label="Blessures saison"
              value={String(seasonInjuryCount)}
              sub="cette saison"
            />
            <RpeKpiCard
              accent={seasonInjuryDays > 0 ? '#3B82F6' : '#00E5A0'}
              label="Jours blessés"
              value={seasonInjuryDays > 0 ? `${seasonInjuryDays}j` : '—'}
              sub="cumulés saison"
            />
          </div>
          <PlayerMedicalView key={pd.player.id} playerId={pd.player.id} />
        </div>
      )}

      {/* ══ RISQUE BLESSURE ═══════════════════════════════════════════════════ */}
      {activeTab === 'risk' && (
        <div>
          <Card accentColor={atRiskNow ? '#EF4444' : '#00E5A0'} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{
                width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                backgroundColor: atRiskNow ? 'rgba(239,68,68,0.12)' : 'rgba(0,229,160,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldAlert size={22} style={{ color: atRiskNow ? '#EF4444' : '#00E5A0' }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
                  Risque de blessure — maintenant
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: atRiskNow ? '#EF4444' : '#00E5A0' }}>
                  {atRiskNow ? 'À risque' : 'Pas de risque identifié'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 4 }}>
                  {[
                    currentInjury ? 'Blessure active en cours' : null,
                    (acwrZ?.label === 'Risque modéré' || acwrZ?.label === 'Risque élevé') ? `Charge ACWR en ${acwrZ.label.toLowerCase()}` : null,
                    alerts.some(a => a.level === 'red') ? 'Alerte récente de niveau élevé' : null,
                  ].filter(Boolean).join(' · ') || 'Charge et indicateurs dans les normes.'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
                  ACWR actuel
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: acwrZ?.color ?? '#94A3B8', fontFamily: 'JetBrains Mono, monospace' }}>
                  {acwr !== null ? acwr.toFixed(2) : '—'}
                </div>
                {acwrZ && <Badge color={acwrZ.color} size="sm" label={acwrZ.label} style={{ fontSize: '0.62rem', marginTop: 4 }} />}
              </div>
            </div>
          </Card>

          <RiskAlertsList alerts={alerts} hidePlayerName />
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
