import type { ReactNode } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';

interface ChargeBarChartProps {
  title:        ReactNode;
  sessionData:  { date: string; load: number }[];
  weekData:     { date: string; load: number }[];
  view:         'session' | 'week';
  onViewChange: (v: 'session' | 'week') => void;
  /** Seuil Surcharge — 3 tiers égaux en dessous, puis Surcharge au-delà */
  sessionHigh:  number;
  weekHigh:     number;
  height?:      number;
}

function chargeColor(v: number, t1: number, t2: number, high: number): string {
  if (v >= high) return '#EF4444';  // Surcharge rouge
  if (v >= t2)   return '#F97316';  // Élevée    orange
  if (v >= t1)   return '#EAB308';  // Soutenu   jaune
  return '#00E5A0';                  // Normal    vert
}

export function ChargeBarChart({
  title, sessionData, weekData, view, onViewChange,
  sessionHigh, weekHigh, height = 180,
}: ChargeBarChartProps) {
  const data = view === 'session' ? sessionData : weekData;
  const high = view === 'session' ? sessionHigh : weekHigh;
  const t1   = Math.round(high / 3);
  const t2   = Math.round(high * 2 / 3);
  const interval = Math.max(0, Math.floor(data.length / 8) - 1);

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{title}</p>
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
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.65rem', color: '#00E5A0' }}>{'< '}{t1.toLocaleString('fr')} Normal</span>
        <span style={{ fontSize: '0.65rem', color: '#EAB308' }}>{t1.toLocaleString('fr')}–{t2.toLocaleString('fr')} Soutenu</span>
        <span style={{ fontSize: '0.65rem', color: '#F97316' }}>{t2.toLocaleString('fr')}–{high.toLocaleString('fr')} Élevée</span>
        <span style={{ fontSize: '0.65rem', color: '#EF4444' }}>{'> '}{high.toLocaleString('fr')} Surcharge</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis dataKey="date" interval={interval} tick={{ fill: '#475569', fontSize: 10 }} />
          <YAxis domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, high) * 1.1)]} tick={{ fill: '#475569', fontSize: 10 }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="load" name="Charge" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={chargeColor(d.load, t1, t2, high)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
