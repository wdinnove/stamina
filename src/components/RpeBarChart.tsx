import type { ReactNode } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { RPE_ZONES, rpeColor } from '../utils/rpe';

interface RpeBarChartProps {
  title: ReactNode;
  sessionData: { date: string; rpe: number }[];
  weekData:    { date: string; rpe: number }[];
  view:        'session' | 'week';
  onViewChange: (v: 'session' | 'week') => void;
  height?: number;
}

export function RpeBarChart({
  title, sessionData, weekData, view, onViewChange, height = 180,
}: RpeBarChartProps) {
  const data     = view === 'session' ? sessionData : weekData;
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        {RPE_ZONES.map(z => (
          <span key={z.label} style={{ fontSize: '0.65rem', color: z.color }}>{z.label}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis dataKey="date" interval={interval} tick={{ fill: '#475569', fontSize: 10 }} />
          <YAxis domain={[0, 10]} tick={{ fill: '#475569', fontSize: 10 }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="rpe" name="RPE" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => {
              const c = rpeColor(d.rpe);
              return <Cell key={i} fill={c} fillOpacity={0.85} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
