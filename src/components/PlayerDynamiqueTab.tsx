import {
  ComposedChart, Bar, Cell, Area, Line, XAxis, YAxis, LabelList, Customized,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts';
import type { RPEEntry, WellnessEntry, MatchStat } from '../data/types';
import { DateRangeCard, useDateRange } from './DateRangeCard';
import { wellnessScoreColor } from '../utils/wellness';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

// ── Week helpers ──────────────────────────────────────────────────────────────
function mondayOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = r.getDay() === 0 ? 7 : r.getDay();
  r.setDate(r.getDate() - (dow - 1));
  return r;
}
function mondayIso(d: Date) { return mondayOf(d).toISOString().split('T')[0]; }

function generateWeeks(from: Date, to: Date) {
  const start = mondayOf(from);
  const weeks: { key: string; monday: Date }[] = [];
  const cur = new Date(start);
  while (cur <= to) {
    weeks.push({ key: cur.toISOString().split('T')[0], monday: new Date(cur) });
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function acwrZone(v: number): { label: string; color: string } {
  if (v < 0.5)  return { label: 'Sous-entraîné',  color: '#94A3B8' };
  if (v < 0.8)  return { label: 'Charge faible',  color: '#60A5FA' };
  if (v <= 1.3) return { label: 'Zone optimale',  color: '#00E5A0' };
  if (v <= 1.5) return { label: 'Vigilance',      color: '#F59E0B' };
  return           { label: 'Surcharge',          color: '#EF4444' };
}

const wellColor = wellnessScoreColor;
const n = (v: unknown): number => Number(v);

function trendOf(curr: number | null, base: number | null) {
  if (curr === null || base === null) return null;
  const diff = curr - base;
  if (Math.abs(diff) < 0.15) return { sym: '→', color: '#94A3B8', label: '~' };
  const pct = base !== 0 ? ((diff / Math.abs(base)) * 100).toFixed(0) : '0';
  return diff > 0
    ? { sym: '↑', color: '#00E5A0', label: `+${pct}%` }
    : { sym: '↓', color: '#EF4444', label: `${pct}%` };
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, sub, value, base, unit, baseLabel, color }: {
  title: string; sub: string; value: number | null; base: number | null;
  unit: string; baseLabel: string; color: string;
}) {
  const t = trendOf(value, base);
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 8 }}>{sub}</div>
      {value !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: '1.7rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{unit}</span>
            {t && <span style={{ fontSize: '1rem', color: t.color, marginLeft: 2 }}>{t.sym}</span>}
          </div>
          {base !== null && (
            <div style={{ fontSize: '0.7rem', marginTop: 5 }}>
              {value === base
                ? <span style={{ color: '#475569' }}>{baseLabel} : {base}{unit} <span style={{ color: '#64748B' }}>= moy.</span></span>
                : <span style={{ color: '#475569' }}>{baseLabel} : {base}{unit}{t && <span style={{ color: t.color, marginLeft: 5 }}>{t.label}</span>}</span>
              }
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: '0.8rem', color: '#475569' }}>—</div>
      )}
    </div>
  );
}

// ── Week data ─────────────────────────────────────────────────────────────────
interface WeekPoint {
  key: string; label: string;
  load: number;
  wellness: number | null;
  matchEval: number | null;
  tsb: number | null;
  sessionCount: number;
  matchCount: number;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function DynTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeekPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const tsbLabel = d.tsb === null ? null
    : d.tsb <= -30 ? 'Surmenage'
    : d.tsb <= -10 ? 'Chargé'
    : d.tsb <=   5 ? 'Zone peak'
    : 'Frais';
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 5px', fontWeight: 600 }}>Sem. du {d.label}</p>
      {d.load > 0 && (
        <p style={{ color: '#F1F5F9', margin: '2px 0' }}>
          Charge : <strong>{d.load} UA</strong>
          <span style={{ color: '#475569', marginLeft: 4 }}>({d.sessionCount} séance{d.sessionCount > 1 ? 's' : ''})</span>
        </p>
      )}
      {d.wellness !== null && <p style={{ color: '#F59E0B', margin: '2px 0' }}>Bien-être : <strong>{d.wellness}/10</strong></p>}
      {d.tsb !== null && (() => {
        const zc = d.tsb <= -30 ? '#EF4444' : d.tsb <= -10 ? '#F59E0B' : d.tsb <= 5 ? '#00E5A0' : '#60A5FA';
        return (
          <p style={{ color: zc, margin: '2px 0' }}>
            Fraîcheur : <strong>{d.tsb > 0 ? '+' : ''}{d.tsb} TSB</strong>
            <span style={{ color: '#475569', marginLeft: 4 }}>· {tsbLabel}</span>
          </p>
        );
      })()}
      {d.matchEval !== null && (
        <p style={{ color: '#60A5FA', margin: '2px 0' }}>
          Éval : <strong>{d.matchEval}</strong>
          <span style={{ color: '#475569', marginLeft: 4 }}>({d.matchCount} match{d.matchCount > 1 ? 's' : ''})</span>
        </p>
      )}
      {!d.load && d.wellness === null && d.tsb === null && d.matchEval === null && <p style={{ color: '#475569', margin: '2px 0' }}>Semaine vide</p>}
    </div>
  );
}

// ── PMC helpers ───────────────────────────────────────────────────────────────
interface DayMetric { date: string; label: string; atl: number; ctl: number; tsb: number; }

function tsbZone(tsb: number): { label: string; color: string } {
  if (tsb <= -30) return { label: 'Surmenage',     color: '#EF4444' };
  if (tsb <= -10) return { label: 'Chargé',        color: '#F59E0B' };
  if (tsb <=   5) return { label: 'Zone peak',     color: '#00E5A0' };
  return                 { label: 'Sous-entraîné', color: '#60A5FA' };
}

function PmcTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayMetric }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const { label: zLabel, color: zColor } = tsbZone(d.tsb);
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 5px', fontWeight: 600 }}>{d.label}</p>
      <p style={{ color: '#60A5FA', margin: '2px 0' }}>CTL <em style={{ color: '#475569', fontSize: '0.7rem' }}>(forme)</em> : <strong>{d.ctl}</strong></p>
      <p style={{ color: '#F59E0B', margin: '2px 0' }}>ATL <em style={{ color: '#475569', fontSize: '0.7rem' }}>(fatigue)</em> : <strong>{d.atl}</strong></p>
      <p style={{ color: zColor, margin: '2px 0' }}>TSB <em style={{ color: '#475569', fontSize: '0.7rem' }}>(fraîcheur)</em> : <strong>{d.tsb > 0 ? '+' : ''}{d.tsb}</strong>
        <span style={{ color: '#475569', marginLeft: 5 }}>· {zLabel}</span>
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props { rpe: RPEEntry[]; wellness: WellnessEntry[]; matchStats: MatchStat[]; seasonStart?: string; }

export function PlayerDynamiqueTab({ rpe, wellness, matchStats, seasonStart }: Props) {
  const dateRange = useDateRange(seasonStart, 45);

  const periodStart = new Date((dateRange.from || new Date(Date.now() - 21 * 86400000).toISOString().split('T')[0]) + 'T00:00:00');
  const periodEnd   = new Date(dateRange.to   + 'T00:00:00');
  const msDay = 86400000;

  // ── ACWR bounds ──
  const d7  = new Date(Date.now() - 7  * msDay);
  const d28 = new Date(Date.now() - 28 * msDay);

  // ── Filtered data for KPIs ──
  const inRange  = (iso: string) => iso >= dateRange.from && iso <= dateRange.to;
  const rpeP     = rpe.filter(r => inRange(r.date));
  const wellP    = wellness.filter(w => inRange(w.date));
  const matchPE  = matchStats.filter(m => inRange(m.date) && m.eval !== null);

  // ── Season baselines ──
  const rpeAvgAll  = avg(rpe.map(r => r.rpe));
  const wellAvgAll = avg(wellness.map(w => n(w.score)));
  const evalAvgAll = avg(matchStats.filter(m => m.eval !== null).map(m => m.eval!));

  const rpeAvgP   = avg(rpeP.map(r => r.rpe));
  const wellAvgP  = avg(wellP.map(w => n(w.score)));
  const evalAvgP  = avg(matchPE.map(m => m.eval!));
  const sleepAvgP = avg(wellP.map(w => n(w.sleep)));

  const rpeDisplay  = rpeAvgP  ?? rpeAvgAll;
  const wellDisplay = wellAvgP ?? wellAvgAll;
  const evalDisplay = evalAvgP ?? evalAvgAll;

  const subLabel = dateRange.preset === 7 ? '7 derniers jours'
    : dateRange.preset === 21 ? '21 derniers jours'
    : dateRange.preset === 45 ? '45 derniers jours'
    : dateRange.preset === 90 ? '90 derniers jours'
    : dateRange.preset === 'phase1' ? 'Phase 1'
    : dateRange.preset === 'phase2' ? 'Phase 2'
    : dateRange.preset === 'saison' ? 'Saison complète'
    : `${dateRange.from} → ${dateRange.to}`;

  // ── ACWR ──
  const load7d  = rpe.filter(r => new Date(r.date) >= d7).reduce((s, r) => s + r.rpe * (r.actualDuration ?? r.plannedDuration), 0);
  const chronic = rpe.filter(r => new Date(r.date) >= d28).reduce((s, r) => s + r.rpe * (r.actualDuration ?? r.plannedDuration), 0) / 4;
  const acwr    = chronic > 0 ? +(load7d / chronic).toFixed(2) : null;

  // ── Weekly load thresholds (from ALL rpe history) ──
  const allWeekMap = new Map<string, number>();
  rpe.forEach(r => {
    const k = mondayIso(new Date(r.date + 'T00:00:00'));
    allWeekMap.set(k, (allWeekMap.get(k) ?? 0) + r.rpe * (r.actualDuration ?? r.plannedDuration));
  });
  const allWeekLoads = Array.from(allWeekMap.values()).filter(l => l > 0);
  const avgWeekLoad  = allWeekLoads.length ? allWeekLoads.reduce((a, b) => a + b, 0) / allWeekLoads.length : 3000;

  // Colors: légère → normale → élevée → surcharge
  const barColor = (load: number): string => {
    if (!load) return '#2A2F3A';
    if (load >= avgWeekLoad * 1.4) return '#EF4444';
    if (load >= avgWeekLoad * 1.0) return '#F59E0B';
    if (load >= avgWeekLoad * 0.6) return '#60A5FA';
    return '#00E5A0';
  };

  // ── Weekly chart data ──
  const weeks = generateWeeks(periodStart, periodEnd);
  const weekData: WeekPoint[] = weeks.map(({ monday }) => {
    const monIso = monday.toISOString().split('T')[0];
    const sun    = new Date(monday.getTime() + 6 * msDay);
    const sunIso = sun.toISOString().split('T')[0];

    const weekRpe     = rpe.filter(r => r.date >= monIso && r.date <= sunIso);
    const weekWell    = wellness.filter(w => w.date >= monIso && w.date <= sunIso);
    const weekMatches = matchStats.filter(m => m.date >= monIso && m.date <= sunIso && m.eval !== null);

    const load = weekRpe.reduce((s, r) => s + r.rpe * (r.actualDuration ?? r.plannedDuration), 0);
    const wellnessAvg = weekWell.length
      ? +( weekWell.reduce((s, w) => s + n(w.score), 0) / weekWell.length ).toFixed(1)
      : null;
    const evalAvg = weekMatches.length
      ? +( weekMatches.reduce((s, m) => s + m.eval!, 0) / weekMatches.length ).toFixed(1)
      : null;

    return {
      key:          monIso,
      label:        `${monday.getDate()} ${MONTHS[monday.getMonth()]}`,
      load,
      wellness:     wellnessAvg,
      matchEval:    evalAvg,
      tsb:          null as number | null,
      sessionCount: weekRpe.length,
      matchCount:   weekMatches.length,
    };
  });

  // ── PMC: ATL / CTL / TSB (calcul depuis toute l'historique RPE) ──
  const dailyLoadMap = new Map<string, number>();
  rpe.forEach(r => {
    const load = r.rpe * (r.actualDuration ?? r.plannedDuration);
    dailyLoadMap.set(r.date, (dailyLoadMap.get(r.date) ?? 0) + load);
  });

  const pmcAllMetrics: DayMetric[] = [];
  if (rpe.length > 0) {
    const firstRpeDate = [...rpe.map(r => r.date)].sort()[0];
    const pmcStart = new Date(firstRpeDate + 'T00:00:00');
    const pmcEnd   = new Date(); pmcEnd.setHours(0, 0, 0, 0);
    let atlV = 0, ctlV = 0;
    const cur = new Date(pmcStart);
    while (cur <= pmcEnd) {
      const iso  = cur.toISOString().split('T')[0];
      const load = dailyLoadMap.get(iso) ?? 0;
      const tsb  = +(ctlV - atlV).toFixed(1); // fraîcheur = état d'avant la séance du jour
      atlV = atlV * (1 - 1/7)  + load * (1/7);
      ctlV = ctlV * (1 - 1/42) + load * (1/42);
      pmcAllMetrics.push({
        date:  iso,
        label: `${cur.getDate()} ${MONTHS[cur.getMonth()]}`,
        atl:   +atlV.toFixed(1),
        ctl:   +ctlV.toFixed(1),
        tsb,
      });
      cur.setDate(cur.getDate() + 1);
    }
  }

  const pmcData  = pmcAllMetrics.filter(m => m.date >= dateRange.from && m.date <= dateRange.to);
  const pmcToday = pmcAllMetrics[pmcAllMetrics.length - 1] ?? null;

  // TSB moyen par semaine (pour le bandeau)
  const weekTsb = weekData.map(w => {
    const sunIso = new Date(new Date(w.key + 'T00:00:00').getTime() + 6 * msDay).toISOString().split('T')[0];
    const inWeek = pmcData.filter(m => m.date >= w.key && m.date <= sunIso);
    const tsb    = inWeek.length
      ? +(inWeek.reduce((s, m) => s + m.tsb, 0) / inWeek.length).toFixed(1)
      : null;
    return { key: w.key, label: w.label, tsb };
  });
  const bandLabelEvery = Math.max(1, Math.ceil(weekTsb.length / 8));

  // Merge TSB into weekData
  weekTsb.forEach((wt, i) => { weekData[i].tsb = wt.tsb; });

  const tsbVals    = weekData.map(w => w.tsb).filter((v): v is number => v !== null);
  const tsbDomain: [number, number] = tsbVals.length
    ? [Math.min(Math.min(...tsbVals) - 5, -25), Math.max(Math.max(...tsbVals) + 5, 15)]
    : [-25, 15];
  // Axe inversé : haut = surmenage (TSB très négatif), bas = frais (TSB positif)
  const tsbDisplayDomain: [number, number] = [-tsbDomain[1], -tsbDomain[0]];

  const tsbLineColor = (tsb: number) =>
    tsb <= -30 ? '#EF4444' : tsb <= -10 ? '#F59E0B' : tsb <= 5 ? '#00E5A0' : '#60A5FA';

  // Composant Recharts custom : dessine la ligne TSB segment par segment avec couleur par zone
  const TsbLine = ({ xAxisMap, yAxisMap }: any) => {
    const xAxis = Object.values(xAxisMap ?? {})[0] as any;
    const yAxis = (yAxisMap ?? {})['tsb'] as any;
    if (!xAxis?.scale || !yAxis?.scale) return null;
    const bw = typeof xAxis.scale.bandwidth === 'function' ? xAxis.scale.bandwidth() : 0;
    const pts = weekData
      .filter(d => d.tsb !== null)
      .map(d => ({
        x: xAxis.scale(d.label) + bw / 2,
        y: yAxis.scale(-d.tsb!),   // inverser ici : affiche -TSB sur l'axe
        tsb: d.tsb!,
      }));
    if (pts.length < 1) return null;
    return (
      <g>
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y}
            stroke={tsbLineColor((pts[i].tsb + p.tsb) / 2)}
            strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {pts.map((p, i) => (
          <circle key={`d-${i}`} cx={p.x} cy={p.y} r={3} fill={tsbLineColor(p.tsb)} />
        ))}
      </g>
    );
  };

  const maxWeekLoad = Math.max(...weekData.map(w => w.load), 1);
  const hasData = weekData.some(w => w.load > 0 || w.wellness !== null);

  const tickInterval = weekData.length > 20 ? 2 : weekData.length > 10 ? 1 : 0;

  // ── Signals ──
  const signals: { type: 'w' | 'g' | 'i'; text: string }[] = [];
  if (acwr !== null && acwr > 1.3 && wellAvgP !== null && wellAvgP < 6)
    signals.push({ type: 'w', text: 'Charge élevée + bien-être bas — risque de surmenage' });
  if (acwr !== null && acwr > 1.5)
    signals.push({ type: 'w', text: `ACWR élevé (${acwr}) — pic de charge à surveiller` });
  if (acwr !== null && acwr < 0.5 && rpe.length > 3)
    signals.push({ type: 'i', text: 'Charge très faible — risque de désentraînement' });
  if (sleepAvgP !== null && sleepAvgP < 6)
    signals.push({ type: 'w', text: `Sommeil faible sur la période — moy. ${sleepAvgP}/10` });
  if (wellAvgP !== null && wellAvgAll !== null && wellAvgP < wellAvgAll - 0.5)
    signals.push({ type: 'w', text: `Bien-être sous la moyenne saison (${wellAvgP} vs ${wellAvgAll})` });
  if (wellAvgP !== null && wellAvgAll !== null && wellAvgP > wellAvgAll + 0.5)
    signals.push({ type: 'g', text: `Bien-être au-dessus de la moyenne saison (${wellAvgP} vs ${wellAvgAll})` });
  if (evalAvgP !== null && evalAvgAll !== null && evalAvgP > evalAvgAll + 1)
    signals.push({ type: 'g', text: `Éval. match en hausse vs saison (+${(evalAvgP - evalAvgAll).toFixed(1)})` });
  if (evalAvgP !== null && evalAvgAll !== null && evalAvgP < evalAvgAll - 1)
    signals.push({ type: 'w', text: `Éval. match en baisse vs saison (${(evalAvgP - evalAvgAll).toFixed(1)})` });

  if (!rpe.length && !wellness.length && !matchStats.length) {
    return <div style={{ padding: '48px 0', textAlign: 'center', color: '#475569', fontSize: '0.9rem' }}>Aucune donnée enregistrée pour ce joueur.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, seasonStart)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
        style={{ marginBottom: 0 }}
      />

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 10 }}>

        {/* État actuel (PMC) — first on the row */}
        {pmcToday ? (() => {
          const { label: zLabel, color: zColor } = tsbZone(pmcToday.tsb);
          return (
            <div style={{ backgroundColor: '#161920', border: `1px solid ${zColor}35`, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>État actuel</div>
              <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 8 }}>TSB · fraîcheur du jour</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: '1.7rem', fontWeight: 700, color: zColor, lineHeight: 1 }}>
                  {pmcToday.tsb > 0 ? '+' : ''}{pmcToday.tsb}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>TSB</span>
              </div>
              <div style={{ fontSize: '0.7rem', marginTop: 5 }}>
                <span style={{ color: zColor }}>{zLabel}</span>
                <span style={{ color: '#475569', marginLeft: 8 }}>Forme <strong style={{ color: '#60A5FA' }}>{pmcToday.ctl}</strong> · Fat. <strong style={{ color: '#F59E0B' }}>{pmcToday.atl}</strong></span>
              </div>
            </div>
          );
        })() : (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>État actuel</div>
            <div style={{ fontSize: '0.68rem', color: '#475569', marginBottom: 8 }}>TSB · fraîcheur du jour</div>
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>—</div>
          </div>
        )}

        <KpiCard title="RPE moyen" sub={rpeAvgP !== null ? subLabel : 'Moy. saison'}
          value={rpeDisplay} base={rpeAvgAll} unit="/10" baseLabel="moy. saison"
          color={rpeDisplay !== null ? (rpeDisplay <= 5 ? '#00E5A0' : rpeDisplay <= 7 ? '#F59E0B' : '#EF4444') : '#94A3B8'} />
        <KpiCard title="Bien-être" sub={wellAvgP !== null ? subLabel : 'Moy. saison'}
          value={wellDisplay} base={wellAvgAll} unit="/10" baseLabel="moy. saison"
          color={wellDisplay !== null ? wellColor(wellDisplay) : '#94A3B8'} />
        <KpiCard title="Éval. match" sub={evalAvgP !== null ? `${matchPE.length} match${matchPE.length > 1 ? 's' : ''} · ${subLabel}` : 'Moy. saison'}
          value={evalDisplay} base={evalAvgAll} unit="" baseLabel="moy. saison"
          color="#60A5FA" />
      </div>

      {/* ── Graphique ── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 8px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 12, marginBottom: 12 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#F1F5F9' }}>Dynamique hebdomadaire</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.7rem', color: '#94A3B8', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ c: '#00E5A0', l: 'Légère' }, { c: '#60A5FA', l: 'Normale' }, { c: '#F59E0B', l: 'Élevée' }, { c: '#EF4444', l: 'Surcharge' }].map(({ c, l }) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: c, borderRadius: 2 }} />
                  {l}
                </span>
              ))}
            </div>
            <div style={{ width: 1, height: 14, backgroundColor: '#2A2F3A' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 14, height: 2, backgroundColor: '#F59E0B' }} />Bien-être
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="28" height="8">
                <line x1="0" y1="4" x2="7" y2="4" stroke="#EF4444" strokeWidth="2.5" />
                <line x1="7" y1="4" x2="14" y2="4" stroke="#F59E0B" strokeWidth="2.5" />
                <line x1="14" y1="4" x2="21" y2="4" stroke="#00E5A0" strokeWidth="2.5" />
                <line x1="21" y1="4" x2="28" y2="4" stroke="#60A5FA" strokeWidth="2.5" />
              </svg>
              Fraîcheur ↑surmenage ↓frais
            </span>
            <div style={{ width: 1, height: 14, backgroundColor: '#2A2F3A' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 22, height: 14, borderRadius: 7, backgroundColor: '#60A5FA15', border: '1px solid #60A5FA60', fontSize: '0.6rem', color: '#60A5FA', fontWeight: 700, textAlign: 'center', lineHeight: '14px' }}>éval</span>
              Éval. match
            </span>
          </div>
        </div>

        {hasData ? (
          <ResponsiveContainer width="100%" height={225}>
            <ComposedChart data={weekData} margin={{ top: 30, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2229" vertical={false} />
              <XAxis dataKey="label" interval={tickInterval}
                tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} height={24} />
              <YAxis yAxisId="load" orientation="left" domain={[0, maxWeekLoad * 1.25]}
                tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} width={42}
                tickFormatter={(v: number) => v > 0 ? String(v) : ''} />
              <YAxis yAxisId="score" orientation="right" domain={[0, 10]}
                tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
              <YAxis yAxisId="tsb" orientation="right" domain={tsbDisplayDomain} hide />
              <Tooltip content={<DynTooltip />} />

              {/* Barres de charge + badges éval en haut */}
              <Bar yAxisId="load" dataKey="load" radius={[3, 3, 0, 0]} maxBarSize={48}>
                {weekData.map((w, i) => (
                  <Cell key={`cell-${i}`} fill={barColor(w.load)} fillOpacity={0.75} />
                ))}
                <LabelList dataKey="matchEval" content={(props: any) => {
                  const val = props.value;
                  if (val === null || val === undefined) return <g />;
                  const cx = Number(props.x ?? 0) + Number(props.width ?? 0) / 2;
                  const c  = evalAvgAll !== null
                    ? val >= evalAvgAll + 2 ? '#00E5A0' : val <= evalAvgAll - 2 ? '#EF4444' : '#F59E0B'
                    : '#60A5FA';
                  const r  = String(val).length >= 3 ? 11 : 9;
                  const cy = 16;
                  return (
                    <g key={`badge-${props.index}`}>
                      <circle cx={cx} cy={cy} r={r} fill={`${c}20`} stroke={c} strokeWidth={1} />
                      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                        fill={c} fontSize={8} fontWeight={700}>{val}</text>
                    </g>
                  );
                }} />
              </Bar>

              {/* Bien-être */}
              <Line yAxisId="score" dataKey="wellness"
                stroke="#F59E0B" strokeWidth={2} type="monotone"
                dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }} connectNulls />

              {/* Fraîcheur TSB — ligne colorée par zone (custom) */}
              <Customized component={TsbLine} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.82rem' }}>
            Aucune activité sur cette période
          </div>
        )}
      </div>

      {/* ── Bandeau de zones TSB ── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#F1F5F9' }}>Fraîcheur hebdomadaire</span>
          <div style={{ display: 'flex', gap: 8, fontSize: '0.68rem' }}>
            {[{ c: '#EF4444', l: 'Surmenage' }, { c: '#F59E0B', l: 'Chargé' }, { c: '#00E5A0', l: 'Zone peak' }, { c: '#60A5FA', l: 'Frais' }].map(({ c, l }) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#64748B' }}>
                <span style={{ width: 8, height: 8, backgroundColor: c, borderRadius: 2, opacity: 0.75, display: 'inline-block' }} />
                {l}
              </span>
            ))}
          </div>
        </div>

        {weekTsb.length > 0 ? (
          <>
            <div style={{ display: 'flex', gap: 2 }}>
              {weekTsb.map(w => {
                const zone = w.tsb !== null ? tsbZone(w.tsb) : null;
                return (
                  <div key={w.key}
                    title={w.tsb !== null
                      ? `Sem. du ${w.label}\nTSB : ${w.tsb > 0 ? '+' : ''}${w.tsb}\n${zone!.label}`
                      : `Sem. du ${w.label}\nAucune séance`}
                    style={{ flex: 1, height: 36, borderRadius: 3, backgroundColor: zone ? zone.color : '#1E2229', opacity: zone ? 0.72 : 0.25 }}
                  />
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 2, marginTop: 5 }}>
              {weekTsb.map((w, i) => (
                <div key={w.key} style={{ flex: 1, fontSize: '0.6rem', color: '#475569', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {i % bandLabelEvery === 0 ? w.label : ''}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ height: 40, display: 'flex', alignItems: 'center', color: '#475569', fontSize: '0.8rem' }}>
            Aucun RPE enregistré
          </div>
        )}
      </div>

      {/* ── ACWR + Signaux ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>

        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>Ratio Charge (ACWR)</div>
          {acwr !== null ? (() => {
            const { label, color } = acwrZone(acwr);
            const pct = Math.min((acwr / 2) * 100, 100);
            return (
              <>
                <div style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>{acwr}</div>
                <div style={{ fontSize: '0.73rem', color, marginTop: 3, marginBottom: 10 }}>{label}</div>
                <div style={{ height: 6, backgroundColor: '#2A2F3A', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: '0.62rem', color: '#475569' }}>
                  <span>0</span><span style={{ color: '#00E5A070' }}>0.8–1.3</span><span>2+</span>
                </div>
                <div style={{ marginTop: 10, fontSize: '0.72rem', color: '#475569' }}>
                  Charge 7j : <strong style={{ color: '#94A3B8' }}>{load7d} UA</strong>
                </div>
              </>
            );
          })() : (
            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.6 }}>
              {rpe.length === 0 ? 'Aucun RPE enregistré' : <>Données insuffisantes<br /><span style={{ fontSize: '0.7rem' }}>28 jours requis</span></>}
            </div>
          )}
        </div>

        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>Signaux croisés</div>
          {rpeP.length === 0 && wellP.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>Pas d'activité sur la période sélectionnée.</div>
          ) : signals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signals.map((s, i) => {
                const c  = s.type === 'w' ? '#EF4444' : s.type === 'g' ? '#00E5A0' : '#94A3B8';
                const bg = s.type === 'w' ? '#EF444415' : s.type === 'g' ? '#00E5A015' : '#94A3B815';
                const ic = s.type === 'w' ? '⚠' : s.type === 'g' ? '✓' : 'i';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.8rem' }}>
                    <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: c }}>{ic}</span>
                    <span style={{ color: s.type === 'w' ? '#FCA5A5' : c, lineHeight: 1.4 }}>{s.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#475569' }}>Aucun signal particulier.</div>
          )}
        </div>
      </div>

    </div>
  );
}
