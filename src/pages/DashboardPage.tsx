import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Clock, Users, Activity, Trophy } from 'lucide-react';
import { PlayerAvatar } from '../components';
import { categoryConfig } from '../data/config';
import { playersApi, medicalApi, actionsApi, wellnessApi } from '../api';
import { supabase } from '../api/client';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, Action, MedicalRecord } from '../data/types';

const LAST_MATCH = { result: 'V', score: '78 - 62', opponent: 'US Guilherand', competition: 'NF2', date: '12/06' };

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv');
}
function fmtShort(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}
function fmtWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' });
}

interface TrainingSession { id: string; date: string; planned_duration: number }
interface AlertItem { player: Player; type: 'danger' | 'warning'; message: string; detail: string }

// ── Card commune ──────────────────────────────────────────────────────────────
function Card({ children, style, onClick, accentColor }: {
  children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void; accentColor?: string;
}) {
  return (
    <div onClick={onClick} style={{
      backgroundColor: '#161920',
      border: '1px solid #2A2F3A',
      borderLeft: accentColor ? `3px solid ${accentColor}` : '1px solid #2A2F3A',
      borderRadius: 8,
      padding: '14px 16px',
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
      {icon && <span style={{ color: '#475569' }}>{icon}</span>}
      <p style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{children}</p>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { selected, loading: teamLoading } = useTeamSeason();

  const today = useMemo(() => localDate(0), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  const [userName,    setUserName]    = useState('');
  const [players,     setPlayers]     = useState<Player[]>([]);
  const [injuries,    setInjuries]    = useState<MedicalRecord[]>([]);
  const [actions,     setActions]     = useState<Action[]>([]);
  const [alerts,      setAlerts]      = useState<AlertItem[]>([]);
  const [lastSession, setLastSession] = useState<TrainingSession | null>(null);
  const [sessIsToday, setSessIsToday] = useState(false);
  const [avgRpe7d,    setAvgRpe7d]    = useState<number | null>(null);
  const [loading,     setLoading]     = useState(false);

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

    const from30 = localDate(-30);
    const from7  = localDate(-7);

    Promise.all([
      playersApi.listBySeason(selected.season.id),
      medicalApi.getActiveInjuries(),
      actionsApi.list(),
      supabase
        .from('training_sessions')
        .select('id, date, planned_duration')
        .eq('team_id', selected.team.id)
        .eq('season_id', selected.season.id)
        .gte('date', from30)
        .lte('date', today)
        .order('date', { ascending: true }),
      wellnessApi.list({ from: from7, to: today }),
    ])
      .then(async ([seasonPlayers, activeInjuries, allActions, sessResult, wellnessEntries]) => {
        setPlayers(seasonPlayers);
        setInjuries(activeInjuries);

        const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));
        setActions(
          allActions
            .filter(a => a.status !== 'done' && seasonPlayerIds.has(a.playerId))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        );

        // Dernière séance
        const sessions = (sessResult.data ?? []) as TrainingSession[];
        const latest = sessions.length > 0 ? sessions[sessions.length - 1] : null;
        setLastSession(latest);
        setSessIsToday(latest?.date === today);

        // RPE moyen 7 jours
        const sessionIds7d = sessions.filter(s => s.date >= from7).map(s => s.id);
        if (sessionIds7d.length > 0) {
          const { data: rpeRows } = await supabase
            .from('rpe_entries').select('rpe').in('session_id', sessionIds7d);
          const vals = (rpeRows ?? []).map((r: { rpe: number }) => r.rpe);
          setAvgRpe7d(vals.length ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length * 10) / 10 : null);
        } else {
          setAvgRpe7d(null);
        }

        // Alertes
        const playerMap = new Map(seasonPlayers.map(p => [p.id, p]));
        const alertItems: AlertItem[] = [];
        const seen = new Set<string>();
        const yesterday = localDate(-1);

        activeInjuries.slice(0, 6).forEach(inj => {
          const player = playerMap.get(inj.playerId);
          if (!player || seen.has(player.id)) return;
          seen.add(player.id);
          alertItems.push({ player, type: 'danger', message: inj.description, detail: inj.rtpDate ? `RTP ${inj.rtpDate.slice(5).replace('-', '/')}` : 'En cours' });
        });
        wellnessEntries.filter(w => w.score < 6 && !seen.has(w.playerId)).forEach(w => {
          if (alertItems.length >= 8) return;
          const player = playerMap.get(w.playerId);
          if (!player) return;
          seen.add(w.playerId);
          alertItems.push({ player, type: 'warning', message: 'Bien-être dégradé', detail: `${w.score.toFixed(1)}/10` });
        });
        const yestIds = sessions.filter(s => s.date === yesterday).map(s => s.id);
        if (yestIds.length > 0) {
          const { data: yRpe } = await supabase.from('rpe_entries').select('rpe, player_id').in('session_id', yestIds);
          (yRpe ?? []).filter((r: { rpe: number; player_id: string }) => r.rpe > 8 && !seen.has(r.player_id)).forEach((r: { rpe: number; player_id: string }) => {
            if (alertItems.length >= 8) return;
            const player = playerMap.get(r.player_id);
            if (!player) return;
            seen.add(r.player_id);
            alertItems.push({ player, type: 'warning', message: 'RPE élevé hier', detail: `RPE ${r.rpe}/10` });
          });
        }
        setAlerts(alertItems);
        setLoading(false);
      })
      .catch(err => { console.error('[Dashboard]', err); setLoading(false); });
  }, [selected, teamLoading, today]);

  const activePlayers  = players.filter(p => p.status === 'active').length;
  const injuredPlayers = players.filter(p => p.status === 'injured').length;
  const overdueActions = actions.filter(a => a.dueDate < today);
  const rpeColor = avgRpe7d === null ? '#475569' : avgRpe7d >= 8 ? '#EF4444' : avgRpe7d >= 6 ? '#F59E0B' : '#00E5A0';
  const isWin = LAST_MATCH.result === 'V';

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;
  if (!selected) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Sélectionnez une équipe et une saison dans la barre du haut pour afficher le dashboard.</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', marginBottom: 2 }}>{userName ? `Bonjour ${userName}` : 'Bonjour'}</h1>
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: 0 }}>{todayLabel} · {selected.team.name}</p>
      </div>

      {/* Ligne 1 : 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 16 }}>

        {/* 1. Effectif & blessures */}
        <Card accentColor={injuredPlayers > 0 ? '#EF4444' : '#00E5A0'} onClick={() => navigate('/roster')}>
          <CardLabel icon={<Users size={12} />}>Effectif</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
            <span style={{ color: '#00E5A0', fontSize: '1.8rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
              {loading ? '…' : activePlayers}
            </span>
            <span style={{ color: '#475569', fontSize: '0.82rem' }}>/ {loading ? '…' : players.length}</span>
          </div>
          {injuredPlayers > 0
            ? <span style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 600 }}>{injuredPlayers} blessé{injuredPlayers > 1 ? 's' : ''}</span>
            : <span style={{ color: '#00E5A0', fontSize: '0.72rem', fontWeight: 600 }}>Effectif complet</span>
          }
        </Card>

        {/* 2. Dernier match */}
        <Card accentColor={isWin ? '#00E5A0' : '#EF4444'} onClick={() => {}}>
          <CardLabel icon={<Trophy size={12} />}>Dernier match</CardLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: isWin ? '#00E5A0' : '#EF4444', fontSize: '1.8rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
              {LAST_MATCH.result}
            </span>
            <span style={{ color: '#F1F5F9', fontSize: '1rem', fontWeight: 700 }}>{LAST_MATCH.score}</span>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', margin: 0 }}>vs {LAST_MATCH.opponent}</p>
        </Card>

        {/* 3. Dernière séance */}
        <Card accentColor={sessIsToday ? '#00E5A0' : '#3B82F6'} onClick={() => lastSession ? navigate(`/sessions/${lastSession.id}`) : navigate('/sessions')}>
          <CardLabel icon={<Activity size={12} />}>Dernière séance</CardLabel>
          {lastSession ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span style={{ color: sessIsToday ? '#00E5A0' : '#F1F5F9', fontSize: '1.8rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {lastSession.planned_duration}
                </span>
                <span style={{ color: '#475569', fontSize: '0.82rem' }}>min</span>
              </div>
              <span style={{ color: '#64748B', fontSize: '0.72rem' }}>
                {sessIsToday ? "Aujourd'hui" : `${fmtWeekday(lastSession.date)} ${fmtShort(lastSession.date)}`}
              </span>
            </>
          ) : (
            <span style={{ color: '#334155', fontSize: '0.8rem', fontStyle: 'italic' }}>Aucune séance récente</span>
          )}
        </Card>

        {/* 4. RPE moyen 7j */}
        <Card accentColor={rpeColor} onClick={() => selected ? navigate(`/rpe/team/${selected.team.id}`) : navigate('/rpe')}>
          <CardLabel icon={<Activity size={12} />}>RPE moyen — 7j</CardLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
            <span style={{ color: rpeColor, fontSize: '1.8rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
              {loading ? '…' : avgRpe7d !== null ? avgRpe7d.toFixed(1) : '—'}
            </span>
            {avgRpe7d !== null && <span style={{ color: '#475569', fontSize: '0.82rem' }}>/10</span>}
          </div>
          <span style={{ color: '#64748B', fontSize: '0.72rem' }}>
            {avgRpe7d === null ? 'Aucune donnée' : avgRpe7d >= 8 ? 'Charge élevée' : avgRpe7d >= 6 ? 'Charge modérée' : 'Charge légère'}
          </span>
        </Card>
      </div>

      {/* Ligne 2 : joueurs à surveiller + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]" style={{ gap: 16 }}>

        {/* Joueurs à surveiller */}
        {!loading && players.length > 0 && (() => {
          const alertById = new Map(alerts.map(a => [a.player.id, a]));
          return (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ color: '#F1F5F9', fontWeight: 700, margin: 0 }}>Joueurs à surveiller</p>
                {alerts.length > 0 && (
                  <span style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {alerts.length} alerte{alerts.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: 8 }}>
                {players.map(player => {
                  const alert = alertById.get(player.id);
                  const isDanger  = alert?.type === 'danger';
                  const isWarning = alert?.type === 'warning';
                  const dotColor    = isDanger ? '#EF4444' : isWarning ? '#F59E0B' : '#00E5A0';
                  const borderColor = isDanger ? '#EF4444' : isWarning ? '#F59E0B' : 'rgba(0,229,160,0.15)';
                  const bgColor     = isDanger ? 'rgba(239,68,68,0.08)' : isWarning ? 'rgba(245,158,11,0.08)' : '#1E2229';
                  return (
                    <div key={player.id} onClick={() => navigate(`/players/${player.id}`, { state: { from: '/dashboard' } })}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', backgroundColor: bgColor, borderRadius: 6, border: `${alert ? '2px' : '1px'} solid ${borderColor}`, cursor: 'pointer' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0, boxShadow: alert ? `0 0 6px ${dotColor}` : 'none' }} />
                      <PlayerAvatar player={player} size={26} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {player.lastName} {player.firstName[0]}.
                        </p>
                        <p style={{ color: alert ? dotColor : '#00E5A0', fontSize: '0.7rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: alert ? 600 : 400 }}>
                          {alert ? alert.message : 'Disponible'}
                        </p>
                      </div>
                      {alert && <span style={{ color: dotColor, fontSize: '0.65rem', flexShrink: 0, fontWeight: 600 }}>{alert.detail}</span>}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Actions */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 700, margin: 0 }}>Actions</p>
            <button onClick={() => navigate('/actions')} style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
              Voir tout <ArrowRight size={12} />
            </button>
          </div>

          {overdueActions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <p style={{ color: '#EF4444', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                En retard ({overdueActions.length})
              </p>
              {overdueActions.slice(0, 4).map(action => {
                const player = players.find(p => p.id === action.playerId);
                const cat = categoryConfig[action.category];
                return (
                  <div key={action.id} onClick={() => navigate('/actions')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', backgroundColor: 'rgba(239,68,68,0.07)', borderRadius: 5, marginBottom: 4, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {player && <PlayerAvatar player={player} size={22} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#F1F5F9', fontSize: '0.76rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.title}</p>
                      <p style={{ color: cat.color, fontSize: '0.65rem', margin: 0 }}>{cat.label}</p>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#EF4444', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>
                      <Clock size={9} />{action.dueDate.slice(5).replace('-', '/')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {actions.filter(a => a.dueDate >= today).length > 0 && (
            <div>
              <p style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>À venir</p>
              {actions.filter(a => a.dueDate >= today).slice(0, 5).map(action => {
                const player = players.find(p => p.id === action.playerId);
                const cat = categoryConfig[action.category];
                return (
                  <div key={action.id} onClick={() => navigate('/actions')}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 5, marginBottom: 4, cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1E2229'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'}
                  >
                    {player && <PlayerAvatar player={player} size={22} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#CBD5E1', fontSize: '0.76rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.title}</p>
                      <p style={{ color: cat.color, fontSize: '0.65rem', margin: 0 }}>{cat.label}</p>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#475569', fontSize: '0.65rem', flexShrink: 0 }}>
                      <Clock size={9} />{action.dueDate.slice(5).replace('-', '/')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {actions.length === 0 && !loading && (
            <p style={{ color: '#334155', fontSize: '0.82rem', margin: 0, textAlign: 'center', paddingTop: 20 }}>Aucune action en cours.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
