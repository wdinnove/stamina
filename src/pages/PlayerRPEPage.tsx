import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Activity, Heart, Stethoscope, CheckSquare, BarChart2 } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi }     from '../api/rpe';
import { Breadcrumb, PlayerAvatar, EmptyState } from '../components';
import { rpeColor, rpeLabel } from '../utils/rpe';
import { computeWeeklyUa, getWeekTier } from '../utils/weeklyLoad';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, RPEEntry, SessionType } from '../data/types';

const DAY_ABBR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  const [, mm, dd] = iso.split('-');
  return `${DAY_ABBR[d.getDay()]} ${Number(dd)}/${Number(mm)}`;
}

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
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

export default function PlayerRPEPage() {
  const { id }         = useParams<{ id: string }>();
  const location       = useLocation();
  const navigate       = useNavigate();
  const locState       = location.state as { from?: string; playerName?: string } | null;
  const { thresholds } = useTeamSeason();

  const [player,  setPlayer]  = useState<Player | null>(null);
  const [entries, setEntries] = useState<RPEEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Oldest → newest for charts
  const chartData = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date:  fmtDate(e.date),
      rpe:   e.rpe,
      load:  Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
    }));

  const lastRPE   = entries[0];
  const avgRPE    = entries.length ? Math.round(entries.reduce((s, e) => s + e.rpe, 0) / entries.length * 10) / 10 : null;
  const totalLoad = entries.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
  const weeklyUa  = computeWeeklyUa(entries);
  const weekTier  = weeklyUa > 0 ? getWeekTier(weeklyUa, thresholds.lightMax, thresholds.normalMax) : null;

  const sessionLoadNormal = Math.round(thresholds.normalMax / 3);
  const sessionLoadT1     = Math.round(sessionLoadNormal / 3);
  const sessionLoadT2     = Math.round(sessionLoadNormal * 2 / 3);

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

      {entries.length === 0 ? (
        <EmptyState message="Aucune donnée RPE pour ce joueur." size="lg" />
      ) : (
        <>
          {/* KPIs — ordre : Charge semaine, Dernier RPE, RPE moyen, Séances, Charge totale */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            {/* Charge semaine */}
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${weekTier ? weekTier.color : '#334155'}`, borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>Charge semaine</p>
              <p style={{ color: weekTier ? weekTier.color : '#475569', fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                {weeklyUa > 0 ? weeklyUa : '—'}
              </p>
              {weekTier ? (
                <span style={{ color: weekTier.color, backgroundColor: weekTier.bg, fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 3, display: 'inline-block', marginTop: 4 }}>{weekTier.label}</span>
              ) : (
                <p style={{ color: '#2A2F3A', fontSize: '0.72rem', margin: '3px 0 0' }}>7j glissants</p>
              )}
            </div>
            {[
              { label: 'Dernier RPE',   value: lastRPE ? String(lastRPE.rpe) : '—', sub: lastRPE ? rpeLabel(lastRPE.rpe) : '',                            accent: lastRPE ? rpeColor(lastRPE.rpe) : '#334155' },
              { label: 'RPE moyen',     value: avgRPE !== null ? String(avgRPE) : '—', sub: `sur ${entries.length} séance${entries.length > 1 ? 's' : ''}`, accent: avgRPE !== null ? rpeColor(avgRPE) : '#334155' },
              { label: 'Séances',       value: String(entries.length),                 sub: 'enregistrées',                                                  accent: '#3B82F6'                                    },
              { label: 'Charge totale', value: totalLoad > 0 ? String(totalLoad) : '—', sub: 'UA (RPE × min)',                                              accent: '#F59E0B'                                    },
            ].map(kpi => (
              <div key={kpi.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${kpi.accent}`, borderRadius: 8, padding: '14px 16px' }}>
                <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{kpi.label}</p>
                <p style={{ color: '#F1F5F9', fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</p>
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
                  <Bar dataKey="load" name="Charge" radius={[3, 3, 0, 0]}>
                    {chartData.map((d, i) => {
                      const c = d.load >= sessionLoadNormal ? '#EF4444' : d.load >= sessionLoadT2 ? '#F97316' : d.load >= sessionLoadT1 ? '#EAB308' : '#00E5A0';
                      return <Cell key={i} fill={c} fillOpacity={0.8} />;
                    })}
                  </Bar>
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
                    {['Date', 'Type', 'Équipe', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => {
                    const dur      = e.actualDuration ?? e.plannedDuration;
                    const load     = e.rpe * dur;
                    const rpeC     = rpeColor(e.rpe);
                    const typeCfg  = SESSION_TYPES[e.sessionType] ?? SESSION_TYPES.training;
                    const uaT1     = Math.round(sessionLoadNormal / 3);
                    const uaT2     = Math.round(sessionLoadNormal * 2 / 3);
                    const uaCfg    = load >= sessionLoadNormal
                      ? { color: '#EF4444', label: 'Surcharge' }
                      : load >= uaT2 ? { color: '#F97316', label: 'Élevée' }
                      : load >= uaT1 ? { color: '#EAB308', label: 'Soutenu' }
                      : { color: '#00E5A0', label: 'Normal' };
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                        onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                        onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                        <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(e.date)}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{typeCfg.label}</span>
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem' }}>{e.teamName ?? '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{dur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ color: rpeC, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{e.rpe}</span>
                        </td>
                        <td style={{ padding: '9px 14px', color: uaCfg.color, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{load.toLocaleString('fr')}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ backgroundColor: uaCfg.color + '20', color: uaCfg.color, fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{uaCfg.label}</span>
                        </td>
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
