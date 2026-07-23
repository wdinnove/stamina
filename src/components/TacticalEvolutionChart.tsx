import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import type { CategoryEvolutionPoint } from '../data/tacticalAnalysis';

/**
 * Évolution match par match d'une catégorie : barres = Actions, ligne = Rentabilité.
 * N'a de sens qu'à partir de 2 matchs — sinon ne rend rien.
 */
export function TacticalEvolutionChart({ points }: { points: CategoryEvolutionPoint[] }) {
  if (points.length < 2) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ color: '#64748B', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
        Évolution match par match
      </p>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px 12px 4px' }}>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={points} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
            <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 10 }} />
            <YAxis yAxisId="actions" orientation="left" tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
            <YAxis yAxisId="rentabilite" orientation="right" hide domain={[0, (max: number) => Math.max(max * 1.1, 1)]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
              labelStyle={{ color: '#94A3B8' }}
              itemStyle={{ color: '#fff' }}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              formatter={(value: number, name: string) => [name === 'Rentabilité' ? value.toFixed(2) : value, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
            <Bar yAxisId="actions" dataKey="actions" name="Actions" fill="#00E5A0" fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Line yAxisId="rentabilite" dataKey="rentabilite" name="Rentabilité" type="monotone" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3, fill: '#3B82F6' }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
