import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import type { DimensionTable } from '../data/tacticalAnalysis';

/** Comparaison des options d'une dimension entre deux périodes (barres groupées). */
export function TacticalPeriodComparisonChart({ tableA, tableB, labelA, labelB }: {
  tableA: DimensionTable;
  tableB: DimensionTable;
  labelA: string;
  labelB: string;
}) {
  const labels = [...new Set([...tableA.rows.map(r => r.label), ...tableB.rows.map(r => r.label)])];
  if (labels.length === 0) return null;
  const data = labels.map(label => ({
    label,
    [labelA]: tableA.rows.find(r => r.label === label)?.actions ?? 0,
    [labelB]: tableB.rows.find(r => r.label === label)?.actions ?? 0,
  }));

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px 12px 4px' }}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} />
          <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
            labelStyle={{ color: '#94A3B8' }}
            itemStyle={{ color: '#fff' }}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
          <Bar dataKey={labelA} fill="#00E5A0" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Bar dataKey={labelB} fill="#3B82F6" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
