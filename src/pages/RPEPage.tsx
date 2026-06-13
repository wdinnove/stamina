import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { Save, Check } from 'lucide-react';
import { playersApi } from '../api/players';
import { rpeApi } from '../api/rpe';
import { StatusBadge, PlayerAvatar } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, RPEEntry, SessionType } from '../data/types';

const rpeColorScale = (v: number) => {
  if (v <= 3) return '#00E5A0';
  if (v <= 5) return '#22d3ee';
  if (v <= 6) return '#F59E0B';
  if (v <= 8) return '#fb923c';
  return '#EF4444';
};

const rpeLabel = (v: number) => {
  const labels: Record<number, string> = {
    1: 'Très facile', 2: 'Facile', 3: 'Modéré', 4: 'Assez difficile', 5: 'Difficile',
    6: 'Difficile+', 7: 'Très difficile', 8: 'Intense', 9: 'Très intense', 10: 'Maximal',
  };
  return labels[v] ?? '';
};

const sessionTypeLabel: Record<string, string> = {
  training: 'Entraînement',
  match:    'Match',
  gym:      'Gym',
  rest:     'Repos',
};

function today(): string {
  return new Date().toISOString().split('T')[0];
}

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function computeAcwr(history: RPEEntry[]): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const ref = new Date(sorted[sorted.length - 1].date);

  const load = (days: number) => {
    const cutoff = new Date(ref);
    cutoff.setDate(cutoff.getDate() - days);
    const entries = sorted.filter(e => new Date(e.date) >= cutoff);
    if (!entries.length) return 0;
    const sum = entries.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
    return sum / days;
  };

  const acute = load(7);
  const chronic = load(28);
  if (!chronic) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', fontSize: '0.78rem' }}>
      <p style={{ color: '#94A3B8', margin: '0 0 4px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

type Tab = 'collective' | 'individual';

export default function RPEPage() {
  const { selected } = useTeamSeason();

  // ── Roster
  const [roster, setRoster]               = useState<Player[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // ── Collective tab state
  const [activeTab, setActiveTab]         = useState<Tab>('collective');
  const [sessionDate, setSessionDate]     = useState(today());
  const [sessionType, setSessionType]     = useState<SessionType>('training');
  const [duration, setDuration]           = useState(90);
  const [rpeValues, setRpeValues]         = useState<Record<string, number | null>>({});
  const [existingSessionId, setExistingSessionId] = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [saveError, setSaveError]         = useState('');

  // ── Individual tab state
  const [selectedPlayerId, setSelectedPlayerId]   = useState<string | null>(null);
  const [history, setHistory]                     = useState<RPEEntry[]>([]);
  const [loadingHistory, setLoadingHistory]       = useState(false);
  const [historyVersion, setHistoryVersion]       = useState(0);

  // Load roster when season changes
  useEffect(() => {
    if (!selected) { setRoster([]); return; }
    setLoadingRoster(true);
    playersApi.listBySeason(selected.season.id)
      .then(players => {
        setRoster(players);
        setRpeValues(Object.fromEntries(players.map(p => [p.id, null])));
        if (players.length > 0 && !selectedPlayerId) {
          setSelectedPlayerId(players[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRoster(false));
  }, [selected?.season.id]);

  // Check for an existing session when date/team/season changes
  useEffect(() => {
    if (!selected) return;
    rpeApi.findSession(selected.team.id, selected.season.id, sessionDate)
      .then(async session => {
        if (session) {
          setExistingSessionId(session.id);
          setSessionType(session.sessionType);
          setDuration(session.plannedDuration);
          const existing = await rpeApi.loadEntriesForSession(session.id);
          setRpeValues(prev =>
            Object.fromEntries(Object.keys(prev).map(id => [id, existing[id] ?? null]))
          );
        } else {
          setExistingSessionId(null);
          setRpeValues(prev => Object.fromEntries(Object.keys(prev).map(id => [id, null])));
        }
      })
      .catch(() => {});
  }, [selected?.team.id, selected?.season.id, sessionDate]);

  // Load individual history
  useEffect(() => {
    if (!selectedPlayerId || !selected) return;
    setLoadingHistory(true);
    rpeApi.listPlayerHistory(selectedPlayerId)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [selectedPlayerId, selected?.season.id, historyVersion]);

  const activeEntries = Object.entries(rpeValues).filter(([, v]) => v !== null) as [string, number][];
  const avgRpe = activeEntries.length
    ? Math.round(activeEntries.reduce((s, [, v]) => s + v, 0) / activeEntries.length * 10) / 10
    : 0;
  const estimatedLoad = Math.round(avgRpe * duration);

  async function handleSave() {
    if (activeEntries.length === 0 || !selected) return;
    setSaving(true);
    setSaveError('');
    try {
      await rpeApi.saveSession({
        teamId:            selected.team.id,
        seasonId:          selected.season.id,
        date:              sessionDate,
        sessionType,
        plannedDuration:   duration,
        entries:           activeEntries.map(([playerId, rpe]) => ({ playerId, rpe })),
        existingSessionId: existingSessionId ?? undefined,
      });
      setSaved(true);
      setHistoryVersion(v => v + 1);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  // ── Chart data: oldest → newest
  const chartData = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20)
    .map((e, i) => ({
      i,
      date:   fmtDate(e.date),
      rpe:    e.rpe,
      charge: e.rpe * (e.actualDuration ?? e.plannedDuration),
      type:   e.sessionType,
    }));

  // ── Table data: newest → oldest
  const tableData = [...history]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);

  const acwr = computeAcwr(history);
  const selectedPlayer = roster.find(p => p.id === selectedPlayerId);

  if (!selected) {
    return (
      <div style={{ padding: '24px' }}>
        <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Perception de l'Effort (RPE)</h1>
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#475569' }}>
          Sélectionnez une équipe et une saison dans la barre du haut.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Perception de l'Effort (RPE)</h1>
        </div>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['collective', 'individual'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', transition: 'all 0.15s' }}>
              {tab === 'collective' ? 'Saisie collective' : 'Historique joueur'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Collective tab ────────────────────────────────────────── */}
      {activeTab === 'collective' && (
        <div>
          {/* Session config */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Date</p>
              <input
                type="date"
                value={sessionDate}
                onChange={e => setSessionDate(e.target.value)}
                style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type de séance</p>
              <select value={sessionType} onChange={e => setSessionType(e.target.value as SessionType)}
                style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
                <option value="training">Entraînement</option>
                <option value="match">Match</option>
                <option value="gym">Gym</option>
                <option value="rest">Repos</option>
              </select>
            </div>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Durée planifiée</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" value={duration} min={1} max={300}
                  onChange={e => setDuration(Number(e.target.value))}
                  style={{ width: 64, padding: '5px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', textAlign: 'center' }} />
                <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>min</span>
              </div>
            </div>
            {existingSessionId && (
              <div style={{ padding: '4px 10px', borderRadius: 5, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00E5A0', fontSize: '0.75rem', fontWeight: 600 }}>
                Séance existante chargée
              </div>
            )}
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Charge collective estimée</p>
              <p style={{ color: '#00E5A0', fontSize: '1.05rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                {avgRpe} × {duration} = <span style={{ color: '#F1F5F9' }}>{estimatedLoad} UA</span>
              </p>
            </div>
          </div>

          {/* Player grid */}
          {loadingRoster ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement du roster…</div>
          ) : roster.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
              Aucune joueur dans le roster pour cette saison. Ajoutez des joueurs depuis <em>Mon Roster</em>.
            </div>
          ) : (
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2F3A', display: 'flex', gap: 20 }}>
                <span style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 180 }}>Joueur</span>
                <span style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>RPE (1 très facile → 10 maximal)</span>
                <span style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 100, textAlign: 'right' }}>Valeur</span>
              </div>
              {roster.map(player => {
                const val = rpeValues[player.id] ?? null;
                const unavailable = player.status === 'injured' || player.status === 'unavailable';
                return (
                  <div key={player.id}
                    style={{ padding: '12px 20px', borderBottom: '1px solid #1E2229', display: 'flex', alignItems: 'center', gap: 16, opacity: unavailable ? 0.45 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 180, flexShrink: 0 }}>
                      <PlayerAvatar player={player} size={28} />
                      <div>
                        <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600 }}>
                          {player.lastName} {player.firstName[0]}.
                        </span>
                        <div style={{ marginTop: 1 }}>
                          <StatusBadge status={player.status} size="sm" />
                        </div>
                      </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                        <button
                          key={v}
                          disabled={unavailable}
                          onClick={() => setRpeValues(prev => ({ ...prev, [player.id]: prev[player.id] === v ? null : v }))}
                          style={{
                            width: 32, height: 32, borderRadius: 6, border: '1px solid',
                            borderColor: val === v ? rpeColorScale(v) : '#2A2F3A',
                            backgroundColor: val === v ? rpeColorScale(v) + '22' : 'transparent',
                            color: val === v ? rpeColorScale(v) : '#94A3B8',
                            cursor: unavailable ? 'not-allowed' : 'pointer',
                            fontSize: '0.82rem', fontWeight: val === v ? 700 : 400,
                            transition: 'all 0.1s',
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>
                      {val !== null ? (
                        <span style={{ color: rpeColorScale(val), fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace' }}>
                          {val} — {rpeLabel(val)}
                        </span>
                      ) : (
                        <span style={{ color: '#334155', fontSize: '0.78rem' }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            {saveError && <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{saveError}</span>}
            <button
              onClick={handleSave}
              disabled={activeEntries.length === 0 || saving}
              style={{
                padding: '10px 24px',
                backgroundColor: saved ? '#1E2229' : activeEntries.length === 0 ? '#1A1F27' : '#00E5A0',
                border: saved ? '1px solid #00E5A0' : 'none',
                borderRadius: 6, color: saved ? '#00E5A0' : activeEntries.length === 0 ? '#334155' : '#0D0F14',
                cursor: activeEntries.length === 0 || saving ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: '0.88rem',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
              }}
            >
              {saved ? <><Check size={15} /> Enregistré !</> : <><Save size={15} /> {saving ? 'Enregistrement…' : `Enregistrer (${activeEntries.length})`}</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Individual tab ────────────────────────────────────────── */}
      {activeTab === 'individual' && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <select
              value={selectedPlayerId ?? ''}
              onChange={e => setSelectedPlayerId(e.target.value)}
              style={{ padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}
            >
              {roster.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
          </div>

          {loadingHistory ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement…</div>
          ) : history.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
              Aucune donnée RPE pour {selectedPlayer?.firstName} {selectedPlayer?.lastName} cette saison.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              {/* Chart */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 20 }}>
                <h3 style={{ color: '#F1F5F9', marginBottom: 4 }}>
                  RPE — {selectedPlayer?.firstName} {selectedPlayer?.lastName}
                </h3>
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', marginBottom: 16 }}>
                  {chartData.length} dernière{chartData.length > 1 ? 's' : ''} séance{chartData.length > 1 ? 's' : ''}
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="i" tickFormatter={i => chartData[i]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={8} stroke="#EF4444" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="rpe" stroke="#00E5A0" strokeWidth={2} dot={{ fill: '#00E5A0', r: 3 }} name="RPE" />
                  </LineChart>
                </ResponsiveContainer>

                {/* ACWR */}
                {acwr !== null && (
                  <div style={{ marginTop: 16, padding: 12, backgroundColor: '#1E2229', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>ACWR (ratio charge aiguë/chronique)</p>
                      <p style={{ color: acwr < 1.3 ? '#00E5A0' : '#EF4444', fontSize: '1.2rem', fontWeight: 800, margin: '4px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>
                        {acwr} {acwr < 1.3 ? '✅' : '⚠️'}
                      </p>
                    </div>
                    <div style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '8px 12px', maxWidth: 280 }}>
                      <p style={{ color: '#F59E0B', fontSize: '0.75rem', margin: 0 }}>⚠️ Seuil d'alerte : ACWR &gt; 1.5 = risque blessure élevé</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Charge chart */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 20 }}>
                <h3 style={{ color: '#F1F5F9', marginBottom: 4 }}>Charge d'entraînement</h3>
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', marginBottom: 16 }}>RPE × durée (UA)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="i" tickFormatter={i => chartData[i]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="charge" fill="#22d3ee" radius={[3, 3, 0, 0]} name="Charge (UA)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* History table */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '110px 1fr 140px 50px 70px 80px', gap: 8 }}>
                  {['Date', 'Séance', 'Équipe', 'RPE', 'Durée', 'Charge'].map(h => (
                    <span key={h} style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>
                {tableData.map((entry, idx) => (
                  <div key={idx} style={{ padding: '10px 20px', borderBottom: '1px solid #1E2229', display: 'grid', gridTemplateColumns: '110px 1fr 140px 50px 70px 80px', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#94A3B8', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmtDate(entry.date)}
                    </span>
                    <span style={{ color: '#F1F5F9', fontSize: '0.82rem' }}>{sessionTypeLabel[entry.sessionType] ?? entry.sessionType}</span>
                    <span style={{ color: '#94A3B8', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.teamName ?? '—'}</span>
                    <span style={{ color: rpeColorScale(entry.rpe), fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace' }}>{entry.rpe}</span>
                    <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>{entry.actualDuration ?? entry.plannedDuration}min</span>
                    <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>
                      {entry.rpe * (entry.actualDuration ?? entry.plannedDuration)} UA
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
