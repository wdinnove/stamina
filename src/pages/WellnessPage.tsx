import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Save, Check } from 'lucide-react';
import { playersApi } from '../api/players';
import { wellnessApi } from '../api/wellness';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, WellnessEntry } from '../data/types';

const dimensions = [
  { key: 'fatigue',    label: 'Fatigue',              emoji: '😴', desc: 'Très reposé ← → Épuisé',           inverted: true  },
  { key: 'mood',       label: 'Humeur',               emoji: '😊', desc: 'Très mauvaise ← → Très bonne',     inverted: false },
  { key: 'stress',     label: 'Stress / Tension',     emoji: '😰', desc: 'Calme ← → Très stressé',           inverted: true  },
  { key: 'motivation', label: 'Motivation',            emoji: '💪', desc: 'Aucune motivation ← → Très motivé', inverted: false },
  { key: 'sleep',      label: 'Qualité du sommeil',   emoji: '🌙', desc: 'Mauvaise ← → Excellente',          inverted: false },
  { key: 'soreness',   label: 'Douleurs musculaires', emoji: '🦵', desc: 'Aucune ← → Très intenses',         inverted: true  },
];

const scoreColor  = (v: number) => v >= 7 ? '#00E5A0' : v >= 5 ? '#F59E0B' : '#EF4444';
const dimColor    = (v: number, inverted: boolean) => scoreColor(inverted ? 11 - v : v);

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function previewScore(values: Record<string, number>): number {
  return Math.round((
    (10 - values.fatigue) + values.mood + (10 - values.stress) +
    values.motivation + values.sleep + (10 - values.soreness)
  ) / 6 * 10) / 10;
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

type Tab = 'entry' | 'history';

const TAB_SLUGS: Record<string, Tab> = {
  new:     'entry',
  history: 'history',
};

export default function WellnessPage() {
  const { selected } = useTeamSeason();
  const navigate     = useNavigate();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'entry';
  const selectedPlayerId = urlId ?? null;

  const setActiveTab = (t: Tab) => {
    const slug = t === 'entry' ? 'new' : 'history';
    const pid  = selectedPlayerId ?? roster[0]?.id;
    navigate(pid ? `/wellness/${slug}/${pid}` : `/wellness/${slug}`, { replace: true });
  };

  const setSelectedPlayerId = (id: string) => {
    const slug = activeTab === 'entry' ? 'new' : 'history';
    navigate(`/wellness/${slug}/${id}`, { replace: true });
  };

  const [roster, setRoster]               = useState<Player[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [values, setValues]       = useState<Record<string, number>>(
    Object.fromEntries(dimensions.map(d => [d.key, 5]))
  );
  const [note, setNote]           = useState('');
  const [existingEntryId, setExistingEntryId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState('');

  const [history, setHistory]               = useState<WellnessEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!selected) { setRoster([]); return; }
    setLoadingRoster(true);
    playersApi.listBySeason(selected.season.id)
      .then(players => {
        setRoster(players);
        if (players.length > 0 && !urlId) {
          const slug = activeTab === 'entry' ? 'new' : 'history';
          navigate(`/wellness/${slug}/${players[0].id}`, { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRoster(false));
  }, [selected?.season.id]);

  useEffect(() => {
    if (!selectedPlayerId) { setHistory([]); return; }
    setLoadingHistory(true);
    wellnessApi.getByPlayer(selectedPlayerId)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [selectedPlayerId, historyVersion]);

  useEffect(() => {
    if (!selectedPlayerId) { setExistingEntryId(null); return; }
    wellnessApi.getByPlayerDate(selectedPlayerId, entryDate)
      .then(entry => {
        if (entry) {
          setExistingEntryId(entry.id);
          setValues({ fatigue: entry.fatigue, mood: entry.mood, stress: entry.stress, motivation: entry.motivation, sleep: entry.sleep, soreness: entry.soreness });
          setNote(entry.notes ?? '');
        } else {
          setExistingEntryId(null);
          setValues(Object.fromEntries(dimensions.map(d => [d.key, 5])));
          setNote('');
        }
      })
      .catch(() => {});
  }, [selectedPlayerId, entryDate]);

  const selectedPlayer = roster.find(p => p.id === selectedPlayerId);
  const score = previewScore(values);

  const historyAsc = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last14     = historyAsc.slice(-14);
  const lastEntry  = historyAsc[historyAsc.length - 1];

  const lineData = last14.map((e, i) => ({
    idx: i, date: fmtDate(e.date),
    fatigue: e.fatigue, humeur: e.mood, stress: e.stress,
    motivation: e.motivation, sommeil: e.sleep, douleur: e.soreness, score: e.score,
  }));

  const radarData = lastEntry
    ? dimensions.map(d => ({ dim: d.label, value: lastEntry[d.key as keyof WellnessEntry] as number, fullMark: 10 }))
    : [];

  const heatmapData = last14.map(e => ({
    date: e.date, score: e.score,
    label: new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3),
  }));

  const tableData  = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const heatColor  = (v: number) => v >= 7 ? '#00E5A033' : v >= 5 ? '#F59E0B33' : '#EF444433';
  const heatBorder = (v: number) => v >= 7 ? '#00E5A0'   : v >= 5 ? '#F59E0B'   : '#EF4444';

  async function handleSave() {
    if (!selectedPlayerId) return;
    setSaving(true);
    setSaveError('');
    try {
      await wellnessApi.create({
        playerId: selectedPlayerId, date: entryDate,
        fatigue: values.fatigue, mood: values.mood, stress: values.stress,
        motivation: values.motivation, sleep: values.sleep, soreness: values.soreness,
        notes: note || undefined,
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

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Perception Émotionnelle</h1>
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#475569' }}>
          Sélectionnez une équipe et une saison dans la barre du haut.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Bien-être</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['entry', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
              {tab === 'entry'
                ? <><span className="hidden sm:inline">Nouvelle saisie</span><span className="sm:hidden">Saisie</span></>
                : 'Historique'}
            </button>
          ))}
        </div>
      </div>

      {/* Player selector */}
      <div style={{ marginBottom: 24 }}>
        {loadingRoster ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Chargement…</span>
        ) : roster.length === 0 ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune joueur dans le roster pour cette saison.</span>
        ) : (
          <select value={selectedPlayerId ?? ''} onChange={e => setSelectedPlayerId(e.target.value)}
            style={{ padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}>
            {roster.map(p => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Entry tab */}
      {activeTab === 'entry' && selectedPlayerId && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '24px' }}>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Comment tu te sens, {selectedPlayer?.firstName} ?</h2>
              {existingEntryId && (
                <div style={{ marginTop: 6, display: 'inline-block', padding: '3px 10px', borderRadius: 5, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', color: '#00E5A0', fontSize: '0.75rem', fontWeight: 600 }}>
                  Saisie existante chargée
                </div>
              )}
            </div>
            <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)}
              style={{ padding: '6px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20 }}>
            {dimensions.map(dim => {
              const val = values[dim.key];
              return (
                <div key={dim.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>{dim.emoji}</span>
                      <span style={{ fontWeight: 500 }}>{dim.label}</span>
                    </label>
                    <span style={{ color: dimColor(val, dim.inverted), fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace', minWidth: 20, textAlign: 'right' }}>{val}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                      <button key={v} onClick={() => setValues(prev => ({ ...prev, [dim.key]: v }))}
                        style={{ width: 'calc(20% - 3.2px)', height: 36, borderRadius: 6, border: `1px solid ${val === v ? dimColor(v, dim.inverted) : '#2A2F3A'}`, backgroundColor: val === v ? dimColor(v, dim.inverted) + '22' : '#1E2229', color: val === v ? dimColor(v, dim.inverted) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}
                      >{v}</button>
                    ))}
                  </div>
                  <p style={{ color: '#475569', fontSize: '0.72rem', margin: '4px 0 0' }}>{dim.desc}</p>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 20 }}>
            <label style={{ color: '#94A3B8', display: 'block', marginBottom: 6 }}>💬 Note libre (facultatif)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Je sens mes jambes lourdes depuis hier soir..."
              style={{ width: '100%', padding: '10px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', resize: 'vertical', minHeight: 80, boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }} />
          </div>

          <div style={{ marginTop: 20, padding: '12px 16px', backgroundColor: '#1E2229', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: 0 }}>Score bien-être global</p>
              <p style={{ color: scoreColor(score), fontSize: '1.4rem', fontWeight: 800, margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace' }}>
                {score} / 10 {score < 5 ? '⚠️ Attention' : score < 7 ? '🟡 Modéré' : '✅ Bien'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {saveError && <span style={{ color: '#EF4444', fontSize: '0.78rem' }}>{saveError}</span>}
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 24px', backgroundColor: saved ? '#1E2229' : '#00E5A0', border: saved ? '1px solid #00E5A0' : 'none', borderRadius: 6, color: saved ? '#00E5A0' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}>
                {saved ? <><Check size={15} /> Enregistré !</> : <><Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History tab */}
      {activeTab === 'history' && (
        loadingHistory ? (
          <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement…</div>
        ) : history.length === 0 ? (
          <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
            Aucune donnée bien-être pour {selectedPlayer?.firstName} {selectedPlayer?.lastName}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
                <h3 style={{ color: '#F1F5F9', marginBottom: 16 }}>Profil POMS — dernière saisie</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#2A2F3A" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Radar name="Score" dataKey="value" stroke="#00E5A0" fill="#00E5A0" fillOpacity={0.15} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
                <h3 style={{ color: '#F1F5F9', marginBottom: 16 }}>Évolution 14 jours</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="idx" tickFormatter={idx => lineData[idx]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line dataKey="score"   stroke="#00E5A0" strokeWidth={2.5} dot={false} name="Score" />
                    <Line dataKey="fatigue" stroke="#EF4444" strokeWidth={1}   dot={false} name="Fatigue" strokeOpacity={0.6} />
                    <Line dataKey="stress"  stroke="#F59E0B" strokeWidth={1}   dot={false} name="Stress"  strokeOpacity={0.6} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
              <h3 style={{ color: '#F1F5F9', marginBottom: 16 }}>Heatmap bien-être (14 jours)</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {heatmapData.map((day, i) => (
                  <div key={i} title={`${fmtDate(day.date)} — Score: ${day.score}`}
                    style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: heatColor(day.score), border: `1px solid ${heatBorder(day.score)}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <span style={{ color: '#94A3B8', fontSize: '0.62rem' }}>{day.label}</span>
                    <span style={{ color: heatBorder(day.score), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{day.score}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                {[['#00E5A0', '≥ 7 Bien'], ['#F59E0B', '5-7 Modéré'], ['#EF4444', '< 5 Attention']].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c + '44', border: `1px solid ${c}` }} />
                    <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '100px repeat(6, 1fr) 60px', gap: 4, minWidth: 560 }}>
                  {['Date', 'Fat.', 'Hum.', 'Str.', 'Mot.', 'Som.', 'Doul.', 'Score'].map(h => (
                    <span key={h} style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                  ))}
                </div>
                {tableData.map((e, idx) => (
                  <div key={idx} style={{ padding: '9px 16px', borderBottom: '1px solid #1E2229', display: 'grid', gridTemplateColumns: '100px repeat(6, 1fr) 60px', gap: 4, alignItems: 'center', minWidth: 560 }}>
                    <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(e.date)}</span>
                    {[e.fatigue, e.mood, e.stress, e.motivation, e.sleep, e.soreness].map((v, i) => (
                      <span key={i} style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{v}</span>
                    ))}
                    <span style={{ color: scoreColor(e.score), fontWeight: 700, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{e.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
