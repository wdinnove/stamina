import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from 'recharts';
import { Download, Share2, Save } from 'lucide-react';
import { rpeColor as rpeColorHex } from '../utils/rpe';
import RichTextEditor from '../components/RichTextEditor';
import { players, rpeEntries, medicalRecords, teamMatchStats, playerSeasonAvg, formatDate, evalColor } from '../data';
import { KPICard, PlayerAvatar, StatusBadge } from '../components';

const t1Players = players.filter(p => p.teamId === 't1');

function makeHeatmap() {
  const days = [];
  const base = new Date('2026-01-15');
  for (let i = 20; i >= 0; i--) {
    const d = new Date(base); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const es = rpeEntries.filter(e => e.date === ds);
    const avg = es.length ? +(es.reduce((s, e) => s + e.rpe, 0) / es.length).toFixed(1) : 0;
    days.push({ date: ds, avg, label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3) });
  }
  return days;
}
const heatmapDays = makeHeatmap();
const rpeColor = (v: number) => {
  if (!v) return { bg: '#1E2229', border: '#2A2F3A', text: '#475569' };
  const c = rpeColorHex(v);
  return { bg: c + '33', border: c, text: c };
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
};

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '6px 8px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', background: '#1E2229' }}>
    {children}
  </th>
);
const Td = ({ children, highlight, left }: { children: React.ReactNode; highlight?: string; left?: boolean }) => (
  <td style={{ padding: '7px 8px', textAlign: left ? 'left' : 'center', color: highlight ?? '#F1F5F9', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.79rem', borderBottom: '1px solid #2A2F3A22' }}>
    {children}
  </td>
);

export default function TeamReportPage() {
  const [metric, setMetric] = useState<'pts' | 'rt' | 'pd' | 'eval'>('pts');
  const [comment, setComment] = useState('Phase aller difficile avec un déficit en rebonds offensifs. Le collectif progresse tactiquement mais doit réduire les ballons perdus. La densité défensive doit être renforcée avant le match retour contre Antibes.');
  const [saved, setSaved] = useState(false);

  const activePlayers = t1Players.filter(p => p.status === 'active').length;
  const allRPE = rpeEntries.filter(e => t1Players.some(p => p.id === e.playerId));
  const avgRPE = allRPE.length ? +(allRPE.reduce((s, e) => s + e.rpe, 0) / allRPE.length).toFixed(1) : 0;
  const totalInjuries = medicalRecords.filter(r => r.type === 'injury').length;
  const totalDaysLost = medicalRecords.filter(r => r.type === 'injury').reduce((s, r) => s + (r.daysAbsent || 0), 0);
  const wins = teamMatchStats.filter(t => t.result === 'win').length;
  const losses = teamMatchStats.filter(t => t.result === 'loss').length;

  const metricLabels: Record<string, string> = { pts: 'Points', rt: 'Rebonds', pd: 'Passes déc.', eval: 'Évaluation' };

  const allAvgs = t1Players.map(p => ({ player: p, avg: playerSeasonAvg(p.id) })).filter(d => d.avg.gp > 0);

  const barData = allAvgs
    .map(d => ({ name: d.player.lastName, value: d.avg[metric as keyof typeof d.avg] as number }))
    .sort((a, b) => b.value - a.value)
    .map((d, i) => ({ ...d, idx: i }));

  // Évolution offensive/défensive par match
  const matchEvolution = teamMatchStats.slice().reverse().map((tm, i) => ({
    idx: i,
    date: formatDate(tm.date).slice(0, 5),
    offRating: tm.offRating,
    defRating: tm.defRating,
    efgPct: tm.efgPct,
    orebPct: tm.orebPct,
    toPct: tm.toPct,
  }));

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Bilan Équipe</h1>
          <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '3px 0 0' }}>AL Meyzieu · NF2 · Saison 2025/26</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select style={{ padding: '7px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
            <option>Saison 2025/26</option>
          </select>
          <button style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Share2 size={14} /> Partager
          </button>
          <button style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#00E5A0', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> PDF
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5" style={{ gap: 10, marginBottom: 14 }}>
        <KPICard label="Bilan" value={`${wins}V - ${losses}D`} accentColor="#3B82F6" trendLabel={`${teamMatchStats.length} matchs`} />
        <KPICard label="Effectif" value={activePlayers} unit={`/ ${t1Players.length}`} accentColor="#00E5A0" trendLabel="joueurs disponibles" />
        <KPICard label="RPE moyen" value={avgRPE} accentColor="#F59E0B" trendLabel="charge collective" trend={0} />
        <KPICard label="Blessures" value={totalInjuries} accentColor="#EF4444" trendLabel={`${totalDaysLost} jours perdus`} trend={-1} />
        <KPICard label="Bien-être" value="6.8" unit="/10" accentColor="#8B5CF6" trendLabel="équipe" trend={0} />
      </div>

      {/* Comparatif + Évolution */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14, marginBottom: 14 }}>
        {/* Bar chart */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ color: '#F1F5F9', margin: 0 }}>Comparatif joueurs</h3>
            <select value={metric} onChange={e => setMetric(e.target.value as any)}
              style={{ padding: '4px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.78rem', outline: 'none' }}>
              {Object.entries(metricLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} layout="vertical" barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="idx" tickFormatter={(idx) => barData[idx]?.name ?? ''} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" fill="#00E5A0" radius={[0, 4, 4, 0]} fillOpacity={0.85} name={metricLabels[metric]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Évolution Off/Def Rating */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <h3 style={{ color: '#F1F5F9', marginBottom: 12 }}>Off. / Def. Rating par match</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={matchEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
              <XAxis dataKey="idx" tickFormatter={(idx) => matchEvolution[idx]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[60, 170]} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '0.72rem', color: '#94A3B8' }} />
              <Line dataKey="offRating" stroke="#00E5A0" strokeWidth={2} dot={{ r: 4 }} name="Off. Rating" />
              <Line dataKey="defRating" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} name="Def. Rating" />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ color: '#475569', fontSize: '0.7rem', margin: '6px 0 0' }}>Off. Rating &gt; Def. Rating = performance positive</p>
        </div>
      </div>

      {/* Stats avancées par match */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto', marginBottom: 14 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2F3A' }}>
          <h3 style={{ color: '#F1F5F9', margin: 0 }}>Stats avancées — par match</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              <Th>Date</Th><Th>Adversaire</Th><Th>Score</Th>
              <Th>Poss.</Th><Th>eFG%</Th><Th>Off Rat.</Th><Th>Def Rat.</Th>
              <Th>TO%</Th><Th>OREB%</Th><Th>DREB%</Th><Th>FT Rate</Th>
            </tr>
          </thead>
          <tbody>
            {teamMatchStats.map((tm, i) => (
              <tr key={i}>
                <Td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: '#94A3B8' }}>{formatDate(tm.date)}</span></Td>
                <Td>
                  <span style={{ fontSize: '0.72rem' }}>{tm.result === 'win' ? '🟢' : '🔴'} </span>
                  <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>{tm.opponent}</span>
                </Td>
                <Td highlight={tm.result === 'win' ? '#00E5A0' : '#EF4444'}>{tm.scoreUs}-{tm.scoreThem}</Td>
                <Td>{tm.possessions}</Td>
                <Td highlight={tm.efgPct >= 48 ? '#00E5A0' : '#EF4444'}>{tm.efgPct}%</Td>
                <Td highlight={tm.offRating > 90 ? '#00E5A0' : tm.offRating >= 60 ? '#F59E0B' : '#EF4444'}>{tm.offRating.toFixed(1)}</Td>
                <Td highlight={tm.defRating <= 100 ? '#00E5A0' : '#EF4444'}>{tm.defRating.toFixed(1)}</Td>
                <Td highlight={tm.toPct <= 15 ? '#00E5A0' : '#EF4444'}>{tm.toPct}%</Td>
                <Td highlight={tm.orebPct >= 35 ? '#00E5A0' : '#94A3B8'}>{tm.orebPct}%</Td>
                <Td highlight={tm.drebPct >= 65 ? '#00E5A0' : '#94A3B8'}>{tm.drebPct}%</Td>
                <Td>{tm.ftRate.toFixed(2)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Heatmap */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px', marginBottom: 14 }}>
        <h3 style={{ color: '#F1F5F9', marginBottom: 12 }}>Heatmap charge collective (21 jours)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
          {heatmapDays.map((day, i) => {
            const cfg = rpeColor(day.avg);
            return (
              <div key={i} title={`${day.date} — RPE: ${day.avg || 'Repos'}`}
                style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}44`, borderRadius: 5, padding: '5px 2px', textAlign: 'center' }}>
                <p style={{ color: '#475569', fontSize: '0.55rem', margin: '0 0 2px' }}>{day.label}</p>
                <p style={{ color: cfg.text, fontWeight: 700, fontSize: '0.78rem', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{day.avg || '—'}</p>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          {[['#00E5A0', '0–4 Facile'], ['#EAB308', '5–6 Soutenu'], ['#F97316', '7 Difficile'], ['#EF4444', '8–10 Extrême']].map(([c, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c + '44', border: `1px solid ${c}` }} />
              <span style={{ color: '#94A3B8', fontSize: '0.68rem' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tableau récapitulatif joueurs */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto', marginBottom: 14 }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2F3A' }}>
          <h3 style={{ color: '#F1F5F9', margin: 0 }}>Moyennes / match — toutes joueurs</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <Th>Joueur</Th><Th>MJ</Th><Th>MIN</Th><Th>PTS</Th>
              <Th>2%</Th><Th>3%</Th><Th>L%</Th>
              <Th>RT</Th><Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th><Th>ÉVAL</Th><Th>+/-</Th>
            </tr>
          </thead>
          <tbody>
            {allAvgs.map(({ player, avg }) => (
              <tr key={player.id} onClick={() => navigate(`/players/${player.id}`)} style={{ cursor: 'pointer' }}>
                <Td left>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlayerAvatar player={player} size={22} />
                    <span style={{ fontFamily: 'Inter, sans-serif', color: '#F1F5F9', fontSize: '0.82rem' }}>
                      {player.firstName} {player.lastName}
                    </span>
                    <StatusBadge status={player.status} size="sm" />
                  </div>
                </Td>
                <Td>{avg.gp}</Td><Td>{avg.min}</Td>
                <Td highlight={Number(avg.pts) >= 12 ? '#00E5A0' : undefined}>{avg.pts}</Td>
                <Td highlight="#F59E0B">{avg.fg2pct}%</Td>
                <Td highlight="#3B82F6">{avg.fg3pct}%</Td>
                <Td highlight="#8B5CF6">{avg.ftpct}%</Td>
                <Td highlight={Number(avg.rt) >= 6 ? '#F59E0B' : undefined}>{avg.rt}</Td>
                <Td highlight={Number(avg.pd) >= 5 ? '#3B82F6' : undefined}>{avg.pd}</Td>
                <Td>{avg.ct}</Td><Td>{avg.intercepts}</Td>
                <Td highlight={Number(avg.bp) >= 6 ? '#EF4444' : undefined}>{avg.bp}</Td>
                <Td highlight={evalColor(Number(avg.eval))}>{avg.eval}</Td>
                <Td highlight={Number(avg.plusMinus) > 0 ? '#00E5A0' : '#EF4444'}>
                  {Number(avg.plusMinus) > 0 ? `+${avg.plusMinus}` : avg.plusMinus}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Blessures */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 14 }}>
        <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Blessures Saison</h3>
        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10 }}>
          {[
            { l: 'Blessures', v: totalInjuries, c: '#EF4444' },
            { l: 'Jours perdus', v: totalDaysLost, c: '#F59E0B' },
            { l: 'Zone dom.', v: 'Cheville 50%', c: '#94A3B8' },
            { l: 'Blessés act.', v: medicalRecords.filter(r => r.status === 'active' && r.type === 'injury').length, c: '#EF4444' },
          ].map(s => (
            <div key={s.l} style={{ padding: '10px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `3px solid ${s.c}` }}>
              <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{s.l}</p>
              <p style={{ color: s.c, fontSize: '1.1rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommandations */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 14 }}>
        <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Recommandations</h3>
        <RichTextEditor value={comment} onChange={setComment} placeholder="Recommandations, axes d'amélioration…" minHeight={80} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button style={{ padding: '10px 18px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Rapport complet PDF
        </button>
        <button
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          style={{ padding: '10px 18px', backgroundColor: saved ? '#1E2229' : '#00E5A0', border: saved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: saved ? '#00E5A0' : '#0D0F14', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
          <Save size={14} />
          {saved ? '✓ Sauvegardé !' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
