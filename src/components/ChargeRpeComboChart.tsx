import type { ReactNode } from 'react';
import {
  ComposedChart, Bar, Cell, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Activity, Ambulance } from 'lucide-react';
import { rpeColor } from '../utils/rpe';
import { CardTitle } from './Card';

/** Repère "blessure" au-dessus d'une ReferenceLine — petit badge rouge avec une icône d'ambulance. */
function InjuryMarkerLabel({ viewBox }: { viewBox?: { x: number; y: number } }) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <g transform={`translate(${x - 11}, ${y - 22})`}>
      <rect width={22} height={18} rx={5} fill="#EF4444" />
      <Ambulance x={4} y={3} width={14} height={12} color="#fff" strokeWidth={2.5} />
    </g>
  );
}

interface ComboDataPoint {
  date: string;
  load: number;
  rpe:  number;
}

export interface ComboStatItem {
  label: string;
  value: ReactNode;
  sub?:  ReactNode;
  color?: string;
}

interface ChargeRpeComboChartProps {
  data:          ComboDataPoint[];
  view:          'session' | 'week';
  onViewChange:  (v: 'session' | 'week') => void;
  /** Seuil Surcharge — les 3 zones sont calculées en tiers égaux */
  high:          number;
  title?:        string;
  height?:       number;
  /** Valeurs de `date` (mêmes libellés que `data`) à marquer d'un repère — ex. dates de blessure, pour visualiser la corrélation avec un pic de charge */
  markLabels?:   string[];
  /** KPIs affichés sous le graphique, dans la même card, séparés par un filet vertical */
  statItems?:    ComboStatItem[];
}

export function ChargeRpeComboChart({
  data, view, onViewChange, high, title = 'Charge & RPE', height = 220, markLabels, statItems,
}: ChargeRpeComboChartProps) {
  const t1       = Math.round(high / 3);
  const t2       = Math.round(high * 2 / 3);
  const interval = Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px' }}>
        <CardTitle icon={<Activity size={12} style={{ color: '#00E5A0' }} />} mb={0}
          right={
            <div style={{ display: 'flex', gap: 2, backgroundColor: '#0D0F14', borderRadius: 6, padding: 2 }}>
              {(['session', 'week'] as const).map(v => (
                <button key={v} onClick={() => onViewChange(v)}
                  style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                    fontWeight: view === v ? 700 : 400,
                    backgroundColor: view === v ? '#1E2229' : 'transparent',
                    color: view === v ? '#00E5A0' : '#475569', whiteSpace: 'nowrap' }}>
                  {v === 'session' ? 'Séance' : 'Semaine'}
                </button>
              ))}
            </div>
          }>
          {title}
        </CardTitle>
      </div>

      <div style={{ padding: '4px 16px 16px' }}>
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
        {!!markLabels?.length && (
          <span style={{ fontSize: '0.65rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ambulance size={11} color="#EF4444" /> Blessure
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: markLabels?.length ? 28 : 14, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis dataKey="date" interval={interval} tick={{ fill: '#475569', fontSize: 10 }} />
          <YAxis yAxisId="load" orientation="left" tick={{ fill: '#475569', fontSize: 10 }}
            domain={[0, (m: number) => Math.ceil(Math.max(m, high) * 1.1)]}
            ticks={[0, t1, t2, high]} tickFormatter={v => v.toLocaleString('fr')} />
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
          {markLabels?.filter(l => data.some(d => d.date === l)).map(l => (
            <ReferenceLine key={l} yAxisId="load" x={l} stroke="#EF4444" strokeWidth={2}
              label={<InjuryMarkerLabel />} />
          ))}
          <Bar yAxisId="load" dataKey="load" name="UA" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => {
              const c = d.load >= high ? '#EF4444' : d.load >= t2 ? '#F97316' : d.load >= t1 ? '#EAB308' : '#00E5A0';
              return <Cell key={i} fill={c} fillOpacity={0.8} />;
            })}
          </Bar>
          <Line yAxisId="rpe" type="monotone" dataKey="rpe" name="RPE" stroke="transparent" strokeWidth={0}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, value } = props as { cx: number; cy: number; value: number };
              return (
                <g key={`d${cx}${cy}`}>
                  <circle cx={cx} cy={cy} r={11} fill={rpeColor(value)} stroke="#161920" strokeWidth={1.5} />
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="#161920">{value}</text>
                </g>
              );
            }}
            activeDot={(props: Record<string, unknown>) => {
              const { cx, cy, value } = props as { cx: number; cy: number; value: number };
              return (
                <g key={`a${cx}${cy}`}>
                  <circle cx={cx} cy={cy} r={13} fill={rpeColor(value)} stroke="#161920" strokeWidth={2} />
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#161920">{value}</text>
                </g>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {!!statItems?.length && (
        <div style={{ display: 'flex', marginTop: 16 }}>
          {statItems.map((s, i) => (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'center', padding: '0 8px',
              borderLeft: i > 0 ? '1px solid #2A2F3A' : 'none',
            }}>
              <div style={{ fontSize: '0.66rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: s.color ?? '#F1F5F9', fontFamily: 'JetBrains Mono, monospace' }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
