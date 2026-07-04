import {
  ResponsiveContainer, ComposedChart, Scatter, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip, Legend, Customized,
} from 'recharts';
import type { PCAPoint, PCAVector } from '../data/pca';

interface PCABiplotProps {
  points: PCAPoint[];
  vectors: PCAVector[];
  varPct: [number, number];
  maxVectors?: number;
}

function BiplotTooltip({ active, payload }: { active?: boolean; payload?: { payload: PCAPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#F1F5F9', margin: '0 0 3px', fontWeight: 600 }}>{p.label}</p>
      <p style={{ color: p.win ? '#00E5A0' : '#EF4444', margin: 0, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.03em' }}>
        {p.win ? 'VICTOIRE' : 'DÉFAITE'}
      </p>
    </div>
  );
}

interface AxisMapEntry { scale: (v: number) => number }

function VectorLayer({ vectors, xAxisMap, yAxisMap }: { vectors: PCAVector[]; xAxisMap?: Record<string, AxisMapEntry>; yAxisMap?: Record<string, AxisMapEntry> }) {
  const xAxis = xAxisMap && Object.values(xAxisMap)[0];
  const yAxis = yAxisMap && Object.values(yAxisMap)[0];
  if (!xAxis || !yAxis) return null;
  const ox = xAxis.scale(0), oy = yAxis.scale(0);

  return (
    <g>
      <defs>
        <marker id="pca-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L8,3.5 z" fill="#7C8798" />
        </marker>
      </defs>
      {vectors.map(v => {
        const tx = xAxis.scale(v.x), ty = yAxis.scale(v.y);
        return (
          <g key={v.label}>
            <line x1={ox} y1={oy} x2={tx} y2={ty} stroke="#7C8798" strokeWidth={1.4} opacity={0.75} markerEnd="url(#pca-arrow)" />
            <text
              x={tx} y={ty} dy={ty < oy ? -6 : 14} textAnchor="middle"
              fill="#CBD5E1" fontSize={11} fontWeight={600}
              style={{ paintOrder: 'stroke', stroke: '#0D0F14', strokeWidth: 3 }}
            >
              {v.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function PCABiplot({ points, vectors, varPct, maxVectors = 12 }: PCABiplotProps) {
  const wins = points.filter(p => p.win);
  const losses = points.filter(p => !p.win);
  const shownVectors = [...vectors]
    .sort((a, b) => (b.x ** 2 + b.y ** 2) - (a.x ** 2 + a.y ** 2))
    .slice(0, maxVectors);
  const hiddenCount = vectors.length - shownVectors.length;

  const extent = Math.max(
    1e-9,
    ...points.flatMap(p => [Math.abs(p.x), Math.abs(p.y)]),
    ...vectors.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]),
  ) * 1.15;

  return (
    <div>
      <ResponsiveContainer width="100%" height={480}>
        <ComposedChart margin={{ top: 20, right: 30, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
          <XAxis
            type="number" dataKey="x" domain={[-extent, extent]} tickFormatter={v => v.toFixed(1)}
            tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#2A2F3A' }} tickLine={false}
            label={{ value: `CP1 (${varPct[0]}%)`, position: 'insideBottom', offset: -4, fill: '#64748B', fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" domain={[-extent, extent]} tickFormatter={v => v.toFixed(1)}
            tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#2A2F3A' }} tickLine={false}
            label={{ value: `CP2 (${varPct[1]}%)`, angle: -90, position: 'insideLeft', fill: '#64748B', fontSize: 11 }}
          />
          <ReferenceLine x={0} stroke="#2A2F3A" />
          <ReferenceLine y={0} stroke="#2A2F3A" />
          <Tooltip content={<BiplotTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#334155' }} />
          <Legend verticalAlign="top" align="right" iconSize={9} wrapperStyle={{ fontSize: '0.72rem', color: '#94A3B8' }} />
          <Customized component={(p: object) => <VectorLayer vectors={shownVectors} {...p} />} />
          <Scatter name="Victoire" data={wins}   fill="#00E5A0" fillOpacity={0.9} />
          <Scatter name="Défaite"  data={losses} fill="#EF4444" fillOpacity={0.9} />
        </ComposedChart>
      </ResponsiveContainer>

      {hiddenCount > 0 && (
        <p style={{ color: '#475569', fontSize: '0.68rem', textAlign: 'center', margin: '4px 0 0' }}>
          Pour garder le graphique lisible, seules les {shownVectors.length} statistiques qui pèsent le plus sont affichées, sur {vectors.length} au total.
        </p>
      )}
    </div>
  );
}
