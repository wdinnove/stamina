import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BarChart2, ChevronDown, ChevronUp, ChevronRight, Activity, Heart, UserCheck, CheckSquare, ShieldAlert } from 'lucide-react';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import { aggregateTeamWellnessDaily, wellnessAvg, wellnessTier } from '../utils/wellness';
import { actionsApi, statsApi, matchesApi } from '../api';
import {
  Card, CardTitle, EmptyState, DateRangeCard, useDateRange, TeamStatsHero, Badge, HeroCard, HeroCardShell,
  PCABiplot, WinFactorsList, PlayerImpactList, RPEPlayerRankingTable, RiskAlertsList, RiskVerdictCard, ChargeRpeComboChart,
  PlayerRankingTable, IndicatorSelect, CorrelationsPanel, WellnessPomsPanel, PlayerCompareByPlayer,
  TeamTrendHero, ResponsiveTabNav, TEAM_SUBJECT, ObjectivesPanel,
  RpeKpiCard, TeamSessionHistoryTable, TeamMedicalOverview, TeamCompareByMatch, TeamCompareBySeason, TeamCompareByPeriod,
  TeamQuarterBreakdown,
} from '../components';
import type { RankingRow } from '../components/PlayerRankingTable';
import { FilterField, filterControlStyle } from '../components/FilterField';
import type { DatePreset } from '../components/DateRangeCard';
import { evalColor, ortgColor, drtgColor } from '../data';
import { calcPlayerAdvanced } from '../data/playerAdvanced';
import { computeMatchPCA, computeWinFactors, computePlayerImpact } from '../data/pca';
import { rpeColor, rpeLabel, acwrZone, tsbZone, ALERT_TITLE_PLAIN, CHARGE_ZONE_PLAIN } from '../utils/rpe';
import { wellnessScoreColor } from '../utils/wellness';
import { mondayIso, getWeekTier } from '../utils/weeklyLoad';
import { fmtDateWithDay } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { roundedAvg } from '../utils/avg';
import { fmt1 } from '../utils/format';
import {
  playerAttributeIndicators, getSeries, detectRiskAlerts,
  type CrossScope, type IndicatorDef,
} from '../data/crossAnalysis';
import type { MatchStat, TeamMatchStat, Action, Match } from '../data/types';

// ─── Helpers partagés (portés depuis AnalyseCollectivePage / PerformancePage) ──

type Sort = { col: string; dir: 'asc' | 'desc' };

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const fmtD = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const fmt  = (v: number | null, suf = '') => v !== null ? `${v}${suf}` : '—';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

const TH: React.CSSProperties = {
  padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A',
  position: 'sticky', top: 0, backgroundColor: '#161920', zIndex: 1,
  cursor: 'pointer', userSelect: 'none' as const,
};
const TD: React.CSSProperties = {
  padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
};
const SEP: React.CSSProperties = { borderLeft: '1px solid #334155' };
const TOTALS: React.CSSProperties = { borderTop: '2px solid #2A2F3A', backgroundColor: 'rgba(255,255,255,0.035)' };
const TL: React.CSSProperties = { padding: '7px 10px', fontSize: '0.78rem', textAlign: 'left', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };

const si = (col: string, s: Sort) => s.col === col ? (s.dir === 'asc' ? ' ↑' : ' ↓') : '';
const thC = (col: string, s: Sort) => s.col === col ? '#CBD5E1' : '#475569';
const tog = (s: Sort, col: string): Sort =>
  s.col === col ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' };

function sumStats(ss: MatchStat[], k: keyof MatchStat) {
  return ss.reduce((a, m) => a + (((m[k] as number) || 0)), 0);
}
function avgStats(ss: MatchStat[], k: keyof MatchStat) {
  return ss.length > 0 ? Math.round(sumStats(ss, k) / ss.length * 10) / 10 : 0;
}

/** Moyenne d'une colonne sur les lignes d'un tableau — pour la ligne "Moyenne équipe" en pied de tableau. */
function colAvg<T>(rows: T[], get: (r: T) => number | null): number | null {
  const vals = rows.map(get).filter((v): v is number => v !== null && !Number.isNaN(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
const colAvg1   = <T,>(rows: T[], get: (r: T) => number | null): number | null => {
  const m = colAvg(rows, get); return m !== null ? Math.round(m * 10) / 10 : null;
};
const colAvgInt = <T,>(rows: T[], get: (r: T) => number | null): number | null => {
  const m = colAvg(rows, get); return m !== null ? Math.round(m) : null;
};

// ─── Onglets ────────────────────────────────────────────────────────────────

// Noms de clés/groupes alignés sur PerformanceIndividuellePage pour une navigation symétrique
// entre les deux pages (cf. audit). Le hero "Forme actuelle" (trajectoire de forme) vit sur la
// Vue d'ensemble des deux pages, ce n'est plus un onglet séparé.
type Tab = 'overview' | 'players-basic' | 'players-advanced' | 'matches-basic' | 'matches-advanced' | 'matches-quarters'
         | 'impact' | 'pca' | 'ranking' | 'dynamic' | 'load' | 'rpe' | 'wellness' | 'medical' | 'correlations'
         | 'compare-match' | 'compare-season' | 'compare-player' | 'objectives';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':            'overview',
  'stats-joueurs':           'players-basic',
  'stats-joueuses':          'players-basic', // ancien slug — conservé pour ne pas casser les liens existants
  'stats-joueurs-avancees':  'players-advanced',
  'stats-matchs':            'matches-basic',
  'stats-matchs-avancees':   'matches-advanced',
  'qt-par-qt':               'matches-quarters',
  'impact':                  'impact',
  'acp':                     'pca',
  'classement-joueurs':      'ranking',
  'charge-physique':         'load',
  'rpe':                     'rpe',
  'bien-etre':               'wellness',
  'medical':                 'medical',
  'correlations':            'correlations',
  'objectifs':               'objectives',
  'par-match':               'compare-match',
  'par-saison':              'compare-season',
  'par-joueur':              'compare-player',
  'comparaison':             'compare-player', // ancien slug — "Comparaison joueurs" fusionné avec "Par joueur" (même page que côté individuel)
  'tendances':               'dynamic', // ancien alias — "Tendances" (période vs saison) s'appelle maintenant "Par période"
  'par-periode':             'dynamic',
  'forme':                   'overview', // ancien onglet "Tendances" (trajectoire de forme) — vit maintenant sur la Vue d'ensemble
};

const TAB_GROUPS: { label?: string; tabs: { key: Tab; slug: string; label: string }[] }[] = [
  { tabs: [{ key: 'overview', slug: 'vue-ensemble', label: "Vue d'ensemble" }] },
  { label: 'Suivi', tabs: [
    { key: 'load',      slug: 'charge-physique', label: 'Charge physique' },
    { key: 'rpe',       slug: 'rpe',             label: 'RPE' },
    { key: 'wellness',  slug: 'bien-etre',       label: 'Bien-être' },
    { key: 'medical',   slug: 'medical',         label: 'Médical' },
  ] },
  { label: 'Statistiques joueurs', tabs: [
    { key: 'players-basic',    slug: 'stats-joueurs',          label: 'Brutes' },
    { key: 'players-advanced', slug: 'stats-joueurs-avancees', label: 'Avancées' },
  ] },
  { label: 'Statistiques matchs', tabs: [
    { key: 'matches-basic',    slug: 'stats-matchs',          label: 'Brutes' },
    { key: 'matches-advanced', slug: 'stats-matchs-avancees', label: 'Avancées' },
  ] },
  { label: 'Analyse', tabs: [
    { key: 'objectives',   slug: 'objectifs',          label: 'Objectifs' },
    { key: 'ranking',      slug: 'classement-joueurs', label: 'Classement joueurs' },
    { key: 'impact',       slug: 'impact',       label: 'Impact joueurs' },
    { key: 'pca',          slug: 'acp',          label: 'Facteurs de victoire' },
    { key: 'matches-quarters', slug: 'qt-par-qt', label: 'QT par QT' },
    { key: 'correlations', slug: 'correlations', label: 'Corrélations' },
  ] },
  { label: 'Comparer', tabs: [
    { key: 'dynamic',        slug: 'par-periode',       label: 'Par période' },
    { key: 'compare-match',  slug: 'par-match',         label: 'Par match' },
    { key: 'compare-season', slug: 'par-saison',        label: 'Par saison' },
    { key: 'compare-player', slug: 'par-joueur',        label: 'Par joueur' },
  ] },
];

// Préréglage de période appliqué à la première arrivée sur chaque onglet (cf. useDateRange —
// ne se réapplique pas à un simple changement d'onglet, seulement quand seasonStart/seasonEnd
// changent, ex. saison/équipe différente choisie dans la TopBar). Actuellement identique partout,
// mais gérable indépendamment onglet par onglet si un besoin de préréglage différent apparaît.
const TAB_DEFAULT_PRESET: Record<Tab, DatePreset> = {
  overview: 'saison', 'players-basic': 'saison', 'players-advanced': 'saison',
  'matches-basic': 'saison', 'matches-advanced': 'saison', 'matches-quarters': 'saison',
  impact: 'saison', pca: 'saison', ranking: 'saison', dynamic: 'saison',
  load: 'saison', rpe: 'saison', wellness: 'saison', medical: 'saison', correlations: 'saison', objectives: 'saison',
  'compare-match': 'saison', 'compare-season': 'saison', 'compare-player': 'saison',
};

export default function PerformanceCollectivePage() {
  const { selected, thresholds, statThresholds, loading: teamLoading } = useTeamSeason();
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab?: string }>();
  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'overview';
  const setActiveTab = (slug: string) => navigate(`/performance-collective/${slug}`, { replace: true });

  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
  const dateRange = useDateRange(seasonStart, TAB_DEFAULT_PRESET[activeTab], seasonEnd);
  const { from, to } = dateRange;
  const showSeasonDiff = dateRange.preset !== 'saison';

  const players    = useMemo(() => data?.players.map(p => p.player) ?? [], [data]);
  const allStats   = useMemo(() => data?.players.flatMap(p => p.matchStats) ?? [], [data]);
  const teamStats  = data?.teamMatchStats ?? [];
  const teamStatsMap = useMemo(
    () => new Map(teamStats.filter(t => t.matchId).map(t => [t.matchId as string, t])),
    [teamStats],
  );

  const filteredAllStats  = useMemo(() => from ? allStats.filter(s => s.date >= from && s.date <= to) : allStats, [allStats, from, to]);
  const filteredTeamStats = useMemo(() => from ? teamStats.filter(t => t.date >= from && t.date <= to) : teamStats, [teamStats, from, to]);

  const openPlayer = (playerId: string) => navigate(`/performance-individuelle/${playerId}/vue-ensemble`);

  // ── Vue d'ensemble : KPIs équipe ──────────────────────────────────────────
  const inRangeTeam = (d: string) => d >= from && d <= to;
  const allPd = data?.players ?? [];
  const allRpe = allPd.flatMap(p => p.rpe);
  const allWellness = allPd.flatMap(p => p.wellness);
  const allMatchStats = allPd.flatMap(p => p.matchStats);
  const allAttendance = allPd.flatMap(p => p.attendance);
  const rpeAvgP   = roundedAvg(allRpe.filter(e => inRangeTeam(e.date)).map(e => e.rpe));
  // Agrégat quotidien équipe (moyenne des joueuses ayant loggué ce jour-là) avant de moyenner
  // sur la période — sinon une joueuse qui logge plus souvent pèse plus lourd dans la moyenne.
  const wellAvgP   = wellnessAvg(aggregateTeamWellnessDaily(allWellness.filter(w => inRangeTeam(w.date))).map(e => e.score));
  const evalAvgP   = roundedAvg(allMatchStats.filter(m => m.eval !== null && inRangeTeam(m.date)).map(m => Number(m.eval)));
  const attP = allAttendance.filter(a => inRangeTeam(a.date));
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;
  const ptsAvgP = roundedAvg(filteredTeamStats.map(t => t.scoreUs));

  // ── Actions d'équipe (Vue d'ensemble) ─────────────────────────────────────
  const [teamActions, setTeamActions] = useState<Action[]>([]);
  useEffect(() => {
    if (!selected) { setTeamActions([]); return; }
    actionsApi.list({ teamId: selected.team.id }).then(setTeamActions).catch(() => {});
  }, [selected?.team.id]);
  const openActions = teamActions.filter(a => a.status !== 'done').length;
  const doneActions = teamActions.filter(a => a.status === 'done').length;

  // ── Statistiques joueurs / matchs (ex-AnalyseCollectivePage) ─────────────
  const [normalize25, setNormalize25] = useState(false);
  const [showBiplot, setShowBiplot]   = useState(false);
  const [s1, setS1] = useState<Sort>({ col: 'pts',  dir: 'desc' });
  const [s2, setS2] = useState<Sort>({ col: 'pts',  dir: 'desc' });
  const [s4, setS4] = useState<Sort>({ col: 'date', dir: 'desc' });
  const [s5, setS5] = useState<Sort>({ col: 'date', dir: 'desc' });

  const playerStatsMap = useMemo(() => {
    const m = new Map<string, MatchStat[]>();
    for (const s of filteredAllStats) {
      if (!m.has(s.playerId)) m.set(s.playerId, []);
      m.get(s.playerId)!.push(s);
    }
    return m;
  }, [filteredAllStats]);

  const pjRows = useMemo(() => players
    .filter(p => playerStatsMap.has(p.id))
    .map(p => {
      const ss = playerStatsMap.get(p.id)!;
      const n  = ss.length;
      const fg2m = sumStats(ss, 'fg2m'), fg2a = sumStats(ss, 'fg2a');
      const fg3m = sumStats(ss, 'fg3m'), fg3a = sumStats(ss, 'fg3a');
      const ftm  = sumStats(ss, 'ftm'),  fta  = sumStats(ss, 'fta');
      const tit  = ss.filter(s => s.starter).length;
      const we   = ss.filter(s => s.eval !== null);
      const evalAvg = roundedAvg(we.map(s => s.eval as number));
      const avgPm = n > 0
        ? Math.round(ss.reduce((a, s) => a + (s.plusMinus ?? 0), 0) / n * 10) / 10 : 0;
      return {
        p, n, tit,
        avgMin: avgStats(ss, 'min'), avgPts: avgStats(ss, 'pts'),
        fg2m, fg2a, fg2Pct: fg2a > 0 ? Math.round(fg2m / fg2a * 100) : null,
        fg3m, fg3a, fg3Pct: fg3a > 0 ? Math.round(fg3m / fg3a * 100) : null,
        ftm,  fta,  ftPct:  fta  > 0 ? Math.round(ftm  / fta  * 100) : null,
        avgRo: avgStats(ss, 'ro'), avgRd: avgStats(ss, 'rd'),
        avgRt: Math.round((avgStats(ss, 'ro') + avgStats(ss, 'rd')) * 10) / 10,
        avgPd: avgStats(ss, 'pd'), avgCt: avgStats(ss, 'ct'),
        avgInt: avgStats(ss, 'intercepts'), avgBp: avgStats(ss, 'bp'),
        avgFte: avgStats(ss, 'fte'), avgFp: avgStats(ss, 'fpr'),
        evalAvg, avgPm,
      };
    }), [players, playerStatsMap]);

  const pjAdvRows = useMemo(() => players
    .filter(p => playerStatsMap.has(p.id))
    .map(p => {
      const ss  = playerStatsMap.get(p.id)!;
      const n   = ss.length;
      const adv = ss.map(m => calcPlayerAdvanced(m, teamStatsMap.get(m.matchId ?? '') ?? null));
      const avgA = (key: string) => {
        const vals = adv.map(a => (a as unknown as Record<string, number | null>)[key]).filter((v): v is number => v !== null);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
      };
      return {
        p, n,
        avgMin: avgStats(ss, 'min'),
        avgPts: n > 0 ? Math.round(ss.reduce((a, s) => a + s.pts, 0) / n * 10) / 10 : 0,
        usagePct: avgA('usagePct'), offRating: avgA('offRating'),
        efgPct: avgA('efgPct'), ftRate: avgA('ftRate'), ptsProd: avgA('ptsProd'),
        astPct: avgA('astPct'), tovPct: avgA('tovPct'), bpPerPoss: avgA('bpPerPoss'),
        trebPct: avgA('trebPct'), drebPct: avgA('drebPct'), orebPct: avgA('orebPct'),
      };
    }), [players, playerStatsMap, teamStatsMap]);

  const pjDisplayRows = useMemo(() => pjRows.map(r => {
    const sc = normalize25 && r.avgMin > 0 ? 25 / r.avgMin : 1;
    const nr = (v: number) => Math.round(v * sc * 10) / 10;
    return {
      ...r,
      avgMin:  normalize25 && r.avgMin > 0 ? 25 : r.avgMin,
      avgPts:  nr(r.avgPts),
      fg2mPg:  nr(Math.round(r.fg2m / r.n * 10) / 10),
      fg2aPg:  nr(Math.round(r.fg2a / r.n * 10) / 10),
      fg3mPg:  nr(Math.round(r.fg3m / r.n * 10) / 10),
      fg3aPg:  nr(Math.round(r.fg3a / r.n * 10) / 10),
      ftmPg:   nr(Math.round(r.ftm  / r.n * 10) / 10),
      ftaPg:   nr(Math.round(r.fta  / r.n * 10) / 10),
      avgRo:   nr(r.avgRo), avgRd: nr(r.avgRd), avgRt: nr(r.avgRt),
      avgPd:   nr(r.avgPd), avgCt: nr(r.avgCt),
      avgInt:  nr(r.avgInt), avgBp: nr(r.avgBp),
      avgPm:   nr(r.avgPm),
      evalAvg: r.evalAvg !== null ? nr(r.evalAvg) : null,
    };
  }), [pjRows, normalize25]);

  const pjAdvDisplayRows = useMemo(() => pjAdvRows.map(r => {
    const sc = normalize25 && r.avgMin > 0 ? 25 / r.avgMin : 1;
    const nr = (v: number) => Math.round(v * sc * 10) / 10;
    return {
      ...r,
      avgMin:  normalize25 && r.avgMin > 0 ? 25 : r.avgMin,
      avgPts:  nr(r.avgPts),
      ptsProd: r.ptsProd !== null ? nr(r.ptsProd) : null,
    };
  }), [pjAdvRows, normalize25]);

  const matchEvalStatsMap = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>();
    for (const s of filteredAllStats) {
      if (!s.matchId || s.eval === null) continue;
      const cur = m.get(s.matchId) ?? { sum: 0, count: 0 };
      cur.sum += s.eval;
      cur.count += 1;
      m.set(s.matchId, cur);
    }
    return m;
  }, [filteredAllStats]);

  const pmRows = useMemo(() => filteredTeamStats.map(t => {
    const evalStats = t.matchId ? matchEvalStatsMap.get(t.matchId) : undefined;
    return {
      ...t,
      pts:           t.fg2m * 2 + t.fg3m * 3 + t.ftm,
      fg2Pct:        t.fg2a > 0 ? Math.round(t.fg2m / t.fg2a * 100) : null,
      fg3Pct:        t.fg3a > 0 ? Math.round(t.fg3m / t.fg3a * 100) : null,
      ftPct:         t.fta  > 0 ? Math.round(t.ftm  / t.fta  * 100) : null,
      // Moyenne d'éval par joueuse sur ce match (pas un total d'équipe) — comparable à la
      // colonne "Éval" de l'onglet Statistiques joueurs, et cohérente avec sa propre couleur.
      evalTeamAvg:   evalStats && evalStats.count > 0 ? Math.round(evalStats.sum / evalStats.count * 10) / 10 : null,
    };
  }), [filteredTeamStats, matchEvalStatsMap]);

  const pcaResult     = useMemo(() => computeMatchPCA(filteredTeamStats),   [filteredTeamStats]);
  const winFactors    = useMemo(() => computeWinFactors(filteredTeamStats), [filteredTeamStats]);
  const playerImpacts = useMemo(() => computePlayerImpact(players, filteredAllStats), [players, filteredAllStats]);

  const sortedPJ = useMemo(() => [...pjDisplayRows].sort((a, b) => {
    const m = s1.dir === 'asc' ? 1 : -1;
    switch (s1.col) {
      case 'name':  return m * a.p.lastName.localeCompare(b.p.lastName);
      case 'mj':    return m * (a.n - b.n);
      case 'tit':   return m * (a.tit - b.tit);
      case 'min':   return m * (a.avgMin - b.avgMin);
      case 'pts':   return m * (a.avgPts - b.avgPts);
      case 'fg2':   return m * ((a.fg2Pct ?? -1) - (b.fg2Pct ?? -1));
      case 'fg3':   return m * ((a.fg3Pct ?? -1) - (b.fg3Pct ?? -1));
      case 'ft':    return m * ((a.ftPct ?? -1) - (b.ftPct ?? -1));
      case 'ro':    return m * (a.avgRo - b.avgRo);
      case 'rd':    return m * (a.avgRd - b.avgRd);
      case 'reb':   return m * (a.avgRt - b.avgRt);
      case 'pd':    return m * (a.avgPd - b.avgPd);
      case 'ct':    return m * (a.avgCt - b.avgCt);
      case 'int':   return m * (a.avgInt - b.avgInt);
      case 'bp':    return m * (a.avgBp - b.avgBp);
      case 'eval':  return m * ((a.evalAvg ?? -99) - (b.evalAvg ?? -99));
      case 'pm':    return m * (a.avgPm - b.avgPm);
      default:      return 0;
    }
  }), [pjDisplayRows, s1]);

  const sortedPJAdv = useMemo(() => [...pjAdvDisplayRows].sort((a, b) => {
    const m = s2.dir === 'asc' ? 1 : -1;
    switch (s2.col) {
      case 'name':  return m * a.p.lastName.localeCompare(b.p.lastName);
      case 'mj':    return m * (a.n - b.n);
      case 'min':   return m * (a.avgMin - b.avgMin);
      case 'pts':   return m * (a.avgPts - b.avgPts);
      case 'usg':   return m * ((a.usagePct ?? -1) - (b.usagePct ?? -1));
      case 'ortg':  return m * ((a.offRating ?? -1) - (b.offRating ?? -1));
      case 'efg':   return m * ((a.efgPct ?? -1) - (b.efgPct ?? -1));
      case 'ftr':   return m * ((a.ftRate ?? -1) - (b.ftRate ?? -1));
      case 'pprod': return m * ((a.ptsProd ?? -1) - (b.ptsProd ?? -1));
      case 'ast':   return m * ((a.astPct ?? -1) - (b.astPct ?? -1));
      case 'tov':   return m * ((a.tovPct ?? -1) - (b.tovPct ?? -1));
      case 'bppos': return m * ((a.bpPerPoss ?? -1) - (b.bpPerPoss ?? -1));
      case 'treb':  return m * ((a.trebPct ?? -1) - (b.trebPct ?? -1));
      case 'dreb':  return m * ((a.drebPct ?? -1) - (b.drebPct ?? -1));
      case 'oreb':  return m * ((a.orebPct ?? -1) - (b.orebPct ?? -1));
      default:      return 0;
    }
  }), [pjAdvDisplayRows, s2]);

  const sortedPM = useMemo(() => [...pmRows].sort((a, b) => {
    const m = s4.dir === 'asc' ? 1 : -1;
    switch (s4.col) {
      case 'date':  return m * (a.date ?? '').localeCompare(b.date ?? '');
      case 'opp':   return m * (a.opponent ?? '').localeCompare(b.opponent ?? '');
      case 'pts':   return m * (a.pts - b.pts);
      case 'fg2':   return m * ((a.fg2Pct ?? -1) - (b.fg2Pct ?? -1));
      case 'fg3':   return m * ((a.fg3Pct ?? -1) - (b.fg3Pct ?? -1));
      case 'ft':    return m * ((a.ftPct ?? -1) - (b.ftPct ?? -1));
      case 'ro':    return m * (a.ro - b.ro);
      case 'rd':    return m * (a.rd - b.rd);
      case 'rt':    return m * (a.rt - b.rt);
      case 'pd':    return m * (a.pd - b.pd);
      case 'ct':    return m * (a.ct - b.ct);
      case 'int':   return m * (a.intercepts - b.intercepts);
      case 'bp':    return m * (a.bp - b.bp);
      default:      return 0;
    }
  }), [pmRows, s4]);

  const sortedPMAdv = useMemo(() => [...pmRows].sort((a, b) => {
    const m = s5.dir === 'asc' ? 1 : -1;
    switch (s5.col) {
      case 'date':  return m * (a.date ?? '').localeCompare(b.date ?? '');
      case 'opp':   return m * (a.opponent ?? '').localeCompare(b.opponent ?? '');
      case 'pts':   return m * (a.pts - b.pts);
      case 'ortg':  return m * (a.offRating - b.offRating);
      case 'drtg':  return m * (a.defRating - b.defRating);
      case 'efg':   return m * (a.efgPct - b.efgPct);
      case 'ftr':   return m * (a.ftRate - b.ftRate);
      case 'to':    return m * (a.toPct - b.toPct);
      case 'oreb':  return m * (a.orebPct - b.orebPct);
      case 'dreb':  return m * (a.drebPct - b.drebPct);
      default:      return 0;
    }
  }), [pmRows, s5]);

  const matchCount = pmRows.length;
  const wins       = pmRows.filter(m => m.result === 'win').length;

  // ── Lignes "Moyenne équipe" en pied des 4 tableaux Statistiques joueurs/matchs ──
  const pjFooter = {
    n:       colAvg1(sortedPJ, r => r.n),       tit:     colAvg1(sortedPJ, r => r.tit),
    avgMin:  colAvg1(sortedPJ, r => r.avgMin),  avgPts:  colAvg1(sortedPJ, r => r.avgPts),
    fg2mPg:  colAvg1(sortedPJ, r => r.fg2mPg),  fg2aPg:  colAvg1(sortedPJ, r => r.fg2aPg),  fg2Pct: colAvgInt(sortedPJ, r => r.fg2Pct),
    fg3mPg:  colAvg1(sortedPJ, r => r.fg3mPg),  fg3aPg:  colAvg1(sortedPJ, r => r.fg3aPg),  fg3Pct: colAvgInt(sortedPJ, r => r.fg3Pct),
    ftmPg:   colAvg1(sortedPJ, r => r.ftmPg),   ftaPg:   colAvg1(sortedPJ, r => r.ftaPg),   ftPct:  colAvgInt(sortedPJ, r => r.ftPct),
    avgRo:   colAvg1(sortedPJ, r => r.avgRo),   avgRd:   colAvg1(sortedPJ, r => r.avgRd),   avgRt:  colAvg1(sortedPJ, r => r.avgRt),
    avgPd:   colAvg1(sortedPJ, r => r.avgPd),   avgCt:   colAvg1(sortedPJ, r => r.avgCt),
    avgInt:  colAvg1(sortedPJ, r => r.avgInt),  avgBp:   colAvg1(sortedPJ, r => r.avgBp),
    evalAvg: colAvg1(sortedPJ, r => r.evalAvg), avgPm:   colAvg1(sortedPJ, r => r.avgPm),
  };
  const pjAdvFooter = {
    n:         colAvg1(sortedPJAdv, r => r.n),         avgMin:    colAvg1(sortedPJAdv, r => r.avgMin),
    avgPts:    colAvg1(sortedPJAdv, r => r.avgPts),    usagePct:  colAvg1(sortedPJAdv, r => r.usagePct),
    offRating: colAvg1(sortedPJAdv, r => r.offRating), efgPct:    colAvg1(sortedPJAdv, r => r.efgPct),
    ftRate:    colAvg1(sortedPJAdv, r => r.ftRate),    ptsProd:   colAvg1(sortedPJAdv, r => r.ptsProd),
    astPct:    colAvg1(sortedPJAdv, r => r.astPct),    tovPct:    colAvg1(sortedPJAdv, r => r.tovPct),
    bpPerPoss: colAvg1(sortedPJAdv, r => r.bpPerPoss), trebPct:   colAvg1(sortedPJAdv, r => r.trebPct),
    drebPct:   colAvg1(sortedPJAdv, r => r.drebPct),   orebPct:   colAvg1(sortedPJAdv, r => r.orebPct),
  };
  const pmFooter = {
    pts:  colAvg1(sortedPM, r => r.pts),
    fg2m: colAvg1(sortedPM, r => r.fg2m), fg2a: colAvg1(sortedPM, r => r.fg2a), fg2Pct: colAvgInt(sortedPM, r => r.fg2Pct),
    fg3m: colAvg1(sortedPM, r => r.fg3m), fg3a: colAvg1(sortedPM, r => r.fg3a), fg3Pct: colAvgInt(sortedPM, r => r.fg3Pct),
    ftm:  colAvg1(sortedPM, r => r.ftm),  fta:  colAvg1(sortedPM, r => r.fta),  ftPct:  colAvgInt(sortedPM, r => r.ftPct),
    ro:   colAvg1(sortedPM, r => r.ro),   rd:   colAvg1(sortedPM, r => r.rd),   rt:     colAvg1(sortedPM, r => r.rt),
    pd:   colAvg1(sortedPM, r => r.pd),   ct:   colAvg1(sortedPM, r => r.ct),
    intercepts: colAvg1(sortedPM, r => r.intercepts), bp: colAvg1(sortedPM, r => r.bp),
    evalTeamAvg: colAvg1(sortedPM, r => r.evalTeamAvg),
  };
  const pmAdvFooter = {
    pts:       colAvg1(sortedPMAdv, r => r.pts),
    offRating: colAvg1(sortedPMAdv, r => r.offRating > 0 ? r.offRating : null),
    defRating: colAvg1(sortedPMAdv, r => r.defRating > 0 ? r.defRating : null),
    efgPct:    colAvgInt(sortedPMAdv, r => r.efgPct > 0 ? r.efgPct : null),
    ftRate:    colAvg1(sortedPMAdv, r => r.ftRate > 0 ? r.ftRate : null),
    toPct:     colAvgInt(sortedPMAdv, r => r.toPct > 0 ? r.toPct : null),
    orebPct:   colAvgInt(sortedPMAdv, r => r.orebPct > 0 ? r.orebPct : null),
    drebPct:   colAvgInt(sortedPMAdv, r => r.drebPct > 0 ? r.drebPct : null),
  };

  // ── Charge physique (ex-RPEPage team_history + verdict/graphe alignés sur PerformanceIndividuellePage) ──
  const {
    playerRanking, teamKpis: rpeTeamKpis, teamSessionRows, teamAcwrAvg, teamFreshAvg,
  } = useTeamRpeHistory(selected?.team.id, selected?.season.id, from, to, players);
  const sessionLoadLight  = Math.round(thresholds.lightMax  / thresholds.sessionsPerWeek);
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);
  const [loadComboView, setLoadComboView] = useState<'session' | 'week'>('week');
  const [rpeComboView, setRpeComboView] = useState<'session' | 'week'>('week');
  const [rpeDisplay, setRpeDisplay] = useState<'chart' | 'table'>('chart');
  const [rankingCollapsed, setRankingCollapsed] = useState(true);

  const alerts = useMemo(
    () => data ? detectRiskAlerts(data.players, from, to, thresholds) : [],
    [data, from, to, thresholds.lightMax, thresholds.normalMax],
  );
  const injuredPlayerCount = players.filter(p => p.status === 'injured').length;
  const atRiskPlayerCount = useMemo(() => new Set([
    ...alerts.filter(a => a.level === 'red').map(a => a.playerId),
    ...players.filter(p => p.status === 'injured').map(p => p.id),
  ]).size, [alerts, players]);

  // Verdict "à risque maintenant" — alertes rouges des 21 derniers jours seulement, sinon un pic
  // de charge déjà résorbé reste signalé pendant des semaines (même fenêtre que côté joueur).
  const riskTo = isoDaysAgo(0);
  const recentFrom = isoDaysAgo(21);
  const recentAlerts = useMemo(
    () => data ? detectRiskAlerts(data.players, recentFrom, riskTo, thresholds) : [],
    [data, recentFrom, riskTo, thresholds.lightMax, thresholds.normalMax],
  );
  const latestRedAlert = useMemo(() => {
    const reds = recentAlerts.filter(a => a.level === 'red');
    return reds.length ? [...reds].sort((a, b) => b.date.localeCompare(a.date))[0] : null;
  }, [recentAlerts]);
  const teamAcwrZ = acwrZone(teamAcwrAvg);
  const teamFreshZ = teamFreshAvg !== null ? tsbZone(teamFreshAvg) : null;

  // Graphe Charge & RPE équipe — même construction que RPEPage (charge moyenne par joueur présent).
  // Suit le filtre de dates de la page (teamSessionRows est déjà borné par from/to, cf.
  // useTeamRpeHistory) ; le graphe devient scrollable horizontalement (cf. ChargeRpeComboChart) si
  // la période choisie contient beaucoup de séances/semaines, plutôt que de tout tasser dans la
  // largeur disponible.
  const sessionCombo = useMemo(() => [...teamSessionRows].reverse().map(s => ({
    date: fmtDateWithDay(s.date),
    load: Math.round(s.totalLoad / Math.max(s.nbPlayers, 1)),
    rpe:  s.avg,
  })), [teamSessionRows]);
  const weekCombo = useMemo(() => {
    const byWeek = new Map<string, { load: number; players: Set<string>; rpes: number[] }>();
    teamSessionRows.forEach(s => {
      const wk = mondayIso(s.date);
      if (!byWeek.has(wk)) byWeek.set(wk, { load: 0, players: new Set(), rpes: [] });
      const w = byWeek.get(wk)!;
      w.load += s.totalLoad;
      s.playerIds.forEach(id => w.players.add(id));
      if (s.avg > 0) w.rpes.push(s.avg);
    });
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, w]) => ({
        date: fmtDateWithDay(wk),
        load: Math.round(w.load / Math.max(w.players.size, 1)),
        rpe:  w.rpes.length ? Math.round(w.rpes.reduce((s, v) => s + v, 0) / w.rpes.length * 10) / 10 : 0,
      }))
      .filter(d => d.rpe > 0);
  }, [teamSessionRows]);
  const avgWeeklyLoad = weekCombo.length
    ? Math.round(weekCombo.reduce((s, d) => s + d.load, 0) / weekCombo.length) : null;
  const weekTier = avgWeeklyLoad !== null && avgWeeklyLoad > 0
    ? getWeekTier(avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax) : null;
  const surchargeWeeksTeam = weekCombo.filter(d => d.load >= thresholds.normalMax).length;
  const totalWeeksTeam = weekCombo.length;

  // ── Comparer > Par saison — historique de l'équipe toutes saisons confondues ──
  const [teamSeasonGroupedStats, setTeamSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: TeamMatchStat[] }[]>([]);
  useEffect(() => {
    if (!selected) { setTeamSeasonGroupedStats([]); return; }
    statsApi.getTeamStatsGroupedBySeason(selected.team.id).then(setTeamSeasonGroupedStats).catch(() => {});
  }, [selected?.team.id]);

  // ── QT par QT — matchs de la saison avec détail quart-temps ───────────────
  const [seasonMatches, setSeasonMatches] = useState<Match[]>([]);
  useEffect(() => {
    if (!selected) { setSeasonMatches([]); return; }
    matchesApi.listBySeason(selected.team.id, selected.season.id).then(setSeasonMatches).catch(() => {});
  }, [selected?.team.id, selected?.season.id]);
  const filteredSeasonMatches = useMemo(
    () => from ? seasonMatches.filter(m => m.date >= from && m.date <= to) : seasonMatches,
    [seasonMatches, from, to],
  );

  // ── Bien-être (ex-WellnessPage team) ──────────────────────────────────────
  const teamWellnessDaily = useMemo(
    () => data ? aggregateTeamWellnessDaily(data.players.flatMap(p => p.wellness)) : [],
    [data],
  );
  const wellnessInRange = useMemo(
    () => from ? teamWellnessDaily.filter(e => e.date >= from && e.date <= to) : teamWellnessDaily,
    [teamWellnessDaily, from, to],
  );
  const wellnessSeasonEntries = useMemo(
    () => seasonStart ? teamWellnessDaily.filter(e => e.date >= seasonStart && (!seasonEnd || e.date <= seasonEnd)) : teamWellnessDaily,
    [teamWellnessDaily, seasonStart, seasonEnd],
  );

  // ── Classement joueurs (1 facteur → classement + valeurs) ─────────────────
  // Titulaire/Domicile-extérieur/Résultat sont des drapeaux de contexte (0/1), pas des facteurs
  // de classement pertinents — masqués de ce sélecteur.
  const rankIndicators = useMemo(
    () => playerAttributeIndicators().filter(i => i.key !== 'starter' && i.key !== 'homeAway' && i.key !== 'result'),
    [],
  );
  const [rankKey, setRankKey] = useState('eval');
  const rankDef = rankIndicators.find(i => i.key === rankKey) ?? rankIndicators[0];
  const rankingRows: RankingRow[] = useMemo(() => (data?.players ?? []).map(p => {
    const pScope: CrossScope = { player: p };
    const meanOf = (def: IndicatorDef) => {
      if (!def.playerSeries) return null;
      const pts = getSeries(def, pScope, from, to);
      return pts.length ? Math.round(pts.reduce((s, x) => s + x.value, 0) / pts.length * 100) / 100 : null;
    };
    // Min/Éval : toujours affichés en repère, quel que soit le facteur choisi pour le classement.
    const periodStats = p.matchStats.filter(m => m.date >= from && m.date <= to);
    const evalStats = periodStats.filter(m => m.eval !== null);
    const rawAvgMin = periodStats.length ? Math.round(periodStats.reduce((s, m) => s + (m.min ?? 0), 0) / periodStats.length * 10) / 10 : null;
    const rawEvalAvg = evalStats.length ? Math.round(evalStats.reduce((s, m) => s + Number(m.eval), 0) / evalStats.length * 10) / 10 : null;
    const rawValue = meanOf(rankDef);
    // "25 min" : recalcule comme si chaque joueur jouait 25 min — même convention que le
    // tableau Statistiques joueurs. Ne s'applique qu'aux stats de match qui croissent avec le
    // temps de jeu (pas les %, ni les indicateurs charge/bien-être/présence).
    const sc = normalize25 && rawAvgMin && rawAvgMin > 0 ? 25 / rawAvgMin : 1;
    const valueScalable = rankDef.domain === 'match' && rankDef.unit !== '%';
    return {
      player: p.player,
      value: rawValue !== null ? Math.round(rawValue * (valueScalable ? sc : 1) * 100) / 100 : null,
      avgMin: normalize25 && rawAvgMin !== null && rawAvgMin > 0 ? 25 : rawAvgMin,
      evalAvg: rawEvalAvg !== null ? Math.round(rawEvalAvg * sc * 10) / 10 : null,
    };
  }), [data?.players, rankDef, from, to, normalize25]);
  const rankTeamAvg = roundedAvg(rankingRows.map(r => r.value).filter((v): v is number => v !== null));

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (teamLoading || loading) return <div className="p-4 md:p-6" style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;
  if (!selected) return <div className="p-4 md:p-6"><EmptyState message="Sélectionnez une équipe et une saison dans la barre du haut." size="lg" /></div>;
  if (!data || data.players.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 20px' }}>Performance collective</h1>
        <Card><EmptyState message="Aucun joueur dans l'effectif de cette saison." /></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 style={{ color: '#F1F5F9', margin: '0 0 16px' }}>Performance collective</h1>

      <TeamStatsHero
        teamName={selected.team.name} category={selected.team.category} seasonLabel={selected.season.label}
        teamStats={filteredTeamStats} statThresholds={statThresholds}
      />

      {/* gap plus petit en pile mobile (aligné sur l'espacement entre cards, 14px) qu'en ligne
          desktop (20px, entre la sidebar et le contenu) — sinon l'écart Menu→Filtres ressort
          nettement plus grand que les autres écarts entre cards. */}
      <div className="flex flex-col lg:flex-row gap-3.5 lg:gap-5" style={{ alignItems: 'flex-start' }}>
        <ResponsiveTabNav groups={TAB_GROUPS} activeKey={activeTab} onSelect={setActiveTab} />

        {/* ── Contenu de l'onglet ── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

          {activeTab !== 'dynamic' && activeTab !== 'compare-match' && activeTab !== 'compare-season' && activeTab !== 'compare-player' && activeTab !== 'medical' && activeTab !== 'objectives' && (
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
          <TeamTrendHero data={{ players: data.players, teamMatchStats: data.teamMatchStats }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 12, marginBottom: 16 }}>
          <HeroCard
            icon={<BarChart2 size={20} color="#3B82F6" />} iconBg="#3B82F622"
            title="Statistiques"
            ctaLabel="Voir les stats" onOpen={() => setActiveTab('stats-joueurs')}
            borderColor={evalAvgP !== null ? evalColor(evalAvgP, statThresholds) : '#475569'}
            stats={[
              { value: ptsAvgP ?? 0, label: 'Points / match', color: '#F1F5F9' },
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
            ctaLabel="Voir les actions" onOpen={() => navigate('/actions')}
            borderColor={openActions === 0 ? '#00E5A0' : '#F59E0B'}
            stats={[
              { value: openActions, label: 'À faire', color: openActions === 0 ? '#475569' : '#F59E0B' },
              { value: doneActions, label: 'Faites', color: '#00E5A0' },
            ]}
          />
          <HeroCardShell
            icon={<ShieldAlert size={20} color={atRiskPlayerCount > 0 ? '#EF4444' : '#00E5A0'} />} iconBg={atRiskPlayerCount > 0 ? '#EF444422' : '#00E5A022'}
            title="Risque blessure"
            ctaLabel="Voir le risque" onOpen={() => setActiveTab('charge-physique')}
            borderColor={atRiskPlayerCount > 0 ? '#EF4444' : '#00E5A0'}
          >
            <div className="text-[1.25rem] md:text-[1.7rem]" style={{ color: atRiskPlayerCount > 0 ? '#EF4444' : '#00E5A0', fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
              {atRiskPlayerCount}
            </div>
            <div className="text-[0.62rem] md:text-[0.68rem]" style={{ color: '#475569', marginTop: 5 }}>
              {atRiskPlayerCount > 0 ? `Joueur${atRiskPlayerCount > 1 ? 's' : ''} à risque` : 'Aucun facteur de risque identifié'}
            </div>
          </HeroCardShell>
          <HeroCardShell
            icon={<Activity size={20} color="#8B5CF6" />} iconBg="#8B5CF622"
            title="RPE moyen"
            ctaLabel="Voir la charge" onOpen={() => setActiveTab('charge-physique')}
            borderColor={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569'}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="text-[1.25rem] md:text-[1.7rem]" style={{ color: rpeAvgP !== null ? rpeColor(rpeAvgP) : '#475569', fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                {rpeAvgP !== null ? fmt1(rpeAvgP) : '—'}
              </div>
              {rpeAvgP !== null && <div className="text-[0.7rem] md:text-[0.85rem]" style={{ color: rpeColor(rpeAvgP), fontWeight: 700 }}>{rpeLabel(Math.round(rpeAvgP))}</div>}
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
              <div className="text-[1.25rem] md:text-[1.7rem]" style={{ color: wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#475569', fontWeight: 800, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
                {wellAvgP !== null ? fmt1(wellAvgP) : '—'}
              </div>
              {wellAvgP !== null && <div className="text-[0.7rem] md:text-[0.85rem]" style={{ color: wellnessTier(wellAvgP).color, fontWeight: 700 }}>{wellnessTier(wellAvgP).label}</div>}
            </div>
            <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5 }}>Score moyen /10</div>
          </HeroCardShell>
        </div>
        </>
      )}

      {/* ══ STATISTIQUES JOUEURS ════════════════════════════════════════════ */}
      {(activeTab === 'players-basic' || activeTab === 'players-advanced') && (
        <Card>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />} mb={18}
            info={sortedPJ.length > 0 ? <>{sortedPJ.length} joueur{sortedPJ.length > 1 ? 's' : ''}</> : undefined}
            right={
              <button type="button" onClick={() => setNormalize25(v => !v)}
                title="Recalculer toutes les stats comme si chaque joueur jouait 25 min"
                style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${normalize25 ? '#F59E0B' : '#2A2F3A'}`, cursor: 'pointer', fontSize: '0.68rem', fontWeight: normalize25 ? 700 : 400, backgroundColor: normalize25 ? 'rgba(245,158,11,0.12)' : 'transparent', color: normalize25 ? '#F59E0B' : '#475569', transition: 'all 0.15s' }}>
                25 min
              </button>
            }
          >Statistiques joueurs</CardTitle>

          {activeTab === 'players-basic' ? (
            sortedPJ.length === 0 ? <EmptyState message="Aucune statistique pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead><tr>
                    <th onClick={() => setS1(p => tog(p, 'name'))} style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}><span style={{ color: thC('name', s1) }}>Joueur{si('name', s1)}</span></th>
                    <th style={{ ...TH, cursor: 'default' }}>#</th>
                    <th onClick={() => setS1(p => tog(p, 'mj'))}   style={{ ...TH, color: thC('mj', s1)   }}>MJ{si('mj', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'tit'))}  style={{ ...TH, color: thC('tit', s1)  }}>Tit{si('tit', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'min'))}  style={{ ...TH, color: normalize25 ? '#F59E0B' : thC('min', s1) }}>Min{si('min', s1)}{normalize25 ? ' ⟳' : ''}</th>
                    <th onClick={() => setS1(p => tog(p, 'pts'))}  style={{ ...TH, color: thC('pts', s1) }}>Pts{si('pts', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>2pts</th>
                    <th onClick={() => setS1(p => tog(p, 'fg2'))}  style={{ ...TH, color: thC('fg2', s1) }}>2%{si('fg2', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>3pts</th>
                    <th onClick={() => setS1(p => tog(p, 'fg3'))}  style={{ ...TH, color: thC('fg3', s1) }}>3%{si('fg3', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>LF</th>
                    <th onClick={() => setS1(p => tog(p, 'ft'))}   style={{ ...TH, color: thC('ft', s1) }}>LF%{si('ft', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'ro'))}   style={{ ...TH, color: thC('ro', s1) }}>Ro{si('ro', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'rd'))}   style={{ ...TH, color: thC('rd', s1) }}>Rd{si('rd', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'reb'))}  style={{ ...TH, color: thC('reb', s1) }}>Rt{si('reb', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'pd'))}   style={{ ...TH, color: thC('pd', s1) }}>Pd{si('pd', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'ct'))}   style={{ ...TH, color: thC('ct', s1) }}>Ct{si('ct', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'int'))}  style={{ ...TH, color: thC('int', s1) }}>Int{si('int', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'bp'))}   style={{ ...TH, color: thC('bp', s1) }}>Bp{si('bp', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'eval'))} style={{ ...TH, color: thC('eval', s1) }}>Eval{si('eval', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'pm'))}   style={{ ...TH, color: thC('pm', s1) }}>±{si('pm', s1)}</th>
                  </tr></thead>
                  <tbody>
                    {sortedPJ.map(({ p, n, tit, avgMin, avgPts, fg2mPg, fg2aPg, fg3mPg, fg3aPg, ftmPg, ftaPg, fg2Pct, fg3Pct, ftPct, avgRo, avgRd, avgRt, avgPd, avgCt, avgInt, avgBp, evalAvg, avgPm }, i) => {
                      const pmCol = avgPm > 0 ? '#00E5A0' : avgPm < 0 ? '#EF4444' : '#475569';
                      return (
                        <tr key={p.id} onClick={() => navigate(`/performance-individuelle/${p.id}/statistiques`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }} className="hover:!bg-white/5">
                          <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></td>
                          <td style={{ ...TD, color: '#475569' }}>{p.number}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{n}</td>
                          <td style={TD}>{tit}</td>
                          <td style={{ ...TD, color: normalize25 ? '#F59E0B' : '#F1F5F9' }}>{avgMin}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{avgPts}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{fg2mPg}/{fg2aPg}</td>
                          <td style={{ ...TD }}>{fg2Pct !== null ? `${fg2Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{fg3mPg}/{fg3aPg}</td>
                          <td style={{ ...TD }}>{fg3Pct !== null ? `${fg3Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{ftmPg}/{ftaPg}</td>
                          <td style={{ ...TD }}>{ftPct !== null ? `${ftPct}%` : '—'}</td>
                          <td style={{ ...TD }}>{avgRo}</td>
                          <td style={{ ...TD }}>{avgRd}</td>
                          <td style={{ ...TD, color: '#F1F5F9' }}>{avgRt}</td>
                          <td style={{ ...TD }}>{avgPd}</td>
                          <td style={{ ...TD }}>{avgCt}</td>
                          <td style={{ ...TD }}>{avgInt}</td>
                          <td style={{ ...TD }}>{avgBp}</td>
                          <td style={{ ...TD, color: evalAvg !== null ? evalColor(evalAvg, statThresholds) : '#475569', fontWeight: evalAvg !== null ? 700 : 400 }}>{evalAvg !== null ? evalAvg : '—'}</td>
                          <td style={{ ...TD, color: pmCol, fontWeight: 700 }}>{avgPm > 0 ? `+${avgPm}` : avgPm !== 0 ? avgPm : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={TOTALS}>
                      <td style={{ ...TL, position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>Moyenne équipe</td>
                      <td style={TD}>—</td>
                      <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{fmt(pjFooter.n)}</td>
                      <td style={TD}>{fmt(pjFooter.tit)}</td>
                      <td style={{ ...TD, color: '#F1F5F9' }}>{fmt(pjFooter.avgMin)}</td>
                      <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{fmt(pjFooter.avgPts)}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pjFooter.fg2mPg)}/{fmt(pjFooter.fg2aPg)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.fg2Pct, '%')}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pjFooter.fg3mPg)}/{fmt(pjFooter.fg3aPg)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.fg3Pct, '%')}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pjFooter.ftmPg)}/{fmt(pjFooter.ftaPg)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.ftPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgRo)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgRd)}</td>
                      <td style={{ ...TD, color: '#F1F5F9' }}>{fmt(pjFooter.avgRt)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgPd)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgCt)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgInt)}</td>
                      <td style={{ ...TD }}>{fmt(pjFooter.avgBp)}</td>
                      <td style={{ ...TD, color: pjFooter.evalAvg !== null ? evalColor(pjFooter.evalAvg, statThresholds) : '#475569', fontWeight: 700 }}>{fmt(pjFooter.evalAvg)}</td>
                      <td style={{ ...TD, color: pjFooter.avgPm !== null && pjFooter.avgPm > 0 ? '#00E5A0' : pjFooter.avgPm !== null && pjFooter.avgPm < 0 ? '#EF4444' : '#475569', fontWeight: 700 }}>
                        {pjFooter.avgPm !== null ? (pjFooter.avgPm > 0 ? `+${pjFooter.avgPm}` : pjFooter.avgPm) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            sortedPJAdv.length === 0 ? <EmptyState message="Aucune statistique pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} onClick={() => setS2(p => tog(p, 'name'))} style={{ ...TH, textAlign: 'left', verticalAlign: 'middle', position: 'sticky', left: 0, zIndex: 2 }}><span style={{ color: thC('name', s2) }}>Joueur{si('name', s2)}</span></th>
                      <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>#</th>
                      <th rowSpan={2} onClick={() => setS2(p => tog(p, 'mj'))} style={{ ...TH, verticalAlign: 'middle', color: thC('mj', s2) }}>MJ{si('mj', s2)}</th>
                      <th rowSpan={2} onClick={() => setS2(p => tog(p, 'min'))} style={{ ...TH, verticalAlign: 'middle', color: normalize25 ? '#F59E0B' : thC('min', s2) }}>Min{si('min', s2)}{normalize25 ? ' ⟳' : ''}</th>
                      <th colSpan={5} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Impact offensif</th>
                      <th colSpan={4} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Playmaking</th>
                      <th colSpan={3} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Rebonds</th>
                    </tr>
                    <tr>
                      <th onClick={() => setS2(p => tog(p, 'pts'))}   style={{ ...TH, ...SEP, color: thC('pts', s2) }}>Pts{si('pts', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'usg'))}   style={{ ...TH, color: thC('usg', s2) }}>USG%{si('usg', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'ortg'))}  style={{ ...TH, color: thC('ortg', s2) }}>ORtg{si('ortg', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'efg'))}   style={{ ...TH, color: thC('efg', s2) }}>eFG%{si('efg', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'ftr'))}   style={{ ...TH, color: thC('ftr', s2) }}>FT Rate{si('ftr', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'pprod'))} style={{ ...TH, ...SEP, color: thC('pprod', s2) }}>Pts générés{si('pprod', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'ast'))}   style={{ ...TH, color: thC('ast', s2) }}>%PD{si('ast', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'tov'))}   style={{ ...TH, color: thC('tov', s2) }}>%BP{si('tov', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'bppos'))} style={{ ...TH, color: thC('bppos', s2) }}>BP/poss{si('bppos', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'treb'))}  style={{ ...TH, ...SEP, color: thC('treb', s2) }}>%TREB{si('treb', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'dreb'))}  style={{ ...TH, color: thC('dreb', s2) }}>%DREB{si('dreb', s2)}</th>
                      <th onClick={() => setS2(p => tog(p, 'oreb'))}  style={{ ...TH, color: thC('oreb', s2) }}>%OREB{si('oreb', s2)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPJAdv.map(({ p, n, avgMin, avgPts, usagePct, offRating, efgPct, ftRate, ptsProd, astPct, tovPct, bpPerPoss, trebPct, drebPct, orebPct }, i) => (
                      <tr key={p.id} onClick={() => navigate(`/performance-individuelle/${p.id}/statistiques`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }} className="hover:!bg-white/5">
                        <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></td>
                        <td style={{ ...TD, color: '#475569' }}>{p.number}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{n}</td>
                        <td style={{ ...TD, color: normalize25 ? '#F59E0B' : '#94A3B8' }}>{avgMin}</td>
                        <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{avgPts}</td>
                        <td style={{ ...TD }}>{fmt(usagePct, '%')}</td>
                        <td style={{ ...TD, color: offRating !== null ? ortgColor(offRating, statThresholds) : '#475569' }}>{fmt(offRating)}</td>
                        <td style={{ ...TD }}>{fmt(efgPct, '%')}</td>
                        <td style={{ ...TD }}>{fmt(ftRate)}</td>
                        <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(ptsProd)}</td>
                        <td style={{ ...TD }}>{fmt(astPct, '%')}</td>
                        <td style={{ ...TD }}>{fmt(tovPct, '%')}</td>
                        <td style={TD}>{fmt(bpPerPoss)}</td>
                        <td style={{ ...TD, ...SEP }}>{fmt(trebPct, '%')}</td>
                        <td style={{ ...TD }}>{fmt(drebPct, '%')}</td>
                        <td style={{ ...TD }}>{fmt(orebPct, '%')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={TOTALS}>
                      <td style={{ ...TL, position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>Moyenne équipe</td>
                      <td style={TD}>—</td>
                      <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{fmt(pjAdvFooter.n)}</td>
                      <td style={{ ...TD, color: '#94A3B8' }}>{fmt(pjAdvFooter.avgMin)}</td>
                      <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{fmt(pjAdvFooter.avgPts)}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.usagePct, '%')}</td>
                      <td style={{ ...TD, color: pjAdvFooter.offRating !== null ? ortgColor(pjAdvFooter.offRating, statThresholds) : '#475569' }}>{fmt(pjAdvFooter.offRating)}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.efgPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.ftRate)}</td>
                      <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(pjAdvFooter.ptsProd)}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.astPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.tovPct, '%')}</td>
                      <td style={TD}>{fmt(pjAdvFooter.bpPerPoss)}</td>
                      <td style={{ ...TD, ...SEP }}>{fmt(pjAdvFooter.trebPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.drebPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pjAdvFooter.orebPct, '%')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {/* ══ STATISTIQUES MATCHS ═════════════════════════════════════════════ */}
      {(activeTab === 'matches-basic' || activeTab === 'matches-advanced') && (
        <Card>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />} mb={18}
            info={matchCount > 0 ? <>{matchCount} match{matchCount > 1 ? 's' : ''} · {wins}V {matchCount - wins}D</> : undefined}
          >Statistiques matchs</CardTitle>

          {activeTab === 'matches-basic' ? (
            sortedPM.length === 0 ? <EmptyState message="Aucune statistique collective pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead><tr>
                    <th onClick={() => setS4(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', color: thC('opp', s4), position: 'sticky', left: 0, zIndex: 2 }}>Adv{si('opp', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'date'))} style={{ ...TH, textAlign: 'left', width: 60, minWidth: 60, color: thC('date', s4) }}>Date{si('date', s4)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>L/E</th>
                    <th style={{ ...TH, cursor: 'default' }}>Score</th>
                    <th onClick={() => setS4(p => tog(p, 'pts'))}  style={{ ...TH, color: thC('pts', s4) }}>Pts{si('pts', s4)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>2pts</th>
                    <th onClick={() => setS4(p => tog(p, 'fg2'))}  style={{ ...TH, color: thC('fg2', s4) }}>2%{si('fg2', s4)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>3pts</th>
                    <th onClick={() => setS4(p => tog(p, 'fg3'))}  style={{ ...TH, color: thC('fg3', s4) }}>3%{si('fg3', s4)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>LF</th>
                    <th onClick={() => setS4(p => tog(p, 'ft'))}   style={{ ...TH, color: thC('ft', s4) }}>LF%{si('ft', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'ro'))}   style={{ ...TH, color: thC('ro', s4) }}>RO{si('ro', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'rd'))}   style={{ ...TH, color: thC('rd', s4) }}>RD{si('rd', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'rt'))}   style={{ ...TH, color: thC('rt', s4) }}>RT{si('rt', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'pd'))}   style={{ ...TH, color: thC('pd', s4) }}>Pd{si('pd', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'ct'))}   style={{ ...TH, color: thC('ct', s4) }}>Ct{si('ct', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'int'))}  style={{ ...TH, color: thC('int', s4) }}>Int{si('int', s4)}</th>
                    <th onClick={() => setS4(p => tog(p, 'bp'))}   style={{ ...TH, color: thC('bp', s4) }}>Bp{si('bp', s4)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>Éval</th>
                  </tr></thead>
                  <tbody>
                    {sortedPM.map((m, i) => {
                      const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                      return (
                        <tr key={m.id} onClick={() => m.matchId && navigate(`/matches/${m.matchId}`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: m.matchId ? 'pointer' : 'default' }} className={m.matchId ? 'hover:!bg-white/5' : ''}>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{m.opponent}</td>
                          <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                          <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                          <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.fg2m}/{m.fg2a}</td>
                          <td style={{ ...TD }}>{m.fg2Pct !== null ? `${m.fg2Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.fg3m}/{m.fg3a}</td>
                          <td style={{ ...TD }}>{m.fg3Pct !== null ? `${m.fg3Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.ftm}/{m.fta}</td>
                          <td style={{ ...TD }}>{m.ftPct !== null ? `${m.ftPct}%` : '—'}</td>
                          <td style={{ ...TD }}>{m.ro}</td>
                          <td style={{ ...TD }}>{m.rd}</td>
                          <td style={{ ...TD, color: '#F1F5F9' }}>{m.rt}</td>
                          <td style={{ ...TD }}>{m.pd}</td>
                          <td style={{ ...TD }}>{m.ct}</td>
                          <td style={{ ...TD }}>{m.intercepts}</td>
                          <td style={{ ...TD }}>{m.bp}</td>
                          <td style={{ ...TD, color: m.evalTeamAvg !== null ? evalColor(m.evalTeamAvg, statThresholds) : '#475569', fontWeight: m.evalTeamAvg !== null ? 700 : 400 }}>{m.evalTeamAvg ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={TOTALS}>
                      <td style={{ ...TL, position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>Moyenne / match</td>
                      <td style={TD}>—</td>
                      <td style={TD}>—</td>
                      <td style={TD}>—</td>
                      <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{fmt(pmFooter.pts)}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pmFooter.fg2m)}/{fmt(pmFooter.fg2a)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.fg2Pct, '%')}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pmFooter.fg3m)}/{fmt(pmFooter.fg3a)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.fg3Pct, '%')}</td>
                      <td style={{ ...TD, fontSize: '0.7rem' }}>{fmt(pmFooter.ftm)}/{fmt(pmFooter.fta)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.ftPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.ro)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.rd)}</td>
                      <td style={{ ...TD, color: '#F1F5F9' }}>{fmt(pmFooter.rt)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.pd)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.ct)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.intercepts)}</td>
                      <td style={{ ...TD }}>{fmt(pmFooter.bp)}</td>
                      <td style={{ ...TD, color: pmFooter.evalTeamAvg !== null ? evalColor(pmFooter.evalTeamAvg, statThresholds) : '#475569', fontWeight: 700 }}>{fmt(pmFooter.evalTeamAvg)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            sortedPMAdv.length === 0 ? <EmptyState message="Aucune statistique collective pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} onClick={() => setS5(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', verticalAlign: 'middle', color: thC('opp', s5), position: 'sticky', left: 0, zIndex: 2 }}>Adv{si('opp', s5)}</th>
                      <th rowSpan={2} onClick={() => setS5(p => tog(p, 'date'))} style={{ ...TH, textAlign: 'left', width: 60, minWidth: 60, verticalAlign: 'middle', color: thC('date', s5) }}>Date{si('date', s5)}</th>
                      <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>L/E</th>
                      <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>Score</th>
                      <th colSpan={5} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Attaque</th>
                      <th colSpan={3} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Rebonds</th>
                    </tr>
                    <tr>
                      <th onClick={() => setS5(p => tog(p, 'pts'))}  style={{ ...TH, ...SEP, color: thC('pts', s5) }}>Pts{si('pts', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'ortg'))} style={{ ...TH, color: thC('ortg', s5) }}>ORtg{si('ortg', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'drtg'))} style={{ ...TH, color: thC('drtg', s5) }}>DRtg{si('drtg', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'efg'))}  style={{ ...TH, color: thC('efg', s5) }}>eFG%{si('efg', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'ftr'))}  style={{ ...TH, color: thC('ftr', s5) }}>FT Rate{si('ftr', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'to'))}   style={{ ...TH, ...SEP, color: thC('to', s5) }}>%TO{si('to', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'oreb'))} style={{ ...TH, color: thC('oreb', s5) }}>%OREB{si('oreb', s5)}</th>
                      <th onClick={() => setS5(p => tog(p, 'dreb'))} style={{ ...TH, color: thC('dreb', s5) }}>%DREB{si('dreb', s5)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPMAdv.map((m, i) => {
                      const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                      return (
                        <tr key={m.id} onClick={() => m.matchId && navigate(`/matches/${m.matchId}`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: m.matchId ? 'pointer' : 'default' }} className={m.matchId ? 'hover:!bg-white/5' : ''}>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{m.opponent}</td>
                          <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                          <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                          <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                          <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                          <td style={{ ...TD, color: m.offRating > 0 ? ortgColor(m.offRating, statThresholds) : '#475569' }}>{m.offRating > 0 ? m.offRating : '—'}</td>
                          <td style={{ ...TD, color: m.defRating > 0 ? drtgColor(m.defRating, statThresholds) : '#475569' }}>{m.defRating > 0 ? m.defRating : '—'}</td>
                          <td style={{ ...TD }}>{m.efgPct > 0 ? `${m.efgPct}%` : '—'}</td>
                          <td style={{ ...TD }}>{m.ftRate > 0 ? m.ftRate : '—'}</td>
                          <td style={{ ...TD, ...SEP }}>{m.toPct > 0 ? `${m.toPct}%` : '—'}</td>
                          <td style={{ ...TD }}>{m.orebPct > 0 ? `${m.orebPct}%` : '—'}</td>
                          <td style={{ ...TD }}>{m.drebPct > 0 ? `${m.drebPct}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={TOTALS}>
                      <td style={{ ...TL, position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#161920' }}>Moyenne / match</td>
                      <td style={TD}>—</td>
                      <td style={TD}>—</td>
                      <td style={TD}>—</td>
                      <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{fmt(pmAdvFooter.pts)}</td>
                      <td style={{ ...TD, color: pmAdvFooter.offRating !== null ? ortgColor(pmAdvFooter.offRating, statThresholds) : '#475569' }}>{fmt(pmAdvFooter.offRating)}</td>
                      <td style={{ ...TD, color: pmAdvFooter.defRating !== null ? drtgColor(pmAdvFooter.defRating, statThresholds) : '#475569' }}>{fmt(pmAdvFooter.defRating)}</td>
                      <td style={{ ...TD }}>{fmt(pmAdvFooter.efgPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pmAdvFooter.ftRate)}</td>
                      <td style={{ ...TD, ...SEP }}>{fmt(pmAdvFooter.toPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pmAdvFooter.orebPct, '%')}</td>
                      <td style={{ ...TD }}>{fmt(pmAdvFooter.drebPct, '%')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {/* ══ QT PAR QT ═══════════════════════════════════════════════════════ */}
      {activeTab === 'matches-quarters' && (
        <TeamQuarterBreakdown matches={filteredSeasonMatches} />
      )}

      {/* ══ IMPACT JOUEURS ══════════════════════════════════════════════════ */}
      {activeTab === 'impact' && (
        <Card>
          <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 7px' }}>Niveau de jeu et impact sur les résultats</h3>
          <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 18px', lineHeight: 1.5 }}>
            Deux lectures complémentaires : le niveau de jeu de chaque joueur sur la saison, et la tendance de ses meilleurs matchs à coïncider avec les victoires ou les défaites de l'équipe (à partir de 5 matchs évalués).
          </p>
          <PlayerImpactList impacts={playerImpacts} />
        </Card>
      )}

      {/* ══ ACP MATCHS ══════════════════════════════════════════════════════ */}
      {activeTab === 'pca' && (
        <Card>
          {pcaResult === null ? <EmptyState message="Pas assez de matchs (minimum 4) pour calculer une ACP." /> : (
            <div>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 7px' }}>Quelles statistiques sont liées aux victoires ?</h3>
              <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 18px', lineHeight: 1.5 }}>
                Sur les {matchCount} derniers matchs, voici les statistiques les plus corrélées avec le résultat des rencontres. C'est une tendance statistique, pas une preuve que l'une cause l'autre.
              </p>
              <WinFactorsList factors={winFactors} />

              <div style={{ borderTop: '1px solid #2A2F3A', margin: '30px 0 20px' }} />

              <button type="button" onClick={() => setShowBiplot(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', color: '#64748B', fontSize: '0.75rem' }}>
                {showBiplot ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showBiplot ? 'Masquer le graphique détaillé' : 'Afficher le graphique détaillé'}
              </button>

              {showBiplot && (
                <div style={{ marginTop: 20 }}>
                  <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 7px' }}>Tous les matchs, en un coup d'œil</h3>
                  <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 18px', lineHeight: 1.5 }}>
                    Chaque point représente un match : 🟢 victoire, 🔴 défaite. Chaque flèche représente une statistique de jeu.
                    Plus un match est proche de la pointe d'une flèche, plus l'équipe a été performante sur cette statistique ce soir-là.
                    Quand les points verts se regroupent d'un côté d'une flèche et les points rouges de l'autre, cette statistique
                    influence fortement le résultat des matchs.
                  </p>
                  <PCABiplot points={pcaResult.points} vectors={pcaResult.vectors} varPct={pcaResult.varPct} />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ══ CLASSEMENT JOUEURS (1 facteur → classement + valeurs) ═══════════ */}
      {activeTab === 'ranking' && (
        <Card>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#00E5A0' }} />} mb={10}
            info={`${rankingRows.length} joueur${rankingRows.length > 1 ? 's' : ''} · moyennes sur la période`}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setNormalize25(v => !v)}
                  title="Recalculer toutes les stats comme si chaque joueur jouait 25 min"
                  style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${normalize25 ? '#F59E0B' : '#2A2F3A'}`, cursor: 'pointer', fontSize: '0.68rem', fontWeight: normalize25 ? 700 : 400, backgroundColor: normalize25 ? 'rgba(245,158,11,0.12)' : 'transparent', color: normalize25 ? '#F59E0B' : '#475569', transition: 'all 0.15s' }}>
                  25 min
                </button>
                <IndicatorSelect indicators={rankIndicators} value={rankKey} onChange={setRankKey} />
              </div>
            }
          >Classement joueurs</CardTitle>
          <PlayerRankingTable rows={rankingRows} def={rankDef} teamAvg={rankTeamAvg} normalized25={normalize25} onOpenPlayer={openPlayer} />
        </Card>
      )}

      {/* ══ CHARGE PHYSIQUE (synthèse RPE × ACWR × Fraîcheur × Risque, alignée sur PerformanceIndividuellePage) ══ */}
      {activeTab === 'load' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Verdict — à risque maintenant */}
          <RiskVerdictCard
            title="Risque de blessure — maintenant"
            atRisk={atRiskPlayerCount > 0}
            verdictLabel={atRiskPlayerCount > 0 ? `${atRiskPlayerCount} joueur${atRiskPlayerCount > 1 ? 's' : ''} à risque` : 'Pas de risque identifié'}
            factors={[
              {
                id: 'injury',
                active: injuredPlayerCount > 0,
                label: injuredPlayerCount > 0 ? `${injuredPlayerCount} blessure${injuredPlayerCount > 1 ? 's' : ''} active${injuredPlayerCount > 1 ? 's' : ''}` : 'Aucune blessure active',
              },
              {
                id: 'acwr',
                active: teamAcwrZ?.label === 'Risque modéré' || teamAcwrZ?.label === 'Risque élevé',
                label: teamAcwrZ ? (CHARGE_ZONE_PLAIN[teamAcwrZ.label] ?? teamAcwrZ.label) : 'Historique de charge insuffisant',
              },
              {
                id: 'alert',
                active: !!latestRedAlert,
                label: `${latestRedAlert ? (ALERT_TITLE_PLAIN[latestRedAlert.title] ?? latestRedAlert.title) : 'Aucun signal d\'alerte récent'} (21 j)`,
              },
            ]}
          />

          {/* Charge & RPE équipe */}
          <ChargeRpeComboChart
            data={loadComboView === 'session' ? sessionCombo : weekCombo}
            view={loadComboView}
            onViewChange={setLoadComboView}
            high={loadComboView === 'session' ? sessionLoadNormal : thresholds.normalMax}
            title="Charge & RPE équipe"
            height={260}
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
                value: rpeTeamKpis ? fmt1(rpeTeamKpis.avg) : '—',
                sub: rpeTeamKpis ? <Badge color={rpeColor(rpeTeamKpis.avg)} size="sm" label={rpeLabel(Math.round(rpeTeamKpis.avg))} style={{ fontSize: '0.62rem' }} /> : undefined,
                color: rpeTeamKpis ? rpeColor(rpeTeamKpis.avg) : undefined,
              },
              {
                label: 'Charge récente vs habituelle (à ce jour)',
                value: teamAcwrAvg !== null
                  ? <span title="Charge des 7 derniers jours ÷ charge des 28 derniers jours. 1.0 = charge habituelle, au-dessus = charge inhabituellement élevée.">{teamAcwrAvg.toFixed(2)}</span>
                  : '—',
                sub: teamAcwrZ ? <Badge color={teamAcwrZ.color} size="sm" label={teamAcwrZ.label} style={{ fontSize: '0.62rem' }} /> : 'Historique insuffisant (28j)',
                color: teamAcwrZ ? teamAcwrZ.color : undefined,
              },
              {
                label: 'Fraîcheur (à ce jour)',
                value: teamFreshAvg !== null
                  ? <span title="Écart entre la forme récente et la forme habituelle de l'équipe. Positif = plus frais, négatif = plus fatigué que d'habitude.">{teamFreshAvg > 0 ? '+' : ''}{teamFreshAvg.toFixed(1)}</span>
                  : '—',
                sub: teamFreshZ ? <Badge color={teamFreshZ.color} size="sm" label={teamFreshZ.label} style={{ fontSize: '0.62rem' }} /> : undefined,
                color: teamFreshZ ? teamFreshZ.color : undefined,
              },
            ]}
          />

          <Card>
            <CardTitle icon={<Activity size={12} style={{ color: '#3B82F6' }} />} mb={rankingCollapsed ? 0 : 10}
              info={rpeTeamKpis ? `${rpeTeamKpis.sessions} séance${rpeTeamKpis.sessions > 1 ? 's' : ''}` : undefined}
              right={
                <button onClick={() => setRankingCollapsed(v => !v)} title={rankingCollapsed ? 'Afficher' : 'Réduire'}
                  style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
                  {rankingCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              }>
              Classement joueurs
            </CardTitle>
            {!rankingCollapsed && (
              <RPEPlayerRankingTable players={playerRanking} sessionLoadLight={sessionLoadLight} sessionLoadNormal={sessionLoadNormal} lightMax={thresholds.lightMax} normalMax={thresholds.normalMax} hideHeader />
            )}
          </Card>

          <RiskAlertsList alerts={alerts} onOpenPlayer={openPlayer} collapsible />
        </div>
      )}

      {/* ══ RPE (historique des séances équipe : KPIs + graphe + tableau) ══ */}
      {activeTab === 'rpe' && (
        !rpeTeamKpis || rpeTeamKpis.sessions === 0 ? (
          <EmptyState message="Aucune séance RPE enregistrée sur cette période." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 10 }}>
              <RpeKpiCard
                accent={weekTier ? weekTier.color : '#334155'}
                label="Charge moyenne par semaine"
                value={avgWeeklyLoad !== null && avgWeeklyLoad > 0 ? <>{avgWeeklyLoad.toLocaleString('fr')}<span title="Unité Arbitraire = RPE × durée de la séance (minutes)" style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></> : '—'}
                sub={weekTier ? <Badge color={weekTier.color} size="sm" label={weekTier.label} style={{ fontSize: '0.62rem' }} /> : undefined}
              />
              <RpeKpiCard
                accent={rpeColor(rpeTeamKpis.avg)}
                label="RPE moyen"
                value={fmt1(rpeTeamKpis.avg)}
                sub={<Badge color={rpeColor(rpeTeamKpis.avg)} size="sm" label={rpeLabel(Math.round(rpeTeamKpis.avg))} style={{ fontSize: '0.62rem' }} />}
              />
              <RpeKpiCard
                accent="#3B82F6"
                label="Séances"
                value={rpeTeamKpis.sessions}
                valueColor="#F1F5F9"
                sub="sur la période sélectionnée"
              />
              <RpeKpiCard
                accent={surchargeWeeksTeam > 0 ? '#EF4444' : '#00E5A0'}
                label="Semaines en surcharge"
                value={<><span style={{ color: surchargeWeeksTeam > 0 ? '#EF4444' : '#00E5A0' }}>{surchargeWeeksTeam}</span><span style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 400 }}> / {totalWeeksTeam}</span></>}
                valueColor="#F1F5F9"
                sub={totalWeeksTeam > 0 ? `${Math.round(surchargeWeeksTeam / totalWeeksTeam * 100)} % des semaines` : '—'}
              />
            </div>

            {rpeDisplay === 'chart' ? (
              <ChargeRpeComboChart
                data={rpeComboView === 'session' ? sessionCombo : weekCombo}
                view={rpeComboView}
                onViewChange={setRpeComboView}
                high={rpeComboView === 'session' ? sessionLoadNormal : thresholds.normalMax}
                title="Charge & RPE équipe"
                height={320}
              />
            ) : (
              <TeamSessionHistoryTable rows={teamSessionRows} sessionLoadLight={sessionLoadLight} sessionLoadNormal={sessionLoadNormal} lightMax={thresholds.lightMax} normalMax={thresholds.normalMax} />
            )}
          </div>
        )
      )}

      {/* ══ BIEN-ÊTRE ═══════════════════════════════════════════════════════ */}
      {activeTab === 'wellness' && (
        wellnessInRange.length === 0 ? (
          <EmptyState message="Aucune donnée bien-être pour l'équipe sur la période sélectionnée." />
        ) : (
          <WellnessPomsPanel
            entries={wellnessInRange}
            seasonEntries={wellnessSeasonEntries}
            showSeasonDiff={showSeasonDiff}
            subjectLabel="L'équipe"
          />
        )
      )}

      {/* ══ MÉDICAL ══════════════════════════════════════════════════════════ */}
      {activeTab === 'medical' && (
        <TeamMedicalOverview players={players} showAddButton={false} />
      )}

      {/* ══ CORRÉLATIONS ════════════════════════════════════════════════════ */}
      {activeTab === 'correlations' && (
        <CorrelationsPanel
          roster={data.players} team={data} from={from} to={to} thresholds={thresholds}
          defaultSubjectId={TEAM_SUBJECT}
        />
      )}

      {/* ══ OBJECTIFS ════════════════════════════════════════════════════════ */}
      {activeTab === 'objectives' && selected && (
        <ObjectivesPanel teamId={selected.team.id} scope={{ team: data }} seasonStart={seasonStart} seasonEnd={seasonEnd} />
      )}

      {/* ══ PAR JOUEUR (même page que "Comparaison joueurs" — comparaison libre de 2 joueurs) ══ */}
      {activeTab === 'compare-player' && (
        <PlayerCompareByPlayer roster={data.players} seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate} />
      )}

      {/* ══ PAR PÉRIODE (2 périodes sélectionnées librement) ═══════════════════ */}
      {activeTab === 'dynamic' && (
        <TeamCompareByPeriod
          teamStats={teamStats} allStats={allStats} allRpe={allRpe} allWellness={allWellness}
          seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate}
        />
      )}

      {/* ══ PAR MATCH (2 groupes de matchs d'équipe sélectionnés librement) ═══ */}
      {activeTab === 'compare-match' && (
        <TeamCompareByMatch teamStats={teamStats} allStats={allStats} allRpe={allRpe} allWellness={allWellness} seasonKey={selected ? `${selected.team.id}-${selected.season.id}` : undefined} />
      )}

      {/* ══ PAR SAISON (2 saisons de l'équipe sélectionnées librement) ═══════ */}
      {activeTab === 'compare-season' && (
        <TeamCompareBySeason seasonGroupedStats={teamSeasonGroupedStats} currentSeasonId={selected?.season.id} />
      )}

        </div>
      </div>
    </div>
  );
}
