import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Activity, Heart, Stethoscope, CheckSquare, BarChart2 } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi }     from '../api/rpe';
import { Breadcrumb, PlayerAvatar } from '../components';
import type { Player, RPEEntry, SessionType } from '../data/types';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const SESSION_LABELS: Record<SessionType, string> = {
  training: 'Entraînement',
  match:    'Match',
  gym:      'Gym',
  rest:     'Repos',
};

const SESSION_COLORS: Record<SessionType, string> = {
  training: '#00E5A0',
  match:    '#3B82F6',
  gym:      '#F59E0B',
  rest:     '#475569',
};

function rpeColor(v: number) {
  if (v <= 3) return '#00E5A0';
  if (v <= 5) return '#22d3ee';
  if (v <= 6) return '#F59E0B';
  if (v <= 8) return '#fb923c';
  return '#EF4444';
}

const RPE_LABELS: Record<number, string> = {
  1: 'Très facile', 2: 'Facile', 3: 'Modéré', 4: 'Assez difficile',
  5: 'Difficile', 6: 'Difficile+', 7: 'Très difficile',
  8: 'Intense', 9: 'Très intense', 10: 'Maximal',
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

type Filter = 'all' | SessionType;

export default function PlayerRPEPage() {
  const { id }    = useParams<{ id: string }>();
  const location  = useLocation();
  const navigate  = useNavigate();
  const locState  = location.state as { from?: string; playerName?: string } | null;

  const [player,  setPlayer]  = useState<Player | null>(null);
  const [entries, setEntries] = useState<RPEEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<Filter>('all');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([playersApi.getById(id), rpeApi.listPlayerHistory(id)])
      .then(([p, rpe]) => { setPlayer(p); setEntries(rpe); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (!player) return <div className="p-4 md:p-6" style={{ color: '#EF4444' }}>Joueur introuvable</div>;

  const fromPath  = locState?.from ?? `/players/${id}`;
  const fromLabel = locState?.playerName ?? `${player.firstName} ${player.lastName}`;

  const filtered = filter === 'all' ? entries : entries.filter(e => e.sessionType === filter);

  // Oldest → newest for charts
  const chartData = [...filtered]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date:  fmtDate(e.date),
      rpe:   e.rpe,
      load:  Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
      color: rpeColor(e.rpe),
    }));

  const lastRPE   = filtered[0];
  const avgRPE    = filtered.length ? Math.round(filtered.reduce((s, e) => s + e.rpe, 0) / filtered.length * 10) / 10 : null;
  const totalLoad = filtered.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
  const sessionTypes = [...new Set(entries.map(e => e.sessionType))] as SessionType[];

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Breadcrumb items={[
          { label: 'Joueurs',  path: '/players' },
          { label: fromLabel,  path: fromPath   },
        ]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <PlayerAvatar player={player} size={32} />
          <h2 style={{ color: '#F1F5F9', margin: 0 }}>Perception de l'Effort (RPE)</h2>
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>#{player.number}</span>
        </div>
      </div>

      {/* Navigation sections joueur */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Effort RPE', icon: Activity,   active: true,  path: `/players/${id}/rpe`, state: { from: `/players/${id}`, playerName: `${player.firstName} ${player.lastName}` } },
          { label: 'Émotions',   icon: Heart,       active: false, path: '/wellness',          state: { from: `/players/${id}`, playerName: `${player.firstName} ${player.lastName}`, playerId: id } },
          { label: 'Médical',    icon: Stethoscope, active: false, path: '/medical',           state: { from: `/players/${id}`, playerName: `${player.firstName} ${player.lastName}`, playerId: id } },
          { label: 'Actions',    icon: CheckSquare, active: false, path: '/actions',           state: { from: `/players/${id}`, playerName: `${player.firstName} ${player.lastName}`, playerId: id } },
          { label: 'Stats',      icon: BarChart2,   active: false, path: `/stats/${id}`,       state: { from: `/players/${id}`, playerName: `${player.firstName} ${player.lastName}` } },
        ].map(({ label, icon: Icon, active, path, state }) => (
          <button key={label} onClick={() => navigate(path, { state })}
            style={{
              padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem',
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: active ? 'rgba(0,229,160,0.1)' : '#1E2229',
              border: `1px solid ${active ? 'rgba(0,229,160,0.35)' : '#2A2F3A'}`,
              color: active ? '#00E5A0' : '#94A3B8',
              fontWeight: active ? 600 : 400,
            }}
            onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#F1F5F9'; e.currentTarget.style.borderColor = '#00E5A0'; } }}
            onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#2A2F3A'; } }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Filtres par type de séance */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', ...sessionTypes] as Filter[]).map(f => {
          const active = filter === f;
          const label  = f === 'all' ? 'Tout' : SESSION_LABELS[f];
          const color  = f === 'all' ? '#94A3B8' : SESSION_COLORS[f];
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 5, fontSize: '0.78rem', cursor: 'pointer',
                backgroundColor: active ? color + '18' : '#1E2229',
                border: `1px solid ${active ? color : '#2A2F3A'}`,
                color: active ? color : '#94A3B8', fontWeight: active ? 600 : 400,
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569' }}>Aucune donnée RPE pour ce joueur.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Dernière RPE',  value: lastRPE ? String(lastRPE.rpe) : '—', sub: lastRPE ? RPE_LABELS[lastRPE.rpe] : '', color: lastRPE ? rpeColor(lastRPE.rpe) : '#F1F5F9' },
              { label: 'RPE moyenne',      value: avgRPE !== null ? String(avgRPE)       : '—', sub: `sur ${filtered.length} séance${filtered.length > 1 ? 's' : ''}`, color: avgRPE !== null ? rpeColor(avgRPE) : '#F1F5F9' },
              { label: 'Charge totale',    value: totalLoad > 0 ? String(totalLoad)      : '—', sub: 'UA (RPE × min)',                    color: '#F1F5F9' },
              { label: 'Séances',          value: String(filtered.length),               sub: 'enregistrées',                             color: '#F1F5F9' },
            ].map(kpi => (
              <div key={kpi.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
                <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{kpi.label}</p>
                <p style={{ color: kpi.color, fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</p>
                <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>Évolution RPE</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                  <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis domain={[0, 10]} tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={7} stroke="#EF444440" strokeDasharray="4 4" />
                  <ReferenceLine y={5} stroke="#F59E0B40" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="rpe" name="RPE" stroke="#00E5A0" dot={{ fill: '#00E5A0', r: 3 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>Charge (UA)</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                  <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="load" name="Charge" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tableau historique */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2F3A' }}>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Historique des séances</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date', 'Type', 'RPE', 'Ressenti', 'Durée', 'Charge', 'Équipe'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const dur   = e.actualDuration ?? e.plannedDuration;
                    const load  = e.rpe * dur;
                    const color = rpeColor(e.rpe);
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                        onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                        onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                        <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ color: SESSION_COLORS[e.sessionType], fontSize: '0.75rem', fontWeight: 600 }}>
                            {SESSION_LABELS[e.sessionType]}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ color: color, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{e.rpe}</span>
                        </td>
                        <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem' }}>{RPE_LABELS[e.rpe] ?? '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#F1F5F9', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{dur} min</td>
                        <td style={{ padding: '9px 14px', color: '#F1F5F9', fontSize: '0.8rem', fontFamily: 'JetBrains Mono, monospace' }}>{load} UA</td>
                        <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem' }}>{e.teamName ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
