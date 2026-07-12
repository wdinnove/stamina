import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TrendingUp, Activity, Stethoscope, LineChart as LineChartIcon, Users, ChevronDown } from 'lucide-react';
import { playersApi, statsApi, wellnessApi, medicalApi, rpeApi, attendanceApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  Card, CardTitle, EmptyState, PlayerSelect, PlayerHero, TeamStatsHero,
  DateRangeCard, useDateRange,
  IndicatorSelect, CrossTimelineChart, CorrelationCard, RiskAlertsList, PlayerComparisonTable,
} from '../components';
import { isoToday } from '../components/DateRangeCard';
import { MedCard, daysBetween, rtpDaysLeft } from '../components/MedicalCard';
import type { ComparisonRow } from '../components/PlayerComparisonTable';
import { computeTsb, tsbZone, rpeColor } from '../utils/rpe';
import { wellnessScoreColor } from '../utils/wellness';
import { evalColor } from '../data';
import {
  playerViewIndicators, teamIndicators, indicatorByKey, getSeries, correlateIndicators,
  detectRiskAlerts, injuryEpisodes,
  type CrossScope, type PlayerCrossData, type TeamCrossData, type IndicatorDef, type LagMode,
} from '../data/crossAnalysis';
import type { BasketballPosition, MedicalRecord } from '../data/types';

// ── Chargement : toutes les données de la saison, fusionnées par joueuse ──────

function usePerformanceData() {
  const { selected } = useTeamSeason();
  const [data, setData] = useState<TeamCrossData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    const { team, season } = selected;
    Promise.all([
      playersApi.listBySeason(season.id),
      statsApi.listAllStatsBySeason(team.id, season.id),
      statsApi.listTeamStatsBySeason(team.id, season.id),
      rpeApi.list({ seasonId: season.id }),
      // wellness_entries n'a pas de season_id : borner explicitement à la fin de saison,
      // sinon une saison passée récupère aussi les entrées des saisons suivantes jusqu'à aujourd'hui.
      wellnessApi.list({ from: season.startDate, to: season.endDate < isoToday() ? season.endDate : isoToday() }),
      attendanceApi.listSessions(team.id, season.id),
    ]).then(async ([players, matchStats, teamMatchStats, rpe, wellness, sessions]) => {
      const [medical, attendance] = await Promise.all([
        players.length ? medicalApi.list({ playerIds: players.map(p => p.id) }) : Promise.resolve([]),
        attendanceApi.listAttendance(sessions.map(s => s.id)),
      ]);
      if (cancelled) return;
      const sessionDate = new Map(sessions.map(s => [s.id, s.date]));
      const teamStatsByMatchId = new Map(
        teamMatchStats.filter(t => t.matchId).map(t => [t.matchId as string, t]),
      );
      const sorted = [...players].sort((a, b) => a.lastName.localeCompare(b.lastName));
      setData({
        teamMatchStats,
        players: sorted.map(pl => ({
          player: pl,
          teamStatsByMatchId,
          matchStats: matchStats.filter(m => m.playerId === pl.id),
          rpe: rpe.filter(e => e.playerId === pl.id),
          wellness: wellness.filter(w => w.playerId === pl.id),
          medical: medical.filter(m => m.playerId === pl.id),
          attendance: attendance
            .filter(a => a.playerId === pl.id && sessionDate.has(a.sessionId))
            .map(a => ({ date: sessionDate.get(a.sessionId)!, status: a.status })),
        })),
      });
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.team.id, selected?.season.id]);

  return { data, loading, seasonStart: selected?.season.startDate, seasonEnd: selected?.season.endDate };
}

// ── Petits éléments partagés ──────────────────────────────────────────────────

const avg = (vals: number[]): number | null =>
  vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;

function MiniKpi({ title, sub, value, base, unit, color }: {
  title: string; sub: string; value: number | string | null;
  base?: number | null; unit?: string; color: string;
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

function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ color: '#64748B', fontSize: '0.82rem', margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Sélection des deux indicateurs à croiser */
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

/** Sélecteur de poste — même style visuel que PlayerSelect (icône, bordure accentuée, chevron) */
function PositionSelect({ value, onChange, positions }: {
  value: 'all' | BasketballPosition; onChange: (v: 'all' | BasketballPosition) => void; positions: BasketballPosition[];
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
      <Users size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value as 'all' | BasketballPosition)}
        style={{
          width: '100%', padding: '8px 30px 8px 32px', backgroundColor: '#1E2229',
          border: '1px solid #00E5A050', borderRadius: 6, color: '#F1F5F9',
          fontSize: '0.85rem', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer',
        }}
      >
        <option value="all">Tous les postes</option>
        {positions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 8, color: '#475569', pointerEvents: 'none' }} />
    </div>
  );
}

// ── Vue Équipe : /team-performance ────────────────────────────────────────────

export default function PerformancePage() {
  const navigate = useNavigate();
  const { thresholds, statThresholds, selected } = useTeamSeason();
  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
  const dateRange = useDateRange(seasonStart, undefined, seasonEnd);
  const [aKey, setAKey] = useState('loadUa');
  const [bKey, setBKey] = useState('eval');
  const [lagDays, setLagDays] = useState<LagMode>('week');
  const [position, setPosition] = useState<'all' | BasketballPosition>('all');

  const indicators = useMemo(teamIndicators, []);
  const aDef = indicatorByKey(aKey) ?? indicators[0];
  const bDef = indicatorByKey(bKey) ?? indicators[1];
  const { from, to } = dateRange;

  const players = useMemo(() => {
    if (!data) return [];
    if (position === 'all') return data.players;
    return data.players.filter(p => p.player.position === position || p.player.secondaryPosition === position);
  }, [data, position]);

  const scope: CrossScope = useMemo(
    () => data ? { team: { players, teamMatchStats: data.teamMatchStats } } : {},
    [data, players],
  );

  const seriesA = useMemo(() => scope.team ? getSeries(aDef, scope, from, to) : [], [scope, aDef, from, to]);
  const seriesB = useMemo(() => scope.team ? getSeries(bDef, scope, from, to) : [], [scope, bDef, from, to]);
  const corr = useMemo(
    () => scope.team ? correlateIndicators(aDef, bDef, scope, from, to, lagDays) : null,
    [scope, aDef, bDef, from, to, lagDays],
  );
  const alerts = useMemo(
    () => detectRiskAlerts(players, from, to, thresholds),
    [players, from, to, thresholds.lightMax, thresholds.normalMax],
  );

  const rows: ComparisonRow[] = useMemo(() => players.map(p => {
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
  }), [players, aDef, bDef, from, to, alerts]);

  const positions = useMemo(
    () => [...new Set((data?.players ?? []).map(p => p.player.position))],
    [data],
  );

  const openPlayer = (playerId: string) => navigate(`/player-performance/${playerId}`);

  // ── KPI équipe : mêmes 5 indicateurs que la vue joueuse, moyennés sur l'effectif filtré ──
  const inRangeTeam = (d: string) => d >= from && d <= to;
  const allRpe = players.flatMap(p => p.rpe);
  const allWellness = players.flatMap(p => p.wellness);
  const allMatchStats = players.flatMap(p => p.matchStats);
  const allAttendance = players.flatMap(p => p.attendance);

  const tsbValues = players.map(p => computeTsb(p.rpe)).filter((v): v is number => v !== null);
  const tsbNow = tsbValues.length ? Math.round(tsbValues.reduce((s, v) => s + v, 0) / tsbValues.length * 10) / 10 : null;
  const tsbNowZone = tsbNow !== null ? tsbZone(tsbNow) : null;

  const rpeAvgP   = avg(allRpe.filter(e => inRangeTeam(e.date)).map(e => e.rpe));
  const rpeAvgAll = avg(allRpe.map(e => e.rpe));
  const wellAvgP   = avg(allWellness.filter(w => inRangeTeam(w.date)).map(w => Number(w.score)));
  const wellAvgAll = avg(allWellness.map(w => Number(w.score)));
  const evalAvgP   = avg(allMatchStats.filter(m => m.eval !== null && inRangeTeam(m.date)).map(m => Number(m.eval)));
  const evalAvgAll = avg(allMatchStats.filter(m => m.eval !== null).map(m => Number(m.eval)));
  const attP = allAttendance.filter(a => inRangeTeam(a.date));
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;

  const filteredTeamStats = (data?.teamMatchStats ?? []).filter(t => inRangeTeam(t.date));

  if (loading) {
    return <div className="p-4 md:p-6" style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;
  }
  if (!data || data.players.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Performance équipe" />
        <Card><EmptyState message="Aucune joueuse dans l'effectif de cette saison." /></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Performance équipe"
        right={<PositionSelect value={position} onChange={setPosition} positions={positions} />}
      />

      {selected && (
        <TeamStatsHero
          teamName={selected.team.name} category={selected.team.category} seasonLabel={selected.season.label}
          teamStats={filteredTeamStats} statThresholds={statThresholds}
        />
      )}

      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
      />

      {/* ── KPI équipe ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 14 }}>
        <MiniKpi title="État actuel" sub="TSB · fraîcheur moyenne"
          value={tsbNow !== null ? `${tsbNow > 0 ? '+' : ''}${tsbNow}` : null}
          color={tsbNowZone?.color ?? '#94A3B8'} />
        <MiniKpi title="RPE moyen" sub="Période sélectionnée"
          value={rpeAvgP} base={rpeAvgAll} unit="/10"
          color={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#94A3B8'} />
        <MiniKpi title="Bien-être" sub="Période sélectionnée"
          value={wellAvgP} base={wellAvgAll} unit="/10"
          color={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#94A3B8'} />
        <MiniKpi title="Éval. match" sub="Période sélectionnée"
          value={evalAvgP} base={evalAvgAll}
          color={evalColor(evalAvgP, statThresholds)} />
        <MiniKpi title="Présence" sub={attP.length ? `${presentP}/${attP.length} séances` : 'Aucune séance'}
          value={presencePct} unit="%"
          color={presencePct !== null ? (presencePct >= 85 ? '#00E5A0' : presencePct >= 70 ? '#F59E0B' : '#EF4444') : '#94A3B8'} />
      </div>

      <IndicatorControls indicators={indicators} aKey={aKey} bKey={bKey} onA={setAKey} onB={setBKey} />

      <Card style={{ marginBottom: 14 }}>
        <CardTitle icon={<LineChartIcon size={12} style={{ color: '#00E5A0' }} />} mb={10}>
          Chronologie croisée
        </CardTitle>
        <CrossTimelineChart a={{ def: aDef, points: seriesA }} b={{ def: bDef, points: seriesB }} from={from} to={to} loadThresholds={thresholds} />
      </Card>

      <CorrelationCard a={aDef} b={bDef} result={corr} lagDays={lagDays} onLagChange={setLagDays} />

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14, marginTop: 14, alignItems: 'start' }}>
        <RiskAlertsList alerts={alerts} onOpenPlayer={openPlayer} />

        <Card>
          <CardTitle icon={<TrendingUp size={12} style={{ color: '#00E5A0' }} />} mb={10}
            info={`${rows.length} joueuse${rows.length > 1 ? 's' : ''} · moyennes sur la période`}>
            Comparaison des joueuses
          </CardTitle>
          <PlayerComparisonTable rows={rows} aDef={aDef} bDef={bDef} onOpenPlayer={openPlayer} />
        </Card>
      </div>
    </div>
  );
}

// ── Vue Joueuse : /player-performance/:id ─────────────────────────────────────

export function PerformancePlayerPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { thresholds, statThresholds } = useTeamSeason();
  const { data, loading, seasonStart, seasonEnd } = usePerformanceData();
  const dateRange = useDateRange(seasonStart, undefined, seasonEnd);
  const [aKey, setAKey] = useState('loadUa');
  const [bKey, setBKey] = useState('eval');
  const [lagDays, setLagDays] = useState<LagMode>('week');

  const players = data?.players ?? [];

  // Sans :id → redirige vers la première joueuse (même pattern que Statistiques individuelles)
  useEffect(() => {
    if (!loading && !id && players.length > 0) {
      navigate(`/player-performance/${players[0].player.id}`, { replace: true });
    }
  }, [loading, id, players.length]);

  const pd: PlayerCrossData | undefined = players.find(p => p.player.id === id);
  // Indicateurs individuels + collectifs de match (le scope contient la joueuse ET l'équipe :
  // un indicateur individuel résout sur ses données, un collectif sur celles de l'équipe)
  const indicators = useMemo(playerViewIndicators, []);
  const aDef = indicatorByKey(aKey) ?? indicators[0];
  const bDef = indicatorByKey(bKey) ?? indicators[1];
  const { from, to } = dateRange;

  const scope: CrossScope = useMemo(
    () => pd ? { player: pd, team: data ?? undefined } : {},
    [pd, data],
  );
  const seriesA = useMemo(() => pd ? getSeries(aDef, scope, from, to) : [], [scope, aDef, from, to]);
  const seriesB = useMemo(() => pd ? getSeries(bDef, scope, from, to) : [], [scope, bDef, from, to]);
  const corr = useMemo(
    () => pd ? correlateIndicators(aDef, bDef, scope, from, to, lagDays) : null,
    [scope, aDef, bDef, from, to, lagDays],
  );
  const alerts = useMemo(
    () => pd ? detectRiskAlerts([pd], from, to, thresholds) : [],
    [pd, from, to, thresholds.lightMax, thresholds.normalMax],
  );
  const injuries = useMemo(() => pd ? injuryEpisodes(pd.medical, from, to) : [], [pd, from, to]);

  // ── KPI : état actuel + moyennes période vs saison (reprend l'ex-onglet Analyse croisée) ──
  const inRange = (d: string) => d >= from && d <= to;
  const tsbNow = pd ? computeTsb(pd.rpe) : null;
  const tsbNowZone = tsbNow !== null ? tsbZone(tsbNow) : null;
  const rpeAvgP   = pd ? avg(pd.rpe.filter(e => inRange(e.date)).map(e => e.rpe)) : null;
  const rpeAvgAll = pd ? avg(pd.rpe.map(e => e.rpe)) : null;
  const wellAvgP   = pd ? avg(pd.wellness.filter(w => inRange(w.date)).map(w => Number(w.score))) : null;
  const wellAvgAll = pd ? avg(pd.wellness.map(w => Number(w.score))) : null;
  const evalAvgP   = pd ? avg(pd.matchStats.filter(m => m.eval !== null && inRange(m.date)).map(m => Number(m.eval))) : null;
  const evalAvgAll = pd ? avg(pd.matchStats.filter(m => m.eval !== null).map(m => Number(m.eval))) : null;
  const attP = pd ? pd.attendance.filter(a => inRange(a.date)) : [];
  const presentP = attP.filter(a => a.status === 'present' || a.status === 'late').length;
  const presencePct = attP.length ? Math.round(presentP / attP.length * 100) : null;

  // ── Infirmerie (reprend l'ex-onglet Bilan physique) — une seule colonne, plus récent en premier ──
  const medInRange = pd ? pd.medical.filter(m => inRange(m.date)) : [];
  const medSorted = [...medInRange].sort((x, y) => y.date.localeCompare(x.date));
  const activeInj = medInRange.filter(m => m.type === 'injury' && m.status === 'active');
  const accentInj = activeInj.length > 0 ? '#EF4444' : medInRange.some(m => m.type === 'injury') ? '#F59E0B' : '#00E5A0';

  const playerSelect = (
    <PlayerSelect
      players={players.map(p => p.player)}
      value={id ?? ''}
      onChange={pid => navigate(`/player-performance/${pid}`)}
    />
  );

  if (loading) {
    return <div className="p-4 md:p-6" style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;
  }
  if (!players.length) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Performance joueuse" />
        <Card><EmptyState message="Aucune joueuse dans l'effectif de cette saison." /></Card>
      </div>
    );
  }
  if (!pd) return null;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Performance joueuse" right={playerSelect} />

      <PlayerHero player={pd.player} />

      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
      />

      {/* ── KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5" style={{ gap: 10, marginBottom: 14 }}>
        <MiniKpi title="État actuel" sub="TSB · fraîcheur du jour"
          value={tsbNow !== null ? `${tsbNow > 0 ? '+' : ''}${tsbNow}` : null}
          color={tsbNowZone?.color ?? '#94A3B8'} />
        <MiniKpi title="RPE moyen" sub="Période sélectionnée"
          value={rpeAvgP} base={rpeAvgAll} unit="/10"
          color={rpeAvgP !== null ? rpeColor(rpeAvgP) : '#94A3B8'} />
        <MiniKpi title="Bien-être" sub="Période sélectionnée"
          value={wellAvgP} base={wellAvgAll} unit="/10"
          color={wellAvgP !== null ? wellnessScoreColor(wellAvgP) : '#94A3B8'} />
        <MiniKpi title="Éval. match" sub="Période sélectionnée"
          value={evalAvgP} base={evalAvgAll}
          color={evalColor(evalAvgP, statThresholds)} />
        <MiniKpi title="Présence" sub={attP.length ? `${presentP}/${attP.length} séances` : 'Aucune séance'}
          value={presencePct} unit="%"
          color={presencePct !== null ? (presencePct >= 85 ? '#00E5A0' : presencePct >= 70 ? '#F59E0B' : '#EF4444') : '#94A3B8'} />
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14, marginTop: 14, alignItems: 'start' }}>
        <RiskAlertsList alerts={alerts} hidePlayerName />

        {/* ── Infirmerie ── */}
        <Card accentColor={accentInj}>
          <CardTitle icon={<Stethoscope size={12} style={{ color: accentInj }} />} mb={14}
            info={medSorted.length > 0 ? `${medSorted.length}` : undefined}>
            Infirmerie
          </CardTitle>
          {medSorted.length === 0
            ? <EmptyState message="Aucun événement médical sur cette période." size="sm" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {medSorted.map(record => {
                  const isActive = record.status === 'active';
                  const days = record.rtpDate
                    ? (isActive ? rtpDaysLeft(record.rtpDate) : daysBetween(record.date, record.rtpDate))
                    : null;
                  const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                  const daysLabel = days !== null && days > 0
                    ? (isActive ? `${rtpLabel} J+${days}` : `${days}j`)
                    : null;
                  return (
                    <MedCard
                      key={record.id}
                      record={record}
                      showTypeBadge
                      daysLabel={daysLabel}
                      daysColor={isActive && days !== null && days <= 3 ? '#00E5A0' : isActive ? '#F59E0B' : '#475569'}
                      onEdit={() => navigate(`/medical/record/${pd.player.id}`)}
                      onDetail={() => navigate(`/medical/record/${pd.player.id}`)}
                    />
                  );
                })}
              </div>
            )
          }
        </Card>
      </div>
    </div>
  );
}
