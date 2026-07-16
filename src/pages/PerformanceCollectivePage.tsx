import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BarChart2, ChevronDown, ChevronRight, TrendingUp, Activity, LineChart as LineChartIcon } from 'lucide-react';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import { aggregateTeamWellnessDaily, wellnessAvg } from '../utils/wellness';
import {
  Card, CardTitle, EmptyState, DateRangeCard, useDateRange, TeamStatsHero,
  PCABiplot, WinFactorsList, PlayerImpactList, RPEPlayerRankingTable, RiskAlertsList,
  PlayerComparisonTable, IndicatorSelect, CrossTimelineChart, CorrelationCard, WellnessPomsPanel,
} from '../components';
import type { ComparisonRow } from '../components/PlayerComparisonTable';
import { evalColor, ortgColor, drtgColor } from '../data';
import { calcPlayerAdvanced } from '../data/playerAdvanced';
import { computeMatchPCA, computeWinFactors, computePlayerImpact } from '../data/pca';
import { computeTsb, tsbZone, rpeColor } from '../utils/rpe';
import { wellnessScoreColor } from '../utils/wellness';
import { playerNameShort } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import {
  teamIndicators, indicatorByKey, getSeries, correlateIndicators, detectRiskAlerts,
  type CrossScope, type IndicatorDef, type LagMode,
} from '../data/crossAnalysis';
import type { MatchStat } from '../data/types';

// ─── Helpers partagés (portés depuis AnalyseCollectivePage / PerformancePage) ──

type Sort = { col: string; dir: 'asc' | 'desc' };

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const fmtD = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
const fmt  = (v: number | null, suf = '') => v !== null ? `${v}${suf}` : '—';

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

// ─── Onglets ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'players' | 'matches' | 'impact' | 'pca' | 'load' | 'wellness' | 'correlations' | 'comparison';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':   'overview',
  'stats-joueurs':  'players',
  'stats-joueuses': 'players', // ancien slug — conservé pour ne pas casser les liens existants
  'stats-matchs':   'matches',
  'impact':         'impact',
  'acp':            'pca',
  'charge-physique':'load',
  'bien-etre':      'wellness',
  'correlations':   'correlations',
  'comparaison':    'comparison',
};

const TAB_GROUPS: { label?: string; tabs: { key: Tab; slug: string; label: string }[] }[] = [
  { tabs: [{ key: 'overview', slug: 'vue-ensemble', label: "Vue d'ensemble" }] },
  { label: 'Stats',      tabs: [{ key: 'players', slug: 'stats-joueurs', label: 'Joueurs' }, { key: 'matches', slug: 'stats-matchs', label: 'Matchs' }] },
  { label: 'Avancé',     tabs: [{ key: 'impact', slug: 'impact', label: 'Impact' }, { key: 'pca', slug: 'acp', label: 'ACP' }] },
  { label: 'Charge & bien-être', tabs: [{ key: 'load', slug: 'charge-physique', label: 'Charge physique' }, { key: 'wellness', slug: 'bien-etre', label: 'Bien-être' }] },
  { label: 'Comparer',   tabs: [{ key: 'correlations', slug: 'correlations', label: 'Corrélations' }, { key: 'comparison', slug: 'comparaison', label: 'Comparaison' }] },
];

export default function PerformanceCollectivePage() {
  const { selected, thresholds, statThresholds, loading: teamLoading } = useTeamSeason();
  const navigate = useNavigate();
  const { tab: tabSlug } = useParams<{ tab?: string }>();
  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'overview';
  const setActiveTab = (slug: string) => navigate(`/performance-collective/${slug}`, { replace: true });

  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
  const dateRange = useDateRange(seasonStart, 'saison', seasonEnd);
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
  // allTimeRpe (pas p.rpe, borné à la saison) : le TSB a besoin de tout l'historique pour
  // être fiable en tout début de saison — même convention que useTeamRpeHistory/Dashboard.
  const tsbValues = allPd.map(p => computeTsb(p.allTimeRpe)).filter((v): v is number => v !== null);
  const tsbNow = tsbValues.length ? Math.round(tsbValues.reduce((s, v) => s + v, 0) / tsbValues.length * 10) / 10 : null;
  const tsbNowZone = tsbNow !== null ? tsbZone(tsbNow) : null;
  const rpeAvgP   = avg(allRpe.filter(e => inRangeTeam(e.date)).map(e => e.rpe));
  const rpeAvgAll = avg(allRpe.map(e => e.rpe));
  // Agrégat quotidien équipe (moyenne des joueuses ayant loggué ce jour-là) avant de moyenner
  // sur la période — sinon une joueuse qui logge plus souvent pèse plus lourd dans la moyenne.
  const wellAvgP   = wellnessAvg(aggregateTeamWellnessDaily(allWellness.filter(w => inRangeTeam(w.date))).map(e => e.score));
  const wellAvgAll = wellnessAvg(aggregateTeamWellnessDaily(allWellness).map(e => e.score));
  const evalAvgP   = avg(allMatchStats.filter(m => m.eval !== null && inRangeTeam(m.date)).map(m => Number(m.eval)));
  const evalAvgAll = avg(allMatchStats.filter(m => m.eval !== null).map(m => Number(m.eval)));
  const attP = allAttendance.filter(a => inRangeTeam(a.date));
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;

  // ── Statistiques joueurs / matchs (ex-AnalyseCollectivePage) ─────────────
  const [normalize25, setNormalize25] = useState(false);
  const [playersView, setPlayersView] = useState<'basic' | 'advanced'>('basic');
  const [matchesView, setMatchesView] = useState<'basic' | 'advanced'>('basic');
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
      const evalAvg = we.length > 0
        ? Math.round(we.reduce((a, s) => a + (s.eval ?? 0), 0) / we.length * 10) / 10 : null;
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

  const evalTeamColor = (sum: number | null, count: number) =>
    sum !== null && count > 0 ? evalColor(sum / count, statThresholds) : '#475569';

  const pmRows = useMemo(() => filteredTeamStats.map(t => {
    const evalStats = t.matchId ? matchEvalStatsMap.get(t.matchId) : undefined;
    return {
      ...t,
      pts:           t.fg2m * 2 + t.fg3m * 3 + t.ftm,
      fg2Pct:        t.fg2a > 0 ? Math.round(t.fg2m / t.fg2a * 100) : null,
      fg3Pct:        t.fg3a > 0 ? Math.round(t.fg3m / t.fg3a * 100) : null,
      ftPct:         t.fta  > 0 ? Math.round(t.ftm  / t.fta  * 100) : null,
      evalTeam:      evalStats ? evalStats.sum : null,
      evalTeamCount: evalStats ? evalStats.count : 0,
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

  // ── Charge physique (ex-RPEPage team_history) ─────────────────────────────
  const { playerRanking, teamKpis: rpeTeamKpis } = useTeamRpeHistory(selected?.team.id, selected?.season.id, from, to, players);
  const sessionLoadLight  = Math.round(thresholds.lightMax  / thresholds.sessionsPerWeek);
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);

  const alerts = useMemo(
    () => data ? detectRiskAlerts(data.players, from, to, thresholds) : [],
    [data, from, to, thresholds.lightMax, thresholds.normalMax],
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

  // ── Corrélations (ex-PerformancePage team) ────────────────────────────────
  const [aKey, setAKey] = useState('loadUa');
  const [bKey, setBKey] = useState('eval');
  const [lagDays, setLagDays] = useState<LagMode>('week');
  const indicators = useMemo(teamIndicators, []);
  const aDef = indicatorByKey(aKey) ?? indicators[0];
  const bDef = indicatorByKey(bKey) ?? indicators[1];
  const scope: CrossScope = useMemo(
    () => data ? { team: { players: data.players, teamMatchStats: data.teamMatchStats } } : {},
    [data],
  );
  const seriesA = useMemo(() => scope.team ? getSeries(aDef, scope, from, to) : [], [scope, aDef, from, to]);
  const seriesB = useMemo(() => scope.team ? getSeries(bDef, scope, from, to) : [], [scope, bDef, from, to]);
  const corr = useMemo(
    () => scope.team ? correlateIndicators(aDef, bDef, scope, from, to, lagDays) : null,
    [scope, aDef, bDef, from, to, lagDays],
  );

  // ── Comparaison joueurs ───────────────────────────────────────────────────
  const rows: ComparisonRow[] = useMemo(() => (data?.players ?? []).map(p => {
    const pScope: CrossScope = { player: p };
    const meanOf = (def: IndicatorDef) => {
      if (!def.playerSeries) return null;
      const pts = getSeries(def, pScope, from, to);
      return pts.length ? Math.round(pts.reduce((s, x) => s + x.value, 0) / pts.length * 100) / 100 : null;
    };
    const evalP   = avg(p.matchStats.filter(m => m.eval !== null && m.date >= from && m.date <= to).map(m => Number(m.eval)));
    const evalAll = avg(p.matchStats.filter(m => m.eval !== null).map(m => Number(m.eval)));
    const pAlerts = alerts.filter(al => al.playerId === p.player.id);
    return {
      player: p.player,
      a: meanOf(aDef),
      b: meanOf(bDef),
      evalDelta: evalP !== null && evalAll !== null ? Math.round((evalP - evalAll) * 10) / 10 : null,
      redAlerts: pAlerts.filter(al => al.level === 'red').length,
      amberAlerts: pAlerts.filter(al => al.level === 'amber').length,
    };
  }), [data?.players, aDef, bDef, from, to, alerts]);

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

      <div className="flex flex-col lg:flex-row" style={{ gap: 20, alignItems: 'flex-start' }}>

        {/* ── Menu vertical d'onglets ── */}
        <nav className="w-full lg:w-[200px]" style={{ flexShrink: 0, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 6 }}>
          <div className="flex lg:flex-col" style={{ gap: 14, overflowX: 'auto' }}>
            {TAB_GROUPS.map((group, gi) => (
              <div key={gi} style={{ flexShrink: 0 }}>
                {group.label && (
                  <div style={{ padding: '6px 10px 4px', color: '#475569', fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {group.label}
                  </div>
                )}
                <div className="flex lg:flex-col" style={{ gap: 2 }}>
                  {group.tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.slug)}
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
        </nav>

        {/* ── Contenu de l'onglet ── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>

          <DateRangeCard
            from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
            onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
            onFrom={dateRange.setFrom} onTo={dateRange.setTo}
          />

          {/* ══ VUE D'ENSEMBLE ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5" style={{ gap: 10 }}>
            <MiniKpi title="État actuel" sub="TSB · fraîcheur moyenne"
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
        </>
      )}

      {/* ══ STATISTIQUES JOUEURS ════════════════════════════════════════════ */}
      {activeTab === 'players' && (
        <Card>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />} mb={18}
            info={sortedPJ.length > 0 ? <>{sortedPJ.length} joueur{sortedPJ.length > 1 ? 's' : ''}</> : undefined}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setNormalize25(v => !v)}
                  title="Recalculer toutes les stats comme si chaque joueur jouait 25 min"
                  style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${normalize25 ? '#F59E0B' : '#2A2F3A'}`, cursor: 'pointer', fontSize: '0.68rem', fontWeight: normalize25 ? 700 : 400, backgroundColor: normalize25 ? 'rgba(245,158,11,0.12)' : 'transparent', color: normalize25 ? '#F59E0B' : '#475569', transition: 'all 0.15s' }}>
                  25 min
                </button>
                <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
                  {(['basic', 'advanced'] as const).map(v => (
                    <button key={v} type="button" onClick={() => setPlayersView(v)}
                      style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: playersView === v ? 700 : 400, backgroundColor: playersView === v ? '#1E2229' : 'transparent', color: playersView === v ? '#00E5A0' : '#475569' }}>
                      {v === 'basic' ? 'Brutes' : 'Avancées'}
                    </button>
                  ))}
                </div>
              </div>
            }
          >Statistiques joueurs</CardTitle>

          {playersView === 'basic' ? (
            sortedPJ.length === 0 ? <EmptyState message="Aucune statistique pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead><tr>
                    <th onClick={() => setS1(p => tog(p, 'name'))} style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}><span style={{ color: thC('name', s1) }}>Joueur{si('name', s1)}</span></th>
                    <th style={{ ...TH, cursor: 'default' }}>#</th>
                    <th onClick={() => setS1(p => tog(p, 'mj'))}   style={{ ...TH, color: thC('mj', s1)   }}>MJ{si('mj', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'tit'))}  style={{ ...TH, color: thC('tit', s1)  }}>Tit{si('tit', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'min'))}  style={{ ...TH, color: normalize25 ? '#F59E0B' : thC('min', s1) }}>Min{si('min', s1)}{normalize25 ? ' ⟳' : ''}</th>
                    <th onClick={() => setS1(p => tog(p, 'pts'))}  style={{ ...TH, color: thC('pts', s1)  }}>Pts{si('pts', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>2pts</th>
                    <th onClick={() => setS1(p => tog(p, 'fg2'))}  style={{ ...TH, color: thC('fg2', s1)  }}>2%{si('fg2', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>3pts</th>
                    <th onClick={() => setS1(p => tog(p, 'fg3'))}  style={{ ...TH, color: thC('fg3', s1)  }}>3%{si('fg3', s1)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>LF</th>
                    <th onClick={() => setS1(p => tog(p, 'ft'))}   style={{ ...TH, color: thC('ft', s1)   }}>LF%{si('ft', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'ro'))}   style={{ ...TH, color: thC('ro', s1)   }}>Ro{si('ro', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'rd'))}   style={{ ...TH, color: thC('rd', s1)   }}>Rd{si('rd', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'reb'))}  style={{ ...TH, color: thC('reb', s1)  }}>Rt{si('reb', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'pd'))}   style={{ ...TH, color: thC('pd', s1)   }}>Pd{si('pd', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'ct'))}   style={{ ...TH, color: thC('ct', s1)   }}>Ct{si('ct', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'int'))}  style={{ ...TH, color: thC('int', s1)  }}>Int{si('int', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'bp'))}   style={{ ...TH, color: thC('bp', s1)   }}>Bp{si('bp', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'eval'))} style={{ ...TH, color: thC('eval', s1) }}>Eval{si('eval', s1)}</th>
                    <th onClick={() => setS1(p => tog(p, 'pm'))}   style={{ ...TH, color: thC('pm', s1)   }}>±{si('pm', s1)}</th>
                  </tr></thead>
                  <tbody>
                    {sortedPJ.map(({ p, n, tit, avgMin, avgPts, fg2mPg, fg2aPg, fg3mPg, fg3aPg, ftmPg, ftaPg, fg2Pct, fg3Pct, ftPct, avgRo, avgRd, avgRt, avgPd, avgCt, avgInt, avgBp, evalAvg, avgPm }, i) => {
                      const pmCol = avgPm > 0 ? '#00E5A0' : avgPm < 0 ? '#EF4444' : '#475569';
                      return (
                        <tr key={p.id} onClick={() => navigate(`/performance-individuelle/${p.id}/statistiques`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }} className="hover:!bg-white/5">
                          <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{playerNameShort(p)}</td>
                          <td style={{ ...TD, color: '#475569' }}>{p.number}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{n}</td>
                          <td style={TD}>{tit}</td>
                          <td style={{ ...TD, color: normalize25 ? '#F59E0B' : '#F1F5F9' }}>{avgMin}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{avgPts}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{fg2mPg}/{fg2aPg}</td>
                          <td style={TD}>{fg2Pct !== null ? `${fg2Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{fg3mPg}/{fg3aPg}</td>
                          <td style={TD}>{fg3Pct !== null ? `${fg3Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{ftmPg}/{ftaPg}</td>
                          <td style={TD}>{ftPct !== null ? `${ftPct}%` : '—'}</td>
                          <td style={TD}>{avgRo}</td>
                          <td style={TD}>{avgRd}</td>
                          <td style={{ ...TD, color: '#F1F5F9' }}>{avgRt}</td>
                          <td style={TD}>{avgPd}</td>
                          <td style={TD}>{avgCt}</td>
                          <td style={TD}>{avgInt}</td>
                          <td style={TD}>{avgBp}</td>
                          <td style={{ ...TD, color: evalAvg !== null ? evalColor(evalAvg, statThresholds) : '#475569', fontWeight: evalAvg !== null ? 700 : 400 }}>{evalAvg !== null ? evalAvg : '—'}</td>
                          <td style={{ ...TD, color: pmCol, fontWeight: 700 }}>{avgPm > 0 ? `+${avgPm}` : avgPm !== 0 ? avgPm : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
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
                        <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{playerNameShort(p)}</td>
                        <td style={{ ...TD, color: '#475569' }}>{p.number}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{n}</td>
                        <td style={{ ...TD, color: normalize25 ? '#F59E0B' : '#94A3B8' }}>{avgMin}</td>
                        <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{avgPts}</td>
                        <td style={TD}>{fmt(usagePct, '%')}</td>
                        <td style={{ ...TD, color: offRating !== null ? ortgColor(offRating, statThresholds) : '#475569' }}>{fmt(offRating)}</td>
                        <td style={TD}>{fmt(efgPct, '%')}</td>
                        <td style={TD}>{fmt(ftRate)}</td>
                        <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(ptsProd)}</td>
                        <td style={TD}>{fmt(astPct, '%')}</td>
                        <td style={TD}>{fmt(tovPct, '%')}</td>
                        <td style={TD}>{fmt(bpPerPoss)}</td>
                        <td style={{ ...TD, ...SEP }}>{fmt(trebPct, '%')}</td>
                        <td style={TD}>{fmt(drebPct, '%')}</td>
                        <td style={TD}>{fmt(orebPct, '%')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {/* ══ STATISTIQUES MATCHS ═════════════════════════════════════════════ */}
      {activeTab === 'matches' && (
        <Card>
          <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />} mb={18}
            info={matchCount > 0 ? <>{matchCount} match{matchCount > 1 ? 's' : ''} · {wins}V {matchCount - wins}D</> : undefined}
            right={
              <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
                {(['basic', 'advanced'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setMatchesView(v)}
                    style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: matchesView === v ? 700 : 400, backgroundColor: matchesView === v ? '#1E2229' : 'transparent', color: matchesView === v ? '#00E5A0' : '#475569' }}>
                    {v === 'basic' ? 'Brutes' : 'Avancées'}
                  </button>
                ))}
              </div>
            }
          >Statistiques matchs</CardTitle>

          {matchesView === 'basic' ? (
            sortedPM.length === 0 ? <EmptyState message="Aucune statistique collective pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead><tr>
                    <th onClick={() => setS4(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', width: 140, minWidth: 140, color: thC('opp', s4), position: 'sticky', left: 0, zIndex: 2 }}>Adv{si('opp', s4)}</th>
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
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left', width: 140, minWidth: 140, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{m.opponent}</td>
                          <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                          <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                          <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.fg2m}/{m.fg2a}</td>
                          <td style={TD}>{m.fg2Pct !== null ? `${m.fg2Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.fg3m}/{m.fg3a}</td>
                          <td style={TD}>{m.fg3Pct !== null ? `${m.fg3Pct}%` : '—'}</td>
                          <td style={{ ...TD, fontSize: '0.7rem' }}>{m.ftm}/{m.fta}</td>
                          <td style={TD}>{m.ftPct !== null ? `${m.ftPct}%` : '—'}</td>
                          <td style={TD}>{m.ro}</td>
                          <td style={TD}>{m.rd}</td>
                          <td style={{ ...TD, color: '#F1F5F9' }}>{m.rt}</td>
                          <td style={TD}>{m.pd}</td>
                          <td style={TD}>{m.ct}</td>
                          <td style={TD}>{m.intercepts}</td>
                          <td style={TD}>{m.bp}</td>
                          <td style={{ ...TD, color: evalTeamColor(m.evalTeam, m.evalTeamCount), fontWeight: m.evalTeam !== null ? 700 : 400 }}>{m.evalTeam ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            sortedPMAdv.length === 0 ? <EmptyState message="Aucune statistique collective pour cette période." /> : (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} onClick={() => setS5(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', width: 140, minWidth: 140, verticalAlign: 'middle', color: thC('opp', s5), position: 'sticky', left: 0, zIndex: 2 }}>Adv{si('opp', s5)}</th>
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
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left', width: 140, minWidth: 140, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{m.opponent}</td>
                          <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                          <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                          <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                          <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                          <td style={{ ...TD, color: m.offRating > 0 ? ortgColor(m.offRating, statThresholds) : '#475569' }}>{m.offRating > 0 ? m.offRating : '—'}</td>
                          <td style={{ ...TD, color: m.defRating > 0 ? drtgColor(m.defRating, statThresholds) : '#475569' }}>{m.defRating > 0 ? m.defRating : '—'}</td>
                          <td style={TD}>{m.efgPct > 0 ? `${m.efgPct}%` : '—'}</td>
                          <td style={TD}>{m.ftRate > 0 ? m.ftRate : '—'}</td>
                          <td style={{ ...TD, ...SEP }}>{m.toPct > 0 ? `${m.toPct}%` : '—'}</td>
                          <td style={TD}>{m.orebPct > 0 ? `${m.orebPct}%` : '—'}</td>
                          <td style={TD}>{m.drebPct > 0 ? `${m.drebPct}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      )}

      {/* ══ IMPACT JOUEURS ══════════════════════════════════════════════════ */}
      {activeTab === 'impact' && (
        <Card>
          <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 7px' }}>Qui fait la différence sur le terrain ?</h3>
          <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 18px', lineHeight: 1.5 }}>
            Ce classement indique si le niveau de jeu de chaque joueur est plus élevé lors des victoires ou des défaites de l'équipe (à partir de 5 matchs joués).
          </p>
          <PlayerImpactList impacts={playerImpacts} />
        </Card>
      )}

      {/* ══ ACP MATCHS ══════════════════════════════════════════════════════ */}
      {activeTab === 'pca' && (
        <Card>
          {pcaResult === null ? <EmptyState message="Pas assez de matchs (minimum 4) pour calculer une ACP." /> : (
            <div>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 7px' }}>Quelles statistiques font gagner l'équipe ?</h3>
              <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 18px', lineHeight: 1.5 }}>
                Sur les {matchCount} derniers matchs, voici les statistiques qui ont le plus influencé le résultat des rencontres. Plus le score est élevé, plus cette statistique a de poids.
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

      {/* ══ CHARGE PHYSIQUE ═════════════════════════════════════════════════ */}
      {activeTab === 'load' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardTitle icon={<Activity size={12} style={{ color: '#3B82F6' }} />} mb={10}
              info={rpeTeamKpis ? `${rpeTeamKpis.sessions} séance${rpeTeamKpis.sessions > 1 ? 's' : ''}` : undefined}>
              Classement charge RPE
            </CardTitle>
            <RPEPlayerRankingTable players={playerRanking} sessionLoadLight={sessionLoadLight} sessionLoadNormal={sessionLoadNormal} lightMax={thresholds.lightMax} normalMax={thresholds.normalMax} />
          </Card>
          <RiskAlertsList alerts={alerts} onOpenPlayer={openPlayer} />
        </div>
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

      {/* ══ CORRÉLATIONS ════════════════════════════════════════════════════ */}
      {activeTab === 'correlations' && (
        <>
          <IndicatorControls indicators={indicators} aKey={aKey} bKey={bKey} onA={setAKey} onB={setBKey} />
          <Card style={{ marginBottom: 14 }}>
            <CardTitle icon={<LineChartIcon size={12} style={{ color: '#00E5A0' }} />} mb={10}>
              Chronologie croisée
            </CardTitle>
            <CrossTimelineChart a={{ def: aDef, points: seriesA }} b={{ def: bDef, points: seriesB }} from={from} to={to} loadThresholds={thresholds} />
          </Card>
          <CorrelationCard a={aDef} b={bDef} result={corr} lagDays={lagDays} onLagChange={setLagDays} />
        </>
      )}

      {/* ══ COMPARAISON JOUEURS ═════════════════════════════════════════════ */}
      {activeTab === 'comparison' && (
        <Card>
          <CardTitle icon={<TrendingUp size={12} style={{ color: '#00E5A0' }} />} mb={10}
            info={`${rows.length} joueur${rows.length > 1 ? 's' : ''} · moyennes sur la période`}>
            Comparaison des joueurs
          </CardTitle>
          <PlayerComparisonTable rows={rows} aDef={aDef} bDef={bDef} onOpenPlayer={openPlayer} />
        </Card>
      )}

        </div>
      </div>
    </div>
  );
}
