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

// Gris = pas de données ; blanc = donnée réelle mais tendance non significative (distinct visuellement,
// pour qu'un verdict "Stable" ne se confonde pas avec une carte vide/désactivée).
function directionMeta(direction: TrendDirection, pct: number, higherIsBetter: boolean) {
  if (direction === 'insufficient') return { color: '#475569', Icon: Minus, label: 'Données insuffisantes' };
  if (direction === 'stable')       return { color: '#F1F5F9', Icon: Minus, label: 'Stable' };
  return {
    color: zoneColor(pct, higherIsBetter),
    Icon: direction === 'up' ? TrendingUp : TrendingDown,
    label: direction === 'up' ? 'En hausse' : 'En baisse',
  };
}

interface Metric { key: string; label: string; trend: Trend; color: string; higherIsBetter: boolean }

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

/** Verdict de forme (pente + durée) sur les {TRAILING_WEEKS} dernières semaines — performance en
 * match, charge physique (RPE) et bien-être. Volontairement distinct de "Par période" (qui
 * compare période choisie vs saison à 2 points) et de "Charge physique" (qui possède déjà
 * ACWR/TSB). Un seul indicateur disponible suffit à colorer le verdict — pas besoin des 3. */
function TrendHeroBody({ scope }: { scope: CrossScope }) {
  const to = new Date().toLocaleDateString('sv');
  const from = isoWeeksAgo(TRAILING_WEEKS);

  const evalDef = indicatorByKey('eval')!;
  const wellDef = indicatorByKey('well_score')!;
  const rpeDef  = indicatorByKey('rpe')!;

  const metrics: Metric[] = [
    { key: 'eval', label: 'Performance en match (éval)', color: evalDef.color, higherIsBetter: true,
      trend: computeTrend(weeklyBuckets(getSeries(evalDef, scope, from, to), evalDef.weeklyAgg)) },
    { key: 'rpe',  label: 'Charge physique (RPE)',       color: rpeDef.color,  higherIsBetter: false,
      trend: computeTrend(weeklyBuckets(getSeries(rpeDef, scope, from, to), rpeDef.weeklyAgg)) },
    { key: 'well', label: 'Bien-être',                   color: wellDef.color, higherIsBetter: true,
      trend: computeTrend(weeklyBuckets(getSeries(wellDef, scope, from, to), wellDef.weeklyAgg)) },
  ];

  const meaningful = metrics.filter(m => m.trend.direction !== 'insufficient');
  const improving  = meaningful.filter(m => m.trend.direction === (m.higherIsBetter ? 'up' : 'down'));
  const declining  = meaningful.filter(m => m.trend.direction === (m.higherIsBetter ? 'down' : 'up'));

  // Blanc par défaut (pas gris) : "Stable" veut dire qu'on a une vraie donnée sans tendance
  // marquée — un gris identique à "Données insuffisantes" donnerait l'impression d'une carte
  // vide/cassée alors qu'elle a bien un verdict.
  let verdict = { label: 'Stable', color: '#F1F5F9' };
  if (meaningful.length === 0) verdict = { label: 'Données insuffisantes', color: '#475569' };
  else if (declining.length > improving.length) verdict = { label: 'À surveiller', color: '#EF4444' };
  else if (improving.length > declining.length) verdict = { label: 'En progression', color: '#00E5A0' };

  return (
    <Card accentColor={verdict.color}>
      {/* En dessous de 1100px, le bloc de métriques (largeur naturelle) n'a plus la place de
          rester à droite du titre et se met à flotter au milieu de la card quand flexWrap le
          renvoie seul sur sa propre ligne. On le force alors en pleine largeur pour qu'il
          reste proprement collé au bord droit (son alignement interne flex-end redevient correct). */}
      <style>{`
        @media (max-width: 1099px) {
          .trend-hero-metrics { width: 100%; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div
          className="w-9 h-9 md:w-[46px] md:h-[46px] [&>svg]:!w-4 [&>svg]:!h-4 md:[&>svg]:!w-[22px] md:[&>svg]:!h-[22px]"
          style={{
            borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
            backgroundColor: `${verdict.color}1F`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <Activity size={22} color={verdict.color} />
        </div>
        <div style={{ flex: 1, minWidth: 200, alignSelf: 'center' }}>
          <div className="text-[0.62rem] md:text-[0.68rem]" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
            Forme actuelle — {TRAILING_WEEKS} dernières semaines
          </div>
          <div className="text-[1.05rem] md:text-[1.3rem]" style={{ fontWeight: 800, color: verdict.color }}>{verdict.label}</div>
        </div>
        <div className="trend-hero-metrics" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignSelf: 'center' }}>
          {metrics.map(m => {
            const meta = directionMeta(m.trend.direction, m.trend.pct, m.higherIsBetter);
            return (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                <span className="text-[0.68rem] md:text-[0.78rem]" style={{ color: meta.color, fontWeight: meta.label === 'Stable' ? 400 : 700, textAlign: 'right' }}>
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
