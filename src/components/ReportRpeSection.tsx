import { RpeKpiCard, TeamRpeSub } from './RpeKpiCard';
import { TeamSessionHistoryTable } from './TeamSessionHistoryTable';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { ReportSectionTitle } from './ReportHeader';
import { rpeColor } from '../utils/rpe';
import { getWeekTier } from '../utils/weeklyLoad';
import { fmt1 } from '../utils/format';
import type { TeamAverage } from '../utils/teamAverage';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';
import type { TeamSessionRow } from '../data/types';

/**
 * La section RPE / charge physique d'un rapport d'équipe : les chiffres clés de la période et
 * l'historique des séances. Reprend les composants de la page RPE (mêmes KPI, même tableau) —
 * un rapport ne doit pas afficher des chiffres calculés autrement que l'écran dont il est tiré.
 */
export function ReportRpeSection({
  avgWeeklyLoad, rpeAvgPeriod, sessions, weekLoads, sessionRows, thresholds,
}: {
  avgWeeklyLoad: number;
  rpeAvgPeriod: TeamAverage;
  sessions: number;
  /** Charge de chaque semaine de la période — sert à compter les semaines en surcharge. */
  weekLoads: number[];
  sessionRows: TeamSessionRow[];
  thresholds: LoadThresholds;
}) {
  const tier = getWeekTier(avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax);
  const surchargeWeeks = weekLoads.filter(load => load >= thresholds.normalMax).length;
  const sessionLoadLight  = Math.round(thresholds.lightMax  / thresholds.sessionsPerWeek);
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);

  return (
    <section style={{ marginBottom: 24 }}>
      <ReportSectionTitle label="RPE / Charge physique" />

      {sessions === 0 ? (
        <EmptyState message="Aucune séance avec RPE sur la période." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 10, marginBottom: 14 }}>
            <RpeKpiCard
              accent={tier.color}
              label="Charge moyenne par semaine"
              value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>{avgWeeklyLoad > 0 ? avgWeeklyLoad.toLocaleString('fr') : '—'}<span style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></span>
                <Badge color={tier.color} size="sm" label={tier.label} style={{ fontSize: '0.62rem' }} />
              </span>}
            />
            <RpeKpiCard
              accent={rpeAvgPeriod.value !== null ? rpeColor(rpeAvgPeriod.value) : '#334155'}
              label="RPE moyen de la période"
              value={fmt1(rpeAvgPeriod.value)}
              sub={<TeamRpeSub avg={rpeAvgPeriod} />}
            />
            <RpeKpiCard
              accent="#3B82F6"
              label="Séances"
              value={sessions}
              valueColor="#F1F5F9"
              sub="sur la période"
            />
            <RpeKpiCard
              accent={surchargeWeeks > 0 ? '#EF4444' : '#00E5A0'}
              label="Semaines surcharge"
              value={<><span style={{ color: surchargeWeeks > 0 ? '#EF4444' : '#00E5A0' }}>{surchargeWeeks}</span><span style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 400 }}> / {weekLoads.length}</span></>}
              valueColor="#F1F5F9"
              sub={weekLoads.length > 0 ? `${Math.round(surchargeWeeks / weekLoads.length * 100)} % des semaines` : '—'}
            />
          </div>

          <TeamSessionHistoryTable
            rows={sessionRows}
            sessionLoadLight={sessionLoadLight}
            sessionLoadNormal={sessionLoadNormal}
            lightMax={thresholds.lightMax}
            normalMax={thresholds.normalMax}
          />
        </>
      )}
    </section>
  );
}
