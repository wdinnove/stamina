import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Save, Check, Mail, X, Heart, TrendingUp, Users, Smile, Meh, Frown } from 'lucide-react';
import { sendEmail } from '../api/email';
import { playersApi } from '../api/players';
import { wellnessApi } from '../api/wellness';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from '../components/RichTextEditor';
import { DateRangeCard, useDateRange, PlayerSelect, Card, CardTitle } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { WELLNESS_DIMENSIONS, wellnessScoreColor, wellnessDimColor, wellnessAvg, wellnessGlobalScore, wellnessStatus } from '../utils/wellness';
import type { Player, WellnessEntry } from '../data/types';

const dimensions = WELLNESS_DIMENSIONS;
const scoreColor = wellnessScoreColor;
const dimColor   = wellnessDimColor;

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
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

type Tab = 'entry' | 'history' | 'team';

const TAB_SLUGS: Record<string, Tab> = {
  new:        'entry',
  individual: 'history',
  team:       'team',
};

export default function WellnessPage() {
  const { selected } = useTeamSeason();
  const navigate     = useNavigate();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab = TAB_SLUGS[tabSlug ?? ''] ?? 'entry';
  const selectedPlayerId = activeTab === 'team' ? null : (urlId ?? null);

  const setActiveTab = (t: Tab) => {
    if (t === 'team') {
      navigate(selected ? `/wellness/team/${selected.team.id}` : '/wellness/team', { replace: true });
      return;
    }
    const slug = t === 'entry' ? 'new' : 'individual';
    const pid  = selectedPlayerId ?? roster[0]?.id;
    navigate(pid ? `/wellness/${slug}/${pid}` : `/wellness/${slug}`, { replace: true });
  };

  const setSelectedPlayerId = (id: string) => {
    const slug = activeTab === 'entry' ? 'new' : 'individual';
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

  const [teamHistory, setTeamHistory]               = useState<WellnessEntry[]>([]);
  const [loadingTeamHistory, setLoadingTeamHistory] = useState(false);

  const dateRange = useDateRange(selected?.season.startDate, 21);
  const [evoTab, setEvoTab] = useState<'global' | 'detail' | 'history'>('global');

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
        if (players.length > 0 && !urlId && activeTab !== 'team') {
          const slug = activeTab === 'entry' ? 'new' : 'individual';
          navigate(`/wellness/${slug}/${players[0].id}`, { replace: true });
        } else if (activeTab === 'team' && !urlId) {
          navigate(`/wellness/team/${selected.team.id}`, { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRoster(false));
  }, [selected?.season.id]);

  useEffect(() => {
    if (activeTab !== 'team' || roster.length === 0) return;
    setLoadingTeamHistory(true);
    Promise.all(roster.map(p => wellnessApi.getByPlayer(p.id)))
      .then(lists => setTeamHistory(lists.flat()))
      .catch(() => {})
      .finally(() => setLoadingTeamHistory(false));
  }, [activeTab, roster, historyVersion]);

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
  const score = wellnessGlobalScore(values as { fatigue: number; mood: number; stress: number; motivation: number; sleep: number; soreness: number });

  // Dernière saisie enregistrée avant la date en cours d'édition, pour donner un repère pendant la saisie
  const previousEntry = history.find(e => e.date < entryDate) ?? null;
  const scoreDiff = previousEntry ? Math.round((score - previousEntry.score) * 10) / 10 : null;

  const isTeamView = activeTab === 'team';

  // Agrégat quotidien de l'équipe : moyenne de chaque dimension entre tous les joueurs ayant saisi ce jour-là
  const teamDailySeries: WellnessEntry[] = (() => {
    const byDate = new Map<string, WellnessEntry[]>();
    teamHistory.forEach(e => {
      const arr = byDate.get(e.date);
      if (arr) arr.push(e); else byDate.set(e.date, [e]);
    });
    return [...byDate.entries()].map(([date, entries]) => ({
      id: date, playerId: 'team', date,
      fatigue:    wellnessAvg(entries.map(e => e.fatigue))    ?? 0,
      mood:       wellnessAvg(entries.map(e => e.mood))       ?? 0,
      stress:     wellnessAvg(entries.map(e => e.stress))     ?? 0,
      motivation: wellnessAvg(entries.map(e => e.motivation)) ?? 0,
      sleep:      wellnessAvg(entries.map(e => e.sleep))      ?? 0,
      soreness:   wellnessAvg(entries.map(e => e.soreness))   ?? 0,
      score:      wellnessAvg(entries.map(e => e.score))      ?? 0,
    }));
  })();

  const sourceHistory = isTeamView ? teamDailySeries : history;

  const historyInRange = sourceHistory.filter(e =>
    (!dateRange.from || e.date >= dateRange.from) && (!dateRange.to || e.date <= dateRange.to)
  );
  const historyAsc = [...historyInRange].sort((a, b) => a.date.localeCompare(b.date));

  // Une mini-série par dimension : valeurs brutes sur la courbe, axe inversé pour les dimensions
  // "inversées" (fatigue/stress/douleurs) pour que le haut du graphique reste toujours "mieux".
  const dimensionSeries = dimensions.map(dim => {
    const rawValues = historyAsc.map(e => e[dim.key as keyof WellnessEntry] as number);
    const avg = rawValues.length > 0 ? Math.round(rawValues.reduce((s, v) => s + v, 0) / rawValues.length * 10) / 10 : null;
    return {
      ...dim,
      avg,
      series: historyAsc.map((e, i) => ({ idx: i, date: fmtDate(e.date), value: e[dim.key as keyof WellnessEntry] as number })),
    };
  });

  // Score global de la période : une seule moyenne, réutilisée pour le radar POMS et le KPI "Score global"
  const scoreAvg    = wellnessAvg(historyInRange.map(e => e.score));
  const radarColor  = scoreColor(scoreAvg ?? 5);

  const radarData = dimensionSeries.map(dim => ({ dim: dim.label, value: dim.avg ?? 0, fullMark: 10 }));

  // Série du score global (déjà "plus haut = mieux", pas d'inversion nécessaire)
  const scoreSeries = historyAsc.map((e, i) => ({ idx: i, date: fmtDate(e.date), value: e.score }));

  const tableData = [...historyInRange].sort((a, b) => b.date.localeCompare(a.date));

  // ── KPI de la période : score global + les 6 dimensions, avec l'écart vs la moyenne de la saison ──
  // Pas de comparaison quand le preset sélectionné est déjà "Saison" (l'écart serait toujours ~0).
  const seasonEntries = selected?.season.startDate
    ? sourceHistory.filter(e => e.date >= selected.season.startDate)
    : sourceHistory;
  const seasonScoreAvg = wellnessAvg(seasonEntries.map(e => e.score));
  const showSeasonDiff = dateRange.preset !== 'saison';

  const periodKpis = [
    {
      key: 'score', emoji: '⚡', label: 'Score global', inverted: false,
      value: scoreAvg,
      prev:  showSeasonDiff ? seasonScoreAvg : null,
    },
    ...dimensionSeries.map(dim => ({
      key: dim.key, emoji: dim.emoji, label: dim.shortLabel, inverted: dim.inverted,
      value: dim.avg,
      prev: showSeasonDiff ? wellnessAvg(seasonEntries.map(e => e[dim.key as keyof WellnessEntry] as number)) : null,
    })),
  ];

  // ── Résumé en langage naturel de la période, affiché sous le sélecteur de dates ──
  const goodDims = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'good').map(d => d.shortLabel);
  const midDims  = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'mid').map(d => d.shortLabel);
  const badDims  = dimensionSeries.filter(d => d.avg !== null && wellnessStatus(d.avg, d.inverted) === 'bad').map(d => d.shortLabel);
  const insightStatus: 'good' | 'mid' | 'bad' | null = scoreAvg === null ? null : wellnessStatus(scoreAvg, false);
  const insightColor  = insightStatus === null ? '#475569' : scoreColor(scoreAvg ?? 5);
  const insightLabel  = insightStatus === 'good' ? 'plutôt bonne' : insightStatus === 'mid' ? 'moyenne' : 'compliquée';
  const InsightIcon   = insightStatus === 'good' ? Smile : insightStatus === 'mid' ? Meh : Frown;
  const insightSeasonDiff = showSeasonDiff && scoreAvg !== null && seasonScoreAvg !== null
    ? Math.round((scoreAvg - seasonScoreAvg) * 10) / 10 : null;
  const insightSeasonPhrase = insightSeasonDiff === null ? null
    : Math.abs(insightSeasonDiff) < 0.2 ? 'stable par rapport à la saison'
    : insightSeasonDiff > 0 ? `en progression par rapport à la saison (+${insightSeasonDiff})`
    : `en baisse par rapport à la saison (${insightSeasonDiff})`;

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
          subject: 'Formulaire bien-être',
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Bien-être</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
              {(['entry', 'history', 'team'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
                  {tab === 'entry' ? 'Nouvelle saisie' : tab === 'history' ? 'Historique joueur' : 'Historique équipe'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Player selector */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {isTeamView ? (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200 }}>
            <Users size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />
            <div style={{
              width: '100%', padding: '8px 12px 8px 32px', backgroundColor: '#1E2229',
              border: '1px solid #00E5A050', borderRadius: 6, color: '#F1F5F9',
              fontSize: '0.85rem', fontWeight: 600,
            }}>
              {selected?.team.name}
            </div>
          </div>
        ) : loadingRoster ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Chargement…</span>
        ) : roster.length === 0 ? (
          <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucun joueur dans l'effectif pour cette saison.</span>
        ) : (
          <PlayerSelect players={roster} value={selectedPlayerId ?? ''} onChange={setSelectedPlayerId} />
        )}

        {activeTab === 'entry' && (
          <button onClick={openLinkModal} disabled={roster.length === 0}
            style={{ marginLeft: 'auto', padding: '6px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: roster.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
            <Mail size={13} />
            <span className="hidden sm:inline">Envoyer les liens</span>
          </button>
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
              const prevVal = previousEntry ? (previousEntry[dim.key as keyof WellnessEntry] as number) : null;
              return (
                <div key={dim.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>{dim.emoji}</span>
                      <span style={{ fontWeight: 500 }}>{dim.label}</span>
                      {prevVal !== null && (
                        <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 400 }}>préc. {prevVal}</span>
                      )}
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
              {previousEntry && scoreDiff !== null && (
                <p style={{ color: Math.abs(scoreDiff) < 0.05 ? '#475569' : scoreDiff > 0 ? '#00E5A0' : '#EF4444', fontSize: '0.75rem', margin: '4px 0 0' }}>
                  vs dernière saisie ({fmtDate(previousEntry.date)}, {previousEntry.score}) : {Math.abs(scoreDiff) < 0.05 ? '=' : `${scoreDiff > 0 ? '▲ +' : '▼ '}${scoreDiff}`}
                </p>
              )}
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
      {(activeTab === 'history' || activeTab === 'team') && (
        <>
          <DateRangeCard
            from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
            onPreset={p => dateRange.applyPreset(p, selected?.season.startDate)}
            onFrom={dateRange.setFrom} onTo={dateRange.setTo}
          />

          {/* Résumé en langage naturel de la période */}
          {!loadingHistory && !loadingTeamHistory && (selectedPlayer || isTeamView) && insightStatus !== null && (
            <div style={{
              backgroundColor: `${insightColor}10`, border: `1px solid ${insightColor}40`, borderLeft: `4px solid ${insightColor}`,
              borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
            }}>
              <InsightIcon size={22} style={{ color: insightColor, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ color: '#F1F5F9', margin: 0, fontSize: '0.86rem', fontWeight: 600 }}>
                  {isTeamView ? "L'équipe traverse" : `${selectedPlayer?.firstName} traverse`} une période {insightLabel} ({scoreAvg}/10){insightSeasonPhrase ? `, ${insightSeasonPhrase}` : ''}
                </p>
                {(goodDims.length > 0 || midDims.length > 0 || badDims.length > 0) && (
                  <p style={{ color: '#94A3B8', margin: '4px 0 0', fontSize: '0.8rem' }}>
                    {goodDims.length > 0 && (
                      <><span style={{ color: '#00E5A0', fontWeight: 600 }}>Points forts</span> : {goodDims.join(', ')}. </>
                    )}
                    {midDims.length > 0 && (
                      <><span style={{ color: '#F59E0B', fontWeight: 600 }}>Points d'attention</span> : {midDims.join(', ')}. </>
                    )}
                    {badDims.length > 0 && (
                      <><span style={{ color: '#EF4444', fontWeight: 600 }}>Points négatifs</span> : {badDims.join(', ')}.</>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {(isTeamView ? loadingTeamHistory : loadingHistory) ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>Chargement…</div>
          ) : historyInRange.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
              Aucune donnée bien-être {isTeamView ? "pour l'équipe" : selectedPlayer ? `pour ${selectedPlayer.firstName} ${selectedPlayer.lastName}` : ''} sur la période sélectionnée.
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Ligne 0 : Résumé chiffré de la période */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" style={{ gap: 10 }}>
              {periodKpis.map((k, i) => {
                const color = k.value !== null ? dimColor(k.value, k.inverted) : '#475569';
                const diff  = k.value !== null && k.prev !== null ? Math.round((k.value - k.prev) * 10) / 10 : null;
                const flat  = diff !== null && Math.abs(diff) < 0.05;
                const better = diff !== null ? (k.inverted ? diff < 0 : diff > 0) : null;
                return (
                  <Card key={k.key} className={i === 0 ? 'col-span-2 sm:col-span-1' : undefined} accentColor={k.value !== null ? color : undefined} style={{ textAlign: 'center', padding: '10px 8px' }}>
                    <div style={{ color: '#475569', fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.emoji} {k.label}</div>
                    <div style={{ color, fontSize: '1.2rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{k.value ?? '—'}</div>
                    <div style={{ fontSize: '0.66rem', marginTop: 4, fontWeight: 600, color: diff === null ? '#334155' : flat ? '#475569' : better ? '#00E5A0' : '#EF4444' }}>
                      {diff === null ? '—' : flat ? '=' : `${better ? '▲' : '▼'} ${diff > 0 ? '+' : ''}${diff}`}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Ligne 2 : POMS | Évolution */}
            <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
              <Card className="md:col-span-1" style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
                <CardTitle icon={<Heart size={12} style={{ color: '#F472B6' }} />} mb={14}
                  right={<span style={{ color: '#475569', fontSize: '0.7rem' }}>{historyAsc.length} saisie{historyAsc.length > 1 ? 's' : ''}</span>}
                >Profil POMS</CardTitle>
                <div style={{ position: 'relative', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="68%" margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                      <PolarGrid stroke="#2A2F3A" />
                      <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                      <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.1} strokeWidth={2}
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
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                    <div style={{ color: radarColor, fontSize: '1.1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{scoreAvg ?? '—'}</div>
                  </div>
                </div>
              </Card>

              <Card className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column' }}>
                <CardTitle icon={<TrendingUp size={12} style={{ color: '#00E5A0' }} />} mb={14} align="flex-start"
                  right={
                    <div style={{ display: 'flex', gap: 2, backgroundColor: '#0D0F14', borderRadius: 6, padding: 2 }}>
                      {([['global', 'Global'], ['detail', 'Par type'], ['history', 'Historique']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setEvoTab(key)}
                          style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: evoTab === key ? 700 : 400, backgroundColor: evoTab === key ? '#1E2229' : 'transparent', color: evoTab === key ? '#00E5A0' : '#475569', whiteSpace: 'nowrap' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  }
                >Évolution</CardTitle>

                {evoTab === 'global' && (
                  <div style={{ flex: 1, minHeight: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={scoreSeries} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          {/* y1/y2 approximés sur la zone de tracé typique une fois la card étirée à la hauteur de POMS,
                              pour que le dégradé corresponde à l'échelle 0–10 affichée */}
                          <linearGradient id="grad-score" gradientUnits="userSpaceOnUse" x1="0" y1={5} x2="0" y2={225}>
                            <stop offset="0%"   stopColor="#00E5A0" />
                            <stop offset="30%"  stopColor="#00E5A0" />
                            <stop offset="50%"  stopColor="#F59E0B" />
                            <stop offset="70%"  stopColor="#EF4444" />
                            <stop offset="100%" stopColor="#EF4444" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                        <XAxis dataKey="idx" tickFormatter={idx => scoreSeries[idx]?.date ?? ''}
                          interval={Math.max(0, Math.ceil(scoreSeries.length / 10) - 1)}
                          tick={{ fill: '#475569', fontSize: 10 }} />
                        <YAxis domain={[0, 10]} ticks={[3, 6, 10]} width={28} tick={{ fill: '#475569', fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line dataKey="value" name="Score" stroke="url(#grad-score)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {evoTab === 'detail' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 10 }}>
                      {dimensionSeries.map(dim => {
                        const boxColor = dim.avg !== null ? dimColor(dim.avg, dim.inverted) : '#1E2229';
                        return (
                        <div key={dim.key} style={{ backgroundColor: '#0D0F14', border: `1px solid ${boxColor}50`, borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ marginBottom: 8 }}>
                            <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600 }}>{dim.emoji} {dim.shortLabel}</span>
                          </div>
                          <ResponsiveContainer width="100%" height={70}>
                            <LineChart data={dim.series}>
                              <defs>
                                {/* Repères alignés sur les mêmes seuils que partout ailleurs dans l'app : ≥7 vert, ≥5 orange, sinon rouge (rouge plein dès ≤3 pour rester visible) */}
                                <linearGradient id={`grad-${dim.key}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={70}>
                                  <stop offset="0%"   stopColor="#00E5A0" />
                                  <stop offset="30%"  stopColor="#00E5A0" />
                                  <stop offset="50%"  stopColor="#F59E0B" />
                                  <stop offset="70%"  stopColor="#EF4444" />
                                  <stop offset="100%" stopColor="#EF4444" />
                                </linearGradient>
                              </defs>
                              <YAxis domain={[0, 10]} reversed={dim.inverted} hide />
                              <Tooltip content={<CustomTooltip />} />
                              <Line
                                dataKey="value" name={dim.label} stroke={`url(#grad-${dim.key})`} strokeWidth={2.5}
                                dot={false} isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {evoTab === 'history' && (
                  <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                    <div style={{ padding: '8px 14px', borderBottom: '1px solid #2A2F3A', display: 'grid', gridTemplateColumns: '90px repeat(6, 1fr) 56px', gap: 4, minWidth: 500 }}>
                      {['Date', ...dimensions.map(d => d.shortLabel), 'Score'].map(h => (
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
                )}
              </Card>
            </div>

          </div>
        )}
        </>
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
