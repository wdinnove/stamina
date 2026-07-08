import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { BarChart2 } from 'lucide-react';
import { playersApi, statsApi } from '../api';
import { evalColor, ortgColor, drtgColor } from '../data';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Card, CardTitle, EmptyState, DateRangeCard, useDateRange, PCABiplot, WinFactorsList, PlayerImpactList } from '../components';
import { calcPlayerAdvanced } from '../data/playerAdvanced';
import { computeMatchPCA, computeWinFactors, computePlayerImpact } from '../data/pca';
import type { Player, MatchStat, TeamMatchStat } from '../data/types';

type OuterTab  = 'par-joueur' | 'par-match';
type StatsView = 'basic' | 'advanced' | 'pca';
type Sort      = { col: string; dir: 'asc' | 'desc' };

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const fmtD = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

const fmt  = (v: number | null, suf = '') => v !== null ? `${v}${suf}` : '—';
const pos  = (p: string) => p === 'Ailier Fort' ? 'AF' : p === 'Ailier' ? 'AI' : p === 'Meneur' ? 'ME' : p === 'Arrière' ? 'AR' : 'PI';

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

export default function AnalyseCollectivePage() {
  const { selected, statThresholds } = useTeamSeason();
  const navigate = useNavigate();

  const [players,      setPlayers]      = useState<Player[]>([]);
  const [allStats,     setAllStats]     = useState<MatchStat[]>([]);
  const [teamStats,    setTeamStats]    = useState<TeamMatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamMatchStat>>(new Map());
  const [loading,      setLoading]      = useState(true);

  const [outerTab,    setOuterTab]    = useState<OuterTab>('par-joueur');
  const [statsView,   setStatsView]   = useState<StatsView>('basic');
  const [normalize25, setNormalize25] = useState(false);

  const [s1, setS1] = useState<Sort>({ col: 'pts',  dir: 'desc' }); // PJ Brutes
  const [s2, setS2] = useState<Sort>({ col: 'pts',  dir: 'desc' }); // PJ Avancées
  const [s4, setS4] = useState<Sort>({ col: 'date', dir: 'desc' }); // PM Brutes
  const [s5, setS5] = useState<Sort>({ col: 'date', dir: 'desc' }); // PM Avancées

  const dateRange = useDateRange(selected?.season.startDate);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    Promise.all([
      playersApi.listBySeason(selected.season.id),
      statsApi.listAllStatsBySeason(selected.team.id, selected.season.id),
      statsApi.listTeamStatsBySeason(selected.team.id, selected.season.id),
    ]).then(([pList, stats, tms]) => {
      setPlayers(pList.sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setAllStats(stats);
      setTeamStats(tms);
      setTeamStatsMap(new Map(tms.map(t => [t.matchId!, t])));
    }).finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  // ── Filtered by date range ────────────────────────────────────────────────────
  const filteredAllStats = useMemo(() =>
    dateRange.from ? allStats.filter(s => s.date >= dateRange.from && s.date <= dateRange.to) : allStats,
    [allStats, dateRange.from, dateRange.to]);

  const filteredTeamStats = useMemo(() =>
    dateRange.from ? teamStats.filter(t => t.date >= dateRange.from && t.date <= dateRange.to) : teamStats,
    [teamStats, dateRange.from, dateRange.to]);

  // Group individual stats by playerId
  const playerStatsMap = useMemo(() => {
    const m = new Map<string, MatchStat[]>();
    for (const s of filteredAllStats) {
      if (!m.has(s.playerId)) m.set(s.playerId, []);
      m.get(s.playerId)!.push(s);
    }
    return m;
  }, [filteredAllStats]);

  // ── Par joueur: Brutes rows ──────────────────────────────────────────────────
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

  // ── Par joueur: Avancées rows ────────────────────────────────────────────────
  const pjAdvRows = useMemo(() => players
    .filter(p => playerStatsMap.has(p.id))
    .map(p => {
      const ss  = playerStatsMap.get(p.id)!;
      const n   = ss.length;
      const adv = ss.map(m => calcPlayerAdvanced(m, teamStatsMap.get(m.matchId ?? '') ?? null));
      const avgA = (key: string) => {
        const vals = adv.map(a => (a as Record<string, number | null>)[key]).filter((v): v is number => v !== null);
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

  // ── Par joueur: display rows (with optional 25-min normalization) ──────────
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

  // ── Par match rows (from teamStats) ─────────────────────────────────────────
  const pmRows = useMemo(() => filteredTeamStats.map(t => ({
    ...t,
    pts:    t.fg2m * 2 + t.fg3m * 3 + t.ftm,
    fg2Pct: t.fg2a > 0 ? Math.round(t.fg2m / t.fg2a * 100) : null,
    fg3Pct: t.fg3a > 0 ? Math.round(t.fg3m / t.fg3a * 100) : null,
    ftPct:  t.fta  > 0 ? Math.round(t.ftm  / t.fta  * 100) : null,
  })), [filteredTeamStats]);

  const pcaResult     = useMemo(() => computeMatchPCA(filteredTeamStats),   [filteredTeamStats]);
  const winFactors    = useMemo(() => computeWinFactors(filteredTeamStats), [filteredTeamStats]);
  const playerImpacts = useMemo(() => computePlayerImpact(players, filteredAllStats), [players, filteredAllStats]);

  // ── Sorts ────────────────────────────────────────────────────────────────────
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

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (!selected) return <div className="p-4 md:p-6"><EmptyState message="Aucune équipe sélectionnée." /></div>;
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const matchCount  = pmRows.length;
  const wins        = pmRows.filter(m => m.result === 'win').length;
  const losses      = matchCount - wins;
  const winPct      = matchCount > 0 ? wins / matchCount : 0;
  const heroAccent  = matchCount === 0 ? '#475569' : winPct > 0.6 ? '#00E5A0' : winPct >= 0.4 ? '#F59E0B' : '#EF4444';
  const avgScoreUs  = matchCount > 0 ? Math.round(pmRows.reduce((a, m) => a + m.scoreUs,   0) / matchCount * 10) / 10 : null;
  const avgScoreThem= matchCount > 0 ? Math.round(pmRows.reduce((a, m) => a + m.scoreThem, 0) / matchCount * 10) / 10 : null;
  const heroDiff    = avgScoreUs !== null && avgScoreThem !== null ? Math.round((avgScoreUs - avgScoreThem) * 10) / 10 : null;
  const validORtg   = pmRows.filter(m => m.offRating > 0);
  const avgORtg     = validORtg.length  > 0 ? Math.round(validORtg.reduce((a, m)  => a + m.offRating,  0) / validORtg.length  * 10) / 10 : null;
  const validDRtg   = pmRows.filter(m => m.defRating > 0);
  const avgDRtg     = validDRtg.length  > 0 ? Math.round(validDRtg.reduce((a, m)  => a + m.defRating,  0) / validDRtg.length  * 10) / 10 : null;
  const teamInitials = selected.team.name.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');

  return (
    <div className="p-4 md:p-6">

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Statistiques collectives</h1>
      </div>

      {/* ── Hero équipe ── */}
      <div style={{ backgroundColor: `${heroAccent}10`, border: `1px solid ${heroAccent}40`, borderLeft: `4px solid ${heroAccent}`, borderRadius: 8, padding: '14px 4px 14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Logo initiales */}
        <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: `${heroAccent}18`, border: `2px solid ${heroAccent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: heroAccent, fontWeight: 800, fontSize: '0.85rem', letterSpacing: '-0.02em' }}>{teamInitials}</span>
        </div>

        {/* Nom + saison */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>{selected.team.name}</div>
          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>
            {selected.team.category} · {selected.season.label}
            {matchCount > 0 && ` · ${matchCount} match${matchCount > 1 ? 's' : ''}`}
          </p>
        </div>

        {/* KPI chips */}
        <div className="flex items-stretch gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#2A2F3A]">

          {/* Bilan */}
          <div style={{ minWidth: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bilan</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: '#00E5A0', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{wins}V</span>
              <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{losses}D</span>
            </div>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

          {/* Pts marqués */}
          <div style={{ minWidth: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pts moy</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreUs ?? '—'}</span>
            </div>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

          {/* Pts concédés */}
          <div style={{ minWidth: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pts conc</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreThem ?? '—'}</span>
            </div>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

          {/* Différentiel */}
          <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Diff</div>
            <span style={{ color: heroDiff === null ? '#475569' : heroDiff > 0 ? '#00E5A0' : heroDiff < 0 ? '#EF4444' : '#94A3B8', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
              {heroDiff === null ? '—' : heroDiff > 0 ? `+${heroDiff}` : heroDiff}
            </span>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

          {/* ORtg */}
          <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ORtg</div>
            <span style={{ color: avgORtg !== null ? ortgColor(avgORtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
              {avgORtg ?? '—'}
            </span>
          </div>

          <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

          {/* DRtg */}
          <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
            <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DRtg</div>
            <span style={{ color: avgDRtg !== null ? drtgColor(avgDRtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
              {avgDRtg ?? '—'}
            </span>
          </div>

        </div>
      </div>

      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, selected?.season.startDate)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
      />

      {/* Outer tabs */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['par-joueur', 'Par joueur'], ['par-match', 'Par match']] as const).map(([k, l]) => (
            <button key={k}
              onClick={() => { setOuterTab(k); }}
              className="hover:!text-[#F1F5F9]"
              style={{ flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: outerTab === k ? '#1E2229' : 'transparent', color: outerTab === k ? '#F1F5F9' : '#94A3B8', transition: 'all 0.15s' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle
          icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />}
          mb={14}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {outerTab === 'par-joueur' && sortedPJ.length > 0 &&
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>{sortedPJ.length} joueur{sortedPJ.length > 1 ? 's' : ''}</span>}
              {outerTab === 'par-match' && matchCount > 0 &&
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>{matchCount} match{matchCount > 1 ? 's' : ''} · {wins}V {matchCount - wins}D</span>}

              {/* Normalize 25 min toggle — par joueur only */}
              {outerTab === 'par-joueur' && statsView !== 'pca' && (
                <button
                  type="button"
                  onClick={() => setNormalize25(v => !v)}
                  title="Recalculer toutes les stats comme si chaque joueur jouait 25 min"
                  style={{
                    padding: '3px 8px', borderRadius: 4, border: `1px solid ${normalize25 ? '#F59E0B' : '#2A2F3A'}`,
                    cursor: 'pointer', fontSize: '0.68rem', fontWeight: normalize25 ? 700 : 400,
                    backgroundColor: normalize25 ? 'rgba(245,158,11,0.12)' : 'transparent',
                    color: normalize25 ? '#F59E0B' : '#475569',
                    transition: 'all 0.15s',
                  }}>
                  25 min
                </button>
              )}

              <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
                {(['basic', 'advanced', 'pca'] as const).map(v => (
                  <button key={v} type="button"
                    onClick={e => { e.stopPropagation(); setStatsView(v); }}
                    style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: statsView === v ? 700 : 400, backgroundColor: statsView === v ? '#1E2229' : 'transparent', color: statsView === v ? '#00E5A0' : '#475569' }}>
                    {v === 'basic' ? 'Brutes' : v === 'advanced' ? 'Avancées' : outerTab === 'par-match' ? 'ACP' : 'Impact'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          Statistiques {outerTab === 'par-joueur' ? 'par joueur' : 'par match'}
        </CardTitle>

        {/* ── PAR JOUEUR : BRUTES ── */}
        {outerTab === 'par-joueur' && statsView === 'basic' && (
          sortedPJ.length === 0 ? <EmptyState message="Aucune statistique pour cette saison." /> : (
            <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr>
                  <th style={{ ...TH, cursor: 'default' }}>#</th>
                  <th onClick={() => setS1(p => tog(p, 'name'))} style={{ ...TH, textAlign: 'left' }}><span style={{ color: thC('name', s1) }}>Joueur{si('name', s1)}</span></th>
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
                      <tr key={p.id} onClick={() => navigate(`/individual-analyze/${p.id}`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }} className="hover:!bg-white/5">
                        <td style={{ ...TD, color: '#475569' }}>#{p.number}</td>
                        <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600 }}>{p.firstName} {p.lastName}</td>
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
                  {/* Totals row */}
                  {(() => {
                    const N = sortedPJ.length;
                    if (N === 0) return null;
                    const tA = (f: (r: typeof sortedPJ[0]) => number) => Math.round(sortedPJ.reduce((a, r) => a + f(r), 0) / N * 10) / 10;
                    const allFg2m = sortedPJ.reduce((a, r) => a + r.fg2m, 0), allFg2a = sortedPJ.reduce((a, r) => a + r.fg2a, 0);
                    const allFg3m = sortedPJ.reduce((a, r) => a + r.fg3m, 0), allFg3a = sortedPJ.reduce((a, r) => a + r.fg3a, 0);
                    const allFtm  = sortedPJ.reduce((a, r) => a + r.ftm,  0), allFta  = sortedPJ.reduce((a, r) => a + r.fta,  0);
                    const pF  = allFg2a > 0 ? Math.round(allFg2m / allFg2a * 100) : null;
                    const p3  = allFg3a > 0 ? Math.round(allFg3m / allFg3a * 100) : null;
                    const pFt = allFta  > 0 ? Math.round(allFtm  / allFta  * 100) : null;
                    const evalRows = sortedPJ.filter(r => r.evalAvg !== null);
                    const evalMoy  = evalRows.length > 0
                      ? Math.round(evalRows.reduce((a, r) => a + (r.evalAvg ?? 0), 0) / evalRows.length * 10) / 10 : null;
                    return (
                      <tr style={TOTALS}>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TL, textAlign: 'left' }}>Moy. équipe</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={TD}>—</td>
                        <td style={{ ...TD, color: normalize25 ? '#F59E0B' : undefined }}>{normalize25 ? 25 : tA(r => r.avgMin)}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{tA(r => r.avgPts)}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>—</td>
                        <td style={TD}>{pF !== null ? `${pF}%` : '—'}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>—</td>
                        <td style={TD}>{p3 !== null ? `${p3}%` : '—'}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>—</td>
                        <td style={TD}>{pFt !== null ? `${pFt}%` : '—'}</td>
                        <td style={TD}>{tA(r => r.avgRo)}</td>
                        <td style={TD}>{tA(r => r.avgRd)}</td>
                        <td style={{ ...TD, color: '#F1F5F9' }}>{tA(r => r.avgRt)}</td>
                        <td style={TD}>{tA(r => r.avgPd)}</td>
                        <td style={TD}>{tA(r => r.avgCt)}</td>
                        <td style={TD}>{tA(r => r.avgInt)}</td>
                        <td style={TD}>{tA(r => r.avgBp)}</td>
                        <td style={{ ...TD, color: evalMoy !== null ? evalColor(evalMoy, statThresholds) : '#475569', fontWeight: evalMoy !== null ? 700 : 400 }}>{evalMoy !== null ? evalMoy : '—'}</td>
                        <td style={TD}>—</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── PAR JOUEUR : AVANCÉES ── */}
        {outerTab === 'par-joueur' && statsView === 'advanced' && (
          sortedPJAdv.length === 0 ? <EmptyState message="Aucune statistique pour cette saison." /> : (
            <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>#</th>
                    <th rowSpan={2} onClick={() => setS2(p => tog(p, 'name'))} style={{ ...TH, textAlign: 'left', verticalAlign: 'middle' }}><span style={{ color: thC('name', s2) }}>Joueur{si('name', s2)}</span></th>
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
                    <tr key={p.id} onClick={() => navigate(`/individual-analyze/${p.id}`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }} className="hover:!bg-white/5">
                      <td style={{ ...TD, color: '#475569' }}>#{p.number}</td>
                      <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600 }}>{p.firstName} {p.lastName}</td>
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

        {/* ── PAR JOUEUR : IMPACT ── */}
        {outerTab === 'par-joueur' && statsView === 'pca' && (
          <div>
            <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 4px' }}>Qui fait la différence sur le terrain ?</h3>
            <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 14px' }}>
              On compare le niveau de jeu de chaque joueur, match après match, aux victoires et défaites de l'équipe (à partir de 5 matchs joués).
            </p>
            <PlayerImpactList impacts={playerImpacts} />
          </div>
        )}

        {/* ── PAR MATCH : BRUTES ── */}
        {outerTab === 'par-match' && statsView === 'basic' && (
          sortedPM.length === 0 ? <EmptyState message="Aucune statistique collective pour cette saison." /> : (
            <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr>
                  <th onClick={() => setS4(p => tog(p, 'date'))} style={{ ...TH, textAlign: 'left', width: 60, minWidth: 60, color: thC('date', s4) }}>Date{si('date', s4)}</th>
                  <th onClick={() => setS4(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', color: thC('opp', s4) }}>Adv{si('opp', s4)}</th>
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
                </tr></thead>
                <tbody>
                  {sortedPM.map((m, i) => {
                    const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                    return (
                      <tr key={m.id} onClick={() => m.matchId && navigate(`/matches/${m.matchId}`)} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: m.matchId ? 'pointer' : 'default' }} className={m.matchId ? 'hover:!bg-white/5' : ''}>
                        <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left' }}>{m.opponent}</td>
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
                      </tr>
                    );
                  })}
                  {/* Averages row */}
                  {(() => {
                    const N = sortedPM.length;
                    if (N === 0) return null;
                    const a = (f: (r: typeof sortedPM[0]) => number) => Math.round(sortedPM.reduce((s, r) => s + f(r), 0) / N * 10) / 10;
                    const tF2m = sortedPM.reduce((s, r) => s + r.fg2m, 0), tF2a = sortedPM.reduce((s, r) => s + r.fg2a, 0);
                    const tF3m = sortedPM.reduce((s, r) => s + r.fg3m, 0), tF3a = sortedPM.reduce((s, r) => s + r.fg3a, 0);
                    const tFtm = sortedPM.reduce((s, r) => s + r.ftm,  0), tFta = sortedPM.reduce((s, r) => s + r.fta,  0);
                    return (
                      <tr style={TOTALS}>
                        <td style={{ ...TL, textAlign: 'left' }}>{N} matchs · {wins}V {N-wins}D</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{a(r => r.pts)}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>{Math.round(tF2m/N*10)/10}/{Math.round(tF2a/N*10)/10}</td>
                        <td style={TD}>{tF2a > 0 ? `${Math.round(tF2m/tF2a*100)}%` : '—'}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>{Math.round(tF3m/N*10)/10}/{Math.round(tF3a/N*10)/10}</td>
                        <td style={TD}>{tF3a > 0 ? `${Math.round(tF3m/tF3a*100)}%` : '—'}</td>
                        <td style={{ ...TD, fontSize: '0.7rem', color: '#64748B' }}>{Math.round(tFtm/N*10)/10}/{Math.round(tFta/N*10)/10}</td>
                        <td style={TD}>{tFta > 0 ? `${Math.round(tFtm/tFta*100)}%` : '—'}</td>
                        <td style={TD}>{a(r => r.ro)}</td>
                        <td style={TD}>{a(r => r.rd)}</td>
                        <td style={{ ...TD, color: '#F1F5F9' }}>{a(r => r.rt)}</td>
                        <td style={TD}>{a(r => r.pd)}</td>
                        <td style={TD}>{a(r => r.ct)}</td>
                        <td style={TD}>{a(r => r.intercepts)}</td>
                        <td style={TD}>{a(r => r.bp)}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── PAR MATCH : AVANCÉES ── */}
        {outerTab === 'par-match' && statsView === 'advanced' && (
          sortedPMAdv.length === 0 ? <EmptyState message="Aucune statistique collective pour cette saison." /> : (
            <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} onClick={() => setS5(p => tog(p, 'date'))} style={{ ...TH, textAlign: 'left', width: 60, minWidth: 60, verticalAlign: 'middle', color: thC('date', s5) }}>Date{si('date', s5)}</th>
                    <th rowSpan={2} onClick={() => setS5(p => tog(p, 'opp'))}  style={{ ...TH, textAlign: 'left', verticalAlign: 'middle', color: thC('opp', s5) }}>Adv{si('opp', s5)}</th>
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
                        <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60 }}>{fmtD(m.date)}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 600, textAlign: 'left' }}>{m.opponent}</td>
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
                  {/* Averages row */}
                  {(() => {
                    const N = sortedPMAdv.length;
                    if (N === 0) return null;
                    const av = (f: (r: typeof sortedPMAdv[0]) => number, filter?: (r: typeof sortedPMAdv[0]) => boolean) => {
                      const rows = filter ? sortedPMAdv.filter(filter) : sortedPMAdv;
                      return rows.length > 0 ? Math.round(rows.reduce((s, r) => s + f(r), 0) / rows.length * 10) / 10 : null;
                    };
                    return (
                      <tr style={TOTALS}>
                        <td style={{ ...TL, textAlign: 'left' }}>{N} matchs · {wins}V {N-wins}D</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, color: '#64748B' }}>—</td>
                        <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 700 }}>{av(r => r.pts)}</td>
                        {(() => { const v = av(r => r.offRating, r => r.offRating > 0); return <td style={{ ...TD, color: v !== null ? ortgColor(v, statThresholds) : '#475569' }}>{v ?? '—'}</td>; })()}
                        {(() => { const v = av(r => r.defRating, r => r.defRating > 0); return <td style={{ ...TD, color: v !== null ? drtgColor(v, statThresholds) : '#475569' }}>{v ?? '—'}</td>; })()}
                        <td style={TD}>{(() => { const v = av(r => r.efgPct, r => r.efgPct > 0); return v !== null ? `${v}%` : '—'; })()}</td>
                        <td style={TD}>{av(r => r.ftRate, r => r.ftRate > 0) ?? '—'}</td>
                        <td style={{ ...TD, ...SEP }}>{(() => { const v = av(r => r.toPct, r => r.toPct > 0); return v !== null ? `${v}%` : '—'; })()}</td>
                        <td style={TD}>{(() => { const v = av(r => r.orebPct, r => r.orebPct > 0); return v !== null ? `${v}%` : '—'; })()}</td>
                        <td style={TD}>{(() => { const v = av(r => r.drebPct, r => r.drebPct > 0); return v !== null ? `${v}%` : '—'; })()}</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── PAR MATCH : ACP ── */}
        {outerTab === 'par-match' && statsView === 'pca' && (
          pcaResult === null ? <EmptyState message="Pas assez de matchs (minimum 4) pour calculer une ACP." /> : (
            <div>
              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 4px' }}>Quelles statistiques font gagner l'équipe ?</h3>
              <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 14px' }}>
                Sur les {matchCount} matchs de la période, voici ce qui pèse vraiment sur le résultat — plus la barre est longue, plus l'effet est net.
              </p>
              <WinFactorsList factors={winFactors} />

              <div style={{ borderTop: '1px solid #2A2F3A', margin: '22px 0 16px' }} />

              <h3 style={{ color: '#F1F5F9', fontSize: '0.9rem', margin: '0 0 4px' }}>Tous les matchs, en un coup d'œil</h3>
              <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 14px', lineHeight: 1.5 }}>
                Chaque point représente un match — 🟢 pour une victoire, 🔴 pour une défaite — et chaque flèche une statistique de jeu.
                Plus un match se rapproche de la pointe d'une flèche, plus l'équipe a été forte sur cette statistique ce soir-là.
                Et quand les points verts se regroupent d'un côté d'une flèche pendant que les rouges restent de l'autre, c'est le signe
                que cette statistique fait vraiment basculer les rencontres.
              </p>
              <PCABiplot points={pcaResult.points} vectors={pcaResult.vectors} varPct={pcaResult.varPct} />
            </div>
          )
        )}
      </Card>
    </div>
  );
}
