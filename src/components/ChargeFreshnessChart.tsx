import {
  ComposedChart, Bar, Cell, XAxis, YAxis, Customized,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { RPEEntry } from '../data/types';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const MS_DAY = 86400000;

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

interface WeekPoint { key: string; label: string; load: number; tsb: number | null; sessionCount: number; }
interface DayMetric { date: string; atl: number; ctl: number; tsb: number; }

const tsbZoneLabel = (tsb: number) =>
  tsb <= -30 ? 'Surmenage' : tsb <= -10 ? 'Chargé' : tsb <= 5 ? 'Zone peak' : 'Frais';
const tsbLineColor = (tsb: number) =>
  tsb <= -30 ? '#EF4444' : tsb <= -10 ? '#F59E0B' : tsb <= 5 ? '#00E5A0' : '#60A5FA';

function ChartTooltipContent({ active, payload }: { active?: boolean; payload?: { payload: WeekPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 5px', fontWeight: 600 }}>Sem. du {d.label}</p>
      {d.load > 0 && (
        <p style={{ color: '#F1F5F9', margin: '2px 0' }}>
          Charge : <strong>{d.load} UA</strong>
          <span style={{ color: '#475569', marginLeft: 4 }}>({d.sessionCount} séance{d.sessionCount > 1 ? 's' : ''})</span>
        </p>
      )}
      {d.tsb !== null && (
        <p style={{ color: tsbLineColor(d.tsb), margin: '2px 0' }}>
          Fraîcheur : <strong>{d.tsb > 0 ? '+' : ''}{d.tsb} TSB</strong>
          <span style={{ color: '#475569', marginLeft: 4 }}>· {tsbZoneLabel(d.tsb)}</span>
        </p>
      )}
      {!d.load && d.tsb === null && <p style={{ color: '#475569', margin: '2px 0' }}>Semaine vide</p>}
    </div>
  );
}

export function ChargeFreshnessChart({ rpe, from, to }: { rpe: RPEEntry[]; from: string; to: string }) {
  const periodStart = new Date((from || new Date(Date.now() - 21 * MS_DAY).toISOString().split('T')[0]) + 'T00:00:00');
  const periodEnd   = new Date(to + 'T00:00:00');

  // Seuils de charge hebdomadaire calculés sur tout l'historique RPE
  const allWeekMap = new Map<string, number>();
  rpe.forEach(r => {
    const k = mondayIso(new Date(r.date + 'T00:00:00'));
    allWeekMap.set(k, (allWeekMap.get(k) ?? 0) + r.rpe * (r.actualDuration ?? r.plannedDuration));
  });
  const allWeekLoads = Array.from(allWeekMap.values()).filter(l => l > 0);
  const avgWeekLoad  = allWeekLoads.length ? allWeekLoads.reduce((a, b) => a + b, 0) / allWeekLoads.length : 3000;

  const barColor = (load: number): string => {
    if (!load) return '#2A2F3A';
    if (load >= avgWeekLoad * 1.4) return '#EF4444';
    if (load >= avgWeekLoad * 1.0) return '#F59E0B';
    if (load >= avgWeekLoad * 0.6) return '#60A5FA';
    return '#00E5A0';
  };

  const weeks = generateWeeks(periodStart, periodEnd);
  const weekData: WeekPoint[] = weeks.map(({ monday }) => {
    const monIso = monday.toISOString().split('T')[0];
    const sunIso = new Date(monday.getTime() + 6 * MS_DAY).toISOString().split('T')[0];
    const weekRpe = rpe.filter(r => r.date >= monIso && r.date <= sunIso);
    return {
      key: monIso,
      label: `${monday.getDate()} ${MONTHS[monday.getMonth()]}`,
      load: weekRpe.reduce((s, r) => s + r.rpe * (r.actualDuration ?? r.plannedDuration), 0),
      tsb: null,
      sessionCount: weekRpe.length,
    };
  });

  // PMC : ATL / CTL / TSB (modèle de Banister), calculé depuis toute l'historique RPE
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
      const tsb  = +(ctlV - atlV).toFixed(1);
      atlV = atlV * (1 - 1 / 7)  + load * (1 / 7);
      ctlV = ctlV * (1 - 1 / 42) + load * (1 / 42);
      pmcAllMetrics.push({ date: iso, atl: +atlV.toFixed(1), ctl: +ctlV.toFixed(1), tsb });
      cur.setDate(cur.getDate() + 1);
    }
  }

  weekData.forEach(w => {
    const sunIso = new Date(new Date(w.key + 'T00:00:00').getTime() + 6 * MS_DAY).toISOString().split('T')[0];
    const inWeek = pmcAllMetrics.filter(m => m.date >= w.key && m.date <= sunIso);
    w.tsb = inWeek.length ? +(inWeek.reduce((s, m) => s + m.tsb, 0) / inWeek.length).toFixed(1) : null;
  });

  const tsbVals = weekData.map(w => w.tsb).filter((v): v is number => v !== null);
  const tsbDomain: [number, number] = tsbVals.length
    ? [Math.min(Math.min(...tsbVals) - 5, -25), Math.max(Math.max(...tsbVals) + 5, 15)]
    : [-25, 15];
  const tsbDisplayDomain: [number, number] = [-tsbDomain[1], -tsbDomain[0]];

  const TsbLine = ({ xAxisMap, yAxisMap }: any) => {
    const xAxis = Object.values(xAxisMap ?? {})[0] as any;
    const yAxis = (yAxisMap ?? {})['tsb'] as any;
    if (!xAxis?.scale || !yAxis?.scale) return null;
    const bw = typeof xAxis.scale.bandwidth === 'function' ? xAxis.scale.bandwidth() : 0;
    const pts = weekData
      .filter(d => d.tsb !== null)
      .map(d => ({ x: xAxis.scale(d.label) + bw / 2, y: yAxis.scale(-d.tsb!), tsb: d.tsb! }));
    if (pts.length < 1) return null;
    return (
      <g>
        {pts.slice(1).map((p, i) => (
          <line key={i} x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y}
            stroke={tsbLineColor((pts[i].tsb + p.tsb) / 2)} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {pts.map((p, i) => <circle key={`d-${i}`} cx={p.x} cy={p.y} r={3} fill={tsbLineColor(p.tsb)} />)}
      </g>
    );
  };

  const maxWeekLoad   = Math.max(...weekData.map(w => w.load), 1);
  const hasData       = weekData.some(w => w.load > 0);
  const tickInterval  = weekData.length > 20 ? 2 : weekData.length > 10 ? 1 : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.66rem', color: '#94A3B8', flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[{ c: '#00E5A0', l: 'Légère' }, { c: '#60A5FA', l: 'Normale' }, { c: '#F59E0B', l: 'Élevée' }, { c: '#EF4444', l: 'Surcharge' }].map(({ c, l }) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: c, borderRadius: 2 }} />{l}
            </span>
          ))}
        </div>
        <div style={{ width: 1, height: 14, backgroundColor: '#2A2F3A' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width="28" height="8">
            <line x1="0" y1="4" x2="7" y2="4" stroke="#EF4444" strokeWidth="2.5" />
            <line x1="7" y1="4" x2="14" y2="4" stroke="#F59E0B" strokeWidth="2.5" />
            <line x1="14" y1="4" x2="21" y2="4" stroke="#00E5A0" strokeWidth="2.5" />
            <line x1="21" y1="4" x2="28" y2="4" stroke="#60A5FA" strokeWidth="2.5" />
          </svg>
          Fraîcheur ↑surmenage ↓frais
        </span>
      </div>

      {hasData ? (
        <div style={{ flex: 1, minHeight: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={weekData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2229" vertical={false} />
              <XAxis dataKey="label" interval={tickInterval}
                tick={{ fill: '#64748B', fontSize: 9 }} axisLine={false} tickLine={false} height={20} />
              <YAxis yAxisId="load" orientation="left" domain={[0, maxWeekLoad * 1.25]}
                tick={{ fill: '#64748B', fontSize: 9 }} axisLine={false} tickLine={false} width={36}
                tickFormatter={(v: number) => v > 0 ? String(v) : ''} />
              <YAxis yAxisId="tsb" orientation="right" domain={tsbDisplayDomain} hide />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar yAxisId="load" dataKey="load" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {weekData.map((w, i) => <Cell key={`cell-${i}`} fill={barColor(w.load)} fillOpacity={0.75} />)}
              </Bar>
              <Customized component={TsbLine} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.82rem' }}>
          Aucune activité sur cette période
        </div>
      )}
    </div>
  );
}
