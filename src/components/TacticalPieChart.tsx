import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { DimensionTable } from '../data/tacticalAnalysis';

const PALETTE = ['#00E5A0', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7', '#14B8A6', '#F472B6', '#94A3B8'];

/** Camembert de répartition des options d'une dimension (volume d'actions). */
export function TacticalPieChart({ table }: { table: DimensionTable }) {
  if (table.rows.length === 0) return null;
  const data = table.rows.map(r => ({ name: r.label, value: r.actions }));

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px 12px' }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
            label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
            labelLine={false}
          >
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
            labelStyle={{ color: '#94A3B8' }}
            itemStyle={{ color: '#fff' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
