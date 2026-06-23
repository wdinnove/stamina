import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Save, Check, Mail, X } from 'lucide-react';
import { sendEmail } from '../api/email';
import { playersApi } from '../api/players';
import { wellnessApi } from '../api/wellness';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from '../components/RichTextEditor';
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

  const [showLinkModal,    setShowLinkModal]    = useState(false);
  const [linkSelected,     setLinkSelected]     = useState<Set<string>>(new Set());
  const [linkSending,      setLinkSending]      = useState(false);
  const [linkSendResult,   setLinkSendResult]   = useState<{ sent: number; skipped: string[]; failed: string[] } | null>(null);

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
  const last3      = historyAsc.slice(-3);

  const lineData = last14.map((e, i) => ({
    idx: i, date: fmtDate(e.date),
    fatigue: e.fatigue, humeur: e.mood, stress: e.stress,
    motivation: e.motivation, sommeil: e.sleep, douleur: e.soreness, score: e.score,
  }));

  const radarData = last3.length > 0
    ? dimensions.map(d => ({
        dim: d.label,
        value: parseFloat((last3.reduce((s, e) => s + (e[d.key as keyof WellnessEntry] as number), 0) / last3.length).toFixed(1)),
        fullMark: 10,
      }))
    : [];
  const avgScore      = last3.length > 0 ? last3.reduce((s, e) => s + e.score, 0) / last3.length : 5;
  const radarColor    = scoreColor(avgScore);

  const heatmapData = historyAsc.map(e => ({
    date: e.date, score: e.score,
    label: new Date(e.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3),
  }));

  const tableData  = [...history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const heatColor  = (v: number) => v >= 7 ? '#00E5A033' : v >= 5 ? '#F59E0B33' : '#EF444433';
  const heatBorder = (v: number) => v >= 7 ? '#00E5A0'   : v >= 5 ? '#F59E0B'   : '#EF4444';

  function openLinkModal() {
    setLinkSelected(new Set(roster.filter(p => p.email).map(p => p.id)));
    setLinkSendResult(null);
    setShowLinkModal(true);
  }

  async function handleSendLinks() {
    setLinkSending(true);
    setLinkSendResult(null);
    const skipped: string[] = [];
    const failed: string[] = [];
    let sent = 0;
    const toSend = roster.filter(p => linkSelected.has(p.id));
    for (const player of toSend) {
      const name = `${player.firstName} ${player.lastName}`;
      if (!player.email) { skipped.push(name); continue; }
      try {
        const url = `${window.location.origin}/player/${player.id}/wellness`;
        await sendEmail({
          to: [{ email: player.email, name }],
          template_id: 'jpzkmgq5vqng059v',
          personalization: [{ email: player.email, data: { name: player.firstName, url } }],
        });
        sent++;
      } catch {
        failed.push(name);
      }
    }
    setLinkSendResult({ sent, skipped, failed });
    setLinkSending(false);
  }

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
      const player = roster.find(p => p.id === selectedPlayerId);
      const playerName = player ? `${player.firstName} ${player.lastName}` : undefined;
      notifyOrg('wellness_added', `Bien-être saisi${playerName ? ` — ${playerName}` : ''}`, entryDate, 'player', selectedPlayerId ?? undefined);
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
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Bien-être</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={openLinkModal} disabled={roster.length === 0}
              style={{ padding: '6px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: roster.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              <Mail size={13} />
              <span className="hidden sm:inline">Envoyer les liens</span>
            </button>
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
              {(['entry', 'history'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
                  {tab === 'entry' ? 'Saisie' : 'Historique'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Player selector */}
      <div style={{ marginBottom: 24 }}>
        {loadingRoster ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Chargement…</span>
        ) : roster.length === 0 ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucun joueur dans le roster pour cette saison.</span>
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
                  <div className="grid grid-cols-5 lg:grid-cols-10" style={{ gap: 4 }}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                      <button key={v} onClick={() => setValues(prev => ({ ...prev, [dim.key]: v }))}
                        style={{ height: 36, borderRadius: 6, border: `1px solid ${val === v ? dimColor(v, dim.inverted) : '#2A2F3A'}`, backgroundColor: val === v ? dimColor(v, dim.inverted) + '22' : '#1E2229', color: val === v ? dimColor(v, dim.inverted) : '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: val === v ? 700 : 400, transition: 'all 0.1s' }}
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
            <RichTextEditor value={note} onChange={setNote} placeholder="Je sens mes jambes lourdes depuis hier soir..." minHeight={80} />
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

            {/* Ligne 1 : Heatmap pleine largeur */}
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
              <h3 style={{ color: '#F1F5F9', margin: '0 0 14px', fontSize: '0.9rem' }}>Heatmap bien-être — historique complet</h3>
              <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                <div style={{ display: 'flex', gap: 6, minWidth: 'max-content' }}>
                  {heatmapData.map((day, i) => (
                    <div key={i} title={`${fmtDate(day.date)} — Score: ${day.score}`}
                      style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: heatColor(day.score), border: `1px solid ${heatBorder(day.score)}44`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, flexShrink: 0 }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.62rem' }}>{day.label}</span>
                      <span style={{ color: heatBorder(day.score), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{day.score}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Indicateur de sens */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, gap: 6 }}>
                <span style={{ color: '#475569', fontSize: '0.68rem' }}>← plus ancien</span>
                <div style={{ flex: 1, height: 1, backgroundColor: '#2A2F3A' }} />
                <span style={{ color: '#475569', fontSize: '0.68rem' }}>aujourd'hui →</span>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                {[['#00E5A0', '≥ 7 Bien'], ['#F59E0B', '5–7 Modéré'], ['#EF4444', '< 5 Attention']].map(([c, l]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c + '44', border: `1px solid ${c}` }} />
                    <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ligne 2 : POMS | Graphique */}
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
              {/* POMS — moyenne 3 dernières saisies */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
                <h3 style={{ color: '#F1F5F9', margin: '0 0 2px', fontSize: '0.9rem' }}>Profil POMS</h3>
                <p style={{ color: '#475569', fontSize: '0.74rem', margin: '0 0 8px' }}>Moyenne des {last3.length} dernière{last3.length > 1 ? 's' : ''} saisie{last3.length > 1 ? 's' : ''}</p>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#2A2F3A" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.15} strokeWidth={2}
                      dot={(props: { cx: number; cy: number; index: number }) => {
                        const dim = dimensions[props.index];
                        const dataPoint = radarData[props.index];
                        if (!dim || !dataPoint) return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} />;
                        const color = dimColor(dataPoint.value, dim.inverted);
                        return <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={color} stroke="#161920" strokeWidth={2} />;
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Graphique d'évolution + légende */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.9rem' }}>Évolution 14 jours</h3>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { color: '#00E5A0', label: 'Score',   opacity: 1   },
                      { color: '#EF4444', label: 'Fatigue', opacity: 0.7 },
                      { color: '#F59E0B', label: 'Stress',  opacity: 0.7 },
                    ].map(({ color, label, opacity }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 18, height: 2, backgroundColor: color, borderRadius: 1, opacity }} />
                        <span style={{ color: '#94A3B8', fontSize: '0.7rem' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
                    <XAxis dataKey="idx" tickFormatter={idx => lineData[idx]?.date ?? ''} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#94A3B8', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line dataKey="score"   stroke="#00E5A0" strokeWidth={2.5} dot={false} name="Score" />
                    <Line dataKey="fatigue" stroke="#EF4444" strokeWidth={1.5} dot={false} name="Fatigue" strokeOpacity={0.7} />
                    <Line dataKey="stress"  stroke="#F59E0B" strokeWidth={1.5} dot={false} name="Stress"  strokeOpacity={0.7} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ligne 3 : Tableau pleine largeur */}
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '90px repeat(6, 1fr) 56px', gap: 4, minWidth: 500 }}>
                  {['Date', 'Fatigue', 'Humeur', 'Stress', 'Motiv.', 'Sommeil', 'Douleurs', 'Score'].map(h => (
                    <span key={h} style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: h === 'Score' ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {tableData.map((e, idx) => (
                  <div key={idx} style={{ padding: '6px 14px', borderBottom: '1px solid #1A1E26', display: 'grid', gridTemplateColumns: '90px repeat(6, 1fr) 56px', gap: 4, alignItems: 'center', minWidth: 500 }}>
                    <span style={{ color: '#64748B', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(e.date)}</span>
                    {dimensions.map((dim, i) => {
                      const val = [e.fatigue, e.mood, e.stress, e.motivation, e.sleep, e.soreness][i];
                      return (
                        <span key={i} style={{ color: dimColor(val, dim.inverted), fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
                      );
                    })}
                    <span style={{ color: scoreColor(e.score), fontWeight: 700, fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{e.score}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )
      )}

      {/* ── Modale envoi liens wellness ── */}
      {showLinkModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: 28, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem' }}>Envoyer les liens bien-être</h2>
              <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {linkSendResult ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>
                  {linkSendResult.failed.length > 0 && linkSendResult.sent === 0 ? '✗' : '✓'}
                </div>
                <p style={{ color: '#F1F5F9', margin: '0 0 4px', fontWeight: 600 }}>
                  {linkSendResult.sent} lien{linkSendResult.sent > 1 ? 's' : ''} envoyé{linkSendResult.sent > 1 ? 's' : ''}
                </p>
                {linkSendResult.failed.length > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, textAlign: 'left' }}>
                    <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 4px', fontWeight: 600 }}>Échec d'envoi</p>
                    {linkSendResult.failed.map(n => (
                      <p key={n} style={{ color: '#EF4444', fontSize: '0.75rem', margin: '2px 0' }}>· {n}</p>
                    ))}
                  </div>
                )}
                {linkSendResult.skipped.length > 0 && (
                  <div style={{ marginTop: 10, padding: '10px 14px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, textAlign: 'left' }}>
                    <p style={{ color: '#F59E0B', fontSize: '0.78rem', margin: '0 0 4px', fontWeight: 600 }}>Sans email</p>
                    {linkSendResult.skipped.map(n => (
                      <p key={n} style={{ color: '#F59E0B', fontSize: '0.75rem', margin: '2px 0' }}>· {n}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowLinkModal(false)}
                  style={{ marginTop: 20, padding: '8px 24px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700 }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                    {linkSelected.size} joueur{linkSelected.size > 1 ? 's' : ''} sélectionné{linkSelected.size > 1 ? 's' : ''}
                  </span>
                  <button onClick={() => {
                    const withEmail = roster.filter(p => p.email).map(p => p.id);
                    setLinkSelected(prev => prev.size === withEmail.length ? new Set() : new Set(withEmail));
                  }} style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', fontSize: '0.78rem' }}>
                    Tout sélectionner / désélectionner
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  {roster.map(player => {
                    const hasEmail = !!player.email;
                    const checked  = linkSelected.has(player.id);
                    return (
                      <label key={player.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, backgroundColor: checked ? 'rgba(0,229,160,0.06)' : '#1E2229', border: `1px solid ${checked ? 'rgba(0,229,160,0.2)' : '#2A2F3A'}`, cursor: hasEmail ? 'pointer' : 'not-allowed', opacity: hasEmail ? 1 : 0.45 }}>
                        <input type="checkbox" checked={checked} disabled={!hasEmail}
                          onChange={() => setLinkSelected(prev => {
                            const next = new Set(prev);
                            checked ? next.delete(player.id) : next.add(player.id);
                            return next;
                          })}
                          style={{ accentColor: '#00E5A0', width: 15, height: 15 }} />
                        <span style={{ flex: 1, color: '#F1F5F9', fontSize: '0.85rem' }}>
                          {player.firstName} {player.lastName}
                        </span>
                        {hasEmail
                          ? <span style={{ color: '#475569', fontSize: '0.72rem' }}>{player.email}</span>
                          : <span style={{ color: '#EF4444', fontSize: '0.72rem' }}>Pas d'email</span>
                        }
                      </label>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setShowLinkModal(false)}
                    style={{ flex: 1, padding: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                    Annuler
                  </button>
                  <button onClick={handleSendLinks} disabled={linkSending || linkSelected.size === 0}
                    style={{ flex: 1, padding: 10, backgroundColor: linkSending || linkSelected.size === 0 ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: linkSending || linkSelected.size === 0 ? '#475569' : '#0D0F14', cursor: linkSending || linkSelected.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Mail size={14} /> {linkSending ? 'Envoi…' : `Envoyer (${linkSelected.size})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
