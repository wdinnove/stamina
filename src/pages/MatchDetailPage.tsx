import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Calendar, BarChart3, Pencil, Trash2, Upload, Settings, ChevronDown } from 'lucide-react';
import { matchesApi } from '../api/matches';
import { statsApi } from '../api/stats';
import { playersApi } from '../api/players';
import { MatchStatsImportModal } from '../components/MatchStatsImportModal';
import { TacticalImportModal } from '../components/TacticalImportModal';
import { tacticalConfigApi } from '../api/tacticalConfig';
import { tacticalEventsApi } from '../api/tacticalEvents';
import { EmptyState, Modal, MatchFormModal, TacticalStatsSection, AccessRestricted } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Match, Player, MatchStat, TeamMatchStat, OpponentMatchStat, TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { calcPlayerAdvanced, calcPlayerAdvancedForMatch, isTeamMinutesPlausible } from '../data/playerAdvanced';
import { evalColor, shotPct } from '../data';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { LAYER } from '../styles/layers';

const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const DAYS_FR   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function fmtFullDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function pct(m: number, a: number): string {
  if (!a) return '—';
  return `${Math.round(m / a * 100)}%`;
}

function fmt1(v: number): string {
  return String(parseFloat(v.toFixed(1)));
}

const TH: React.CSSProperties = {
  padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A',
  position: 'sticky', top: 0, backgroundColor: '#161920',
};
const TD: React.CSSProperties = {
  padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
};

interface MatchActionsMenuProps {
  hasStats: boolean;
  hasTactical: boolean;
  onImportStats: () => void;
  onDeleteStats: () => void;
  onImportTactical: () => void;
  onDeleteTactical: () => void;
  onEditMatch: () => void;
  onDeleteMatch: () => void;
}

function MatchActionsMenu({
  hasStats, hasTactical, onImportStats, onDeleteStats, onImportTactical, onDeleteTactical, onEditMatch, onDeleteMatch,
}: MatchActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px',
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', color: '#E2E8F0',
    textAlign: 'left', whiteSpace: 'nowrap',
  };
  const dangerStyle: React.CSSProperties = { ...itemStyle, color: '#EF4444' };
  const divider = <div style={{ height: 1, backgroundColor: '#2A2F3A', margin: '4px 0' }} />;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', backgroundColor: open ? '#1E2229' : 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
        <Settings size={13} /><span>Actions</span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 240,
          backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: LAYER.dropdown, padding: '4px 0',
        }}>
          <button className="hover:!bg-white/5" style={itemStyle} onClick={() => run(onImportStats)}>
            <Upload size={13} />{hasStats ? 'Modifier les statistiques' : 'Importer les statistiques'}
          </button>
          {hasStats && (
            <button className="hover:!bg-white/5" style={dangerStyle} onClick={() => run(onDeleteStats)}>
              <Trash2 size={13} />Supprimer les statistiques
            </button>
          )}

          {divider}

          <button className="hover:!bg-white/5" style={itemStyle} onClick={() => run(onImportTactical)}>
            <Upload size={13} />{hasTactical ? 'Modifier les statistiques tactiques' : 'Importer les statistiques tactiques'}
          </button>
          {hasTactical && (
            <button className="hover:!bg-white/5" style={dangerStyle} onClick={() => run(onDeleteTactical)}>
              <Trash2 size={13} />Supprimer les statistiques tactiques
            </button>
          )}

          {divider}

          <button className="hover:!bg-white/5" style={itemStyle} onClick={() => run(onEditMatch)}>
            <Pencil size={13} />Modifier le match
          </button>
          <button className="hover:!bg-white/5" style={dangerStyle} onClick={() => run(onDeleteMatch)}>
            <Trash2 size={13} />Supprimer le match
          </button>
        </div>
      )}
    </div>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selected, canEditTeamData } = useTeamSeason();

  const [match,            setMatch]           = useState<Match | null>(null);
  const [players,          setPlayers]         = useState<Player[]>([]);
  const [individualStats,  setIndividualStats] = useState<MatchStat[]>([]);
  const [teamStats,        setTeamStats]       = useState<TeamMatchStat | null>(null);
  const [opponentStats,    setOpponentStats]   = useState<OpponentMatchStat[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState('');

  const [showEdit,  setShowEdit]  = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  const [confirmDeleteStats, setConfirmDeleteStats] = useState(false);
  const [deletingStats,      setDeletingStats]      = useState(false);
  const [confirmDeleteTactical, setConfirmDeleteTactical] = useState(false);
  const [deletingTactical,      setDeletingTactical]      = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [showTacticalImport, setShowTacticalImport] = useState(false);
  const [tacticalEvents, setTacticalEvents]         = useState<TacticalEvent[]>([]);
  const [tacticalCategories, setTacticalCategories] = useState<TacticalCategory[]>([]);
  const [tacticalDimensions, setTacticalDimensions] = useState<TacticalDimension[]>([]);
  const [tacticalOptions, setTacticalOptions]       = useState<TacticalDimensionOption[]>([]);
  const [tacticalLoaded, setTacticalLoaded]         = useState(false);
  const [loadingTactical, setLoadingTactical]       = useState(false);

  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [oppSortCol, setOppSortCol] = useState<string | null>(null);
  const [oppSortDir, setOppSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState('boxscore');

  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [seasonTeamStats, setSeasonTeamStats] = useState<TeamMatchStat[]>([]);
  const [loadingSeasonStats, setLoadingSeasonStats] = useState(false);

  useEffect(() => {
    if (individualStats.length >= 1 && !playerA) setPlayerA(individualStats[0].playerId);
    if (individualStats.length >= 2 && !playerB) setPlayerB(individualStats[1].playerId);
  }, [individualStats]);

  useEffect(() => {
    if (activeTab !== 'comp_matches' || !match || seasonTeamStats.length > 0 || loadingSeasonStats) return;
    setLoadingSeasonStats(true);
    matchesApi.listBySeason(match.teamId, match.seasonId)
      .then(matches => statsApi.listTeamStatsByMatchIds(matches.map(m => m.id)))
      .then(stats => setSeasonTeamStats(stats))
      .catch(() => {})
      .finally(() => setLoadingSeasonStats(false));
  }, [activeTab, match]);

  // Sert à ignorer une réponse de loadTactical devenue obsolète (match changé entre-temps) —
  // sans ça, naviguer rapidement d'un match à l'autre peut afficher brièvement (ou durablement,
  // si la réponse de l'ancien match arrive après celle du nouveau) les données tactiques du
  // mauvais match sous l'en-tête du nouveau.
  const currentMatchIdRef = useRef<string | undefined>(undefined);

  const loadTactical = useCallback(async (matchId: string, teamId: string) => {
    setLoadingTactical(true);
    try {
      const [{ categories, dimensions, options }, events] = await Promise.all([
        tacticalConfigApi.getForTeam(teamId),
        tacticalEventsApi.getByMatchId(matchId),
      ]);
      if (currentMatchIdRef.current !== matchId) return;
      setTacticalCategories(categories);
      setTacticalDimensions(dimensions);
      setTacticalOptions(options);
      setTacticalEvents(events);
      setTacticalLoaded(true);
    } finally {
      if (currentMatchIdRef.current === matchId) setLoadingTactical(false);
    }
  }, []);

  useEffect(() => {
    if ((activeTab !== 'tactical_brutes' && activeTab !== 'tactical_dashboard') || !match || tacticalLoaded || loadingTactical) return;
    loadTactical(match.id, match.teamId);
  }, [activeTab, match, tacticalLoaded, loadingTactical, loadTactical]);

  useEffect(() => {
    currentMatchIdRef.current = id;
    setTacticalLoaded(false);
    setTacticalEvents([]);
    setTacticalCategories([]);
    setTacticalDimensions([]);
    setTacticalOptions([]);
  }, [id]);

  const loadStats = useCallback(async (matchId: string) => {
    const [ind, team, opp] = await Promise.all([
      statsApi.listByMatchId(matchId),
      statsApi.getTeamStatsByMatchId(matchId),
      statsApi.listOpponentStatsByMatchId(matchId),
    ]);
    setIndividualStats(ind);
    // teamMinutes (Σ minutes de tout l'effectif sur ce match) : corrige usagePct par la part de
    // minutes jouées — voir calcPlayerAdvancedForMatch (playerAdvanced.ts).
    setTeamStats(team ? { ...team, teamMinutes: ind.reduce((sum, s) => sum + s.min, 0) } : team);
    setOpponentStats(opp);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    matchesApi.getById(id)
      .then(async m => {
        setMatch(m);
        if (m) {
          const [seasonPlayers] = await Promise.all([
            playersApi.listBySeason(m.seasonId),
            loadStats(m.id),
          ]);
          setPlayers(seasonPlayers);
          // Chargé en arrière-plan (pas dans le Promise.all bloquant ci-dessus) : sert seulement à
          // savoir si des données tactiques existent (menu Actions), sans retarder l'affichage du boxscore.
          // Erreur ignorée ici : si ça échoue, tacticalLoaded reste false et l'onglet Tactique réessaiera.
          loadTactical(m.id, m.teamId).catch(() => {});
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, loadStats, loadTactical]);

  useEffect(() => {
    // Le match dans l'URL n'appartient pas à l'équipe sélectionnée (ex. bascule dans la TopBar).
    if (match && selected && match.teamId !== selected.team.id) navigate('/', { replace: true });
  }, [match, selected?.team.id]);

  async function handleDelete() {
    if (!match) return;
    setDeleting(true);
    try {
      await matchesApi.delete(match.id);
      navigate('/matchs', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
      setConfirmDelete(false); setDeleting(false);
    }
  }

  async function handleDeleteStats() {
    if (!match) return;
    setDeletingStats(true);
    try {
      await statsApi.deleteForMatch(match.id);
      setIndividualStats([]);
      setTeamStats(null);
      setOpponentStats([]);
      setConfirmDeleteStats(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression des statistiques.');
    } finally {
      setDeletingStats(false);
    }
  }

  async function handleDeleteTactical() {
    if (!match) return;
    setDeletingTactical(true);
    try {
      await tacticalEventsApi.deleteForMatch(match.id);
      setTacticalEvents([]);
      setConfirmDeleteTactical(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression des données tactiques.');
    } finally {
      setDeletingTactical(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !match) return (
    <div className="p-4 md:p-6">
      <button onClick={() => navigate('/matchs')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', marginBottom: 16, fontSize: '0.85rem' }}>
        <ArrowLeft size={16} /> Matchs
      </button>
      {error ? (
        <p style={{ color: '#EF4444' }}>{error}</p>
      ) : (
        <AccessRestricted message="Ce match n'existe pas ou vous n'avez pas accès à l'équipe concernée." />
      )}
    </div>
  );

  const isWin = match.result === 'win';
  const playerById = new Map(players.map(p => [p.id, p]));

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function getSortVal(s: MatchStat, col: string): number {
    const p = playerById.get(s.playerId);
    switch (col) {
      case 'number':     return p?.number ?? 999;
      case 'min':        return s.min;
      case 'pts':        return s.pts;
      case 'fg2pct':     return s.fg2a > 0 ? s.fg2m / s.fg2a : -1;
      case 'fg3pct':     return s.fg3a > 0 ? s.fg3m / s.fg3a : -1;
      case 'ftpct':      return s.fta > 0 ? s.ftm / s.fta : -1;
      case 'ro':         return s.ro;
      case 'rd':         return s.rd;
      case 'rt':         return s.ro + s.rd;
      case 'pd':         return s.pd;
      case 'ct':         return s.ct;
      case 'intercepts': return s.intercepts;
      case 'bp':         return s.bp;
      case 'fte':        return s.fte;
      case 'fpr':        return s.fpr;
      case 'eval':       return s.eval ?? -999;
      case 'plusMinus':  return s.plusMinus ?? -999;
      default: {
        const adv = calcPlayerAdvancedForMatch(s, teamStats);
        return (adv[col as keyof typeof adv] as number | null) ?? -1;
      }
    }
  }

  const sortedStats = sortCol
    ? [...individualStats].sort((a, b) => {
        const va = getSortVal(a, sortCol);
        const vb = getSortVal(b, sortCol);
        return sortDir === 'desc' ? vb - va : va - vb;
      })
    : individualStats;

  const THsort = (label: string, col: string, extraStyle?: React.CSSProperties) => (
    <th
      style={{ ...TH, ...extraStyle, cursor: 'pointer', userSelect: 'none', color: sortCol === col ? '#CBD5E1' : '#475569' }}
      onClick={() => toggleSort(col)}
    >
      {label}{sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  function toggleOppSort(col: string) {
    if (oppSortCol === col) setOppSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setOppSortCol(col); setOppSortDir('desc'); }
  }

  // Contexte "équipe" vu du côté adverse : ses propres totaux sont les colonnes opp_* de
  // team_match_stats, et ses rebonds "adversaire" sont les nôtres.
  const oppTeamCtx: TeamMatchStat | null = teamStats ? {
    fg2m: teamStats.opp_fg2m, fg2a: teamStats.opp_fg2a,
    fg3m: teamStats.opp_fg3m, fg3a: teamStats.opp_fg3a,
    fta: teamStats.opp_fta, bp: teamStats.opp_bp,
    ro: teamStats.opp_ro, rd: teamStats.opp_rd,
    opp_ro: teamStats.ro, opp_rd: teamStats.rd,
  } as unknown as TeamMatchStat : null;
  // Σ minutes de l'effectif adverse sur ce match — même rôle que teamStats.teamMinutes côté
  // équipe : rend la colonne %USG/min calculable pour l'adversaire aussi (repli sur %USG si la
  // donnée est implausible, ex. minutes non importées côté adversaire).
  const oppTeamMinutes = opponentStats.reduce((sum, s) => sum + s.min, 0);
  const oppAdvFor = (s: OpponentMatchStat) => calcPlayerAdvanced(
    s as unknown as MatchStat,
    oppTeamCtx,
    isTeamMinutesPlausible(oppTeamMinutes, 1) ? oppTeamMinutes : undefined,
  );

  function getOppSortVal(s: OpponentMatchStat, col: string): number {
    switch (col) {
      case 'min':        return s.min;
      case 'pts':        return s.pts;
      case 'fg2pct':     return s.fg2a > 0 ? s.fg2m / s.fg2a : -1;
      case 'fg3pct':     return s.fg3a > 0 ? s.fg3m / s.fg3a : -1;
      case 'ftpct':      return s.fta > 0 ? s.ftm / s.fta : -1;
      case 'ro':         return s.ro;
      case 'rd':         return s.rd;
      case 'rt':         return s.ro + s.rd;
      case 'pd':         return s.pd;
      case 'ct':         return s.ct;
      case 'intercepts': return s.intercepts;
      case 'bp':         return s.bp;
      case 'fte':        return s.fte;
      case 'fpr':        return s.fpr;
      case 'eval':       return s.eval ?? -999;
      case 'plusMinus':  return s.plusMinus ?? -999;
      default: {
        const adv = oppAdvFor(s);
        return (adv[col as keyof typeof adv] as number | null) ?? -1;
      }
    }
  }

  const sortedOppStats = oppSortCol
    ? [...opponentStats].sort((a, b) => {
        const va = getOppSortVal(a, oppSortCol);
        const vb = getOppSortVal(b, oppSortCol);
        return oppSortDir === 'desc' ? vb - va : va - vb;
      })
    : opponentStats;

  const THoppSort = (label: string, col: string, extraStyle?: React.CSSProperties) => (
    <th
      style={{ ...TH, ...extraStyle, cursor: 'pointer', userSelect: 'none', color: oppSortCol === col ? '#CBD5E1' : '#475569' }}
      onClick={() => toggleOppSort(col)}
    >
      {label}{oppSortCol === col ? (oppSortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div className="p-4 md:p-6">
      <style>{`
        @media (max-width: 639px) {
          .stat-table th { padding: 6px 7px !important; font-size: 0.62rem !important; }
          .stat-table td { padding: 6px 7px !important; font-size: 0.73rem !important; }
        }
      `}</style>
      {/* Back + Modifier */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/matchs')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
          <ArrowLeft size={15} /> Matchs
        </button>
        {canEditTeamData && (
          <MatchActionsMenu
            hasStats={!!(teamStats || individualStats.length > 0)}
            hasTactical={tacticalLoaded && tacticalEvents.length > 0}
            onImportStats={() => setShowImport(true)}
            onDeleteStats={() => setConfirmDeleteStats(true)}
            onImportTactical={() => setShowTacticalImport(true)}
            onDeleteTactical={() => setConfirmDeleteTactical(true)}
            onEditMatch={() => setShowEdit(true)}
            onDeleteMatch={() => setConfirmDelete(true)}
          />
        )}
      </div>

      {/* Hero card */}
      <div className="p-4 sm:p-6" style={{ backgroundColor: '#161920', border: `1px solid ${isWin ? '#00E5A040' : '#EF444440'}`, borderRadius: 12, marginBottom: 20, backgroundImage: isWin ? 'linear-gradient(135deg, #00E5A00A 0%, transparent 55%)' : 'linear-gradient(135deg, #EF44440A 0%, transparent 55%)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: isWin ? 'linear-gradient(90deg, #00E5A0, #00E5A050)' : 'linear-gradient(90deg, #EF4444, #EF444450)', borderRadius: '12px 12px 0 0' }} />

        {/* Ligne 1 : nom adversaire + score */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="text-xl sm:text-2xl" style={{ color: '#F1F5F9', margin: '0 0 8px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.5px' }}>
              vs {match.opponent}
            </h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, color: isWin ? '#00E5A0' : '#EF4444', backgroundColor: isWin ? '#00E5A015' : '#EF444415', border: `1px solid ${isWin ? '#00E5A030' : '#EF444430'}`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: 'currentColor', flexShrink: 0 }} />
              {isWin ? 'Victoire' : 'Défaite'}
            </span>
          </div>
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div className="text-2xl sm:text-4xl" style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, lineHeight: 1, letterSpacing: '-1px', color: isWin ? '#00E5A0' : '#EF4444', textShadow: isWin ? '0 0 32px #00E5A045' : '0 0 32px #EF444445' }}>
              {match.scoreUs}<span style={{ color: '#334155', margin: '0 6px', fontWeight: 400 }}>–</span>{match.scoreThem}
            </div>
          </div>
        </div>

        {/* Ligne 2 : meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#64748B' }}>
            <Calendar size={12} />{fmtFullDate(match.date)}
          </span>
          <span style={{ color: '#334155' }}>·</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, color: match.homeAway === 'home' ? '#3B82F6' : '#A855F7', backgroundColor: match.homeAway === 'home' ? '#3B82F615' : '#A855F715' }}>
            {match.homeAway === 'home' ? 'Domicile' : 'Extérieur'}
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, color: '#64748B', backgroundColor: '#1E2229' }}>
            {match.competition}
          </span>
          {match.gameNumber && (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, color: '#F59E0B', backgroundColor: '#F59E0B12' }}>
              J{match.gameNumber}
            </span>
          )}
        </div>
      </div>

      {/* Stats section */}
      {/* Tab bar */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #2A2F3A' }}>
          <style>{`.tabs-scroll::-webkit-scrollbar{display:none}`}</style>
          <div className="tabs-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            {([
              { id: 'boxscore',      label: 'Boxscore',        short: 'Box'       },
              { id: 'advanced',      label: 'Statistiques avancées',  short: 'Avancées'  },
              { id: 'four_factors',  label: 'Four Factors',    short: '4 Factors' },
              { id: 'comp_players',  label: 'Compar. joueurs', short: 'Joueurs'   },
              { id: 'comp_teams',    label: 'Compar. équipes', short: 'Équipes'   },
              { id: 'comp_matches',  label: 'Compar. saison',  short: 'Saison'    },
              { id: 'tactical_brutes',    label: 'Statistiques tactiques brutes', short: 'Tactique brutes'   },
              { id: 'tactical_dashboard', label: 'Tableau de bord tactique',      short: 'Tableau de bord'   },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="px-3 sm:px-[18px] py-2.5 sm:py-3"
                style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? '#00E5A0' : 'transparent'}`, cursor: 'pointer', fontSize: '0.78rem', fontWeight: activeTab === tab.id ? 700 : 400, color: activeTab === tab.id ? '#F1F5F9' : '#475569', whiteSpace: 'nowrap', marginBottom: -1, transition: 'color 0.15s' }}>
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-3 sm:p-5">

          {/* ── BOXSCORE ── */}
          {activeTab === 'boxscore' && (
            !teamStats && individualStats.length === 0 ? (
              <EmptyState message="Aucune statistique importée." />
            ) : (
              <div className="flex flex-col gap-4 sm:gap-6">
                {individualStats.length > 0 && (
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                      Statistiques individuelles · {individualStats.length} joueur{individualStats.length > 1 ? 's' : ''}
                    </p>
                    <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                      <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                          <tr>
                            <th style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}>Joueur</th>
                            {THsort('#', 'number', { width: 32, textAlign: 'center' })}
                            {THsort('MIN', 'min')}{THsort('PTS', 'pts')}
                            <th style={TH}>2pts</th>{THsort('2%', 'fg2pct', { color: '#475569' })}
                            <th style={TH}>3pts</th>{THsort('3%', 'fg3pct', { color: '#475569' })}
                            <th style={TH}>LF</th>{THsort('LF%', 'ftpct', { color: '#475569' })}
                            {THsort('RO', 'ro')}{THsort('RD', 'rd')}{THsort('RT', 'rt')}
                            {THsort('PD', 'pd')}{THsort('CT', 'ct')}{THsort('IN', 'intercepts')}
                            {THsort('BP', 'bp')}{THsort('FTE', 'fte')}{THsort('FPR', 'fpr')}
                            {THsort('ÉVAL', 'eval')}{THsort('+/-', 'plusMinus')}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedStats.map((s, i) => {
                            const player = playerById.get(s.playerId);
                            return (
                              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', cursor: player ? 'pointer' : undefined }} onClick={() => player && navigate(`/performance-individuelle/${player.id}/vue-ensemble`)}>
                                <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{player ? <span style={{ color: '#F1F5F9', fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(player)}</span><span className="md:hidden">{playerNameShort(player)}</span></span> : <span style={{ color: '#475569' }}>{s.playerId.slice(0, 8)}…</span>}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>{player ? player.number : '—'}</td>
                                <td style={{ ...TD }}>{fmt1(s.min)}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{s.pts}</td>
                                <td style={TD}>{s.fg2m}/{s.fg2a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.fg2m, s.fg2a)}</td>
                                <td style={TD}>{s.fg3m}/{s.fg3a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.fg3m, s.fg3a)}</td>
                                <td style={TD}>{s.ftm}/{s.fta}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.ftm, s.fta)}</td>
                                <td style={{ ...TD }}>{s.ro}</td><td style={{ ...TD }}>{s.rd}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{s.ro + s.rd}</td>
                                <td style={{ ...TD }}>{s.pd}</td><td style={{ ...TD }}>{s.ct}</td><td style={{ ...TD }}>{s.intercepts}</td>
                                <td style={{ ...TD }}>{s.bp}</td><td style={{ ...TD }}>{s.fte}</td><td style={{ ...TD }}>{s.fpr}</td>
                                <td style={{ ...TD, color: evalColor(s.eval ?? null) }}>{s.eval ?? '—'}</td>
                                <td style={{ ...TD, color: (s.plusMinus ?? 0) > 0 ? '#00E5A0' : (s.plusMinus ?? 0) < 0 ? '#EF4444' : '#94A3B8' }}>{s.plusMinus != null ? (s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus) : '—'}</td>
                              </tr>
                            );
                          })}
                          {/* Ligne TOTAUX */}
                          {individualStats.length > 1 && (() => {
                            const t = individualStats.reduce((acc, s) => ({
                              min: acc.min + s.min, pts: acc.pts + s.pts,
                              fg2m: acc.fg2m + s.fg2m, fg2a: acc.fg2a + s.fg2a,
                              fg3m: acc.fg3m + s.fg3m, fg3a: acc.fg3a + s.fg3a,
                              ftm: acc.ftm + s.ftm, fta: acc.fta + s.fta,
                              ro: acc.ro + s.ro, rd: acc.rd + s.rd,
                              pd: acc.pd + s.pd, ct: acc.ct + s.ct,
                              intercepts: acc.intercepts + s.intercepts, bp: acc.bp + s.bp,
                              fte: acc.fte + s.fte, fpr: acc.fpr + s.fpr,
                            }), { min: 0, pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0 });
                            return (
                              <tr key="totals" style={{ borderTop: '2px solid #2A2F3A', backgroundColor: 'rgba(255,255,255,0.035)' }}>
                                <td style={{ ...TD, textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#1A1E26' }}>Totaux</td>
                                <td style={{ ...TD, color: '#334155' }}>—</td>
                                <td style={{ ...TD }}>{fmt1(t.min)}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{t.pts}</td>
                                <td style={TD}>{t.fg2m}/{t.fg2a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.fg2m, t.fg2a)}</td>
                                <td style={TD}>{t.fg3m}/{t.fg3a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.fg3m, t.fg3a)}</td>
                                <td style={TD}>{t.ftm}/{t.fta}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.ftm, t.fta)}</td>
                                <td style={{ ...TD }}>{t.ro}</td>
                                <td style={{ ...TD }}>{t.rd}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{t.ro + t.rd}</td>
                                <td style={{ ...TD }}>{t.pd}</td><td style={{ ...TD }}>{t.ct}</td><td style={{ ...TD }}>{t.intercepts}</td>
                                <td style={{ ...TD }}>{t.bp}</td><td style={{ ...TD }}>{t.fte}</td><td style={{ ...TD }}>{t.fpr}</td>
                                <td style={{ ...TD, color: '#475569' }}>—</td>
                                <td style={{ ...TD, color: '#475569' }}>—</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {opponentStats.length > 0 && (
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                      Statistiques individuelles {match.opponent} · {opponentStats.length} joueur{opponentStats.length > 1 ? 's' : ''}
                    </p>
                    <div style={{ overflowX: 'auto', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                      <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                        <thead>
                          <tr>
                            <th style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}>Joueur</th>
                            <th style={{ ...TH, width: 32, textAlign: 'center' }}>#</th>
                            {THoppSort('MIN', 'min')}{THoppSort('PTS', 'pts')}
                            <th style={TH}>2pts</th>{THoppSort('2%', 'fg2pct', { color: '#475569' })}
                            <th style={TH}>3pts</th>{THoppSort('3%', 'fg3pct', { color: '#475569' })}
                            <th style={TH}>LF</th>{THoppSort('LF%', 'ftpct', { color: '#475569' })}
                            {THoppSort('RO', 'ro')}{THoppSort('RD', 'rd')}{THoppSort('RT', 'rt')}
                            {THoppSort('PD', 'pd')}{THoppSort('CT', 'ct')}{THoppSort('IN', 'intercepts')}
                            {THoppSort('BP', 'bp')}{THoppSort('FTE', 'fte')}{THoppSort('FPR', 'fpr')}
                            {THoppSort('ÉVAL', 'eval')}{THoppSort('+/-', 'plusMinus')}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedOppStats.map((s, i) => (
                            <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                              <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}><span style={{ color: '#F1F5F9', fontWeight: 600 }}>{s.playerName}</span></td>
                              <td style={{ ...TD, color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>—</td>
                              <td style={TD}>{fmt1(s.min)}</td>
                              <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{s.pts}</td>
                              <td style={TD}>{s.fg2m}/{s.fg2a}</td>
                              <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.fg2m, s.fg2a)}</td>
                              <td style={TD}>{s.fg3m}/{s.fg3a}</td>
                              <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.fg3m, s.fg3a)}</td>
                              <td style={TD}>{s.ftm}/{s.fta}</td>
                              <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(s.ftm, s.fta)}</td>
                              <td style={TD}>{s.ro}</td><td style={TD}>{s.rd}</td>
                              <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{s.ro + s.rd}</td>
                              <td style={TD}>{s.pd}</td><td style={TD}>{s.ct}</td><td style={TD}>{s.intercepts}</td>
                              <td style={TD}>{s.bp}</td><td style={TD}>{s.fte}</td><td style={TD}>{s.fpr}</td>
                              <td style={{ ...TD, color: evalColor(s.eval ?? null) }}>{s.eval ?? '—'}</td>
                              <td style={{ ...TD, color: s.plusMinus != null ? (s.plusMinus > 0 ? '#00E5A0' : s.plusMinus < 0 ? '#EF4444' : '#94A3B8') : '#475569' }}>{s.plusMinus != null ? (s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus) : '—'}</td>
                            </tr>
                          ))}
                          {opponentStats.length > 1 && (() => {
                            const t = opponentStats.reduce((acc, s) => ({
                              min: acc.min + s.min, pts: acc.pts + s.pts,
                              fg2m: acc.fg2m + s.fg2m, fg2a: acc.fg2a + s.fg2a,
                              fg3m: acc.fg3m + s.fg3m, fg3a: acc.fg3a + s.fg3a,
                              ftm: acc.ftm + s.ftm, fta: acc.fta + s.fta,
                              ro: acc.ro + s.ro, rd: acc.rd + s.rd,
                              pd: acc.pd + s.pd, ct: acc.ct + s.ct,
                              intercepts: acc.intercepts + s.intercepts, bp: acc.bp + s.bp,
                              fte: acc.fte + s.fte, fpr: acc.fpr + s.fpr,
                            }), { min:0,pts:0,fg2m:0,fg2a:0,fg3m:0,fg3a:0,ftm:0,fta:0,ro:0,rd:0,pd:0,ct:0,intercepts:0,bp:0,fte:0,fpr:0 });
                            return (
                              <tr key="opp-totals" style={{ borderTop: '2px solid #2A2F3A', backgroundColor: 'rgba(255,255,255,0.035)' }}>
                                <td style={{ ...TD, textAlign: 'left', color: '#64748B', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', left: 0, zIndex: 1, backgroundColor: '#1A1E26' }}>Totaux</td>
                                <td style={{ ...TD, color: '#334155' }}>—</td>
                                <td style={TD}>{fmt1(t.min)}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{t.pts}</td>
                                <td style={TD}>{t.fg2m}/{t.fg2a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.fg2m, t.fg2a)}</td>
                                <td style={TD}>{t.fg3m}/{t.fg3a}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.fg3m, t.fg3a)}</td>
                                <td style={TD}>{t.ftm}/{t.fta}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{pct(t.ftm, t.fta)}</td>
                                <td style={TD}>{t.ro}</td>
                                <td style={TD}>{t.rd}</td>
                                <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{t.ro + t.rd}</td>
                                <td style={TD}>{t.pd}</td><td style={TD}>{t.ct}</td><td style={TD}>{t.intercepts}</td>
                                <td style={TD}>{t.bp}</td><td style={TD}>{t.fte}</td><td style={TD}>{t.fpr}</td>
                                <td style={{ ...TD, color: '#475569' }}>—</td>
                                <td style={{ ...TD, color: '#475569' }}>—</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* ── STATS AVANCÉES ── */}
          {activeTab === 'advanced' && (
            !individualStats.length && !opponentStats.length ? (
              <EmptyState message="Aucune statistique individuelle importée." />
            ) : (
              <div className="flex flex-col gap-4 sm:gap-6">
                {individualStats.length > 0 && (
                  <div>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                      Statistiques avancées · {individualStats.length} joueur{individualStats.length > 1 ? 's' : ''}
                    </p>
                    <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                      <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{ ...TH, textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid #2A2F3A', position: 'sticky', left: 0, zIndex: 2 }}>Joueur</th>
                            <th rowSpan={2} style={{ ...TH, width: 32, textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid #2A2F3A' }}>#</th>
                            <th colSpan={5} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impact offensif</th>
                            <th colSpan={4} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Playmaking</th>
                            <th colSpan={3} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rebonds</th>
                          </tr>
                          <tr>
                            {THsort('%USG', 'usagePctRaw', { borderLeft: '1px solid #334155' })}
                            {THsort('%USG/min', 'usagePct')}
                            {THsort('ORtg', 'offRating')}{THsort('eFG%', 'efgPct')}{THsort('FT Rate', 'ftRate')}
                            {THsort('Pts générés', 'ptsProd', { borderLeft: '1px solid #334155', color: '#00E5A080' })}
                            {THsort('%PD', 'astPct')}{THsort('%BP', 'tovPct')}{THsort('BP/poss', 'bpPerPoss')}
                            {THsort('%TREB', 'trebPct', { borderLeft: '1px solid #334155' })}
                            {THsort('%DREB', 'drebPct')}{THsort('%OREB', 'orebPct')}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedStats.map((s, i) => {
                            const player = playerById.get(s.playerId);
                            const adv = calcPlayerAdvancedForMatch(s, teamStats);
                            const fmt = (v: number | null, suffix = '') => v !== null ? `${v}${suffix}` : '—';
                            const SEP: React.CSSProperties = { borderLeft: '1px solid #334155' };
                            return (
                              <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}>{player ? <span style={{ color: '#F1F5F9', fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(player)}</span><span className="md:hidden">{playerNameShort(player)}</span></span> : <span style={{ color: '#475569' }}>{s.playerId.slice(0, 8)}…</span>}</td>
                                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>{player ? player.number : '—'}</td>
                                <td style={{ ...TD, ...SEP }}>{fmt(adv.usagePctRaw, '%')}</td>
                                <td style={{ ...TD }}>{fmt(adv.usagePct, '%')}</td>
                                <td style={{ ...TD, color: adv.offRating === null ? '#475569' : adv.offRating > 90 ? '#00E5A0' : adv.offRating >= 60 ? '#F59E0B' : '#EF4444' }}>{fmt(adv.offRating)}</td>
                                <td style={{ ...TD }}>{fmt(adv.efgPct, '%')}</td>
                                <td style={{ ...TD }}>{fmt(adv.ftRate)}</td>
                                <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(adv.ptsProd)}</td>
                                <td style={{ ...TD }}>{fmt(adv.astPct, '%')}</td>
                                <td style={{ ...TD }}>{fmt(adv.tovPct, '%')}</td>
                                <td style={TD}>{fmt(adv.bpPerPoss)}</td>
                                <td style={{ ...TD, ...SEP }}>{fmt(adv.trebPct, '%')}</td>
                                <td style={{ ...TD }}>{fmt(adv.drebPct, '%')}</td>
                                <td style={{ ...TD }}>{fmt(adv.orebPct, '%')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {opponentStats.length > 0 && teamStats && (() => {
                  return (
                    <div>
                      <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                        Statistiques avancées {match.opponent} · {opponentStats.length} joueur{opponentStats.length > 1 ? 's' : ''}
                      </p>
                      <div style={{ overflowX: 'auto', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8 }}>
                        <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                          <thead>
                            <tr>
                              <th rowSpan={2} style={{ ...TH, textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid #2A2F3A', position: 'sticky', left: 0, zIndex: 2 }}>Joueur</th>
                              <th rowSpan={2} style={{ ...TH, width: 32, textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid #2A2F3A' }}>#</th>
                              <th colSpan={5} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Impact offensif</th>
                              <th colSpan={4} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Playmaking</th>
                              <th colSpan={3} style={{ ...TH, borderLeft: '1px solid #334155', borderBottom: 'none', textAlign: 'center', fontSize: '0.6rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rebonds</th>
                            </tr>
                            <tr>
                              {THoppSort('%USG', 'usagePctRaw', { borderLeft: '1px solid #334155' })}
                              {THoppSort('%USG/min', 'usagePct')}
                              {THoppSort('ORtg', 'offRating')}{THoppSort('eFG%', 'efgPct')}{THoppSort('FT Rate', 'ftRate')}
                              {THoppSort('Pts générés', 'ptsProd', { borderLeft: '1px solid #334155', color: '#00E5A080' })}
                              {THoppSort('%PD', 'astPct')}{THoppSort('%BP', 'tovPct')}{THoppSort('BP/poss', 'bpPerPoss')}
                              {THoppSort('%TREB', 'trebPct', { borderLeft: '1px solid #334155' })}
                              {THoppSort('%DREB', 'drebPct')}{THoppSort('%OREB', 'orebPct')}
                            </tr>
                          </thead>
                          <tbody>
                            {sortedOppStats.map((s, i) => {
                              const adv = oppAdvFor(s);
                              const fmt = (v: number | null, suffix = '') => v !== null ? `${v}${suffix}` : '—';
                              const SEP: React.CSSProperties = { borderLeft: '1px solid #334155' };
                              return (
                                <tr key={s.id} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                  <td style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: i % 2 === 0 ? '#161920' : '#1A1E26' }}><span style={{ color: '#F1F5F9', fontWeight: 600 }}>{s.playerName}</span></td>
                                  <td style={{ ...TD, color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>—</td>
                                  <td style={{ ...TD, ...SEP }}>{fmt(adv.usagePctRaw, '%')}</td>
                                  <td style={{ ...TD }}>{fmt(adv.usagePct, '%')}</td>
                                  <td style={{ ...TD, color: adv.offRating === null ? '#475569' : adv.offRating > 90 ? '#00E5A0' : adv.offRating >= 60 ? '#F59E0B' : '#EF4444' }}>{fmt(adv.offRating)}</td>
                                  <td style={TD}>{fmt(adv.efgPct, '%')}</td>
                                  <td style={TD}>{fmt(adv.ftRate)}</td>
                                  <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(adv.ptsProd)}</td>
                                  <td style={TD}>{fmt(adv.astPct, '%')}</td>
                                  <td style={TD}>{fmt(adv.tovPct, '%')}</td>
                                  <td style={TD}>{fmt(adv.bpPerPoss)}</td>
                                  <td style={{ ...TD, ...SEP }}>{fmt(adv.trebPct, '%')}</td>
                                  <td style={TD}>{fmt(adv.drebPct, '%')}</td>
                                  <td style={TD}>{fmt(adv.orebPct, '%')}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )
          )}

          {/* ── FOUR FACTORS ── */}
          {activeTab === 'four_factors' && (() => {
            if (!teamStats) return <EmptyState message="Statistiques collectives requises." />;
            const oppFga = teamStats.opp_fg2a + teamStats.opp_fg3a;
            const oppFtRate = oppFga > 0 ? Math.round(teamStats.opp_fta / oppFga * 100) / 100 : null;
            const factors: { label: string; desc: string; weight: string; own: number | null; opp: number | null; higherIsBetter: boolean; fmt: (v: number) => string }[] = [
              { label: 'eFG%', desc: 'Efficacité au tir pondérant le 3pts', weight: '40%', own: teamStats.efgPct, opp: teamStats.opp_efgPct, higherIsBetter: true, fmt: v => `${v}%` },
              { label: 'TO%', desc: 'Balles perdues par 100 possessions', weight: '25%', own: teamStats.toPct, opp: teamStats.opp_toPct, higherIsBetter: false, fmt: v => `${v}%` },
              { label: 'OREB%', desc: 'Part des rebonds offensifs captés', weight: '20%', own: teamStats.orebPct, opp: teamStats.opp_orebPct, higherIsBetter: true, fmt: v => `${v}%` },
              { label: 'FT Rate', desc: 'Lancers-francs obtenus par tir tenté', weight: '15%', own: teamStats.ftRate, opp: oppFtRate, higherIsBetter: true, fmt: v => v.toFixed(2) },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
                  {factors.map(f => {
                    const ownBetter = f.own !== null && f.opp !== null && (f.higherIsBetter ? f.own > f.opp : f.own < f.opp);
                    const oppBetter = f.own !== null && f.opp !== null && (f.higherIsBetter ? f.opp > f.own : f.opp < f.own);
                    const maxVal = Math.max(f.own ?? 0, f.opp ?? 0, 0.01);
                    const ownPct = f.own !== null ? Math.min((f.own / maxVal) * 100, 100) : 0;
                    const oppPct = f.opp !== null ? Math.min((f.opp / maxVal) * 100, 100) : 0;
                    return (
                      <div key={f.label} className="p-3 sm:p-4" style={{ backgroundColor: '#1E2229', border: `1px solid ${ownBetter ? '#00E5A020' : oppBetter ? '#EF444420' : '#2A2F3A'}`, borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '1rem' }}>{f.label}</span>
                              <span style={{ fontSize: '0.6rem', color: '#334155', backgroundColor: '#0D1117', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{f.weight}</span>
                            </div>
                            <span style={{ color: '#334155', fontSize: '0.65rem', display: 'block', marginTop: 2 }}>{f.desc}</span>
                          </div>
                          {ownBetter && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00E5A0', backgroundColor: '#00E5A012', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>✓ Avantage</span>}
                          {oppBetter && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#EF4444', backgroundColor: '#EF444412', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>✗ Désavantage</span>}
                        </div>
                        {/* Mon équipe */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Mon équipe</span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: ownBetter ? '#00E5A0' : oppBetter ? '#EF4444' : '#F1F5F9', fontFamily: 'JetBrains Mono, monospace' }}>
                              {f.own !== null ? f.fmt(f.own) : '—'}
                            </span>
                          </div>
                          <div style={{ height: 6, backgroundColor: '#2A2F3A', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${ownPct}%`, backgroundColor: ownBetter ? '#22C55E' : oppBetter ? '#EF4444' : '#475569', borderRadius: 4 }} />
                          </div>
                        </div>
                        {/* Adversaire */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{match.opponent}</span>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}>
                              {f.opp !== null ? f.fmt(f.opp) : '—'}
                            </span>
                          </div>
                          <div style={{ height: 6, backgroundColor: '#2A2F3A', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${oppPct}%`, backgroundColor: '#475569', borderRadius: 4 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ margin: 0, fontSize: '0.68rem', color: '#2A2F3A', textAlign: 'center' }}>
                  Modèle Dean Oliver — les poids indiqués reflètent l'importance relative de chaque facteur.
                </p>
              </div>
            );
          })()}

          {/* ── COMPARAISON JOUEURS ── */}
          {activeTab === 'comp_players' && (() => {
            if (individualStats.length < 2) return <EmptyState message="Au moins 2 joueurs importés requis." />;
            const sA = individualStats.find(s => s.playerId === playerA);
            const sB = individualStats.find(s => s.playerId === playerB);
            const pA = playerById.get(playerA);
            const pB = playerById.get(playerB);
            type Metric = { label: string; a: number; b: number; displayA: string; displayB: string; higherBetter: boolean | null };
            type MetricGroup = { title: string; metrics: Metric[] };
            const calcPct = (m: number, a: number) => shotPct(m, a) ?? 0;
            const advA = sA ? calcPlayerAdvancedForMatch(sA, teamStats) : null;
            const advB = sB ? calcPlayerAdvancedForMatch(sB, teamStats) : null;
            const hasAdv = !!(teamStats && teamStats.possessions > 0 && advA && advB);
            const adv = (label: string, va: number | null, vb: number | null, fmtFn: (v: number) => string, higherBetter: boolean | null): Metric => ({
              label, a: va ?? -999, b: vb ?? -999,
              displayA: va !== null ? fmtFn(va) : '—',
              displayB: vb !== null ? fmtFn(vb) : '—',
              higherBetter,
            });
            const groups: MetricGroup[] = !sA || !sB ? [] : [
              { title: 'Score', metrics: [
                { label: 'MIN', a: sA.min, b: sB.min, displayA: String(sA.min), displayB: String(sB.min), higherBetter: null },
                { label: 'PTS', a: sA.pts, b: sB.pts, displayA: String(sA.pts), displayB: String(sB.pts), higherBetter: true },
                { label: 'ÉVAL', a: sA.eval ?? 0, b: sB.eval ?? 0, displayA: String(sA.eval ?? '—'), displayB: String(sB.eval ?? '—'), higherBetter: true },
                { label: '+/-', a: sA.plusMinus ?? 0, b: sB.plusMinus ?? 0, displayA: sA.plusMinus != null ? (sA.plusMinus > 0 ? `+${sA.plusMinus}` : String(sA.plusMinus)) : '—', displayB: sB.plusMinus != null ? (sB.plusMinus > 0 ? `+${sB.plusMinus}` : String(sB.plusMinus)) : '—', higherBetter: true },
              ]},
              { title: 'Tirs', metrics: [
                { label: 'eFG%', a: advA?.efgPct ?? 0, b: advB?.efgPct ?? 0, displayA: `${advA?.efgPct ?? 0}%`, displayB: `${advB?.efgPct ?? 0}%`, higherBetter: true },
                { label: '2pts', a: sA.fg2m, b: sB.fg2m, displayA: `${sA.fg2m}/${sA.fg2a}`, displayB: `${sB.fg2m}/${sB.fg2a}`, higherBetter: true },
                { label: '2pts%', a: calcPct(sA.fg2m, sA.fg2a), b: calcPct(sB.fg2m, sB.fg2a), displayA: `${calcPct(sA.fg2m, sA.fg2a)}%`, displayB: `${calcPct(sB.fg2m, sB.fg2a)}%`, higherBetter: true },
                { label: '3pts', a: sA.fg3m, b: sB.fg3m, displayA: `${sA.fg3m}/${sA.fg3a}`, displayB: `${sB.fg3m}/${sB.fg3a}`, higherBetter: true },
                { label: '3pts%', a: calcPct(sA.fg3m, sA.fg3a), b: calcPct(sB.fg3m, sB.fg3a), displayA: `${calcPct(sA.fg3m, sA.fg3a)}%`, displayB: `${calcPct(sB.fg3m, sB.fg3a)}%`, higherBetter: true },
                { label: 'LF', a: sA.ftm, b: sB.ftm, displayA: `${sA.ftm}/${sA.fta}`, displayB: `${sB.ftm}/${sB.fta}`, higherBetter: true },
                { label: 'LF%', a: calcPct(sA.ftm, sA.fta), b: calcPct(sB.ftm, sB.fta), displayA: `${calcPct(sA.ftm, sA.fta)}%`, displayB: `${calcPct(sB.ftm, sB.fta)}%`, higherBetter: true },
              ]},
              { title: 'Rebonds', metrics: [
                { label: 'RT', a: sA.ro + sA.rd, b: sB.ro + sB.rd, displayA: String(sA.ro + sA.rd), displayB: String(sB.ro + sB.rd), higherBetter: true },
                { label: 'RO', a: sA.ro, b: sB.ro, displayA: String(sA.ro), displayB: String(sB.ro), higherBetter: true },
                { label: 'RD', a: sA.rd, b: sB.rd, displayA: String(sA.rd), displayB: String(sB.rd), higherBetter: true },
                ...(hasAdv ? [
                  adv('%TREB', advA!.trebPct, advB!.trebPct, v => `${v}%`, true),
                  adv('%OREB', advA!.orebPct, advB!.orebPct, v => `${v}%`, true),
                  adv('%DREB', advA!.drebPct, advB!.drebPct, v => `${v}%`, true),
                ] : []),
              ]},
              { title: 'Playmaking', metrics: [
                { label: 'PD', a: sA.pd, b: sB.pd, displayA: String(sA.pd), displayB: String(sB.pd), higherBetter: true },
                { label: 'BP', a: sA.bp, b: sB.bp, displayA: String(sA.bp), displayB: String(sB.bp), higherBetter: false },
                ...(hasAdv ? [
                  adv('%PD', advA!.astPct, advB!.astPct, v => `${v}%`, true),
                  adv('%BP', advA!.tovPct, advB!.tovPct, v => `${v}%`, false),
                  adv('BP/poss', advA!.bpPerPoss, advB!.bpPerPoss, v => String(v), false),
                ] : []),
              ]},
              { title: 'Défense', metrics: [
                { label: 'CT', a: sA.ct, b: sB.ct, displayA: String(sA.ct), displayB: String(sB.ct), higherBetter: true },
                { label: 'IN', a: sA.intercepts, b: sB.intercepts, displayA: String(sA.intercepts), displayB: String(sB.intercepts), higherBetter: true },
              ]},
              ...(hasAdv ? [
                { title: 'Efficacité', metrics: [
                  adv('%USG', advA!.usagePctRaw, advB!.usagePctRaw, v => `${v}%`, true),
                  adv('%USG/min', advA!.usagePct, advB!.usagePct, v => `${v}%`, true),
                  adv('ORtg', advA!.offRating, advB!.offRating, v => String(v), true),
                  adv('Pts créés', advA!.ptsProd, advB!.ptsProd, v => String(v), true),
                  adv('FT Rate', advA!.ftRate, advB!.ftRate, v => v.toFixed(2), true),
                ]},
              ] as MetricGroup[] : []),
              { title: 'Fautes', metrics: [
                { label: 'FPR', a: sA.fpr, b: sB.fpr, displayA: String(sA.fpr), displayB: String(sB.fpr), higherBetter: false },
                { label: 'FTE', a: sA.fte, b: sB.fte, displayA: String(sA.fte), displayB: String(sB.fte), higherBetter: null },
              ]},
            ];
            const selStyle: React.CSSProperties = { backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.82rem', padding: '7px 10px', cursor: 'pointer', outline: 'none', flex: 1 };
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540, margin: '0 auto', width: '100%' }}>
                {/* Sélecteurs avec noms en évidence */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Joueur A</span>
                    <select value={playerA} onChange={e => setPlayerA(e.target.value)} style={{ ...selStyle, flex: 'unset', width: '100%' }}>
                      {individualStats.map(s => { const p = playerById.get(s.playerId); return <option key={s.playerId} value={s.playerId}>{p ? `#${p.number} ${playerNameFull(p)}` : s.playerId.slice(0,8)}</option>; })}
                    </select>
                    {pA && <span style={{ fontSize: '0.72rem', color: '#475569' }}>{pA.position} · #{pA.number}</span>}
                  </div>
                  <span style={{ color: '#2A2F3A', fontWeight: 700, fontSize: '1.2rem' }}>vs</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Joueur B</span>
                    <select value={playerB} onChange={e => setPlayerB(e.target.value)} style={{ ...selStyle, flex: 'unset', width: '100%', textAlign: 'right' }}>
                      {individualStats.map(s => { const p = playerById.get(s.playerId); return <option key={s.playerId} value={s.playerId}>{p ? `#${p.number} ${playerNameFull(p)}` : s.playerId.slice(0,8)}</option>; })}
                    </select>
                    {pB && <span style={{ fontSize: '0.72rem', color: '#475569' }}>{pB.position} · #{pB.number}</span>}
                  </div>
                </div>
                {/* Tableau de comparaison par section */}
                {sA && sB && (
                  <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                    <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, textAlign: 'right', minWidth: 110, color: '#F1F5F9' }}>{pA ? `${playerNameFull(pA)}` : '—'}</th>
                          <th style={{ ...TH, width: 90 }}>STATISTIQUE</th>
                          <th style={{ ...TH, textAlign: 'left', minWidth: 110, color: '#94A3B8' }}>{pB ? `${playerNameFull(pB)}` : '—'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map(g => (
                          <React.Fragment key={g.title}>
                            <tr>
                              <td colSpan={3} style={{ padding: '10px 14px 5px', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2229', borderTop: '1px solid #1A1F28', backgroundColor: '#12151A' }}>{g.title}</td>
                            </tr>
                            {g.metrics.map((m, i) => {
                              const aWins = m.higherBetter === true ? m.a > m.b : m.higherBetter === false ? m.a < m.b : false;
                              const bWins = m.higherBetter === true ? m.b > m.a : m.higherBetter === false ? m.b < m.a : false;
                              return (
                                <tr key={m.label} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                  <td style={{ ...TD, textAlign: 'right', fontWeight: aWins ? 700 : 400, color: aWins ? '#00E5A0' : bWins ? '#EF4444' : '#94A3B8', fontSize: '0.9rem' }}>{m.displayA}</td>
                                  <td style={{ ...TD, color: '#475569', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</td>
                                  <td style={{ ...TD, textAlign: 'left', fontWeight: bWins ? 700 : 400, color: bWins ? '#00E5A0' : aWins ? '#EF4444' : '#94A3B8', fontSize: '0.9rem' }}>{m.displayB}</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── COMPARAISONS ÉQUIPES ── */}
          {activeTab === 'comp_teams' && (() => {
            if (!teamStats) return <EmptyState message="Statistiques collectives requises." />;
            const hasOpp = teamStats.opp_fg2a > 0 || teamStats.opp_fg3a > 0 || teamStats.opp_fta > 0;
            const f1 = (v: number) => `${v}%`;
            const f2 = (v: number) => v.toFixed(2);
            const oppFga = teamStats.opp_fg2a + teamStats.opp_fg3a;
            const oppFtRate = oppFga > 0 ? Math.round(teamStats.opp_fta / oppFga * 100) / 100 : 0;
            const oppDrebPct = (teamStats.opp_rd + teamStats.ro) > 0 ? Math.round(teamStats.opp_rd / (teamStats.opp_rd + teamStats.ro) * 1000) / 10 : 0;
            type Row = { label: string; own: number; opp: number; higherBetter: boolean | null; fmt?: (v: number) => string };
            const groups: { title: string; rows: Row[] }[] = [
              { title: 'Score', rows: [
                { label: 'Points', own: match.scoreUs, opp: match.scoreThem, higherBetter: true },
                { label: 'ORtg', own: teamStats.offRating, opp: teamStats.defRating, higherBetter: true, fmt: f1 },
                { label: 'Possessions', own: teamStats.possessions, opp: teamStats.opp_possessions, higherBetter: null },
              ]},
              { title: 'Tirs', rows: [
                { label: 'eFG%', own: teamStats.efgPct, opp: teamStats.opp_efgPct, higherBetter: true, fmt: f1 },
                { label: '2pts%', own: teamStats.fg2a > 0 ? Math.round(teamStats.fg2m/teamStats.fg2a*100) : 0, opp: teamStats.opp_fg2a > 0 ? Math.round(teamStats.opp_fg2m/teamStats.opp_fg2a*100) : 0, higherBetter: true, fmt: f1 },
                { label: '3pts%', own: teamStats.fg3a > 0 ? Math.round(teamStats.fg3m/teamStats.fg3a*100) : 0, opp: teamStats.opp_fg3a > 0 ? Math.round(teamStats.opp_fg3m/teamStats.opp_fg3a*100) : 0, higherBetter: true, fmt: f1 },
                { label: 'LF%', own: teamStats.fta > 0 ? Math.round(teamStats.ftm/teamStats.fta*100) : 0, opp: teamStats.opp_fta > 0 ? Math.round(teamStats.opp_ftm/teamStats.opp_fta*100) : 0, higherBetter: true, fmt: f1 },
                { label: 'FT Rate', own: teamStats.ftRate, opp: oppFtRate, higherBetter: true, fmt: f2 },
              ]},
              { title: 'Rebonds', rows: [
                { label: 'RT', own: teamStats.rt, opp: teamStats.opp_rt, higherBetter: true },
                { label: 'RO', own: teamStats.ro, opp: teamStats.opp_ro, higherBetter: true },
                { label: 'RD', own: teamStats.rd, opp: teamStats.opp_rd, higherBetter: true },
                { label: 'OREB%', own: teamStats.orebPct, opp: teamStats.opp_orebPct, higherBetter: true, fmt: f1 },
                { label: 'DREB%', own: teamStats.drebPct, opp: oppDrebPct, higherBetter: true, fmt: f1 },
              ]},
              { title: 'Playmaking', rows: [
                { label: 'PD', own: teamStats.pd, opp: teamStats.opp_pd, higherBetter: true },
                { label: 'BP', own: teamStats.bp, opp: teamStats.opp_bp, higherBetter: false },
                { label: 'TO%', own: teamStats.toPct, opp: teamStats.opp_toPct, higherBetter: false, fmt: f1 },
              ]},
              { title: 'Défense', rows: [
                { label: 'CT', own: teamStats.ct, opp: teamStats.opp_ct, higherBetter: true },
                { label: 'IN', own: teamStats.intercepts, opp: teamStats.opp_intercepts, higherBetter: true },
              ]},
              { title: 'Fautes', rows: [
                { label: 'FTE', own: teamStats.fte, opp: teamStats.opp_fte, higherBetter: null },
                { label: 'FPR', own: teamStats.fpr, opp: teamStats.opp_fpr, higherBetter: false },
              ]},
            ];
            return (
              <div style={{ maxWidth: 540, margin: '0 auto', width: '100%', overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH, textAlign: 'right', minWidth: 110, color: '#F1F5F9' }}>Mon équipe</th>
                      <th style={{ ...TH, width: 100, color: '#475569' }}>STATISTIQUE</th>
                      <th style={{ ...TH, textAlign: 'left', minWidth: 110, color: '#94A3B8' }}>{match.opponent}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <React.Fragment key={g.title}>
                        <tr>
                          <td colSpan={3} style={{ padding: '10px 14px 5px', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2229', borderTop: '1px solid #1A1F28', backgroundColor: '#12151A' }}>{g.title}</td>
                        </tr>
                        {g.rows.map((r, i) => {
                          const ownWins = r.higherBetter === true ? r.own > r.opp : r.higherBetter === false ? r.own < r.opp : false;
                          const oppWins = r.higherBetter === true ? r.opp > r.own : r.higherBetter === false ? r.opp < r.own : false;
                          const delta = r.own - r.opp;
                          const absDelta = Math.abs(Math.round(delta * 10) / 10);
                          const fmtDelta = r.fmt ? r.fmt(absDelta) : String(absDelta);
                          const deltaPositive = delta > 0 === (r.higherBetter !== false);
                          return (
                            <tr key={r.label} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', opacity: !hasOpp && r.opp === 0 ? 0.35 : 1 }}>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: ownWins ? 700 : 400, color: ownWins ? '#00E5A0' : oppWins ? '#EF4444' : '#94A3B8', fontSize: '0.88rem' }}>{r.fmt ? r.fmt(r.own) : r.own}</td>
                              <td style={{ ...TD, color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{r.label}</td>
                              <td style={{ ...TD, textAlign: 'left', fontSize: '0.88rem' }}>{r.fmt ? r.fmt(r.opp) : r.opp}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* ── COMPARAISON MATCHS ── */}
          {activeTab === 'comp_matches' && (() => {
            if (loadingSeasonStats) return (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 20, height: 20, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            );
            if (!teamStats) return <EmptyState message="Statistiques collectives requises." />;
            const others = seasonTeamStats.filter(ts => ts.matchId !== match.id);
            const n = others.length;
            if (n === 0) return <EmptyState message="Aucun autre match cette saison." />;
            const avg = (fn: (ts: TeamMatchStat) => number) => {
              const vals = others.map(fn);
              return Math.round(vals.reduce((a, b) => a + b, 0) / n * 10) / 10;
            };
            const f1 = (v: number) => `${v}%`;
            const f2 = (v: number) => v.toFixed(2);
            type MatchRow = { label: string; cur: number; avgVal: number; higherBetter: boolean | null; fmt?: (v: number) => string };
            type MatchGroup = { title: string; rows: MatchRow[] };
            const matchGroups: MatchGroup[] = [
              { title: 'Score', rows: [
                { label: 'Points', cur: match.scoreUs, avgVal: avg(ts => ts.scoreUs), higherBetter: true },
                { label: 'Pts encaissés', cur: match.scoreThem, avgVal: avg(ts => ts.scoreThem), higherBetter: false },
                { label: 'ORtg', cur: teamStats.offRating, avgVal: avg(ts => ts.offRating), higherBetter: true, fmt: f1 },
                { label: 'DRtg', cur: teamStats.defRating, avgVal: avg(ts => ts.defRating), higherBetter: false, fmt: f1 },
                { label: 'Possessions', cur: teamStats.possessions, avgVal: avg(ts => ts.possessions), higherBetter: null },
              ]},
              { title: 'Tirs', rows: [
                { label: 'eFG%', cur: teamStats.efgPct, avgVal: avg(ts => ts.efgPct), higherBetter: true, fmt: f1 },
                { label: '2pts%', cur: teamStats.fg2a > 0 ? Math.round(teamStats.fg2m/teamStats.fg2a*100) : 0, avgVal: avg(ts => ts.fg2a > 0 ? Math.round(ts.fg2m/ts.fg2a*100) : 0), higherBetter: true, fmt: f1 },
                { label: '3pts%', cur: teamStats.fg3a > 0 ? Math.round(teamStats.fg3m/teamStats.fg3a*100) : 0, avgVal: avg(ts => ts.fg3a > 0 ? Math.round(ts.fg3m/ts.fg3a*100) : 0), higherBetter: true, fmt: f1 },
                { label: 'LF%', cur: teamStats.fta > 0 ? Math.round(teamStats.ftm/teamStats.fta*100) : 0, avgVal: avg(ts => ts.fta > 0 ? Math.round(ts.ftm/ts.fta*100) : 0), higherBetter: true, fmt: f1 },
                { label: 'FT Rate', cur: teamStats.ftRate, avgVal: avg(ts => ts.ftRate), higherBetter: true, fmt: f2 },
              ]},
              { title: 'Rebonds', rows: [
                { label: 'RT', cur: teamStats.rt, avgVal: avg(ts => ts.rt), higherBetter: true },
                { label: 'OREB%', cur: teamStats.orebPct, avgVal: avg(ts => ts.orebPct), higherBetter: true, fmt: f1 },
                { label: 'DREB%', cur: teamStats.drebPct, avgVal: avg(ts => ts.drebPct), higherBetter: true, fmt: f1 },
              ]},
              { title: 'Playmaking', rows: [
                { label: 'PD', cur: teamStats.pd, avgVal: avg(ts => ts.pd), higherBetter: true },
                { label: 'BP', cur: teamStats.bp, avgVal: avg(ts => ts.bp), higherBetter: false },
                { label: 'TO%', cur: teamStats.toPct, avgVal: avg(ts => ts.toPct), higherBetter: false, fmt: f1 },
              ]},
              { title: 'Défense', rows: [
                { label: 'CT', cur: teamStats.ct, avgVal: avg(ts => ts.ct), higherBetter: true },
                { label: 'IN', cur: teamStats.intercepts, avgVal: avg(ts => ts.intercepts), higherBetter: true },
              ]},
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540, margin: '0 auto', width: '100%' }}>
                <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                  <table className="stat-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'right', minWidth: 100, color: '#F1F5F9' }}>CE MATCH</th>
                        <th style={{ ...TH, width: 130 }}>STATISTIQUE</th>
                        <th style={{ ...TH, textAlign: 'left', minWidth: 100, color: '#475569' }}>MOY. SAISON <span style={{ color: '#334155', fontWeight: 400 }}>({n})</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchGroups.map(g => (
                        <React.Fragment key={g.title}>
                          <tr>
                            <td colSpan={3} style={{ padding: '10px 14px 5px', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1E2229', borderTop: '1px solid #1A1F28', backgroundColor: '#12151A' }}>{g.title}</td>
                          </tr>
                          {g.rows.map((r, i) => {
                            const better = r.higherBetter === true ? r.cur > r.avgVal : r.higherBetter === false ? r.cur < r.avgVal : false;
                            const worse = r.higherBetter === true ? r.cur < r.avgVal : r.higherBetter === false ? r.cur > r.avgVal : false;
                            return (
                              <tr key={r.label} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                <td style={{ ...TD, textAlign: 'right', fontWeight: better ? 700 : 400, color: better ? '#00E5A0' : worse ? '#EF4444' : '#94A3B8', fontSize: '0.9rem' }}>{r.fmt ? r.fmt(r.cur) : r.cur}</td>
                                <td style={{ ...TD, color: '#475569', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{r.label}</td>
                                <td style={{ ...TD, textAlign: 'left', fontSize: '0.9rem' }}>{r.fmt ? r.fmt(r.avgVal) : r.avgVal}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ── STATISTIQUES TACTIQUES BRUTES ── */}
          {activeTab === 'tactical_brutes' && (
            loadingTactical ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 20, height: 20, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            ) : (
              <TacticalStatsSection
                view="brutes"
                teamId={match.teamId}
                events={tacticalEvents}
                categories={tacticalCategories}
                dimensions={tacticalDimensions}
                options={tacticalOptions}
                matches={[{ id: match.id, date: match.date, label: `vs ${match.opponent}` }]}
                emptyMessage="Aucune donnée tactique importée."
              />
            )
          )}

          {/* ── TABLEAU DE BORD TACTIQUE ── */}
          {activeTab === 'tactical_dashboard' && (
            loadingTactical ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                <div style={{ width: 20, height: 20, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              </div>
            ) : (
              <TacticalStatsSection
                view="dashboard"
                teamId={match.teamId}
                events={tacticalEvents}
                categories={tacticalCategories}
                dimensions={tacticalDimensions}
                options={tacticalOptions}
                matches={[{ id: match.id, date: match.date, label: `vs ${match.opponent}` }]}
                emptyMessage="Aucune donnée tactique importée."
              />
            )
          )}

        </div>
      </div>

      {/* Edit modal */}
      {showEdit && (
        <MatchFormModal
          match={match}
          teamId={match.teamId}
          seasonId={match.seasonId}
          onClose={() => setShowEdit(false)}
          onSaved={saved => { setMatch(saved); setShowEdit(false); }}
          onRequestDelete={() => { setShowEdit(false); setConfirmDelete(true); }}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal maxWidth={360} overlayOpacity={0.8} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer ce match ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 4px' }}>vs {match.opponent} — {match.date}</p>
            <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 20px' }}>Les statistiques associées seront aussi supprimées.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger"
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
        </Modal>
      )}

      {/* Confirm delete stats */}
      {confirmDeleteStats && (
        <Modal onClose={() => setConfirmDeleteStats(false)} closeOnBackdropClick maxWidth={360} overlayOpacity={0.8} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer les statistiques de ce match ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px' }}>
              Les statistiques individuelles, collectives et adverses importées seront supprimées. Le match et les statistiques tactiques ne sont pas affectés.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteStats(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleDeleteStats} disabled={deletingStats}
                style={{ flex: 1, padding: '10px', backgroundColor: deletingStats ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deletingStats ? '#475569' : '#fff', cursor: deletingStats ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deletingStats ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
        </Modal>
      )}

      {/* Confirm delete tactical */}
      {confirmDeleteTactical && (
        <Modal onClose={() => setConfirmDeleteTactical(false)} closeOnBackdropClick maxWidth={360} overlayOpacity={0.8} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer les statistiques tactiques de ce match ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px' }}>
              Tous les événements tactiques importés pour ce match seront supprimés. Les statistiques et le match ne sont pas affectés.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteTactical(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleDeleteTactical} disabled={deletingTactical}
                style={{ flex: 1, padding: '10px', backgroundColor: deletingTactical ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deletingTactical ? '#475569' : '#fff', cursor: deletingTactical ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deletingTactical ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
        </Modal>
      )}

      {/* Import modal */}
      {showImport && match && (
        <MatchStatsImportModal
          match={match}
          players={players}
          hasExistingStats={teamStats !== null || individualStats.length > 0}
          onClose={() => setShowImport(false)}
          onSaved={() => {
            setShowImport(false);
            loadStats(match.id);
            matchesApi.getById(match.id).then(m => {
              if (m) setMatch(m);
            });
          }}
        />
      )}

      {/* Import tactique */}
      {showTacticalImport && match && (
        <TacticalImportModal
          match={match}
          hasExistingData={tacticalEvents.length > 0}
          onClose={() => setShowTacticalImport(false)}
          onSaved={() => {
            setShowTacticalImport(false);
            setTacticalLoaded(false);
            loadTactical(match.id, match.teamId);
          }}
        />
      )}
    </div>
  );
}
