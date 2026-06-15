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
import { weekMonday, getWeekTier, WEEK_TIERS } from '../utils/weeklyLoad';
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
  const [weekTierCounts, setWeekTierCounts] = useState<{ légère: number; normale: number; surcharge: number } | null>(null);
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
        .select('id, date, planned_duration')
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
        const d = new Date();
        const daysUntilSunday = d.getDay() === 0 ? 0 : 7 - d.getDay();
        d.setDate(d.getDate() + daysUntilSunday);
        const endOfWeek = d.toLocaleDateString('sv');
        setUpcomingActions(
          allActions
            .filter(a => a.status !== 'done' && a.dueDate <= endOfWeek && seasonPlayerIds.has(a.playerId))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .slice(0, 8)
        );

        const playerMap = new Map(seasonPlayers.map(p => [p.id, p]));

        // Two-step RPE: sessions → entries
        const sessions = (sessionsResult.data ?? []) as Array<{ id: string; date: string; planned_duration: number }>;
        const sessionIds = sessions.map(s => s.id);
        const sessionDateMap = Object.fromEntries(sessions.map(s => [s.id, s.date]));
        const sessionDurMap  = Object.fromEntries(sessions.map(s => [s.id, s.planned_duration]));

        let rpeRows: Array<{ rpe: number; player_id: string; session_id: string; actual_duration: number | null }> = [];
        if (sessionIds.length > 0) {
          const { data } = await supabase
            .from('rpe_entries')
            .select('rpe, player_id, session_id, actual_duration')
            .in('session_id', sessionIds);
          rpeRows = (data ?? []) as typeof rpeRows;
        }

        // Charge semaine par joueur
        const weekStart = weekMonday();
        const weekSessionIds = new Set(sessions.filter(s => s.date >= weekStart).map(s => s.id));
        const weekUaByPlayer = new Map<string, number>();
        rpeRows.forEach(r => {
          if (!weekSessionIds.has(r.session_id)) return;
          const dur = r.actual_duration ?? sessionDurMap[r.session_id] ?? 90;
          weekUaByPlayer.set(r.player_id, (weekUaByPlayer.get(r.player_id) ?? 0) + r.rpe * dur);
        });
        const counts = { légère: 0, normale: 0, surcharge: 0 };
        weekUaByPlayer.forEach(ua => {
          const tier = getWeekTier(ua);
          if (tier.label === 'Légère')    counts.légère++;
          else if (tier.label === 'Normale') counts.normale++;
          else                               counts.surcharge++;
        });
        setWeekTierCounts(weekUaByPlayer.size > 0 ? counts : null);

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
            type: 'danger',
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
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 12, marginBottom: 24 }}>
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

      {/* Charge semaine — répartition */}
      {!loading && weekTierCounts && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Charge semaine</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
            {WEEK_TIERS.map(tier => {
              const count = tier.label === 'Légère' ? weekTierCounts.légère : tier.label === 'Normale' ? weekTierCounts.normale : weekTierCounts.surcharge;
              return (
                <div key={tier.label} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: tier.bg, border: `1px solid ${tier.color}44`, borderRadius: 6, padding: '5px 12px' }}>
                  <span style={{ color: tier.color, fontSize: '1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{count}</span>
                  <div>
                    <div style={{ color: tier.color, fontSize: '0.72rem', fontWeight: 700 }}>{tier.label}</div>
                    <div style={{ color: '#475569', fontSize: '0.62rem' }}>{tier.ref}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart + Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]" style={{ gap: 16, marginBottom: 16 }}>
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

        {/* Prochaines actions */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ color: '#F1F5F9' }}>Prochaines actions</h3>
            <button
              onClick={() => navigate('/actions')}
              style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Voir tout <ArrowRight size={13} />
            </button>
          </div>
          {!loading && upcomingActions.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action à venir.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingActions.map(action => {
                const player = players.find(p => p.id === action.playerId);
                const catCfg = categoryConfig[action.category];
                const isOverdue = action.dueDate < today;
                return (
                  <div key={action.id} onClick={() => navigate('/actions')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', backgroundColor: isOverdue ? 'rgba(239,68,68,0.07)' : '#1E2229', borderRadius: 6, cursor: 'pointer', border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : 'transparent'}` }}>
                    {player && <PlayerAvatar player={player} size={26} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player ? `${player.lastName} ${player.firstName[0]}.` : '—'} · {action.title}
                      </p>
                      <p style={{ color: catCfg.color, fontSize: '0.68rem', margin: '2px 0 0' }}>{catCfg.label}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      {isOverdue && <span style={{ color: '#EF4444', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>En retard</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isOverdue ? '#EF4444' : '#94A3B8', fontSize: '0.7rem' }}>
                        <Clock size={10} />{action.dueDate.slice(5).replace('-', '/')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Joueurs à surveiller — tous les joueurs */}
      {!loading && players.length > 0 && (() => {
        const alertById = new Map(alerts.map(a => [a.player.id, a]));
        return (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ color: '#F1F5F9' }}>Joueurs à surveiller</h3>
              {alerts.length > 0 && (
                <span style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4" style={{ gap: 8 }}>
              {players.map(player => {
                const alert = alertById.get(player.id);
                const isDanger = alert?.type === 'danger';
                const isWarning = alert?.type === 'warning';
                const dotColor   = isDanger ? '#EF4444' : isWarning ? '#F59E0B' : '#00E5A0';
                const borderColor = isDanger ? '#EF4444' : isWarning ? '#F59E0B' : 'rgba(0,229,160,0.15)';
                const borderWidth = alert ? '2px' : '1px';
                const bgColor     = isDanger ? 'rgba(239,68,68,0.08)' : isWarning ? 'rgba(245,158,11,0.08)' : '#1E2229';
                return (
                  <div
                    key={player.id}
                    onClick={() => navigate(`/players/${player.id}`, { state: { from: '/dashboard' } })}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', backgroundColor: bgColor, borderRadius: 6, border: `${borderWidth} solid ${borderColor}`, cursor: 'pointer', transition: 'opacity 0.15s' }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, boxShadow: alert ? `0 0 6px ${dotColor}` : 'none' }} />
                    <PlayerAvatar player={player} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.lastName} {player.firstName[0]}.
                      </p>
                      <p style={{ color: alert ? dotColor : '#00E5A0', fontSize: '0.7rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: alert ? 600 : 400 }}>
                        {alert ? alert.message : 'Tout va bien'}
                      </p>
                    </div>
                    {alert && <span style={{ color: dotColor, fontSize: '0.65rem', flexShrink: 0, textAlign: 'right', fontWeight: 600 }}>{alert.detail}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
