import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { eachDay, type IndicatorDef, type InjuryEpisode, type SeriesPoint } from '../data/crossAnalysis';
import { mondayIso, getWeekTier, buildWeekTiers } from '../utils/weeklyLoad';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

/** Au-delà de ~10 semaines, on regroupe par semaine pour garder un graphique lisible */
const WEEKLY_THRESHOLD_DAYS = 70;

interface ChartRow {
  key: string;
  a: number | null;
  b: number | null;
  injuryLabels: string[];
}

interface CrossSeries { def: IndicatorDef; points: SeriesPoint[] }

interface CrossTimelineChartProps {
  a: CrossSeries;
  b: CrossSeries;
  from: string;
  to: string;
  /** Épisodes de blessure affichés en surimpression rouge */
  injuries?: InjuryEpisode[];
  /** Seuils d'équipe — colore les barres de « Charge de séance » par palier (Normal/Soutenu/Élevée/Surcharge) */
  loadThresholds?: { lightMax: number; normalMax: number; sessionsPerWeek: number };
  height?: number;
}

function bucketize(points: SeriesPoint[], keyOf: (date: string) => string, agg: 'mean' | 'sum'): Map<string, number> {
  const grouped = new Map<string, number[]>();
  points.forEach(p => {
    const k = keyOf(p.date);
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(p.value);
  });
  const out = new Map<string, number>();
  grouped.forEach((vs, k) => {
    const sum = vs.reduce((x, y) => x + y, 0);
    out.set(k, Math.round((agg === 'sum' ? sum : sum / vs.length) * 100) / 100);
  });
  return out;
}

function SeriesChip({ def, weekly }: { def: IndicatorDef; weekly: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, backgroundColor: def.color }} />
      {def.shortLabel}
      {def.unit && <span style={{ color: '#475569' }}>({def.unit}{weekly && def.weeklyAgg === 'sum' ? '/sem' : ''})</span>}
    </span>
  );
}

export function CrossTimelineChart({ a, b, from, to, injuries = [], loadThresholds, height = 260 }: CrossTimelineChartProps) {
  const days = eachDay(from, to);
  const weekly = days.length > WEEKLY_THRESHOLD_DAYS;
  const keyOf = weekly ? mondayIso : (d: string) => d;

  // Seuils de charge : par semaine si les barres sont regroupées par semaine, par séance sinon
  const chargeHigh = loadThresholds
    ? (weekly ? loadThresholds.normalMax : Math.round(loadThresholds.normalMax / loadThresholds.sessionsPerWeek))
    : null;
  const chargeLow = loadThresholds
    ? (weekly ? loadThresholds.lightMax : Math.round(loadThresholds.lightMax / loadThresholds.sessionsPerWeek))
    : null;

  const keys = [...new Set(days.map(keyOf))].sort();
  const aVals = bucketize(a.points, keyOf, a.def.weeklyAgg && weekly ? a.def.weeklyAgg : 'mean');
  const bVals = bucketize(b.points, keyOf, b.def.weeklyAgg && weekly ? b.def.weeklyAgg : 'mean');

  // Fin de période couverte par un point (dimanche pour une semaine, le jour lui-même sinon)
  const bucketEnd = (k: string) => {
    if (!weekly) return k;
    const d = new Date(k + 'T12:00:00');
    d.setDate(d.getDate() + 6);
    return d.toLocaleDateString('sv');
  };

  const injuryOf = (k: string) =>
    injuries.filter(ep => ep.from <= bucketEnd(k) && ep.to >= k).map(ep => ep.label);

  const rows: ChartRow[] = keys.map(k => ({
    key: k,
    a: aVals.get(k) ?? null,
    b: bVals.get(k) ?? null,
    injuryLabels: injuryOf(k),
  }));

  const injuryAreas = injuries
    .map(ep => {
      const x1 = keys.find(k => bucketEnd(k) >= ep.from && k <= ep.to);
      const x2 = [...keys].reverse().find(k => k <= ep.to && bucketEnd(k) >= ep.from);
      return x1 && x2 ? { x1, x2, label: ep.label } : null;
    })
    .filter((x): x is { x1: string; x2: string; label: string } => x !== null);

  const fmtTick = (iso: string) => {
    const [, m, d] = iso.split('-');
    return weekly ? `${Number(d)} ${MONTHS[Number(m) - 1]}` : `${Number(d)}/${Number(m)}`;
  };

  const fmtValue = (def: IndicatorDef, v: number) =>
    `${def.key === 'acwr' ? v.toFixed(2) : Math.round(v * 10) / 10}${def.unit ? ` ${def.unit}` : ''}`;

  const ChartTooltipContent = ({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
        <p style={{ color: '#94A3B8', margin: '0 0 5px', fontWeight: 600 }}>{weekly ? 'Sem. du ' : ''}{fmtTick(row.key)}</p>
        {row.a !== null && <p style={{ color: a.def.color, margin: '2px 0' }}>{a.def.shortLabel} : <strong>{fmtValue(a.def, row.a)}</strong></p>}
        {row.b !== null && <p style={{ color: b.def.color, margin: '2px 0' }}>{b.def.shortLabel} : <strong>{fmtValue(b.def, row.b)}</strong></p>}
        {row.injuryLabels.map((l, i) => <p key={i} style={{ color: '#EF4444', margin: '2px 0' }}>⚕ {l}</p>)}
        {row.a === null && row.b === null && !row.injuryLabels.length && <p style={{ color: '#475569', margin: '2px 0' }}>Aucune donnée</p>}
      </div>
    );
  };

  const axisDomain = (def: IndicatorDef): [number | string, number | string] =>
    def.yDomain ?? (def.chart === 'bar' ? [0, 'auto'] : ['auto', 'auto']);

  const renderSeries = (id: 'a' | 'b', def: IndicatorDef) => {
    if (def.chart === 'bar') {
      // Charge de séance : barres colorées par palier d'équipe (Normal/Soutenu/Élevée/Surcharge)
      if (def.key === 'loadUa' && chargeHigh !== null) {
        return (
          <Bar key={id} yAxisId={id} dataKey={id} name={def.shortLabel} radius={[3, 3, 0, 0]} maxBarSize={26}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r[id] !== null ? getWeekTier(r[id]!, chargeLow ?? undefined, chargeHigh).color : 'transparent'} fillOpacity={0.65} />
            ))}
          </Bar>
        );
      }
      return <Bar key={id} yAxisId={id} dataKey={id} name={def.shortLabel} fill={def.color} fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={26} />;
    }
    if (def.chart === 'dots') {
      return (
        <Line key={id} yAxisId={id} dataKey={id} name={def.shortLabel} stroke={def.color} strokeOpacity={0.35}
          strokeWidth={1.5} strokeDasharray="3 3" connectNulls isAnimationActive={false}
          dot={{ r: 4, fill: def.color, strokeWidth: 0 }} activeDot={{ r: 6, fill: def.color }} />
      );
    }
    return (
      <Line key={id} yAxisId={id} type="monotone" dataKey={id} name={def.shortLabel} stroke={def.color}
        strokeWidth={2} connectNulls isAnimationActive={false}
        dot={{ r: 2.5, fill: def.color, strokeWidth: 0 }} activeDot={{ r: 5, fill: def.color }} />
    );
  };

  const hasData = rows.some(r => r.a !== null || r.b !== null);
  const tickInterval = Math.max(0, Math.ceil(keys.length / 10) - 1);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.7rem', color: '#94A3B8', flexWrap: 'wrap', marginBottom: 10 }}>
        <SeriesChip def={a.def} weekly={weekly} />
        <SeriesChip def={b.def} weekly={weekly} />
        {chargeHigh !== null && [a.def, b.def].some(d => d.key === 'loadUa') && (
          <span style={{ display: 'flex', gap: 6 }}>
            {buildWeekTiers(chargeLow ?? undefined, chargeHigh).map(tier => (
              <span key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, backgroundColor: tier.color }} />
                {tier.label}
              </span>
            ))}
          </span>
        )}
        {injuries.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#EF4444', fontWeight: 700 }}>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, backgroundColor: '#EF444425', border: '1.5px dashed #EF4444' }} />
            Blessure
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: '#475569' }}>{weekly ? 'Regroupé par semaine' : 'Par jour'}</span>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2229" vertical={false} />
            <XAxis dataKey="key" interval={tickInterval} tickFormatter={fmtTick}
              tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} height={22} />
            <YAxis yAxisId="a" orientation="left" domain={axisDomain(a.def)}
              tick={{ fill: a.def.color, fontSize: 10, fillOpacity: 0.85 }} axisLine={false} tickLine={false} width={40} />
            <YAxis yAxisId="b" orientation="right" domain={axisDomain(b.def)}
              tick={{ fill: b.def.color, fontSize: 10, fillOpacity: 0.85 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltipContent />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {injuryAreas.map((ep, i) => (
              <ReferenceArea key={`inj-${i}`} yAxisId="a" x1={ep.x1} x2={ep.x2}
                fill="#EF4444" fillOpacity={0.14} stroke="#EF4444" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="4 4"
                label={{ value: `⚕ ${ep.label}`, position: 'insideTop', fill: '#EF4444', fontSize: 10, fontWeight: 700 }} />
            ))}
            {/* Barres toujours dessinées en premier (donc en dessous) pour ne jamais masquer une ligne dessus */}
            {[{ id: 'a' as const, def: a.def }, { id: 'b' as const, def: b.def }]
              .sort((x, y) => (x.def.chart === 'bar' ? 0 : 1) - (y.def.chart === 'bar' ? 0 : 1))
              .map(s => renderSeries(s.id, s.def))}
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.82rem' }}>
          Aucune donnée sur cette période pour ces indicateurs
        </div>
      )}
    </div>
  );
}
