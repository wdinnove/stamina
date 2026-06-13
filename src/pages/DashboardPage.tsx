import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts';
import { Users, AlertTriangle, CheckSquare, TrendingUp, ArrowRight, Clock } from 'lucide-react';
import { KPICard, PlayerAvatar } from '../components';
import { categoryConfig, priorityConfig } from '../data/config';
import { playersApi, medicalApi, actionsApi, wellnessApi } from '../api';
import { supabase } from '../api/client';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, Action, MedicalRecord } from '../data/types';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

interface AlertItem {
  player: Player;
  type: 'danger' | 'warning';
  message: string;
  detail: string;
}

interface ChartDay {
  label: string;
  date: string;
  avgRpe: number;
}

function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return d.toLocaleDateString('sv'); // YYYY-MM-DD in local timezone
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px' }}>
      <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: '0 0 4px' }}>{label}</p>
      <p style={{ color: '#00E5A0', fontSize: '0.85rem', margin: 0 }}>
        RPE moy : <strong>{payload[0]?.value || '—'}</strong>
      </p>
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { selected, loading: teamLoading } = useTeamSeason();

  const today = useMemo(() => new Date().toLocaleDateString('sv'), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  const [userName, setUserName] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [injuries, setInjuries] = useState<MedicalRecord[]>([]);
  const [overdueActions, setOverdueActions] = useState<Action[]>([]);
  const [upcomingActions, setUpcomingActions] = useState<Action[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [avgRpe7d, setAvgRpe7d] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch current user's first name once
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('first_name').eq('id', user.id).single()
        .then(({ data }) => { if (data) setUserName(data.first_name ?? ''); });
    });
  }, []);

  useEffect(() => {
    if (!selected || teamLoading) return;

    setLoading(true);
    const chartDays = getLastNDays(30);
    const kpiDays   = getLastNDays(7);
    const chartFrom = chartDays[0];
    const yesterday = kpiDays[5]; // kpiDays[6] = today, kpiDays[5] = yesterday

    Promise.all([
      playersApi.listBySeason(selected.season.id),
      medicalApi.getActiveInjuries(),
      actionsApi.getOverdue(today),
      actionsApi.list(),
      supabase
        .from('training_sessions')
        .select('id, date')
        .eq('team_id', selected.team.id)
        .eq('season_id', selected.season.id)
        .gte('date', chartFrom)
        .lte('date', today),
      wellnessApi.list({ from: kpiDays[4], to: today }),
    ])
      .then(async ([seasonPlayers, activeInjuries, overdue, allActions, sessionsResult, wellnessEntries]) => {
        setPlayers(seasonPlayers);
        setInjuries(activeInjuries);
        setOverdueActions(overdue);

        const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));
        setUpcomingActions(
          allActions
            .filter(a => a.status !== 'done' && a.dueDate >= today && seasonPlayerIds.has(a.playerId))
            .slice(0, 5)
        );

        const playerMap = new Map(seasonPlayers.map(p => [p.id, p]));

        // Two-step RPE: sessions → entries
        const sessions = (sessionsResult.data ?? []) as Array<{ id: string; date: string }>;
        const sessionIds = sessions.map(s => s.id);
        const sessionDateMap = Object.fromEntries(sessions.map(s => [s.id, s.date]));

        let rpeRows: Array<{ rpe: number; player_id: string; session_id: string }> = [];
        if (sessionIds.length > 0) {
          const { data } = await supabase
            .from('rpe_entries')
            .select('rpe, player_id, session_id')
            .in('session_id', sessionIds);
          rpeRows = (data ?? []) as typeof rpeRows;
        }

        // Group RPE values by date
        const rpeByDate = new Map<string, number[]>();
        rpeRows.forEach(r => {
          const date = sessionDateMap[r.session_id];
          if (!date) return;
          if (!rpeByDate.has(date)) rpeByDate.set(date, []);
          rpeByDate.get(date)!.push(r.rpe);
        });

        const chart: ChartDay[] = chartDays.map(dateStr => {
          const vals = rpeByDate.get(dateStr) ?? [];
          const avg = vals.length
            ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10
            : 0;
          const [, mm, dd] = dateStr.split('-');
          return { label: `${dd}/${mm}`, date: dateStr, avgRpe: avg };
        });
        setChartData(chart);

        const kpiRpeVals = rpeRows
          .filter(r => { const d = sessionDateMap[r.session_id]; return d && d >= kpiDays[0]; })
          .map(r => r.rpe);
        setAvgRpe7d(
          kpiRpeVals.length
            ? Math.round(kpiRpeVals.reduce((s, v) => s + v, 0) / kpiRpeVals.length * 10) / 10
            : 0
        );

        // Build alert list: injuries → low wellness → high RPE
        const alertItems: AlertItem[] = [];
        const seen = new Set<string>();

        activeInjuries.forEach(inj => {
          if (alertItems.length >= 3) return;
          const player = playerMap.get(inj.playerId);
          if (!player || seen.has(player.id)) return;
          seen.add(player.id);
          alertItems.push({
            player,
            type: inj.severity === 'severe' ? 'danger' : 'warning',
            message: inj.description,
            detail: inj.rtpDate ? `RTP ${inj.rtpDate.slice(5).replace('-', '/')}` : 'En cours',
          });
        });

        const seenWellness = new Set<string>();
        wellnessEntries
          .filter(w => w.score < 6 && !seen.has(w.playerId) && !seenWellness.has(w.playerId))
          .forEach(w => {
            if (alertItems.length >= 5) return;
            const player = playerMap.get(w.playerId);
            if (!player) return;
            seenWellness.add(w.playerId);
            seen.add(w.playerId);
            alertItems.push({
              player,
              type: 'warning',
              message: 'Bien-être dégradé',
              detail: `Score ${w.score.toFixed(1)}/10`,
            });
          });

        const seenRpe = new Set<string>();
        rpeRows
          .filter(r => sessionDateMap[r.session_id] === yesterday && r.rpe > 8)
          .forEach(r => {
            if (alertItems.length >= 5 || seen.has(r.player_id) || seenRpe.has(r.player_id)) return;
            const player = playerMap.get(r.player_id);
            if (!player) return;
            seenRpe.add(r.player_id);
            seen.add(r.player_id);
            alertItems.push({
              player,
              type: 'warning',
              message: 'RPE élevé hier',
              detail: `RPE ${r.rpe}/10`,
            });
          });

        setAlerts(alertItems);
        setLoading(false);
      })
      .catch(err => {
        console.error('[Dashboard] load error', err);
        setLoading(false);
      });
  }, [selected, teamLoading, today]);

  const activePlayers = players.filter(p => p.status === 'active').length;
  const injuredPlayers = players.filter(p => p.status === 'injured').length;

  if (teamLoading) {
    return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;
  }

  if (!selected) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
          Sélectionnez une équipe et une saison dans la barre du haut pour afficher le dashboard.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', marginBottom: 4 }}>
          {userName ? `Bonjour ${userName}` : 'Bonjour'}
        </h1>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>
          {todayLabel} · {selected.team.name} · {selected.season.label}
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KPICard
          label="Joueurs en saison"
          value={loading ? '…' : `${activePlayers} / ${players.length}`}
          icon={<Users size={18} />}
          accentColor="#00E5A0"
          trendLabel="disponibles"
          onClick={() => navigate('/roster')}
        />
        <KPICard
          label="Alertes médicales"
          value={loading ? '…' : injuries.length}
          icon={<AlertTriangle size={18} />}
          accentColor="#EF4444"
          trendLabel={`${injuredPlayers} blessés`}
          trend={injuries.length > 0 ? -1 : 0}
          onClick={() => navigate('/medical/infirmary')}
        />
        <KPICard
          label="Actions en retard"
          value={loading ? '…' : overdueActions.length}
          icon={<CheckSquare size={18} />}
          accentColor="#F59E0B"
          trendLabel="nécessitent attention"
          trend={overdueActions.length > 0 ? -1 : 0}
          onClick={() => navigate('/actions')}
        />
        <KPICard
          label="RPE moyen (7 jours)"
          value={loading ? '…' : (avgRpe7d || '—')}
          unit={avgRpe7d ? '/ 10' : ''}
          icon={<TrendingUp size={18} />}
          accentColor="#3B82F6"
          trendLabel={avgRpe7d ? (avgRpe7d > 7 ? 'charge élevée' : 'charge modérée') : 'aucune séance'}
          trend={0}
          onClick={() => navigate('/rpe/new')}
        />
      </div>

      {/* Chart + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>
        {/* RPE Chart */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#F1F5F9', marginBottom: 2 }}>Charge collective — 30 derniers jours</h3>
              <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>RPE moyen de l'équipe par séance</p>
            </div>
            <button
              onClick={() => navigate('/rpe/new')}
              style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Voir tout <ArrowRight size={13} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
              <XAxis dataKey="label" interval={4} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
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
              backgroundColor: alerts.length > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(71,85,105,0.12)',
              color: alerts.length > 0 ? '#EF4444' : '#475569',
              borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700,
            }}>
              {loading ? '…' : alerts.length}
            </span>
          </div>
          {!loading && alerts.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune alerte active.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  onClick={() => navigate(`/players/${alert.player.id}`, { state: { from: '/dashboard' } })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px',
                    backgroundColor: '#1E2229', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${alert.type === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: alert.type === 'danger' ? '#EF4444' : '#F59E0B', flexShrink: 0 }} />
                  <PlayerAvatar player={alert.player} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                      {alert.player.lastName} {alert.player.firstName[0]}.
                    </p>
                    <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.message}
                    </p>
                  </div>
                  <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{alert.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming actions */}
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
        {!loading && upcomingActions.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action à venir.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingActions.map(action => {
              const player = players.find(p => p.id === action.playerId);
              const catCfg = categoryConfig[action.category];
              const priCfg = priorityConfig[action.priority];
              const isOverdue = action.dueDate < today;
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
        )}
      </div>
    </div>
  );
}
