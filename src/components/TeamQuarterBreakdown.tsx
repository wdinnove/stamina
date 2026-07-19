import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Card, CardTitle } from './Card';
import { EmptyState } from './EmptyState';
import { fmtDate } from '../utils/dateFormat';
import type { Match } from '../data/types';

interface TeamQuarterBreakdownProps {
  matches: Match[];
}

interface QuarterAgg {
  label: string;
  avgUs: number | null;
  avgThem: number | null;
  diff: number | null;
  n: number;
  won: number;
  lost: number;
  tied: number;
}

const qtLabel = (i: number) => i < 4 ? `Q${i + 1}` : `P${i - 3}`;
const round1 = (v: number) => Math.round(v * 10) / 10;

const TH: React.CSSProperties = {
  padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'nowrap',
  borderBottom: '1px solid #2A2F3A',
};
const TD: React.CSSProperties = {
  padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
};

export function TeamQuarterBreakdown({ matches }: TeamQuarterBreakdownProps) {
  const withData = useMemo(
    () => matches.filter(m => m.quarterScores && m.quarterScores.length > 0),
    [matches],
  );

  const maxQuarters = useMemo(
    () => withData.reduce((mx, m) => Math.max(mx, m.quarterScores!.length), 0),
    [withData],
  );

  const aggs: QuarterAgg[] = useMemo(() => {
    const rows: QuarterAgg[] = [];
    for (let i = 0; i < maxQuarters; i++) {
      const vals = withData
        .map(m => m.quarterScores?.[i])
        .filter((q): q is { us: number; them: number } => !!q);
      if (vals.length === 0) {
        rows.push({ label: qtLabel(i), avgUs: null, avgThem: null, diff: null, n: 0, won: 0, lost: 0, tied: 0 });
        continue;
      }
      const avgUs   = round1(vals.reduce((s, v) => s + v.us, 0) / vals.length);
      const avgThem = round1(vals.reduce((s, v) => s + v.them, 0) / vals.length);
      rows.push({
        label: qtLabel(i), avgUs, avgThem, diff: round1(avgUs - avgThem),
        n: vals.length,
        won:  vals.filter(v => v.us > v.them).length,
        lost: vals.filter(v => v.us < v.them).length,
        tied: vals.filter(v => v.us === v.them).length,
      });
    }
    return rows;
  }, [withData, maxQuarters]);

  // Prolongations exclues du meilleur/pire QT — trop peu de matchs concernés pour être comparables
  // aux 4 quarts-temps réguliers, qui eux sont joués par toutes les équipes à chaque match.
  const regularAggs = useMemo(() => aggs.filter(a => a.n > 0 && !a.label.startsWith('P')), [aggs]);

  const bestQt = useMemo(
    () => regularAggs.length
      ? regularAggs.reduce((b, a) => (a.diff ?? -Infinity) > (b.diff ?? -Infinity) ? a : b)
      : null,
    [regularAggs],
  );
  const worstQt = useMemo(
    () => regularAggs.length
      ? regularAggs.reduce((w, a) => (a.diff ?? Infinity) < (w.diff ?? Infinity) ? a : w)
      : null,
    [regularAggs],
  );

  const chartData = useMemo(
    () => aggs.filter(a => a.n > 0).map(a => ({ label: a.label, Nous: a.avgUs, Adversaire: a.avgThem })),
    [aggs],
  );

  const sortedMatches = useMemo(() => [...withData].sort((a, b) => b.date.localeCompare(a.date)), [withData]);

  if (withData.length === 0) {
    return <Card><EmptyState message="Aucun match avec un détail quart-temps sur cette période." /></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />}
          info={`${withData.length} match${withData.length > 1 ? 's' : ''} avec détail QT`}
        >Score moyen par quart-temps</CardTitle>

        <div style={{ overflowX: 'auto' }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 14, right: 4, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
              <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, fontSize: '0.72rem' }}
                labelStyle={{ color: '#94A3B8' }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Legend wrapperStyle={{ fontSize: '0.72rem', color: '#94A3B8' }} />
              <Bar dataKey="Nous"       fill="#00E5A0" radius={[3, 3, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Adversaire" fill="#EF4444" fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {(bestQt || worstQt) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid #2A2F3A' }}>
            {bestQt && (
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: '0.66rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Meilleur quart-temps</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#00E5A0', fontFamily: 'JetBrains Mono, monospace' }}>
                  {bestQt.label} <span style={{ fontSize: '0.85rem' }}>({bestQt.diff! > 0 ? '+' : ''}{bestQt.diff})</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{bestQt.avgUs} – {bestQt.avgThem} en moyenne</div>
              </div>
            )}
            {worstQt && (
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: '0.66rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Quart-temps le plus faible</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: (worstQt.diff ?? 0) < 0 ? '#EF4444' : '#F1F5F9', fontFamily: 'JetBrains Mono, monospace' }}>
                  {worstQt.label} <span style={{ fontSize: '0.85rem' }}>({worstQt.diff! > 0 ? '+' : ''}{worstQt.diff})</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{worstQt.avgUs} – {worstQt.avgThem} en moyenne</div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle mb={12}>Détail par quart-temps</CardTitle>
        <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr>
              <th style={{ ...TH, textAlign: 'left' }}>QT</th>
              <th style={TH}>Nous (moy.)</th>
              <th style={TH}>Adversaire (moy.)</th>
              <th style={TH}>Écart</th>
              <th style={TH}>Gagnés</th>
              <th style={TH}>Perdus</th>
              <th style={TH}>Nuls</th>
            </tr></thead>
            <tbody>
              {aggs.filter(a => a.n > 0).map((a, i) => (
                <tr key={a.label} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 700 }}>{a.label}</td>
                  <td style={{ ...TD, color: '#F1F5F9' }}>{a.avgUs}</td>
                  <td style={TD}>{a.avgThem}</td>
                  <td style={{ ...TD, color: (a.diff ?? 0) > 0 ? '#00E5A0' : (a.diff ?? 0) < 0 ? '#EF4444' : '#94A3B8', fontWeight: 700 }}>
                    {(a.diff ?? 0) > 0 ? '+' : ''}{a.diff}
                  </td>
                  <td style={{ ...TD, color: '#00E5A0' }}>{a.won}</td>
                  <td style={{ ...TD, color: '#EF4444' }}>{a.lost}</td>
                  <td style={TD}>{a.tied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle mb={12} info={`${withData.length} match${withData.length > 1 ? 's' : ''}`}>Détail par match</CardTitle>
        <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
            <thead><tr>
              <th style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, backgroundColor: '#161920' }}>Adversaire</th>
              <th style={{ ...TH, textAlign: 'left' }}>Date</th>
              <th style={TH}>Score</th>
              {Array.from({ length: maxQuarters }, (_, i) => <th key={i} style={TH}>{qtLabel(i)}</th>)}
            </tr></thead>
            <tbody>
              {sortedMatches.map((m, i) => {
                const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{m.opponent}</td>
                    <td style={{ ...TD, textAlign: 'left' }}>{fmtDate(m.date)}</td>
                    <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                    {Array.from({ length: maxQuarters }, (_, qi) => {
                      const q = m.quarterScores?.[qi];
                      if (!q) return <td key={qi} style={TD}>—</td>;
                      const col = q.us > q.them ? '#00E5A0' : q.us < q.them ? '#EF4444' : '#94A3B8';
                      return <td key={qi} style={{ ...TD, color: col, fontWeight: 600 }}>{q.us}-{q.them}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
