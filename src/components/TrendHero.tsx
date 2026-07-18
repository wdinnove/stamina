import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { Card } from './Card';
import { getSeries, indicatorByKey, type PlayerCrossData, type TeamCrossData, type CrossScope } from '../data/crossAnalysis';
import { mondayIso } from '../utils/weeklyLoad';
import { zoneColor } from './TrendBlocks';

const TRAILING_WEEKS = 10;
const SIGNIFICANT_PCT = 5;

function isoWeeksAgo(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return d.toLocaleDateString('sv');
}

function weeklyBuckets(points: { date: string; value: number }[], agg: 'mean' | 'sum'): number[] {
  const byWeek = new Map<string, number[]>();
  points.forEach(p => {
    const wk = mondayIso(p.date);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(p.value);
  });
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, vs]) => agg === 'sum' ? vs.reduce((s, v) => s + v, 0) : vs.reduce((s, v) => s + v, 0) / vs.length);
}

// Écart-type glissant (fenêtre pleine uniquement, cf. appelant) — mesure la variabilité locale
// d'une série ; utilisé pour dériver un indicateur de régularité à partir d'une autre série.
function rollingStdDev(values: number[], window = 3): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < window) return null;
    const m = slice.reduce((s, v) => s + v, 0) / slice.length;
    return Math.sqrt(slice.reduce((s, v) => s + (v - m) ** 2, 0) / slice.length);
  }).filter((v): v is number => v !== null);
}

function linregSlope(values: number[]): number {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
  return den === 0 ? 0 : num / den;
}

// Moyenne glissante à 3 points : sert uniquement à décider, semaine par semaine, si l'évolution
// va dans le sens de la tendance globale, sans qu'une saisie isolée ne casse le décompte de durée.
function smooth3(values: number[]): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - 2), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

export type TrendDirection = 'up' | 'down' | 'stable' | 'insufficient';

export interface Trend {
  direction: TrendDirection;
  pct: number;
  streakWeeks: number;
  values: number[];
}

/** Tendance = pente de régression sur la fenêtre (pas un delta à 2 points) + durée de la
 * série de semaines consécutives allant dans ce sens, calculée sur une version lissée. */
function computeTrend(values: number[]): Trend {
  if (values.length < 3) {
    return { direction: 'insufficient', pct: 0, streakWeeks: 0, values };
  }
  const slope = linregSlope(values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const pct = mean !== 0 ? +(slope * (values.length - 1) / Math.abs(mean) * 100).toFixed(1) : 0;
  const direction: TrendDirection = Math.abs(pct) < SIGNIFICANT_PCT ? 'stable' : pct > 0 ? 'up' : 'down';

  const smoothed = smooth3(values);
  const dirSign = direction === 'up' ? 1 : direction === 'down' ? -1 : 0;
  let streakWeeks = 1;
  for (let i = smoothed.length - 1; i >= 1; i--) {
    const d = smoothed[i] - smoothed[i - 1];
    const sign = Math.abs(d) < 0.01 ? 0 : Math.sign(d);
    if (dirSign === 0 ? sign === 0 : (sign === dirSign || sign === 0)) { streakWeeks++; continue; }
    break;
  }
  return { direction, pct, streakWeeks: Math.min(streakWeeks, values.length), values };
}

function directionMeta(direction: TrendDirection, pct: number) {
  if (direction === 'insufficient') return { color: '#475569', Icon: Minus, label: 'Données insuffisantes' };
  if (direction === 'stable')       return { color: '#475569', Icon: Minus, label: 'Stable' };
  return {
    color: zoneColor(pct, true),
    Icon: direction === 'up' ? TrendingUp : TrendingDown,
    label: direction === 'up' ? 'En hausse' : 'En baisse',
  };
}

interface Metric { key: string; label: string; trend: Trend; color: string }

export interface PlayerTrendHeroProps {
  pd: PlayerCrossData;
}

/** Hero "Forme actuelle" (joueur) — trajectoire de forme (pente + durée) affichée sur la Vue
 * d'ensemble, à côté des autres KPIs de la page. */
export function PlayerTrendHero({ pd }: PlayerTrendHeroProps) {
  return <TrendHeroBody scope={{ player: pd }} />;
}

export interface TeamTrendHeroProps {
  data: TeamCrossData;
}

/** Hero "Forme actuelle" (équipe) — même trajectoire de forme, agrégée sur tout l'effectif. */
export function TeamTrendHero({ data }: TeamTrendHeroProps) {
  return <TrendHeroBody scope={{ team: data }} />;
}

/** Verdict de forme (pente + durée) sur les {TRAILING_WEEKS} dernières semaines — perf/bien-être/
 * régularité, toutes higher-is-better. Volontairement distinct de "Par période" (qui compare
 * période choisie vs saison à 2 points) et de "Charge physique" (qui possède déjà ACWR/TSB). */
function TrendHeroBody({ scope }: { scope: CrossScope }) {
  const to = new Date().toLocaleDateString('sv');
  const from = isoWeeksAgo(TRAILING_WEEKS);

  const evalDef = indicatorByKey('eval')!;
  const wellDef = indicatorByKey('well_score')!;

  const evalWeekly = weeklyBuckets(getSeries(evalDef, scope, from, to), evalDef.weeklyAgg);
  // Régularité = tendance inverse de la variabilité locale de l'éval (écart-type glissant négé) :
  // ainsi "en hausse" veut toujours dire "mieux", comme pour les deux autres cartes.
  const regularitySeries = rollingStdDev(evalWeekly, 3).map(v => -v);

  const metrics: Metric[] = [
    { key: 'eval', label: 'Performance en match (éval)',  color: evalDef.color, trend: computeTrend(evalWeekly) },
    { key: 'well', label: 'Bien-être',                    color: wellDef.color, trend: computeTrend(weeklyBuckets(getSeries(wellDef, scope, from, to), wellDef.weeklyAgg)) },
    { key: 'reg',  label: 'Régularité (perf. en match)',  color: '#F59E0B',     trend: computeTrend(regularitySeries) },
  ];

  const meaningful = metrics.filter(m => m.trend.direction !== 'insufficient');
  const improving  = meaningful.filter(m => m.trend.direction === 'up');
  const declining  = meaningful.filter(m => m.trend.direction === 'down');

  let verdict = { label: 'Stable', color: '#475569' };
  if (meaningful.length === 0) verdict = { label: 'Données insuffisantes', color: '#475569' };
  else if (declining.length > improving.length && declining.length >= 2) verdict = { label: 'À surveiller', color: '#EF4444' };
  else if (improving.length > declining.length && improving.length >= 2) verdict = { label: 'En progression', color: '#00E5A0' };

  return (
    <Card accentColor={verdict.color}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
          backgroundColor: `${verdict.color}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Activity size={22} color={verdict.color} />
        </div>
        <div style={{ flex: 1, minWidth: 200, alignSelf: 'center' }}>
          <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
            Forme actuelle — {TRAILING_WEEKS} dernières semaines
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: verdict.color }}>{verdict.label}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignSelf: 'center' }}>
          {metrics.map(m => {
            const meta = directionMeta(m.trend.direction, m.trend.pct);
            return (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: '0.78rem', color: meta.color, fontWeight: meta.label === 'Stable' ? 400 : 700, textAlign: 'right' }}>
                  {m.label} — {meta.label.toLowerCase()}
                </span>
                <meta.Icon size={13} color={meta.color} />
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
