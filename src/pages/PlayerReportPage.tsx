import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend } from 'recharts';
import { Download, Printer, Save, ArrowLeft } from 'lucide-react';
import { players, getPlayerById, getPlayerRPE, getPlayerWellness, getPlayerMedical, getPlayerActions, getPlayerStats, playerSeasonAvg, fg2Pct, fg3Pct, ftPct, formatDate, getAge } from '../data';
import { PlayerAvatar, StatusBadge } from '../components';

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', background: '#1E2229' }}>
    {children}
  </th>
);
const Td = ({ children, highlight, left }: { children: React.ReactNode; highlight?: string; left?: boolean }) => (
  <td style={{ padding: '7px 8px', textAlign: left ? 'left' : 'center', color: highlight ?? '#F1F5F9', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', borderBottom: '1px solid #2A2F3A22' }}>
    {children}
  </td>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
};

export default function PlayerReportPage() {
  const navigate = useNavigate();
  const [selectedPlayer, setSelectedPlayer] = useState('p1');
  const [comment, setComment] = useState('Saison régulière avec une belle efficacité offensive. Sa vision de jeu et son leadership sont des atouts majeurs pour le collectif. À surveiller : la gestion des ballons perdus lors des sorties de pressing adverse.');
  const [saved, setSaved] = useState(false);

  const player = getPlayerById(selectedPlayer);
  const rpe = getPlayerRPE(selectedPlayer);
  const wellness = getPlayerWellness(selectedPlayer);
  const medical = getPlayerMedical(selectedPlayer);
  const actions = getPlayerActions(selectedPlayer);
  const stats = getPlayerStats(selectedPlayer);
  const avg = playerSeasonAvg(selectedPlayer);
  const t1Players = players.filter(p => p.teamId === 't1');

  const resolvedInjuries = medical.filter(m => m.status === 'resolved' && m.type === 'injury').length;
  const totalDaysLost = medical.filter(m => m.type === 'injury').reduce((s, m) => s + (m.daysAbsent || 0), 0);
  const availability = avg.gp ? Math.round(avg.gp / 14 * 100) : 0;
  const doneActions = actions.filter(a => a.status === 'done').length;
  const actionRate = actions.length ? Math.round(doneActions / actions.length * 100) : 0;

  const avgRpe = rpe.length ? +(rpe.slice(0, 20).reduce((s, e) => s + e.rpe, 0) / Math.min(rpe.length, 20)).toFixed(1) : 0;
  const avgWellness = wellness.length ? +(wellness.slice(0, 14).reduce((s, e) => s + e.score, 0) / Math.min(wellness.length, 14)).toFixed(1) : 0;

  const radarData = [
    { key: 'Tir 2pts', value: avg.fg2pct },
    { key: 'Tir 3pts', value: avg.fg3pct },
    { key: 'LT%', value: avg.ftpct },
    { key: 'Rebonds', value: Math.min(100, avg.rt * 10) },
    { key: 'Passes', value: Math.min(100, avg.pd * 10) },
    { key: 'Éval.', value: Math.min(100, avg.eval * 5) },
  ];

  const lineData = stats.slice().reverse().map((m, i) => ({
    idx: i,
    date: m.date.slice(5).replace('-', '/'),
    pts: m.pts, eval: m.eval, rpe: rpe.find(r => r.date === m.date)?.rpe ?? null,
  }));

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/players')} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Retour
        </button>
        <span style={{ color: '#2A2F3A' }}>|</span>
        <h1 style={{ color: '#F1F5F9', margin: 0, flex: 1 }}>Bilan Joueur</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={14} /> Imprimer
          </button>
          <button style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#00E5A0', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Exporter PDF
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <select value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
          style={{ padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}>
          {t1Players.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
        </select>
        <select style={{ padding: '8px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
          <option>Saison 2025/26</option>
        </select>
      </div>

      {player && (
        <>
          {/* Identity */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <PlayerAvatar player={player} size={58} />
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#F1F5F9', margin: 0 }}>{player.firstName} {player.lastName}</h2>
                <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '3px 0 5px' }}>
                  #{player.number} · {player.position} · {getAge(player.birthDate)} ans · {player.height} cm / {player.weight} kg
                </p>
                <StatusBadge status={player.status} />
              </div>
              {/* Snapshot moyennes */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {[['PTS', avg.pts, '#00E5A0'], ['REB', avg.rt, '#F59E0B'], ['PD', avg.pd, '#3B82F6'], ['ÉVAL', avg.eval, '#8B5CF6'], ['2%', `${avg.fg2pct}%`, '#94A3B8'], ['3%', `${avg.fg3pct}%`, '#94A3B8'], ['L%', `${avg.ftpct}%`, '#94A3B8']].map(([l, v, c]) => (
                  <div key={l as string} style={{ textAlign: 'center' }}>
                    <p style={{ color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase', margin: 0 }}>{l}</p>
                    <p style={{ color: c as string, fontWeight: 800, fontSize: '1.1rem', margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Santé */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 10 }}>
            <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Santé & Disponibilité</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { l: 'Disponibilité', v: `${availability}%`, c: availability >= 75 ? '#00E5A0' : '#F59E0B' },
                { l: 'Matchs joués', v: `${avg.gp} / 14`, c: '#F1F5F9' },
                { l: 'Blessures', v: resolvedInjuries, c: '#F59E0B' },
                { l: 'Jours perdus', v: totalDaysLost, c: '#EF4444' },
              ].map(s => (
                <div key={s.l} style={{ padding: '10px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                  <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{s.l}</p>
                  <p style={{ color: s.c, fontSize: '1.2rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charge & Bien-être */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 10 }}>
            <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Charge & Bien-être</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  {[['RPE moyen', avgRpe, '#00E5A0'], ['Bien-être', avgWellness, avgWellness >= 7 ? '#00E5A0' : '#F59E0B']].map(([l, v, c]) => (
                    <div key={l as string} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                      <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{l}</p>
                      <p style={{ color: c as string, fontSize: '1.2rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{v} / 10</p>
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="idx" tickFormatter={(idx) => lineData[idx]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 9 }} axisLine={false} tickLine={false} width={20} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line dataKey="rpe" stroke="#00E5A0" strokeWidth={2} dot={false} name="RPE" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#1E2229', borderRadius: 6, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                {[['#00E5A0', 'RPE charge perçue'], ['#3B82F6', 'Score bien-être'], ['#EF4444', 'Zone surcharge (ACWR>1.5)']].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 2, backgroundColor: c }} />
                    <span style={{ color: '#94A3B8', fontSize: '0.73rem' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats performance */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 10 }}>
            <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Performances — Moyennes / match</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 16 }}>
              <div>
                {/* Shooting */}
                <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 6 }}>Tirs</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  {[
                    [`${avg.fg2m}/${avg.fg2a}`, `${avg.fg2pct}%`, '2pts', '#F59E0B'],
                    [`${avg.fg3m}/${avg.fg3a}`, `${avg.fg3pct}%`, '3pts', '#3B82F6'],
                    [`${avg.ftm}/${avg.fta}`, `${avg.ftpct}%`, 'LT', '#8B5CF6'],
                  ].map(([attempts, pct, label, color]) => (
                    <div key={label as string} style={{ padding: '10px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `3px solid ${color}` }}>
                      <p style={{ color: '#475569', fontSize: '0.68rem', margin: '0 0 2px' }}>{label}</p>
                      <p style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{attempts}</p>
                      <p style={{ color: color as string, fontSize: '0.82rem', fontWeight: 800, margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>{pct}</p>
                    </div>
                  ))}
                </div>
                {/* Autres */}
                <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: 6 }}>Autres stats</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[
                    ['PTS', avg.pts, '#00E5A0'], ['REB', avg.rt, '#F59E0B'], ['PD', avg.pd, '#3B82F6'],
                    ['CT', avg.ct, '#00E5A0'], ['IN', avg.intercepts, '#00E5A0'], ['BP', avg.bp, '#EF4444'],
                    ['ÉVAL', avg.eval, '#8B5CF6'], ['+/-', Number(avg.plusMinus) > 0 ? `+${avg.plusMinus}` : avg.plusMinus, Number(avg.plusMinus) >= 0 ? '#00E5A0' : '#EF4444'],
                  ].map(([l, v, c]) => (
                    <div key={l as string} style={{ padding: '8px', backgroundColor: '#1E2229', borderRadius: 5 }}>
                      <p style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase', margin: 0 }}>{l}</p>
                      <p style={{ color: c as string, fontWeight: 800, fontSize: '0.95rem', margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Radar */}
              <div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#2A2F3A" />
                    <PolarAngleAxis dataKey="key" tick={{ fill: '#94A3B8', fontSize: 9 }} />
                    <Radar dataKey="value" stroke="#00E5A0" fill="#00E5A0" fillOpacity={0.15} strokeWidth={2} name="Joueur" />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Table match par match condensée */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto', marginBottom: 10 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2F3A' }}>
              <h3 style={{ color: '#F1F5F9', margin: 0 }}>Match par match</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Adversaire</Th><Th>MIN</Th><Th>PTS</Th>
                  <Th>2%</Th><Th>3%</Th><Th>L%</Th>
                  <Th>RT</Th><Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th><Th>ÉVAL</Th><Th>+/-</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map((m, i) => (
                  <tr key={i}>
                    <Td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: '#94A3B8' }}>{formatDate(m.date)}</span></Td>
                    <Td left={false}>
                      <span style={{ fontSize: '0.72rem' }}>{m.result === 'win' ? '🟢' : '🔴'} </span>
                      <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif' }}>{m.opponent}</span>
                    </Td>
                    <Td>{m.min}</Td>
                    <Td highlight={m.pts >= 15 ? '#00E5A0' : undefined}>{m.pts}</Td>
                    <Td highlight="#F59E0B">{fg2Pct(m)}</Td>
                    <Td highlight="#3B82F6">{fg3Pct(m)}</Td>
                    <Td highlight="#8B5CF6">{ftPct(m)}</Td>
                    <Td highlight={(m.ro+m.rd) >= 8 ? '#F59E0B' : undefined}>{m.ro+m.rd}</Td>
                    <Td highlight={m.pd >= 6 ? '#3B82F6' : undefined}>{m.pd}</Td>
                    <Td>{m.ct}</Td><Td>{m.intercepts}</Td>
                    <Td highlight={m.bp >= 6 ? '#EF4444' : undefined}>{m.bp}</Td>
                    <Td highlight={m.eval >= 15 ? '#00E5A0' : m.eval < 5 ? '#EF4444' : undefined}>{m.eval}</Td>
                    <Td highlight={m.plusMinus > 0 ? '#00E5A0' : '#EF4444'}>
                      {m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 10 }}>
            <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Actions & Objectifs</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { l: 'Assignées', v: actions.length, c: '#94A3B8' },
                { l: `Réalisées (${actionRate}%)`, v: doneActions, c: '#00E5A0' },
                { l: 'En retard', v: actions.filter(a => a.status !== 'done' && a.dueDate < '2026-01-15').length, c: '#EF4444' },
              ].map(s => (
                <div key={s.l} style={{ padding: '10px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                  <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{s.l}</p>
                  <p style={{ color: s.c, fontSize: '1.1rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Commentaire staff */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 14 }}>
            <h3 style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, borderBottom: '1px solid #2A2F3A', paddingBottom: 7 }}>── Commentaire Staff</h3>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              style={{ width: '100%', padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', resize: 'vertical', minHeight: 90, boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
            <div style={{ marginTop: 8 }}>
              <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '0 0 4px' }}>Axes de progression :</p>
              <ul style={{ color: '#94A3B8', fontSize: '0.8rem', paddingLeft: 16, margin: 0 }}>
                <li>Améliorer le % tirs 3pts (actuellement {avg.fg3pct}%)</li>
                <li>Réduire les ballons perdus ({avg.bp}/match)</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button style={{ padding: '10px 18px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={14} /> Générer rapport PDF
            </button>
            <button
              onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
              style={{ padding: '10px 18px', backgroundColor: saved ? '#1E2229' : '#00E5A0', border: saved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: saved ? '#00E5A0' : '#0D0F14', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
              <Save size={14} />
              {saved ? '✓ Enregistré !' : 'Enregistrer le bilan'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
