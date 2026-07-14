import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Activity, Stethoscope } from 'lucide-react';
import { rpeApi, wellnessApi, statsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import {
  Card, CardTitle, EmptyState, PlayerSelect, PlayerHero,
  DateRangeCard, useDateRange, PlayerDynStatTab, PlayerStatsPanel, PlayerLoadPanel, WellnessPomsPanel,
  IndicatorSelect, CrossTimelineChart, CorrelationCard, RiskAlertsList,
} from '../components';
import { MedCard, daysBetween, rtpDaysLeft } from '../components/MedicalCard';
import { computeTsb, tsbZone, rpeColor } from '../utils/rpe';
import { wellnessScoreColor } from '../utils/wellness';
import { evalColor } from '../data';
import {
  playerViewIndicators, indicatorByKey, getSeries, correlateIndicators, detectRiskAlerts, injuryEpisodes,
  type CrossScope, type PlayerCrossData, type IndicatorDef, type LagMode,
} from '../data/crossAnalysis';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat } from '../data/types';

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

type Tab = 'overview' | 'stats' | 'dynamic' | 'load' | 'wellness' | 'correlations' | 'medical';

const TAB_SLUGS: Record<string, Tab> = {
  'vue-ensemble':    'overview',
  'statistiques':    'stats',
  'dynamique':       'dynamic',
  'charge-physique': 'load',
  'bien-etre':       'wellness',
  'correlations':    'correlations',
  'medical':         'medical',
};
const TABS: { key: Tab; slug: string; label: string }[] = [
  { key: 'overview',     slug: 'vue-ensemble',    label: "Vue d'ensemble" },
  { key: 'stats',        slug: 'statistiques',    label: 'Statistiques' },
  { key: 'dynamic',      slug: 'dynamique',       label: 'Dynamique' },
  { key: 'load',         slug: 'charge-physique', label: 'Charge physique' },
  { key: 'wellness',     slug: 'bien-etre',       label: 'Bien-être' },
  { key: 'correlations', slug: 'correlations',    label: 'Corrélations' },
  { key: 'medical',      slug: 'medical',         label: 'Médical / Risques' },
];

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

  // ── Données joueuse all-time (dynamique / charge physique / bien-être / statistiques) ──
  const [rpe, setRpe] = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamMatchStat>>(new Map());

  useEffect(() => {
    if (!id) return;
    Promise.all([
      rpeApi.listPlayerHistory(id),
      wellnessApi.getByPlayer(id),
    ]).then(([rpeData, wellnessData]) => {
      setRpe(rpeData);
      setWellness(wellnessData);
    });
    statsApi.getPlayerStatsGroupedBySeason(id).then(setSeasonGroupedStats);
  }, [id]);

  useEffect(() => {
    if (!id || !selected) return;
    setMatchStats([]);
    statsApi.getPlayerStatsBySeason(id, selected.season.id).then(setMatchStats);
  }, [id, selected]);

  const siblingSeasons = useMemo(
    () => selected ? seasonGroupedStats.filter(g => g.seasonLabel === selected.season.label) : [],
    [seasonGroupedStats, selected?.season.label],
  );
  const multiTeamSeason = siblingSeasons.length > 1;
  const combinedSeasonStats = useMemo(() => siblingSeasons.flatMap(g => g.stats), [siblingSeasons]);
  // Fetch systématiquement la superset (toutes équipes) dès que la saison est multi-équipes,
  // pour que teamStatsMap couvre les entrées nécessaires quel que soit le toggle "Toutes les
  // équipes" interne à PlayerStatsPanel.
  const effectiveMatchStats = multiTeamSeason ? combinedSeasonStats : matchStats;
  const matchIdsKey = useMemo(
    () => effectiveMatchStats.map(s => s.matchId).filter((mid): mid is string => !!mid).sort().join(','),
    [effectiveMatchStats],
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

  // ── Vue d'ensemble : KPIs joueuse (ex-PerformancePlayerPage) ──────────────
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

  // ── Infirmerie (ex-PerformancePlayerPage) ─────────────────────────────────
  const medInRange = pd ? pd.medical.filter(m => inRange(m.date)) : [];
  const medSorted = [...medInRange].sort((x, y) => y.date.localeCompare(x.date));
  const activeInj = medInRange.filter(m => m.type === 'injury' && m.status === 'active');
  const accentInj = activeInj.length > 0 ? '#EF4444' : medInRange.some(m => m.type === 'injury') ? '#F59E0B' : '#00E5A0';

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
        <Card><EmptyState message="Aucune joueuse dans l'effectif de cette saison." /></Card>
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

      {/* ── Barre d'onglets ── */}
      <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, marginBottom: 14, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.slug)}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap',
              backgroundColor: activeTab === t.key ? '#1E2229' : 'transparent',
              color: activeTab === t.key ? '#F1F5F9' : '#94A3B8', fontWeight: activeTab === t.key ? 600 : 400, transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab !== 'dynamic' && (
        <DateRangeCard
          from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
          onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
          onFrom={dateRange.setFrom} onTo={dateRange.setTo}
        />
      )}

      {/* ══ VUE D'ENSEMBLE ══════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-5" style={{ gap: 10 }}>
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
      )}

      {/* ══ STATISTIQUES ════════════════════════════════════════════════════ */}
      {activeTab === 'stats' && (
        <PlayerStatsPanel
          key={`${id}-${selected?.season.id ?? ''}`}
          perfRange={dateRange}
          seasonStartDate={selected?.season.startDate}
          seasonEndDate={selected?.season.endDate}
          seasonGroupedStats={seasonGroupedStats}
          matchStats={matchStats}
          multiTeamSeason={multiTeamSeason}
          combinedSeasonStats={combinedSeasonStats}
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
          ? <EmptyState message={`Aucune donnée RPE pour ${pd.player.firstName} ${pd.player.lastName}.`} />
          : <PlayerLoadPanel history={rpe} filtered={rpeFiltered} thresholds={thresholds} showSeasonDiff={showSeasonDiff} />
      )}

      {/* ══ BIEN-ÊTRE ═══════════════════════════════════════════════════════ */}
      {activeTab === 'wellness' && (
        wellnessInRange.length === 0 ? (
          <EmptyState message={`Aucune saisie bien-être pour ${pd.player.firstName} ${pd.player.lastName} sur la période sélectionnée.`} />
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

      {/* ══ MÉDICAL / RISQUES ═══════════════════════════════════════════════ */}
      {activeTab === 'medical' && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14, alignItems: 'start' }}>
          <RiskAlertsList alerts={alerts} hidePlayerName />

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
      )}
    </div>
  );
}
