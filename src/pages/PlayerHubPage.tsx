import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts';
import { BarChart2, Heart, Activity, Stethoscope, CheckSquare, ArrowRight } from 'lucide-react';
import { playersApi, rpeApi, wellnessApi, medicalApi, actionsApi, statsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { PlayerHero, Card, CardTitle, EmptyState, ChargeRpeComboChart } from '../components';
import { evalColor } from '../data';
import { WELLNESS_DIMENSIONS, wellnessScoreColor, wellnessDimColor, wellnessAvg } from '../utils/wellness';
import { rpeColor, computeAcwr, acwrZone } from '../utils/rpe';
import { mondayIso as getWeekMonday } from '../utils/weeklyLoad';
import { fmtDate, fmtDateWithDay } from '../utils/dateFormat';
import { priorityConfig } from '../data/config';
import type { Player, RPEEntry, WellnessEntry, MedicalRecord, Action, MatchStat } from '../data/types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
}

export default function PlayerHubPage() {
  const { id }        = useParams<{ id: string }>();
  const navigate       = useNavigate();
  const { thresholds, selected } = useTeamSeason();

  const [player,   setPlayer]   = useState<Player | null>(null);
  const [rpe,      setRpe]      = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [medical,  setMedical]  = useState<MedicalRecord[]>([]);
  const [actions,  setActions]  = useState<Action[]>([]);
  const [seasonStats, setSeasonStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [comboView, setComboView] = useState<'session' | 'week'>('session');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      playersApi.getById(id),
      rpeApi.listPlayerHistory(id),
      wellnessApi.getByPlayer(id),
      medicalApi.getByPlayer(id),
      actionsApi.getByPlayer(id),
      statsApi.getPlayerStatsGroupedBySeason(id),
    ]).then(([p, rpeData, wellnessData, medicalData, actionsData, seasonData]) => {
      setPlayer(p);
      setRpe(rpeData);
      setWellness(wellnessData);
      setMedical(medicalData);
      setActions(actionsData);
      setSeasonStats(seasonData);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!id || !player) return <div className="p-4 md:p-6" style={{ color: '#EF4444' }}>Joueur introuvable</div>;

  const playerName    = `${player.firstName} ${player.lastName}`;
  const openActions   = actions.filter(a => a.status !== 'done').length;

  // ── Tâches : à venir vs passées, 3 max par colonne ──
  const today = isoDaysAgo(0);
  const upcomingTasks = [...actions]
    .filter(a => a.status !== 'done' && a.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  const pastTasks = [...actions]
    .filter(a => a.status === 'done' || a.dueDate < today)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 3);

  // ── Infirmerie : blessure en cours, dernière blessure, total saison, ACWR ──
  const injuries = medical.filter(m => m.type === 'injury').sort((a, b) => b.date.localeCompare(a.date));
  const activeInjury = injuries.find(m => m.status === 'active') ?? null;
  const lastInjury    = injuries.find(m => m.id !== activeInjury?.id) ?? null;
  const seasonInjuryCount = selected?.season.startDate
    ? injuries.filter(m => m.date >= selected.season.startDate).length
    : injuries.length;
  const acwr    = computeAcwr(rpe);
  const acwrZ   = acwrZone(acwr);

  // ── Fenêtre 45 jours pour POMS (bien-être) et le graphique Charge & RPE ──
  const cutoff45 = isoDaysAgo(45);
  const wellness45 = wellness.filter(e => e.date >= cutoff45);
  const rpe45       = rpe.filter(e => e.date >= cutoff45);

  const wellnessScoreAvg = wellnessAvg(wellness45.map(e => e.score));
  const radarColor = wellnessScoreColor(wellnessScoreAvg ?? 5);
  const radarData = WELLNESS_DIMENSIONS.map(dim => {
    const vals = wellness45.map(e => e[dim.key] as number);
    const avg  = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : 0;
    return { dim: dim.shortLabel, value: avg, fullMark: 10, inverted: dim.inverted };
  });

  const rpeAvg = rpe45.length > 0 ? Math.round(rpe45.reduce((s, e) => s + e.rpe, 0) / rpe45.length * 10) / 10 : null;
  const weekComboMap = new Map<string, { load: number; rpes: number[] }>();
  rpe45.forEach(e => {
    const k = getWeekMonday(e.date);
    if (!weekComboMap.has(k)) weekComboMap.set(k, { load: 0, rpes: [] });
    const w = weekComboMap.get(k)!;
    w.load += e.rpe * (e.actualDuration ?? e.plannedDuration);
    w.rpes.push(e.rpe);
  });
  const weekCombo = [...weekComboMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, { load, rpes }]) => ({
      date: fmtDateWithDay(d),
      load: Math.round(load),
      rpe:  Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
    }));
  const sessionCombo = [...rpe45]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({
      date: fmtDateWithDay(e.date),
      load: Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
      rpe:  e.rpe,
    }));
  const comboData = comboView === 'session' ? sessionCombo : weekCombo;
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);
  const comboHigh = comboView === 'session' ? sessionLoadNormal : thresholds.normalMax;

  const seasonRows = [...seasonStats]
    .sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel))
    .map(g => {
      const ss = g.stats;
      const n  = ss.length;
      const sum = (k: keyof MatchStat) => ss.reduce((a, m) => a + (((m[k] as number) || 0)), 0);
      const avg = (k: keyof MatchStat) => n > 0 ? Math.round((sum(k) / n) * 10) / 10 : 0;
      const withEval = ss.filter(s => s.eval !== null);
      const evalAvg  = withEval.length > 0 ? Math.round(withEval.reduce((a, s) => a + (s.eval ?? 0), 0) / withEval.length * 10) / 10 : null;
      const withPm = ss.filter(s => s.plusMinus !== null);
      const pmAvg  = withPm.length > 0 ? Math.round(withPm.reduce((a, s) => a + (s.plusMinus ?? 0), 0) / withPm.length * 10) / 10 : null;
      const fg2m = sum('fg2m'), fg2a = sum('fg2a');
      const fg3m = sum('fg3m'), fg3a = sum('fg3a');
      const ftm  = sum('ftm'),  fta  = sum('fta');
      const ro   = sum('ro'),   rd   = sum('rd');
      return {
        seasonId: g.seasonId, seasonLabel: g.seasonLabel, teamName: g.teamName, n,
        starters: ss.filter(s => s.starter).length,
        avgMin: avg('min'), avgPts: avg('pts'),
        fg2m, fg2a, fg2Pct: fg2a > 0 ? Math.round((fg2m / fg2a) * 100) : null,
        fg3m, fg3a, fg3Pct: fg3a > 0 ? Math.round((fg3m / fg3a) * 100) : null,
        ftm, fta, ftPct: fta > 0 ? Math.round((ftm / fta) * 100) : null,
        avgRo: avg('ro'), avgRd: avg('rd'), avgRt: n > 0 ? Math.round((ro + rd) / n * 10) / 10 : 0,
        avgPd: avg('pd'), avgCt: avg('ct'),
        avgInt: avg('intercepts'), avgBp: avg('bp'),
        evalAvg, pmAvg,
      };
    });

  const thStyle: React.CSSProperties = { padding: '6px 8px', color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '7px 8px', color: '#94A3B8', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' };

  return (
    <div className="p-4 md:p-6">
      <div style={{ marginBottom: 14 }}>
        <button onClick={() => navigate('/roster')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
          ← Retour à l'effectif
        </button>
      </div>

      <PlayerHero player={player} marginBottom={20} />

      <Card style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => navigate(`/individual-analyze/${id}`)}>
        <CardTitle icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />}
          right={<ArrowRight size={13} style={{ color: '#475569' }} />}>
          Statistiques — saison par saison
        </CardTitle>
        {seasonRows.length === 0 ? (
          <EmptyState message="Aucune statistique enregistrée." size="sm" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Saison</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Équipe</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>MJ</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Tit</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Min</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Pts</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>2PT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>2PT%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>3PT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>3PT%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>LF</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>LF%</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RO</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RD</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>RT</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Pd</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Ct</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Int</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bp</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Éval</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>±</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map(r => (
                  <tr key={r.seasonId} style={{ borderBottom: '1px solid #1E2229' }}>
                    <td style={{ ...tdStyle, fontFamily: 'inherit', color: '#F1F5F9', fontWeight: 600 }}>{r.seasonLabel}</td>
                    <td style={{ ...tdStyle, fontFamily: 'inherit' }}>{r.teamName || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9', fontWeight: 700 }}>{r.n}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.starters}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgMin}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9', fontWeight: 800 }}>{r.avgPts}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg2m}/{r.fg2a}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg2Pct !== null ? `${r.fg2Pct}%` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg3m}/{r.fg3a}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.fg3Pct !== null ? `${r.fg3Pct}%` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.ftm}/{r.fta}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.ftPct  !== null ? `${r.ftPct}%`  : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgRo}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgRd}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: '#F1F5F9' }}>{r.avgRt}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgPd}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgCt}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgInt}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.avgBp}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: r.evalAvg !== null ? 700 : 400, color: r.evalAvg !== null ? evalColor(r.evalAvg) : '#475569' }}>{r.evalAvg ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: r.pmAvg === null ? '#475569' : r.pmAvg > 0 ? '#00E5A0' : r.pmAvg < 0 ? '#EF4444' : '#94A3B8' }}>{r.pmAvg !== null ? (r.pmAvg > 0 ? `+${r.pmAvg}` : r.pmAvg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 12 }}>
        <Card style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => navigate(`/rpe/individual/${id}`, { state: { from: `/roster/${id}`, playerName } })}>
          <CardTitle icon={<Activity size={12} style={{ color: '#3B82F6' }} />}
            right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {rpeAvg !== null && <span style={{ color: rpeColor(rpeAvg), fontWeight: 700, fontSize: '0.78rem' }}>RPE moy. {rpeAvg}</span>}
              <ArrowRight size={13} style={{ color: '#475569' }} />
            </div>}>
            RPE — 45 derniers jours
          </CardTitle>
          {rpe45.length === 0 ? (
            <EmptyState message="Aucune donnée RPE sur la période." size="sm" />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
              <ChargeRpeComboChart
                data={comboData}
                view={comboView}
                onViewChange={setComboView}
                high={comboHigh}
                title="Charge et RPE"
                height={220}
              />
            </div>
          )}
        </Card>

        <Card style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => navigate(`/wellness/individual/${id}`)}>
          <CardTitle icon={<Heart size={12} style={{ color: '#F472B6' }} />}
            right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#475569', fontSize: '0.7rem' }}>{wellness45.length} saisie{wellness45.length > 1 ? 's' : ''}</span>
              <ArrowRight size={13} style={{ color: '#475569' }} />
            </div>}>
            Bien-être — POMS 45j
          </CardTitle>
          {wellness45.length === 0 ? (
            <EmptyState message="Aucune saisie bien-être sur la période." size="sm" />
          ) : (
            <div style={{ position: 'relative', flex: '1 1 220px', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="68%" margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <PolarGrid stroke="#2A2F3A" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.1} strokeWidth={2}
                    dot={(props: { cx: number; cy: number; index: number }) => {
                      const point = radarData[props.index];
                      if (!point) return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} />;
                      const color = wellnessDimColor(point.value, point.inverted);
                      return <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={color} stroke="#161920" strokeWidth={2} />;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ color: radarColor, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{wellnessScoreAvg ?? '—'}</div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
        <Card style={{ cursor: 'pointer' }} onClick={() => navigate(`/medical/record/${id}`)}>
          <CardTitle icon={<Stethoscope size={12} style={{ color: '#EF4444' }} />}
            right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {acwrZ && <span style={{ color: acwrZ.color, fontWeight: 700, fontSize: '0.78rem' }}>ACWR {acwr} · {acwrZ.label}</span>}
              <ArrowRight size={13} style={{ color: '#475569' }} />
            </div>}>
            Médical
          </CardTitle>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Blessure en cours</span>
              {activeInjury ? (
                <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '0.8rem', textAlign: 'right' }}>{activeInjury.location || activeInjury.description}</span>
              ) : (
                <span style={{ color: '#00E5A0', fontWeight: 600, fontSize: '0.8rem' }}>Aucune</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Dernière blessure</span>
              {lastInjury ? (
                <span style={{ color: '#F1F5F9', fontSize: '0.8rem', textAlign: 'right' }}>{lastInjury.location || lastInjury.description} · {fmtDate(lastInjury.date)}</span>
              ) : (
                <span style={{ color: '#475569', fontSize: '0.8rem' }}>—</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Blessures cette saison</span>
              <span style={{ color: seasonInjuryCount === 0 ? '#00E5A0' : seasonInjuryCount === 1 ? '#F59E0B' : '#EF4444', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{seasonInjuryCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>ACWR (risque de blessure)</span>
              <span style={{ color: acwrZ?.color ?? '#475569', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{acwr !== null ? acwr : '—'}</span>
            </div>
          </div>
        </Card>

        <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/actions', { state: { playerId: id, playerName, from: `/roster/${id}` } })}>
          <CardTitle icon={<CheckSquare size={12} style={{ color: '#F59E0B' }} />}
            right={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: openActions === 0 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.78rem' }}>{openActions} en cours</span>
              <ArrowRight size={13} style={{ color: '#475569' }} />
            </div>}>
            Tâches
          </CardTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
            <div>
              <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>À venir</div>
              {upcomingTasks.length === 0 ? (
                <span style={{ color: '#334155', fontSize: '0.78rem' }}>Aucune tâche à venir</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {upcomingTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: priorityConfig[t.priority].color, flexShrink: 0 }} />
                      <span style={{ color: '#F1F5F9', fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{fmtDate(t.dueDate)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={{ color: '#475569', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Passées</div>
              {pastTasks.length === 0 ? (
                <span style={{ color: '#334155', fontSize: '0.78rem' }}>Aucune tâche passée</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pastTasks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.status === 'done' ? '#00E5A0' : '#EF4444', flexShrink: 0 }} />
                      <span style={{ color: t.status === 'done' ? '#94A3B8' : '#F1F5F9', fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                      <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{fmtDate(t.dueDate)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
