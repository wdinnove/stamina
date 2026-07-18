import {
  ComposedChart, Scatter, Cell, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { IndicatorDef, InjuryEpisode } from '../data/crossAnalysis';
import { linearRegression, type CorrelationPair } from '../utils/correlation';

interface CorrelationScatterChartProps {
  a: IndicatorDef;
  b: IndicatorDef;
  pairs: CorrelationPair[];
  /** Points dont la date tombe dans un épisode de blessure — mis en évidence en rouge */
  injuries?: InjuryEpisode[];
  height?: number;
}

function fmtVal(def: IndicatorDef, v: number): string {
  const num = def.key === 'acwr' ? v.toFixed(2) : def.key === 'tsb' ? v.toFixed(1) : `${Math.round(v * 10) / 10}`;
  const signed = def.key === 'tsb' && v > 0 ? `+${num}` : num;
  return `${signed}${def.unit ? ` ${def.unit}` : ''}`;
}

/** Valeur + libellé de zone (ex. « 1 · Titulaire ») — pour le tooltip uniquement, pas les axes (trop verbeux en continu) */
function fmtValWithLabel(def: IndicatorDef, v: number): string {
  const label = def.valueLabel ? ` · ${def.valueLabel(v)}` : '';
  return `${fmtVal(def, v)}${label}`;
}

function axisLabel(def: IndicatorDef): string {
  return def.unit ? `${def.shortLabel} (${def.unit})` : def.shortLabel;
}

function ScatterTooltip({ active, payload, a, b }: {
  active?: boolean; payload?: { payload: CorrelationPair & { injured?: boolean } }[]; a: IndicatorDef; b: IndicatorDef;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 5px', fontWeight: 600 }}>{p.label ?? p.date}</p>
      <p style={{ color: a.color, margin: '2px 0' }}>{a.shortLabel} : <strong>{fmtValWithLabel(a, p.x)}</strong></p>
      <p style={{ color: b.color, margin: '2px 0' }}>{b.shortLabel} : <strong>{fmtValWithLabel(b, p.y)}</strong></p>
      {p.injured && <p style={{ color: '#EF4444', margin: '4px 0 0', fontWeight: 700 }}>⚕ Période de blessure</p>}
    </div>
  );
}

/**
 * Nuage de points des paires (x, y) réellement utilisées pour calculer la corrélation,
 * avec droite de régression — répond visuellement à « ces deux facteurs sont-ils liés ? »,
 * contrairement à la chronologie croisée qui superpose deux séries indépendamment de
 * l'appariement/décalage retenu pour le calcul de r (les deux graphiques ne montrent pas
 * la même construction de données).
 */
export function CorrelationScatterChart({ a, b, pairs, injuries = [], height = 280 }: CorrelationScatterChartProps) {
  const isInjured = (date: string) => injuries.some(ep => date >= ep.from && date <= ep.to);
  const data = pairs.map(p => ({ ...p, injured: isInjured(p.date) }));

  const xs = pairs.map(p => p.x);
  const ys = pairs.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || Math.abs(xMax) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.1 || 1;

  const reg = linearRegression(xs, ys);
  const regLine = reg ? [{ x: xMin, y: reg.slope * xMin + reg.intercept }, { x: xMax, y: reg.slope * xMax + reg.intercept }] : [];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart margin={{ top: 10, right: 16, bottom: 26, left: 6 }}>
        <CartesianGrid stroke="#1E2229" strokeDasharray="3 3" />
        <XAxis
          type="number" dataKey="x" domain={[xMin - xPad, xMax + xPad]} tickFormatter={v => fmtVal(a, v)}
          tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false}
          label={{ value: axisLabel(a), position: 'insideBottom', offset: -18, fill: a.color, fontSize: 11, fontWeight: 600 }}
        />
        <YAxis
          type="number" dataKey="y" domain={[yMin - yPad, yMax + yPad]} tickFormatter={v => fmtVal(b, v)}
          tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} width={44}
          label={{ value: axisLabel(b), angle: -90, position: 'insideLeft', fill: b.color, fontSize: 11, fontWeight: 600 }}
        />
        <Tooltip content={<ScatterTooltip a={a} b={b} />} cursor={{ strokeDasharray: '3 3', stroke: '#334155' }} />
        {reg && (
          <Line data={regLine} dataKey="y" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="5 4"
            dot={false} isAnimationActive={false} legendType="none" />
        )}
        <Scatter data={data} isAnimationActive={false}>
          {data.map((p, i) => (
            <Cell key={i} fill={p.injured ? '#EF4444' : '#00E5A0'} fillOpacity={0.75}
              stroke={p.injured ? '#EF4444' : 'none'} strokeWidth={p.injured ? 1.5 : 0} />
          ))}
        </Scatter>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
