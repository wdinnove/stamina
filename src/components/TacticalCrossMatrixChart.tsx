import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import type { CrossMatrix } from '../data/tacticalAnalysis';

const LINE_COLORS = ['#00E5A0', '#3B82F6', '#F59E0B', '#EC4899', '#A855F7', '#22D3EE', '#F97316', '#84CC16'];

/**
 * Matrice croisée en graphique : axe X = options de la dimension X, une ligne par
 * option de la dimension Y — valeur = rentabilité de la cellule (X, Y). Pas de
 * point tracé pour les cellules sans donnée (pas de faux 0).
 */
export function TacticalCrossMatrixChart({ matrix, labelX, labelY }: { matrix: CrossMatrix; labelX: string; labelY: string }) {
  if (matrix.optionsX.length === 0 || matrix.optionsY.length === 0) {
    return <p style={{ color: '#475569', fontSize: '0.8rem' }}>Aucune action n'a de valeur sur les deux dimensions.</p>;
  }

  const data = matrix.optionsX.map(x => {
    const row: Record<string, string | number | null> = { x };
    for (const y of matrix.optionsY) row[y] = matrix.cells.get(`${x}::${y}`)?.rentabilite ?? null;
    return row;
  });

  return (
    <div>
      <p style={{ color: '#64748B', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
        Rentabilité par {labelX} — une ligne par option de {labelY}
      </p>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px 12px 4px' }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
            <XAxis dataKey="x" tick={{ fill: '#475569', fontSize: 10 }} label={{ value: labelX, position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }} />
            <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
              labelStyle={{ color: '#94A3B8' }}
              itemStyle={{ color: '#fff' }}
              formatter={value => (value === null || value === undefined ? ['—'] : [Number(value).toFixed(2)])}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
            {matrix.optionsY.map((y, i) => (
              <Line key={y} dataKey={y} name={y} type="monotone" stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
