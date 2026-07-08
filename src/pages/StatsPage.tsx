import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend } from 'recharts';
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { players, matchStats, teamMatchStats, getPlayerById, getPlayerStats, playerSeasonAvg, fg2Pct, fg3Pct, ftPct, formatDate, evalColor, TeamMatchStat, MatchStat } from '../data';
import { PlayerAvatar, PlayerSelect, Breadcrumb } from '../components';

type Tab = 'player' | 'team' | 'match';

const col = (v: number | string, color?: string) => (
  <span style={{ color: color ?? '#F1F5F9', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>{v}</span>
);

const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{ color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', fontWeight: 600, textAlign: right ? 'right' : 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', background: '#1E2229' }}>
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

function StatRow({ label, value, opp }: { label: string; value: string | number; opp?: string | number }) {
  const better = opp !== undefined && typeof value === 'number' && typeof opp === 'number';
  const vColor = better ? (value > opp ? '#00E5A0' : value < opp ? '#EF4444' : '#94A3B8') : '#F1F5F9';
  const oColor = better ? (opp > value ? '#00E5A0' : opp < value ? '#EF4444' : '#94A3B8') : '#94A3B8';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: opp !== undefined ? '1fr 100px 100px' : '1fr 100px', gap: 8, padding: '6px 0', borderBottom: '1px solid #2A2F3A22', alignItems: 'center' }}>
      <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{label}</span>
      <span style={{ color: vColor, fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{value}</span>
      {opp !== undefined && <span style={{ color: oColor, fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{opp}</span>}
    </div>
  );
}

// ── Vue match détaillé ────────────────────────────────────────────────────────
function MatchDetail({ tm }: { tm: TeamMatchStat }) {
  const matchPlayers = matchStats.filter(s => s.date === tm.date);
  const fg2PctStr = (m: number, a: number) => a ? `${Math.round(m/a*100)}%` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header match */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>{tm.homeAway === 'home' ? '🏠 Domicile' : '✈️ Extérieur'} · {tm.competition} · {formatDate(tm.date)}</p>
            <h2 style={{ color: '#F1F5F9', margin: '4px 0' }}>AL Meyzieu <span style={{ color: '#94A3B8', fontWeight: 400 }}>vs</span> {tm.opponent}</h2>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: tm.result === 'win' ? '#00E5A0' : '#EF4444', fontSize: '2rem', fontWeight: 900, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
              {tm.scoreUs} — {tm.scoreThem}
            </p>
            <span style={{ backgroundColor: tm.result === 'win' ? 'rgba(0,229,160,0.12)' : 'rgba(239,68,68,0.12)', color: tm.result === 'win' ? '#00E5A0' : '#EF4444', padding: '2px 10px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700 }}>
              {tm.result === 'win' ? 'VICTOIRE' : 'DÉFAITE'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
        {/* Stats collectives */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase' }}>Stats équipe</span>
            <span style={{ color: '#3B82F6', fontSize: '0.72rem', fontWeight: 700, textAlign: 'right' }}>Nous</span>
            <span style={{ color: '#94A3B8', fontSize: '0.72rem', textAlign: 'right' }}>Adv.</span>
          </div>
          <StatRow label="Tirs 2pts" value={`${tm.fg2m}/${tm.fg2a} (${fg2PctStr(tm.fg2m, tm.fg2a)})`} opp={`${tm.opp_fg2m}/${tm.opp_fg2a} (${fg2PctStr(tm.opp_fg2m, tm.opp_fg2a)})`} />
          <StatRow label="Tirs 3pts" value={`${tm.fg3m}/${tm.fg3a} (${fg2PctStr(tm.fg3m, tm.fg3a)})`} opp={`${tm.opp_fg3m}/${tm.opp_fg3a} (${fg2PctStr(tm.opp_fg3m, tm.opp_fg3a)})`} />
          <StatRow label="Lancers libres" value={`${tm.ftm}/${tm.fta} (${fg2PctStr(tm.ftm, tm.fta)})`} opp={`${tm.opp_ftm}/${tm.opp_fta} (${fg2PctStr(tm.opp_ftm, tm.opp_fta)})`} />
          <StatRow label="Rebonds off." value={tm.ro} opp={tm.opp_ro} />
          <StatRow label="Rebonds déf." value={tm.rd} opp={tm.opp_rd} />
          <StatRow label="Passes déc." value={tm.pd} opp={tm.opp_pd} />
          <StatRow label="Contres" value={tm.ct} opp={tm.opp_ct} />
          <StatRow label="Interceptions" value={tm.interceptsercepts} opp={tm.opp_intercepts} />
          <StatRow label="Ballons perdus" value={tm.bp} opp={tm.opp_bp} />
        </div>

        {/* Stats avancées */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase' }}>Stats avancées</span>
            <span style={{ color: '#3B82F6', fontSize: '0.72rem', fontWeight: 700, textAlign: 'right' }}>Nous</span>
            <span style={{ color: '#94A3B8', fontSize: '0.72rem', textAlign: 'right' }}>Adv.</span>
          </div>
          <StatRow label="Possessions" value={tm.possessions} opp={tm.opp_possessions} />
          <StatRow label="eFG %" value={`${tm.efgPct}%`} opp={`${tm.opp_efgPct}%`} />
          <StatRow label="Off. Rating" value={tm.offRating.toFixed(1)} />
          <StatRow label="Def. Rating" value={tm.defRating.toFixed(1)} />
          <StatRow label="TO %" value={`${tm.toPct}%`} opp={`${tm.opp_toPct}%`} />
          <StatRow label="OREB %" value={`${tm.orebPct}%`} opp={`${tm.opp_orebPct}%`} />
          <StatRow label="DREB %" value={`${tm.drebPct}%`} />
          <StatRow label="FT Rate" value={tm.ftRate.toFixed(2)} />
        </div>
      </div>

      {/* Box score joueurs */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2F3A' }}>
          <h3 style={{ color: '#F1F5F9', margin: 0 }}>Box Score — Joueurs</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <Th left>Joueur</Th>
              <Th>MIN</Th><Th>PTS</Th>
              <Th>2R</Th><Th>2T</Th><Th>2%</Th>
              <Th>3R</Th><Th>3T</Th><Th>3%</Th>
              <Th>LR</Th><Th>LT</Th><Th>L%</Th>
              <Th>RO</Th><Th>RD</Th><Th>RT</Th>
              <Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th>
              <Th>FTE</Th><Th>FPR</Th><Th>ÉVAL</Th><Th>+/-</Th>
            </tr>
          </thead>
          <tbody>
            {matchPlayers.map(m => {
              const p = getPlayerById(m.playerId);
              const rt = m.ro + m.rd;
              return (
                <tr key={m.id} style={{ backgroundColor: m.starter ? 'transparent' : '#1E222944' }}>
                  <Td left>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p && <PlayerAvatar player={p} size={22} />}
                      <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
                        {p ? `${p.firstName} ${p.lastName}` : '—'}
                        {!m.starter && <span style={{ color: '#475569', marginLeft: 4, fontSize: '0.7rem' }}>B</span>}
                      </span>
                    </div>
                  </Td>
                  <Td>{m.min}</Td>
                  <Td highlight={m.pts >= 15 ? '#00E5A0' : undefined}>{m.pts}</Td>
                  <Td>{m.fg2m}</Td><Td>{m.fg2a}</Td><Td>{fg2Pct(m)}</Td>
                  <Td>{m.fg3m}</Td><Td>{m.fg3a}</Td><Td>{fg3Pct(m)}</Td>
                  <Td>{m.ftm}</Td><Td>{m.fta}</Td><Td>{ftPct(m)}</Td>
                  <Td>{m.ro}</Td><Td>{m.rd}</Td><Td highlight={rt >= 8 ? '#F59E0B' : undefined}>{rt}</Td>
                  <Td highlight={m.pd >= 6 ? '#3B82F6' : undefined}>{m.pd}</Td>
                  <Td>{m.ct}</Td><Td>{m.intercepts}</Td>
                  <Td highlight={m.bp >= 6 ? '#EF4444' : undefined}>{m.bp}</Td>
                  <Td>{m.fte}</Td><Td>{m.fpr}</Td>
                  <Td highlight={evalColor(m.eval ?? null)}>{m.eval ?? '—'}</Td>
                  <Td highlight={(m.plusMinus ?? 0) > 0 ? '#00E5A0' : (m.plusMinus ?? 0) < 0 ? '#EF4444' : undefined}>
                    {m.plusMinus != null ? (m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus) : '—'}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vue stats par joueur ────────────────────────────────────────────────────
function PlayerStatsView() {
  const [selectedPlayer, setSelectedPlayer] = useState('p1');
  const [showForm, setShowForm] = useState(false);
  const t1Players = players.filter(p => p.teamId === 't1');
  const player = getPlayerById(selectedPlayer);
  const stats = getPlayerStats(selectedPlayer);
  const avg = playerSeasonAvg(selectedPlayer);

  const radarData = [
    { key: 'Tir 2pts', value: avg.fg2pct },
    { key: 'Tir 3pts', value: avg.fg3pct },
    { key: 'LT', value: avg.ftpct },
    { key: 'Rebonds', value: Math.min(100, avg.rt * 10) },
    { key: 'Passes', value: Math.min(100, avg.pd * 10) },
    { key: 'Éval.', value: Math.min(100, avg.eval * 5) },
  ];

  const lineData = stats.slice().reverse().map((m, i) => ({
    idx: i,
    date: m.date.slice(5).replace('-', '/'),
    pts: m.pts, eval: m.eval, pd: m.pd,
  }));

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <PlayerSelect players={t1Players} value={selectedPlayer} onChange={setSelectedPlayer} />
        <select style={{ padding: '7px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
          <option>Saison 2025/26</option>
        </select>
        <button onClick={() => setShowForm(true)}
          style={{ marginLeft: 'auto', padding: '7px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Saisir un match
        </button>
      </div>

      {player && (
        <>
          {/* Player header + moyennes */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <PlayerAvatar player={player} size={42} />
            <div>
              <h3 style={{ color: '#F1F5F9', margin: 0 }}>{player.firstName} {player.lastName}</h3>
              <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: 0 }}>{player.position} · #{player.number} · {avg.gp} matchs</p>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, overflowX: 'auto', flexShrink: 0 }}>
              {[
                ['MIN', avg.min], ['PTS', avg.pts], ['REB', avg.rt], ['PD', avg.pd], ['ÉVAL', avg.eval],
                ['2%', `${avg.fg2pct}%`], ['3%', `${avg.fg3pct}%`], ['L%', `${avg.ftpct}%`],
              ].map(([l, v]) => (
                <div key={l as string} style={{ textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase', margin: 0 }}>{l}</p>
                  <p style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '1rem', margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14, marginBottom: 14 }}>
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
              <h4 style={{ color: '#F1F5F9', marginBottom: 12 }}>Évolution match par match</h4>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                  <XAxis dataKey="idx" tickFormatter={(idx) => lineData[idx]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={22} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '0.72rem', color: '#94A3B8' }} />
                  <Line dataKey="pts" stroke="#00E5A0" strokeWidth={2} dot={{ r: 3 }} name="Points" />
                  <Line dataKey="eval" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Éval." />
                  <Line dataKey="pd" stroke="#F59E0B" strokeWidth={1.5} dot={{ r: 2 }} name="PD" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
              <h4 style={{ color: '#F1F5F9', marginBottom: 8 }}>Radar de profil</h4>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#2A2F3A" />
                  <PolarAngleAxis dataKey="key" tick={{ fill: '#94A3B8', fontSize: 9 }} />
                  <Radar dataKey="value" stroke="#00E5A0" fill="#00E5A0" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table match par match */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2F3A' }}>
              <h4 style={{ color: '#F1F5F9', margin: 0 }}>Match par match</h4>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr>
                  <Th left>Date</Th><Th left>Adversaire</Th>
                  <Th>MIN</Th><Th>PTS</Th>
                  <Th>2R/2T</Th><Th>2%</Th>
                  <Th>3R/3T</Th><Th>3%</Th>
                  <Th>LR/LT</Th><Th>L%</Th>
                  <Th>RO</Th><Th>RD</Th><Th>RT</Th>
                  <Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th>
                  <Th>ÉVAL</Th><Th>+/-</Th>
                </tr>
              </thead>
              <tbody>
                {stats.map((m, idx) => (
                  <tr key={idx}>
                    <Td left><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', color: '#94A3B8' }}>{formatDate(m.date)}</span></Td>
                    <Td left>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: '0.72rem' }}>{m.result === 'win' ? '🟢' : '🔴'}</span>
                        <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>{m.opponent}</span>
                        <span style={{ color: '#475569', fontSize: '0.7rem' }}>{m.scoreUs}-{m.scoreThem}</span>
                      </div>
                    </Td>
                    <Td>{m.min}</Td>
                    <Td highlight={m.pts >= 15 ? '#00E5A0' : undefined}>{m.pts}</Td>
                    <Td>{m.fg2m}/{m.fg2a}</Td><Td>{fg2Pct(m)}</Td>
                    <Td>{m.fg3m}/{m.fg3a}</Td><Td>{fg3Pct(m)}</Td>
                    <Td>{m.ftm}/{m.fta}</Td><Td>{ftPct(m)}</Td>
                    <Td>{m.ro}</Td><Td>{m.rd}</Td><Td highlight={(m.ro+m.rd) >= 8 ? '#F59E0B' : undefined}>{m.ro+m.rd}</Td>
                    <Td highlight={m.pd >= 6 ? '#3B82F6' : undefined}>{m.pd}</Td>
                    <Td>{m.ct}</Td><Td>{m.intercepts}</Td>
                    <Td highlight={m.bp >= 6 ? '#EF4444' : undefined}>{m.bp}</Td>
                    <Td highlight={evalColor(m.eval ?? null)}>{m.eval ?? '—'}</Td>
                    <Td highlight={(m.plusMinus ?? 0) > 0 ? '#00E5A0' : (m.plusMinus ?? 0) < 0 ? '#EF4444' : undefined}>
                      {m.plusMinus != null ? (m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus) : '—'}
                    </Td>
                  </tr>
                ))}
                {/* Ligne totaux */}
                <tr style={{ backgroundColor: '#1E2229' }}>
                  <Td left><span style={{ color: '#475569', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>MOY / match</span></Td>
                  <Td left><span style={{ color: '#475569', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>{avg.gp} matchs</span></Td>
                  <Td>{avg.min}</Td>
                  <Td highlight="#00E5A0">{avg.pts}</Td>
                  <Td>{avg.fg2m}/{avg.fg2a}</Td><Td highlight="#F59E0B">{avg.fg2pct}%</Td>
                  <Td>{avg.fg3m}/{avg.fg3a}</Td><Td highlight="#F59E0B">{avg.fg3pct}%</Td>
                  <Td>{avg.ftm}/{avg.fta}</Td><Td highlight="#F59E0B">{avg.ftpct}%</Td>
                  <Td>{avg.ro}</Td><Td>{avg.rd}</Td><Td>{avg.rt}</Td>
                  <Td highlight="#3B82F6">{avg.pd}</Td>
                  <Td>{avg.ct}</Td><Td>{avg.intercepts}</Td><Td>{avg.bp}</Td>
                  <Td highlight={evalColor(Number(avg.eval))}>{avg.eval}</Td>
                  <Td highlight={Number(avg.plusMinus) > 0 ? '#00E5A0' : '#EF4444'}>
                    {Number(avg.plusMinus) > 0 ? `+${avg.plusMinus}` : avg.plusMinus}
                  </Td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Saisir un match</h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={e => { e.preventDefault(); setShowForm(false); }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['Date', 'date'], ['Adversaire', 'text'], ['Compétition', 'text'], ['MIN', 'number'], ['PTS', 'number'], ['2R', 'number'], ['2T', 'number'], ['3R', 'number'], ['3T', 'number'], ['LR', 'number'], ['LT', 'number'], ['RO', 'number'], ['RD', 'number'], ['PD', 'number'], ['CT', 'number'], ['IN', 'number'], ['BP', 'number'], ['FTE', 'number'], ['FPR', 'number'], ['+/-', 'number']].map(([l, t]) => (
                  <div key={l}>
                    <label style={{ color: '#94A3B8', fontSize: '0.72rem', display: 'block', marginBottom: 3 }}>{l}</label>
                    <input type={t} style={{ width: '100%', padding: '6px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '9px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" style={{ flex: 1, padding: '9px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700 }}>Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Vue stats équipe (tableau récap toutes joueurs) ─────────────────────────
function TeamStatsView() {
  const t1Players = players.filter(p => p.teamId === 't1');
  return (
    <div>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2F3A' }}>
          <h3 style={{ color: '#F1F5F9', margin: 0 }}>Moyennes saison — toutes joueurs</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '2px 0 0' }}>Saison 2025/26 · NF2 · Moyennes par match</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr>
              <Th left>Joueur</Th><Th>MJ</Th><Th>MIN</Th><Th>PTS</Th>
              <Th>2R/2T</Th><Th>2%</Th><Th>3R/3T</Th><Th>3%</Th><Th>LR/LT</Th><Th>L%</Th>
              <Th>RO</Th><Th>RD</Th><Th>RT</Th><Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th><Th>ÉVAL</Th><Th>+/-</Th>
            </tr>
          </thead>
          <tbody>
            {t1Players.map(p => {
              const avg = playerSeasonAvg(p.id);
              if (avg.gp === 0) return null;
              return (
                <tr key={p.id}>
                  <Td left>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar player={p} size={22} />
                      <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>{p.firstName} {p.lastName}</span>
                    </div>
                  </Td>
                  <Td>{avg.gp}</Td><Td>{avg.min}</Td>
                  <Td highlight={Number(avg.pts) >= 12 ? '#00E5A0' : undefined}>{avg.pts}</Td>
                  <Td>{avg.fg2m}/{avg.fg2a}</Td><Td highlight="#F59E0B">{avg.fg2pct}%</Td>
                  <Td>{avg.fg3m}/{avg.fg3a}</Td><Td highlight="#F59E0B">{avg.fg3pct}%</Td>
                  <Td>{avg.ftm}/{avg.fta}</Td><Td highlight="#F59E0B">{avg.ftpct}%</Td>
                  <Td>{avg.ro}</Td><Td>{avg.rd}</Td>
                  <Td highlight={Number(avg.rt) >= 6 ? '#F59E0B' : undefined}>{avg.rt}</Td>
                  <Td highlight={Number(avg.pd) >= 5 ? '#3B82F6' : undefined}>{avg.pd}</Td>
                  <Td>{avg.ct}</Td><Td>{avg.intercepts}</Td><Td>{avg.bp}</Td>
                  <Td highlight={evalColor(Number(avg.eval))}>{avg.eval}</Td>
                  <Td highlight={Number(avg.plusMinus) > 0 ? '#00E5A0' : '#EF4444'}>
                    {Number(avg.plusMinus) > 0 ? `+${avg.plusMinus}` : avg.plusMinus}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function StatsPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const location   = useLocation();
  const locState   = location.state as { from?: string; playerName?: string } | null;
  const [tab, setTab] = useState<Tab>(id ? 'player' : 'team');
  const [selectedMatch, setSelectedMatch] = useState<string>(teamMatchStats[0]?.id ?? '');

  const breadcrumbItems = id && locState?.playerName
    ? [
        { label: 'Joueurs',          path: '/players'         },
        { label: locState.playerName, path: locState.from ?? `/players/${id}` },
      ]
    : id
      ? [{ label: 'Profil', path: `/players/${id}` }]
      : [];

  return (
    <div className="p-4 md:p-6">
      <div style={{ marginBottom: 20 }}>
        <Breadcrumb items={breadcrumbItems} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: breadcrumbItems.length > 0 ? 8 : 0 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Statistiques</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['team', 'player', 'match'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: tab === t ? '#1E2229' : 'transparent', color: tab === t ? '#F1F5F9' : '#94A3B8' }}>
              {t === 'team' ? 'Équipe' : t === 'player' ? 'Joueur' : 'Par match'}
            </button>
          ))}
        </div>
        </div>
      </div>

      {tab === 'player' && <PlayerStatsView />}
      {tab === 'team' && <TeamStatsView />}
      {tab === 'match' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {teamMatchStats.map(tm => (
              <button key={tm.id} onClick={() => setSelectedMatch(tm.id)}
                style={{
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.15s',
                  backgroundColor: selectedMatch === tm.id ? '#1E2229' : 'transparent',
                  border: `1px solid ${selectedMatch === tm.id ? (tm.result === 'win' ? '#00E5A0' : '#EF4444') : '#2A2F3A'}`,
                  color: selectedMatch === tm.id ? '#F1F5F9' : '#94A3B8',
                }}>
                <span style={{ marginRight: 6 }}>{tm.result === 'win' ? '🟢' : '🔴'}</span>
                vs {tm.opponent} — {formatDate(tm.date)}
              </button>
            ))}
          </div>
          {teamMatchStats.find(t => t.id === selectedMatch) && (
            <MatchDetail tm={teamMatchStats.find(t => t.id === selectedMatch)!} />
          )}
        </div>
      )}
    </div>
  );
}
