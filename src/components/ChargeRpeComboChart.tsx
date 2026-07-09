import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Activity } from 'lucide-react';
import { rpeColor } from '../utils/rpe';
import { CardTitle } from './Card';

interface ComboDataPoint {
  date: string;
  load: number;
  rpe:  number;
}

interface ChargeRpeComboChartProps {
  data:          ComboDataPoint[];
  view:          'session' | 'week';
  onViewChange:  (v: 'session' | 'week') => void;
  /** Seuil Surcharge — les 3 zones sont calculées en tiers égaux */
  high:          number;
  title?:        string;
  height?:       number;
}

export function ChargeRpeComboChart({
  data, view, onViewChange, high, title = 'Charge & RPE', height = 220,
}: ChargeRpeComboChartProps) {
  const t1       = Math.round(high / 3);
  const t2       = Math.round(high * 2 / 3);
  const interval = Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
      <CardTitle icon={<Activity size={12} style={{ color: '#00E5A0' }} />} mb={10}
        right={
          <div style={{ display: 'flex', gap: 2, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, padding: 2 }}>
            {(['session', 'week'] as const).map(v => (
              <button key={v} onClick={() => onViewChange(v)}
                style={{ padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.68rem',
                  backgroundColor: view === v ? '#2A2F3A' : 'transparent',
                  color: view === v ? '#F1F5F9' : '#475569', transition: 'all 0.12s' }}>
                {v === 'session' ? 'Séance' : 'Semaine'}
              </button>
            ))}
          </div>
        }>
        {title}
      </CardTitle>

      <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.65rem', color: '#00E5A0' }}>{'< '}{t1.toLocaleString('fr')} Normal</span>
        <span style={{ fontSize: '0.65rem', color: '#EAB308' }}>{t1.toLocaleString('fr')}–{t2.toLocaleString('fr')} Soutenu</span>
        <span style={{ fontSize: '0.65rem', color: '#F97316' }}>{t2.toLocaleString('fr')}–{high.toLocaleString('fr')} Élevée</span>
        <span style={{ fontSize: '0.65rem', color: '#EF4444' }}>{'> '}{high.toLocaleString('fr')} Surcharge</span>
        <span style={{ width: 1, height: 12, backgroundColor: '#2A2F3A', display: 'inline-block' }} />
        <span style={{ fontSize: '0.65rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#94A3B8' }} />
          RPE (couleur zone)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis dataKey="date" interval={interval} tick={{ fill: '#475569', fontSize: 10 }} />
          <YAxis yAxisId="load" orientation="left" tick={{ fill: '#475569', fontSize: 10 }}
            domain={[0, (m: number) => Math.ceil(Math.max(m, high) * 1.1)]} />
          <YAxis yAxisId="rpe" orientation="right" domain={[0, 10]} hide />
          <Tooltip
            contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
            labelStyle={{ color: '#94A3B8' }}
            itemStyle={{ color: '#fff' }}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <ReferenceLine yAxisId="load" y={high} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.25} />
          <ReferenceLine yAxisId="load" y={t2}   stroke="#F97316" strokeDasharray="4 4" strokeOpacity={0.25} />
          <ReferenceLine yAxisId="load" y={t1}   stroke="#EAB308" strokeDasharray="4 4" strokeOpacity={0.25} />
          <Bar yAxisId="load" dataKey="load" name="UA" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => {
              const c = d.load >= high ? '#EF4444' : d.load >= t2 ? '#F97316' : d.load >= t1 ? '#EAB308' : '#00E5A0';
              return <Cell key={i} fill={c} fillOpacity={0.8} />;
            })}
          </Bar>
          <Line yAxisId="rpe" type="monotone" dataKey="rpe" name="RPE" stroke="transparent" strokeWidth={0}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, value } = props as { cx: number; cy: number; value: number };
              return <circle key={`d${cx}${cy}`} cx={cx} cy={cy} r={5} fill={rpeColor(value)} stroke="#161920" strokeWidth={1.5} />;
            }}
            activeDot={(props: Record<string, unknown>) => {
              const { cx, cy, value } = props as { cx: number; cy: number; value: number };
              return <circle key={`a${cx}${cy}`} cx={cx} cy={cy} r={7} fill={rpeColor(value)} stroke="#161920" strokeWidth={2} />;
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
