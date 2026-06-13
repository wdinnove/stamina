import { useNavigate } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { Users, AlertTriangle, CheckSquare, TrendingUp, ArrowRight, Flame, Clock } from 'lucide-react';
import { KPICard, StatusBadge, PlayerAvatar } from '../components';
import { players, rpeEntries, actions, medicalRecords, getPlayerById, getOverdueActions, categoryConfig, priorityConfig } from '../data';

function getTeamRPELast7Days() {
  const days: { idx: number; date: string; label: string; avgRpe: number; load: number }[] = [];
  const base = new Date('2026-01-15');
  const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayEntries = rpeEntries.filter(e => e.date === dateStr);
    const avgRpe = dayEntries.length
      ? Math.round(dayEntries.reduce((s, e) => s + e.rpe, 0) / dayEntries.length * 10) / 10
      : 0;
    const totalLoad = dayEntries.reduce((s, e) => s + e.rpe * e.duration, 0);
    days.push({
      idx: 6 - i,
      date: dateStr,
      label: labels[d.getDay() === 0 ? 6 : d.getDay() - 1] ?? dateStr.slice(5),
      avgRpe,
      load: Math.round(totalLoad / 10),
    });
  }
  return days;
}

const chartData = getTeamRPELast7Days();

const alerts = [
  { playerId: 'p3', type: 'danger' as const, message: 'Entorse cheville droite', detail: 'RTP J+9' },
  { playerId: 'p6', type: 'warning' as const, message: 'Douleurs lombaires', detail: 'Surveillance' },
  { playerId: 'p1', type: 'warning' as const, message: 'RPE > 8 hier', detail: 'Charge élevée' },
  { playerId: 'p7', type: 'warning' as const, message: 'Bien-être dégradé', detail: 'Score 5.2/10' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px' }}>
      <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#00E5A0', fontSize: '0.85rem', margin: 0 }}>RPE moy : <strong>{payload[0]?.value}</strong></p>
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const activePlayers = players.filter(p => p.status === 'active').length;
  const injuredPlayers = players.filter(p => p.status === 'injured').length;
  const overdueActions = getOverdueActions();
  const activeInjuries = medicalRecords.filter(r => r.status === 'active' && r.type === 'injury');
  const allRPE = rpeEntries.filter(e => e.date === '2026-01-14');
  const avgRpe = allRPE.length ? Math.round(allRPE.reduce((s, e) => s + e.rpe, 0) / allRPE.length * 10) / 10 : 0;

  const upcomingActions = actions.filter(a => a.status !== 'done' && a.dueDate >= '2026-01-15').slice(0, 5);

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', marginBottom: 4 }}>Bonjour Thomas 👋</h1>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>Jeudi 15 janvier 2026 · AL Meyzieu</p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KPICard
          label="Joueurs actifs"
          value={`${activePlayers} / ${players.filter(p => p.teamId === 't1').length}`}
          icon={<Users size={18} />}
          accentColor="#00E5A0"
          trendLabel="disponibles aujourd'hui"
          onClick={() => navigate('/players')}
        />
        <KPICard
          label="Alertes médicales"
          value={activeInjuries.length}
          icon={<AlertTriangle size={18} />}
          accentColor="#EF4444"
          trendLabel={`${injuredPlayers} blessés`}
          trend={-1}
          onClick={() => navigate('/medical')}
        />
        <KPICard
          label="Actions en retard"
          value={overdueActions.length}
          icon={<CheckSquare size={18} />}
          accentColor="#F59E0B"
          trendLabel="nécessitent attention"
          trend={-1}
          onClick={() => navigate('/actions')}
        />
        <KPICard
          label="RPE moyen (hier)"
          value={avgRpe}
          unit="/ 10"
          icon={<TrendingUp size={18} />}
          accentColor="#3B82F6"
          trendLabel="charge modérée"
          trend={0}
          onClick={() => navigate('/rpe')}
        />
      </div>

      {/* Charts + Alerts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>
        {/* RPE Chart */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#F1F5F9', marginBottom: 2 }}>Charge collective — 7 derniers jours</h3>
              <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>RPE moyen de l'équipe par séance</p>
            </div>
            <button
              onClick={() => navigate('/rpe')}
              style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Voir tout <ArrowRight size={13} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
              <XAxis dataKey="idx" tickFormatter={(idx) => chartData[idx]?.label ?? ''} tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 12 }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={8} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Seuil', fill: '#EF4444', fontSize: 11, position: 'insideTopRight' }} />
              <Bar dataKey="avgRpe" fill="#00E5A0" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ color: '#F1F5F9' }}>Joueurs à surveiller</h3>
            <span style={{
              backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444',
              borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
            }}>{alerts.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.map((alert, idx) => {
              const player = getPlayerById(alert.playerId);
              if (!player) return null;
              return (
                <div
                  key={idx}
                  onClick={() => navigate(`/players/${alert.playerId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                    backgroundColor: '#1E2229', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${alert.type === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: alert.type === 'danger' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                  <PlayerAvatar player={player} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                      {player.lastName} {player.firstName[0]}.
                    </p>
                    <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.message}
                    </p>
                  </div>
                  <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{alert.detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ color: '#F1F5F9' }}>Prochaines actions</h3>
          <button
            onClick={() => navigate('/actions')}
            style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            Voir toutes les actions <ArrowRight size={13} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {upcomingActions.map(action => {
            const player = getPlayerById(action.playerId);
            const catCfg = categoryConfig[action.category];
            const priCfg = priorityConfig[action.priority];
            const isOverdue = action.dueDate < '2025-06-09';
            return (
              <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                {player && <PlayerAvatar player={player} size={28} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player ? `${player.lastName} ${player.firstName[0]}.` : '—'} · {action.title}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ color: catCfg.color, fontSize: '0.7rem', backgroundColor: catCfg.color + '18', padding: '2px 6px', borderRadius: 3 }}>
                    {catCfg.label}
                  </span>
                  <span style={{ color: priCfg.color, fontSize: '0.72rem', fontWeight: 600 }}>{priCfg.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isOverdue ? '#EF4444' : '#94A3B8', fontSize: '0.72rem' }}>
                    <Clock size={11} />{action.dueDate.slice(5).replace('-', '/')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
