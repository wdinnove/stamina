import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import {
  Plus, Search, Activity, Heart,
  Stethoscope, CheckSquare, BarChart2, X, AlertCircle, Edit, ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import { playersApi, rpeApi, wellnessApi, medicalApi, actionsApi, statsApi } from '../api';
import { attendanceApi } from '../api/attendance';
import { computeWeeklyUa, getWeekTier } from '../utils/weeklyLoad';
import { StatusBadge, PlayerAvatar, Breadcrumb } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { formatDate, getAge } from '../data';
import type { Player, RPEEntry, WellnessEntry, MedicalRecord, Action, MatchStat } from '../data/types';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtShortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const RPETooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
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

const wellDimensions = [
  { key: 'fatigue',    label: 'Fatigue',    inverted: true  },
  { key: 'mood',       label: 'Humeur',     inverted: false },
  { key: 'stress',     label: 'Stress',     inverted: true  },
  { key: 'motivation', label: 'Motivation', inverted: false },
  { key: 'sleep',      label: 'Sommeil',    inverted: false },
  { key: 'soreness',   label: 'Douleurs',   inverted: true  },
];
const wellScoreColor = (v: number) => v >= 7 ? '#00E5A0' : v >= 5 ? '#F59E0B' : '#EF4444';
const wellDimColor   = (v: number, inv: boolean) => wellScoreColor(inv ? 11 - v : v);

const POSITIONS: Player['position'][] = ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot'];

const STATUSES: { value: Player['status']; label: string }[] = [
  { value: 'active',      label: 'Actif' },
  { value: 'injured',     label: 'Blessé' },
  { value: 'limited',     label: 'Limité' },
  { value: 'suspended',   label: 'Suspendu' },
  { value: 'unavailable', label: 'Indisponible' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const flagEmoji: Record<string, string> = { FR: '🇫🇷', ES: '🇪🇸', CI: '🇨🇮', MA: '🇲🇦', IT: '🇮🇹' };

const BACK_LABELS: Record<string, string> = {
  '/players':   'Joueurs',
  '/roster':    'Effectif',
  '/dashboard': 'Dashboard',
};

// ── Sparkline SVG inline ──────────────────────────────────────────────────────
function Sparkline({ values, color, h = 36 }: { values: number[]; color: string; h?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const VW = 200;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * VW,
    h - 2 - ((v - min) / range) * (h - 4),
  ]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${VW} ${h}`} style={{ width: '100%', height: h, display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r={3} fill={color} />
    </svg>
  );
}

const MOCK_MATCH_STATS: MatchStat[] = [
  { id:'m1',  playerId:'', date:'2026-04-12', opponent:'Pau Lacq-Orthez', homeAway:'home', competition:'Pro B', result:'win',  scoreUs:82, scoreThem:74, starter:true,  min:31, pts:18, fg2m:4, fg2a:7,  fg3m:2, fg3a:5, ftm:4, fta:4,  ro:1, rd:5, pd:3, ct:1, intercepts:2, bp:2, fte:3, fpr:4, eval:22, plusMinus:12 },
  { id:'m2',  playerId:'', date:'2026-04-05', opponent:'Vichy-Clermont',  homeAway:'away', competition:'Pro B', result:'loss', scoreUs:67, scoreThem:71, starter:true,  min:28, pts:11, fg2m:3, fg2a:6,  fg3m:1, fg3a:4, ftm:2, fta:3,  ro:0, rd:3, pd:5, ct:0, intercepts:1, bp:3, fte:2, fpr:3, eval:10, plusMinus:-6 },
  { id:'m3',  playerId:'', date:'2026-03-29', opponent:'Fos Provence',    homeAway:'home', competition:'Pro B', result:'win',  scoreUs:88, scoreThem:79, starter:true,  min:34, pts:22, fg2m:5, fg2a:8,  fg3m:3, fg3a:6, ftm:1, fta:2,  ro:2, rd:6, pd:4, ct:2, intercepts:3, bp:1, fte:4, fpr:5, eval:28, plusMinus:9  },
  { id:'m4',  playerId:'', date:'2026-03-22', opponent:'Blois Basket',    homeAway:'away', competition:'Pro B', result:'win',  scoreUs:75, scoreThem:68, starter:true,  min:29, pts:14, fg2m:3, fg2a:5,  fg3m:2, fg3a:4, ftm:2, fta:2,  ro:1, rd:4, pd:6, ct:1, intercepts:2, bp:2, fte:3, fpr:3, eval:18, plusMinus:7  },
  { id:'m5',  playerId:'', date:'2026-03-15', opponent:'Élan Chalon',     homeAway:'home', competition:'Pro B', result:'loss', scoreUs:72, scoreThem:80, starter:true,  min:32, pts:9,  fg2m:2, fg2a:6,  fg3m:1, fg3a:5, ftm:2, fta:4,  ro:0, rd:2, pd:4, ct:0, intercepts:1, bp:4, fte:2, fpr:4, eval:6,  plusMinus:-8 },
  { id:'m6',  playerId:'', date:'2026-03-08', opponent:'Boulazac',        homeAway:'away', competition:'Pro B', result:'win',  scoreUs:91, scoreThem:83, starter:true,  min:36, pts:26, fg2m:6, fg2a:9,  fg3m:3, fg3a:6, ftm:5, fta:6,  ro:3, rd:7, pd:2, ct:3, intercepts:4, bp:1, fte:5, fpr:5, eval:34, plusMinus:14 },
  { id:'m7',  playerId:'', date:'2026-03-01', opponent:'Aix-Maurienne',   homeAway:'home', competition:'Pro B', result:'win',  scoreUs:79, scoreThem:65, starter:false, min:18, pts:7,  fg2m:2, fg2a:3,  fg3m:1, fg3a:2, ftm:0, fta:0,  ro:1, rd:2, pd:1, ct:0, intercepts:1, bp:1, fte:1, fpr:2, eval:9,  plusMinus:5  },
  { id:'m8',  playerId:'', date:'2026-02-22', opponent:'Rouen Métropole', homeAway:'home', competition:'Pro B', result:'win',  scoreUs:84, scoreThem:76, starter:true,  min:33, pts:19, fg2m:4, fg2a:7,  fg3m:2, fg3a:5, ftm:5, fta:6,  ro:2, rd:4, pd:5, ct:1, intercepts:2, bp:2, fte:4, fpr:3, eval:24, plusMinus:11 },
  { id:'m9',  playerId:'', date:'2026-02-15', opponent:'Nantes',          homeAway:'away', competition:'Pro B', result:'loss', scoreUs:61, scoreThem:69, starter:true,  min:30, pts:10, fg2m:2, fg2a:5,  fg3m:2, fg3a:6, ftm:0, fta:0,  ro:0, rd:3, pd:3, ct:0, intercepts:0, bp:3, fte:2, fpr:4, eval:7,  plusMinus:-5 },
  { id:'m10', playerId:'', date:'2026-02-08', opponent:'Chalon-sur-Saône',homeAway:'home', competition:'Pro B', result:'win',  scoreUs:77, scoreThem:70, starter:true,  min:27, pts:15, fg2m:3, fg2a:6,  fg3m:2, fg3a:4, ftm:3, fta:4,  ro:1, rd:5, pd:4, ct:2, intercepts:1, bp:1, fte:3, fpr:3, eval:20, plusMinus:8  },
  { id:'m11', playerId:'', date:'2026-02-01', opponent:'Mulhouse',        homeAway:'away', competition:'Coupe', result:'win',  scoreUs:90, scoreThem:77, starter:true,  min:25, pts:12, fg2m:2, fg2a:4,  fg3m:2, fg3a:5, ftm:2, fta:2,  ro:2, rd:3, pd:6, ct:1, intercepts:3, bp:0, fte:2, fpr:2, eval:19, plusMinus:10 },
  { id:'m12', playerId:'', date:'2026-01-25', opponent:'Souffelweyersheim',homeAway:'home',competition:'Pro B', result:'win',  scoreUs:85, scoreThem:72, starter:true,  min:30, pts:17, fg2m:4, fg2a:6,  fg3m:2, fg3a:4, ftm:3, fta:4,  ro:1, rd:4, pd:3, ct:0, intercepts:2, bp:2, fte:3, fpr:3, eval:21, plusMinus:6  },
  { id:'m13', playerId:'', date:'2026-01-18', opponent:'Poitiers',        homeAway:'away', competition:'Pro B', result:'loss', scoreUs:70, scoreThem:78, starter:true,  min:32, pts:13, fg2m:3, fg2a:7,  fg3m:1, fg3a:5, ftm:4, fta:5,  ro:0, rd:2, pd:4, ct:1, intercepts:1, bp:3, fte:2, fpr:4, eval:11, plusMinus:-4 },
  { id:'m14', playerId:'', date:'2026-01-11', opponent:'Champagne Basket', homeAway:'home',competition:'Pro B', result:'win',  scoreUs:81, scoreThem:74, starter:false, min:22, pts:8,  fg2m:2, fg2a:4,  fg3m:1, fg3a:3, ftm:1, fta:2,  ro:1, rd:2, pd:2, ct:0, intercepts:2, bp:1, fte:1, fpr:2, eval:10, plusMinus:3  },
  { id:'m15', playerId:'', date:'2026-01-04', opponent:'Évreux',          homeAway:'home', competition:'Pro B', result:'win',  scoreUs:93, scoreThem:81, starter:true,  min:35, pts:24, fg2m:6, fg2a:10, fg3m:3, fg3a:7, ftm:3, fta:4,  ro:2, rd:6, pd:5, ct:2, intercepts:3, bp:2, fte:5, fpr:4, eval:30, plusMinus:16 },
];

// ─── Profil joueur ────────────────────────────────────────────────────────────
function PlayerProfile({ playerId }: { playerId: string }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const fromPath  = (location.state as { from?: string } | null)?.from ?? '/players';
  const { thresholds, selected } = useTeamSeason();
  const fromLabel = BACK_LABELS[fromPath] ?? 'Retour';

  const [player,   setPlayer]   = useState<Player | null>(null);
  const [rpe,      setRpe]      = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [medical,  setMedical]  = useState<MedicalRecord[]>([]);
  const [actions,   setActions]   = useState<Action[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [presenceRate, setPresenceRate] = useState<number | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);

  const [showEdit,   setShowEdit]   = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState('');
  const [editForm,   setEditForm]   = useState({
    firstName: '', lastName: '', number: '',
    position:  'Meneur' as Player['position'],
    status:    'active' as Player['status'],
    birthDate: '', nationality: 'FR',
    hand:      'right' as Player['hand'],
    height: '', weight: '', contractEnd: '', email: '',
  });

  useEffect(() => {
    playersApi.list().then(setAllPlayers);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      playersApi.getById(playerId),
      rpeApi.listPlayerHistory(playerId),
      wellnessApi.getByPlayer(playerId),
      medicalApi.getByPlayer(playerId),
      actionsApi.getByPlayer(playerId),
    ]).then(([p, rpeData, wellnessData, medicalData, actionsData]) => {
      setPlayer(p);
      setRpe(rpeData);
      setWellness(wellnessData);
      setMedical(medicalData);
      setActions(actionsData);
    }).finally(() => setLoading(false));
    statsApi.getPlayerStats(playerId).then(setMatchStats);
  }, [playerId]);

  useEffect(() => {
    if (!selected) return;
    attendanceApi.listSessions(selected.team.id, selected.season.id).then(sessions => {
      if (!sessions.length) { setPresenceRate(null); return; }
      const ids = sessions.map(s => s.id);
      attendanceApi.listAttendance(ids).then(records => {
        const playerRecords = records.filter(r => r.playerId === playerId);
        const presentCount  = playerRecords.filter(r => r.status === 'present' || r.status === 'late').length;
        setPresenceRate(Math.round((presentCount / sessions.length) * 100));
      });
    });
  }, [playerId, selected]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!player) return <div style={{ padding: 24, color: '#EF4444' }}>Joueur introuvable</div>;

  const openEdit = () => {
    setEditForm({
      firstName:   player.firstName,
      lastName:    player.lastName,
      number:      String(player.number),
      position:    player.position,
      status:      player.status,
      birthDate:   player.birthDate,
      nationality: player.nationality,
      hand:        player.hand,
      height:      player.height  ? String(player.height)  : '',
      weight:      player.weight  ? String(player.weight)  : '',
      contractEnd: player.contractEnd ?? '',
      email:       player.email ?? '',
    });
    setEditError('');
    setShowEdit(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');
    try {
      await playersApi.update(playerId, {
        firstName:   editForm.firstName,
        lastName:    editForm.lastName,
        number:      parseInt(editForm.number),
        position:    editForm.position,
        status:      editForm.status,
        birthDate:   editForm.birthDate,
        nationality: editForm.nationality,
        hand:        editForm.hand,
        height:      editForm.height      ? parseInt(editForm.height)      : undefined,
        weight:      editForm.weight      ? parseInt(editForm.weight)      : undefined,
        contractEnd: editForm.contractEnd || undefined,
        email:       editForm.email       || undefined,
      });
      const updated = await playersApi.getById(playerId);
      setPlayer(updated);
      setShowEdit(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Données calculées ──
  const lastRPE        = rpe[0];
  const lastWellness   = wellness[0];
  const activeMedical  = medical.filter(m => m.status === 'active');
  const pendingActions = actions.filter(a => a.status !== 'done').length;

  const rpeVal  = lastRPE?.rpe ?? null;
  const rpeCol  = rpeVal === null ? '#475569' : rpeVal >= 8 ? '#EF4444' : rpeVal >= 6 ? '#F59E0B' : '#00E5A0';
  const avg7    = rpe.length > 0 ? rpe.slice(0, 7).reduce((s, r) => s + r.rpe, 0) / Math.min(rpe.length, 7) : null;
  const wVal    = lastWellness?.score ?? null;
  const wCol    = wVal === null ? '#475569' : wVal < 5 ? '#EF4444' : wVal < 7 ? '#F59E0B' : '#00E5A0';
  const wTrend  = wellness.length >= 2 ? wellness[0].score - wellness[1].score : null;
  const medCol  = activeMedical.length > 0 ? '#EF4444' : '#00E5A0';
  const actCol  = pendingActions > 0 ? '#F59E0B' : '#00E5A0';
  const weeklyUa = computeWeeklyUa(rpe);
  const weekTier = weeklyUa > 0 ? getWeekTier(weeklyUa, thresholds.lightMax, thresholds.normalMax) : null;
  const rpeSparkVals  = rpe.slice(0, 7).reverse().map(r => r.rpe);
  const wellSparkVals = wellness.slice(0, 7).reverse().map(w => w.score);
  const wellSubs = lastWellness ? [
    { label: 'Sommeil',    v: lastWellness.sleep,      c: '#3B82F6' },
    { label: 'Fatigue',    v: lastWellness.fatigue,    c: '#F59E0B' },
    { label: 'Humeur',     v: lastWellness.mood,       c: '#00E5A0' },
    { label: 'Stress',     v: lastWellness.stress,     c: '#EF4444' },
    { label: 'Motivation', v: lastWellness.motivation, c: '#8B5CF6' },
    { label: 'Douleurs',   v: lastWellness.soreness,   c: '#F472B6' },
  ] : [];

  const last3w      = [...wellness].sort((a, b) => a.date.localeCompare(b.date)).slice(-3);
  const radarData   = last3w.length > 0
    ? wellDimensions.map(d => ({
        dim:      d.label,
        value:    parseFloat((last3w.reduce((s, e) => s + (e[d.key as keyof typeof e] as number), 0) / last3w.length).toFixed(1)),
        fullMark: 10,
      }))
    : [];
  const avgWScore   = last3w.length > 0 ? last3w.reduce((s, e) => s + e.score, 0) / last3w.length : 5;
  const radarColor  = wellScoreColor(avgWScore);

  const statusLabel: Record<Player['status'], string> = {
    active: 'Actif', injured: 'Blessé', limited: 'Limité', suspended: 'Suspendu', unavailable: 'Indispo.',
  };
  const statusColor: Record<Player['status'], string> = {
    active: '#00E5A0', injured: '#EF4444', limited: '#F59E0B', suspended: '#8B5CF6', unavailable: '#475569',
  };

  const injuryCount  = medical.filter(m => m.type === 'injury').length;
  const wellnessAvg  = wellness.length > 0
    ? (wellness.reduce((s, e) => s + e.score, 0) / wellness.length).toFixed(1)
    : null;
  const wellnessAvgNum = wellnessAvg !== null ? parseFloat(wellnessAvg) : null;
  const wellnessAvgCol = wellnessAvgNum === null ? '#475569' : wellnessAvgNum < 5 ? '#EF4444' : wellnessAvgNum < 7 ? '#F59E0B' : '#00E5A0';

  const kpis = [
    {
      label: 'Statut',
      bigVal: statusLabel[player.status],
      unit: undefined,
      col: statusColor[player.status],
      onClick: openEdit,
    },
    {
      label: 'Présence entr.',
      bigVal: presenceRate !== null ? String(presenceRate) : '—',
      unit: presenceRate !== null ? '%' : undefined,
      col: presenceRate === null ? '#475569' : presenceRate >= 80 ? '#00E5A0' : presenceRate >= 60 ? '#F59E0B' : '#EF4444',
      onClick: () => navigate(`/rpe/individual/${playerId}`, { state: { from: `/players/${playerId}`, playerName: `${player.firstName} ${player.lastName}` } }),
    },
    {
      label: 'Blessures saison',
      bigVal: String(injuryCount),
      unit: undefined,
      col: injuryCount === 0 ? '#00E5A0' : injuryCount === 1 ? '#F59E0B' : '#EF4444',
      onClick: () => navigate(`/medical/record/${playerId}`),
    },
    {
      label: 'Moy. bien-être',
      bigVal: wellnessAvg ?? '—',
      unit: wellnessAvg !== null ? '/10' : undefined,
      col: wellnessAvgCol,
      onClick: () => navigate(`/wellness/history/${playerId}`, { state: { from: `/players/${playerId}`, playerName: `${player.firstName} ${player.lastName}` } }),
    },
  ];

  return (
    <div className="p-4 md:p-6">

      {/* ── Header compact ── */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Breadcrumb items={[{ label: fromLabel, path: fromPath }]} />
        {allPlayers.length > 0 && (
          <select
            value={playerId}
            onChange={e => navigate(`/players/${e.target.value}`, { state: { from: fromPath } })}
            style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', fontSize: '0.78rem', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
          >
            {[...allPlayers].sort((a, b) => a.lastName.localeCompare(b.lastName)).map(p => (
              <option key={p.id} value={p.id}>
                {p.lastName} {p.firstName[0]}. #{p.number}
              </option>
            ))}
          </select>
        )}
      </div>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
        <PlayerAvatar player={player} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>{player.firstName} {player.lastName}</span>
            <span style={{ color: '#475569', fontSize: '0.8rem' }}>#{player.number} · {player.position}</span>
          </div>
          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>
            {flagEmoji[player.nationality] ?? ''}
            {player.birthDate ? ` · ${getAge(player.birthDate)} ans` : ''}
            {player.height && player.weight ? ` · ${player.height} cm / ${player.weight} kg` : ''}
            {player.contractEnd ? ` · Contrat → ${formatDate(player.contractEnd)}` : ''}
          </p>
        </div>
        <button onClick={openEdit} style={{ padding: '6px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <Edit size={13} /> Modifier
        </button>
      </div>

      {/* ── 4 KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 12, marginBottom: 14 }}>
        {kpis.map(k => (
          <div key={k.label} onClick={k.onClick}
            style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${k.col}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer' }}>
            <p style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>{k.label}</p>
            <p style={{ color: k.col, fontSize: '1.7rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
              {k.bigVal}{k.unit && <span style={{ color: '#475569', fontSize: '0.75rem', fontWeight: 400 }}>{k.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* ── Ligne 3 : RPE (2/3) · Bien-être (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ gap: 12, marginBottom: 14 }}>

        {/* RPE chart — 2/4 */}
        {(() => {
          const borderCol = weekTier?.color ?? rpeCol;
          const chartData = [...rpe].sort((a, b) => a.date.localeCompare(b.date)).slice(-12).map(r => ({
            date: fmtShortDate(r.date),
            rpe:  r.rpe,
          }));
          return (
            <div onClick={() => navigate(`/rpe/individual/${playerId}`, { state: { from: `/players/${playerId}`, playerName: `${player.firstName} ${player.lastName}` } })}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${borderCol}`, borderRadius: 8, padding: '16px 18px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: 2 }}>
                  <Activity size={14} style={{ color: borderCol }} />
                  <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>Charge & RPE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{ color: '#475569', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Charge sem.</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: weeklyUa > 0 ? '#F1F5F9' : '#475569', fontSize: '1.15rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
                        {weeklyUa > 0 ? weeklyUa : '—'}
                      </span>
                      {weeklyUa > 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>UA</span>}
                      {weekTier && <span style={{ color: weekTier.color, backgroundColor: weekTier.bg, fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3 }}>{weekTier.label}</span>}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 22, backgroundColor: '#2A2F3A' }} />
                  {rpeVal !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ color: '#475569', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dernier RPE</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: rpeCol, fontSize: '1.15rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{rpeVal}</span>
                        <span style={{ color: '#475569', fontSize: '0.75rem' }}>/10</span>
                      </div>
                    </div>
                  )}
                  <ArrowRight size={13} style={{ color: '#475569' }} />
                </div>
              </div>

              {rpe.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" />
                    <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#475569', fontSize: 10 }} />
                    <Tooltip content={<RPETooltip />} />
                    <ReferenceLine y={7} stroke="#EF444440" strokeDasharray="4 4" />
                    <ReferenceLine y={5} stroke="#F59E0B40" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="rpe" name="RPE" stroke="#00E5A0" dot={{ fill: '#00E5A0', r: 3 }} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune session enregistrée</p>
              )}
            </div>
          );
        })()}

        {/* Bien-être — 1/3 */}
        <div onClick={() => navigate(`/wellness/history/${playerId}`, { state: { from: `/players/${playerId}`, playerName: `${player.firstName} ${player.lastName}` } })}
          style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 18px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Heart size={14} style={{ color: '#F472B6' }} />
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>Bien-être</span>
            </div>
            <ArrowRight size={13} style={{ color: '#475569' }} />
          </div>
          {wellness.length > 0 ? (
            <>
              <p style={{ color: '#475569', fontSize: '0.74rem', margin: '0 0 0' }}>
                Moyenne des {last3w.length} dernière{last3w.length > 1 ? 's' : ''} saisie{last3w.length > 1 ? 's' : ''}
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#2A2F3A" />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                  <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.15} strokeWidth={2}
                    dot={(props: { cx: number; cy: number; index: number }) => {
                      const dim = wellDimensions[props.index];
                      const pt  = radarData[props.index];
                      if (!dim || !pt) return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} />;
                      const c = wellDimColor(pt.value, dim.inverted);
                      return <circle key={props.index} cx={props.cx} cy={props.cy} r={6} fill={c} stroke="#161920" strokeWidth={2} />;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune saisie</p>
          )}
        </div>
      </div>

      {/* ── Ligne 4 : Médical 1/2 · Actions 1/2 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12, marginBottom: 14 }}>

        {/* Médical */}
        <div onClick={() => navigate(`/medical/record/${playerId}`)}
          style={{ backgroundColor: '#161920', border: `1px solid ${activeMedical.length > 0 ? 'rgba(239,68,68,0.25)' : '#2A2F3A'}`, borderRadius: 8, padding: '16px 18px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Stethoscope size={14} style={{ color: activeMedical.length > 0 ? '#EF4444' : '#3B82F6' }} />
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>Médical</span>
            </div>
            <ArrowRight size={13} style={{ color: '#475569' }} />
          </div>
          {medical.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune entrée</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {medical.slice(0, 5).map(m => {
                const isActive = m.status === 'active';
                const typeCol  = m.type === 'injury' ? '#EF4444' : m.type === 'treatment' ? '#00E5A0' : '#3B82F6';
                const typeIcon = m.type === 'injury' ? '🚑' : m.type === 'treatment' ? '💊' : '🩺';
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `2px solid ${isActive && m.type !== 'checkup' ? typeCol : 'transparent'}` }}>
                    <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{typeIcon}</span>
                    <p style={{ color: '#F1F5F9', fontSize: '0.75rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.description}</p>
                  </div>
                );
              })}
              {medical.length > 5 && (
                <p style={{ color: '#475569', fontSize: '0.68rem', margin: 0, textAlign: 'right' }}>+{medical.length - 5} entrées</p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div onClick={() => navigate('/actions', { state: { playerId } })}
          style={{ backgroundColor: '#161920', border: `1px solid ${pendingActions > 0 ? 'rgba(245,158,11,0.25)' : '#2A2F3A'}`, borderRadius: 8, padding: '16px 18px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CheckSquare size={14} style={{ color: pendingActions > 0 ? '#F59E0B' : '#00E5A0' }} />
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>Actions</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {actions.length > 0 && <span style={{ color: '#475569', fontSize: '0.72rem' }}>{actions.filter(a => a.status === 'done').length}/{actions.length} faites</span>}
              <ArrowRight size={13} style={{ color: '#475569' }} />
            </div>
          </div>
          {actions.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action</p>
          ) : pendingActions === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', backgroundColor: '#1E2229', borderRadius: 6 }}>
              <span style={{ color: '#00E5A0' }}>✓</span>
              <span style={{ color: '#00E5A0', fontSize: '0.8rem', fontWeight: 600 }}>Toutes les actions sont réalisées</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.filter(a => a.status !== 'done').slice(0, 5).map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</p>
                    <p style={{ color: '#475569', fontSize: '0.68rem', margin: 0 }}>Échéance : {formatDate(a.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Ligne 5 : Statistiques par match ── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChart2 size={14} style={{ color: '#3B82F6' }} />
            <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>Statistiques saison</span>
          </div>
          {(() => { const n = matchStats.length > 0 ? matchStats.length : MOCK_MATCH_STATS.length; return <span style={{ color: '#475569', fontSize: '0.72rem' }}>{n} match{n > 1 ? 's' : ''}</span>; })()}
        </div>

        {(() => {
          const rows = matchStats.length > 0 ? matchStats : MOCK_MATCH_STATS;
          return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  {['Date','Adv','L/E','Res','Score','Tit','Min','Pts','2pts','3pts','LF','Reb O','Reb D','Pd','Ct','Int','Bp','Fte','Fp','Eval','±'].map(h => (
                    <th key={h} style={{ color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 8px', textAlign: 'center', fontSize: '0.62rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                  const fg2Pct = m.fg2a > 0 ? Math.round((m.fg2m / m.fg2a) * 100) : null;
                  const fg3Pct = m.fg3a > 0 ? Math.round((m.fg3m / m.fg3a) * 100) : null;
                  const ftPct  = m.fta  > 0 ? Math.round((m.ftm  / m.fta)  * 100) : null;
                  const pmCol  = m.plusMinus > 0 ? '#00E5A0' : m.plusMinus < 0 ? '#EF4444' : '#475569';
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : '#161920' }}>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center' }}>{fmtShortDate(m.date)}</td>
                      <td style={{ color: '#F1F5F9', padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>{m.opponent}</td>
                      <td style={{ color: '#475569', padding: '6px 8px', textAlign: 'center' }}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                      <td style={{ color: resCol, padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{m.result === 'win' ? 'V' : 'D'}</td>
                      <td style={{ color: '#475569', padding: '6px 8px', textAlign: 'center' }}>{m.scoreUs}-{m.scoreThem}</td>
                      <td style={{ color: '#475569', padding: '6px 8px', textAlign: 'center' }}>{m.starter ? '✓' : '–'}</td>
                      <td style={{ color: '#F1F5F9', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.min ?? '—'}</td>
                      <td style={{ color: '#F1F5F9', padding: '6px 8px', textAlign: 'center', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{m.pts}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                        {m.fg2m}/{m.fg2a}{fg2Pct !== null ? <span style={{ color: '#475569', fontSize: '0.6rem' }}> {fg2Pct}%</span> : ''}
                      </td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                        {m.fg3m}/{m.fg3a}{fg3Pct !== null ? <span style={{ color: '#475569', fontSize: '0.6rem' }}> {fg3Pct}%</span> : ''}
                      </td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
                        {m.ftm}/{m.fta}{ftPct !== null ? <span style={{ color: '#475569', fontSize: '0.6rem' }}> {ftPct}%</span> : ''}
                      </td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.ro}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.rd}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.pd}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.ct}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.intercepts}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.bp}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.fte}</td>
                      <td style={{ color: '#94A3B8', padding: '6px 8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace' }}>{m.fpr}</td>
                      <td style={{ color: '#F1F5F9', padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{m.eval}</td>
                      <td style={{ color: pmCol, padding: '6px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          );
        })()}
      </div>

      {/* ── Modal édition joueur ── */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Modifier {player.firstName} {player.lastName}</h2>
              <button onClick={() => setShowEdit(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {editError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{editError}</span>
              </div>
            )}
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom *</label>
                  <input required value={editForm.firstName} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom *</label>
                  <input required value={editForm.lastName} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date de naissance *</label>
                  <input required type="date" value={editForm.birthDate} onChange={e => setEditForm(f => ({ ...f, birthDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>N° maillot *</label>
                  <input required type="number" min={0} max={99} value={editForm.number} onChange={e => setEditForm(f => ({ ...f, number: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poste *</label>
                  <select required value={editForm.position} onChange={e => setEditForm(f => ({ ...f, position: e.target.value as Player['position'] }))} style={{ ...inputStyle, width: '100%' }}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Statut</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Player['status'] }))} style={{ ...inputStyle, width: '100%' }}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Main forte</label>
                  <select value={editForm.hand} onChange={e => setEditForm(f => ({ ...f, hand: e.target.value as Player['hand'] }))} style={{ ...inputStyle, width: '100%' }}>
                    <option value="right">Droite</option>
                    <option value="left">Gauche</option>
                    <option value="both">Les deux</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nationalité</label>
                  <input maxLength={2} placeholder="FR" value={editForm.nationality} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value.toUpperCase() }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Taille (cm)</label>
                  <input type="number" min={140} max={230} value={editForm.height} onChange={e => setEditForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poids (kg)</label>
                  <input type="number" min={40} max={150} value={editForm.weight} onChange={e => setEditForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Fin de contrat</label>
                  <input type="date" value={editForm.contractEnd} onChange={e => setEditForm(f => ({ ...f, contractEnd: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email du joueur</label>
                <input type="email" placeholder="joueur@example.com" value={editForm.email}
                  onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowEdit(false)}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={editSaving}
                  style={{ flex: 1, padding: '10px', backgroundColor: editSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: editSaving ? '#475569' : '#0D0F14', cursor: editSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Liste joueurs ────────────────────────────────────────────────────────────
const emptyForm = {
  firstName: '', lastName: '', number: '',
  position:  'Meneur' as Player['position'],
  birthDate: '', nationality: 'FR',
  hand:      'right' as Player['hand'],
  height: '', weight: '', contractEnd: '',
};

export default function PlayersPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const [players,      setPlayers]      = useState<Player[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(emptyForm);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (id) return;
    setLoading(true);
    setFetchError('');
    playersApi.list()
      .then(setPlayers)
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (id) return <PlayerProfile playerId={id} />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const created = await playersApi.create({
        organizationId: '',
        firstName:   form.firstName,
        lastName:    form.lastName,
        number:      parseInt(form.number),
        position:    form.position,
        nationality: form.nationality || 'FR',
        birthDate:   form.birthDate,
        hand:        form.hand,
        status:      'active',
        height:      form.height ? parseInt(form.height) : undefined,
        weight:      form.weight ? parseInt(form.weight) : undefined,
        contractEnd: form.contractEnd || undefined,
      });
      setPlayers(prev => [...prev, created].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setShowForm(false);
      setForm(emptyForm);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  const closeForm = () => { setShowForm(false); setFormError(''); setForm(emptyForm); };

  const filtered = players.filter(p => {
    const nameMatch   = `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === 'all' || p.status === statusFilter;
    return nameMatch && statusMatch;
  });

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Joueurs</h1>
        <button onClick={() => setShowForm(true)}
          style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /><span className="hidden md:inline">Nouveau joueur</span>
        </button>
      </div>

      {fetchError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{fetchError}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row" style={{ gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            placeholder="Rechercher un joueur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div className="w-full md:w-auto" style={{ position: 'relative' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ width: '100%', padding: statusFilter !== 'all' ? '8px 52px 8px 12px' : '8px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="all">Tous statuts</option>
            <option value="active">Actif</option>
            <option value="injured">Blessé</option>
            <option value="limited">Limité</option>
            <option value="suspended">Suspendu</option>
            <option value="unavailable">Indisponible</option>
          </select>
          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2, display: 'flex', lineHeight: 1 }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
          {search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur dans cette organisation.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {filtered.map(player => (
            <div key={player.id} onClick={() => navigate(`/players/${player.id}`, { state: { from: '/players' } })}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A066')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}>
              <PlayerAvatar player={player} size={48} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>{player.lastName}</p>
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '2px 0' }}>{player.firstName}</p>
                <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>#{player.number} · {player.position.split(' ')[0]}</p>
              </div>
              <StatusBadge status={player.status} size="sm" />
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouveau joueur</h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom *</label>
                  <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom *</label>
                  <input required value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date de naissance *</label>
                  <input required type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>N° maillot *</label>
                  <input required type="number" min={0} max={99} value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poste *</label>
                  <select required value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value as Player['position'] }))} style={{ ...inputStyle, width: '100%' }}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Main forte</label>
                  <select value={form.hand} onChange={e => setForm(f => ({ ...f, hand: e.target.value as Player['hand'] }))} style={{ ...inputStyle, width: '100%' }}>
                    <option value="right">Droite</option>
                    <option value="left">Gauche</option>
                    <option value="both">Les deux</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nationalité</label>
                  <input maxLength={2} placeholder="FR" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value.toUpperCase() }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Taille (cm)</label>
                  <input type="number" min={140} max={230} value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poids (kg)</label>
                  <input type="number" min={40} max={150} value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Fin de contrat</label>
                <input type="date" value={form.contractEnd} onChange={e => setForm(f => ({ ...f, contractEnd: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={closeForm}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
