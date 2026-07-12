import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, BarChart2, X, AlertCircle, Edit, Users,
} from 'lucide-react';
import { playersApi, rpeApi, wellnessApi, statsApi } from '../api';
import { StatusBadge, PlayerAvatar, PlayerHero, Card, CardTitle, EmptyState, PlayerDynStatTab, DateRangeCard, useDateRange, Modal } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { evalColor, ortgColor, shotPct } from '../data';
import type { Player, RPEEntry, WellnessEntry, MatchStat } from '../data/types';
import { calcPlayerAdvanced } from '../data/playerAdvanced';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtShortDate(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

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

// ─── Profil joueur ────────────────────────────────────────────────────────────
export function PlayerProfile({ playerId, hideBackButton, playerSelect }: { playerId: string; hideBackButton?: boolean; playerSelect?: React.ReactNode }) {
  const navigate  = useNavigate();
  const { selected, statThresholds } = useTeamSeason();

  const [player,   setPlayer]   = useState<Player | null>(null);
  const [rpe,      setRpe]      = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, import('../data/types').TeamMatchStat>>(new Map());
  const [playerTab, setPlayerTab] = useState<'performance' | 'dynstat'>('performance');
  const [statsView, setStatsView] = useState<'basic' | 'advanced' | 'season'>('basic');
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);
  const [allTeamsSeason, setAllTeamsSeason] = useState(false);
  const [basicSort, setBasicSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });
  const [advSort, setAdvSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' });
  const [seasonSort, setSeasonSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'season', dir: 'desc' });

  const perfRange = useDateRange(selected?.season.startDate, 'saison', selected?.season.endDate);

  const [showEdit,      setShowEdit]      = useState(false);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [editForm,   setEditForm]   = useState({
    firstName: '', lastName: '', number: '',
    position:  'Meneur' as Player['position'],
    status:    'active' as Player['status'],
    birthDate: '', nationality: 'FR',
    hand:      'right' as Player['hand'],
    height: '', weight: '', contractEnd: '', email: '',
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      playersApi.getById(playerId),
      rpeApi.listPlayerHistory(playerId),
      wellnessApi.getByPlayer(playerId),
    ]).then(([p, rpeData, wellnessData]) => {
      setPlayer(p);
      setRpe(rpeData);
      setWellness(wellnessData);
    }).finally(() => setLoading(false));
    statsApi.getPlayerStatsGroupedBySeason(playerId).then(setSeasonGroupedStats);
  }, [playerId]);

  useEffect(() => {
    if (!selected) return;
    setMatchStats([]);
    setAllTeamsSeason(false);
    statsApi.getPlayerStatsBySeason(playerId, selected.season.id).then(setMatchStats);
  }, [playerId, selected]);

  // ── Autres équipes ayant joué la même saison (même libellé, ex. "2025/2026") ──
  const siblingSeasons = useMemo(
    () => selected ? seasonGroupedStats.filter(g => g.seasonLabel === selected.season.label) : [],
    [seasonGroupedStats, selected?.season.label]
  );
  const multiTeamSeason = siblingSeasons.length > 1;
  const combinedSeasonStats = useMemo(
    () => siblingSeasons.flatMap(g => g.stats),
    [siblingSeasons]
  );
  const effectiveMatchStats = allTeamsSeason && multiTeamSeason ? combinedSeasonStats : matchStats;

  const matchIdsKey = useMemo(
    () => effectiveMatchStats.map(s => s.matchId).filter((id): id is string => !!id).sort().join(','),
    [effectiveMatchStats]
  );
  useEffect(() => {
    if (!matchIdsKey) { setTeamStatsMap(new Map()); return; }
    statsApi.listTeamStatsByMatchIds(matchIdsKey.split(',')).then(teamStats => {
      setTeamStatsMap(new Map(teamStats.map(t => [t.matchId!, t])));
    });
  }, [matchIdsKey]);

  const perfFilteredStats = perfRange.from
    ? effectiveMatchStats.filter(s => s.date >= perfRange.from && s.date <= perfRange.to)
    : effectiveMatchStats;

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

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !player) return;
    setPhotoUploading(true);
    try {
      const url = await playersApi.uploadPhoto(player.id, file);
      setPlayer(p => p ? { ...p, photoUrl: url } : p);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Erreur upload photo');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
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

  return (
    <div className="p-4 md:p-6">

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        {!hideBackButton ? (
          <button onClick={() => navigate('/roster')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
            ← Retour à l'effectif
          </button>
        ) : (
          <h1 style={{ color: '#F1F5F9', margin: 0 }}>Statistiques individuelles</h1>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {!hideBackButton ? (
            <button onClick={openEdit} style={{ padding: '6px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Edit size={13} /> Modifier
            </button>
          ) : (playerSelect ?? <div />)}
        </div>
      </div>

      <PlayerHero player={player} />


      {/* ── Tabs ── */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, marginBottom: 14, overflowX: 'auto' }}>
        <div style={{ display: 'flex', gap: 4, minWidth: 'max-content', width: '100%' }}>
          {([
            { key: 'performance', label: 'Statistiques'   },
            { key: 'dynstat',     label: 'Dynamique'      },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setPlayerTab(t.key)}
              className="hover:!text-[#F1F5F9]"
              style={{ flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', backgroundColor: playerTab === t.key ? '#1E2229' : 'transparent', color: playerTab === t.key ? '#F1F5F9' : '#94A3B8', transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>


      {/* ── Dynamique (comparatif période vs saison) ── */}
      {playerTab === 'dynstat' && (
        <PlayerDynStatTab rpe={rpe} wellness={wellness} matchStats={matchStats} seasonStart={selected?.season.startDate} seasonEnd={selected?.season.endDate} teamStatsMap={teamStatsMap} />
      )}


      {/* ── Performance ── */}
      {playerTab === 'performance' && <>

      <DateRangeCard
        from={perfRange.from} to={perfRange.to} preset={perfRange.preset}
        onPreset={p => perfRange.applyPreset(p, selected?.season.startDate, selected?.season.endDate)}
        onFrom={perfRange.setFrom} onTo={perfRange.setTo}
      />

      {/* ── Ligne 5 : Statistiques par match ── */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle
          icon={<BarChart2 size={12} style={{ color: '#3B82F6' }} />}
          mb={14}
          info={statsView !== 'season' && perfFilteredStats.length > 0
            ? `${perfFilteredStats.length} match${perfFilteredStats.length > 1 ? 's' : ''}`
            : undefined}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {statsView !== 'season' && multiTeamSeason && (
                <button type="button" onClick={e => { e.stopPropagation(); setAllTeamsSeason(v => !v); }}
                  title="Inclut les matchs joués avec les autres équipes du club sur cette même saison"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: allTeamsSeason ? 700 : 400, backgroundColor: allTeamsSeason ? 'rgba(0,229,160,0.12)' : 'transparent', color: allTeamsSeason ? '#00E5A0' : '#475569' }}>
                  <Users size={11} /> Toutes les équipes
                </button>
              )}
              <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
                {([['basic', 'Brutes'], ['advanced', 'Avancées'], ['season', 'Par saison']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={e => { e.stopPropagation(); setStatsView(v); }}
                    style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: statsView === v ? 700 : 400, backgroundColor: statsView === v ? '#1E2229' : 'transparent', color: statsView === v ? '#00E5A0' : '#475569' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          }
        >Statistiques saison</CardTitle>

        {statsView === 'season' ? (
          seasonGroupedStats.length === 0 ? (
            <EmptyState message="Aucune statistique disponible." />
          ) : (() => {
            const TH: React.CSSProperties = {
              padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
              whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A',
              position: 'sticky', top: 0, backgroundColor: '#161920', zIndex: 1,
              cursor: 'pointer', userSelect: 'none',
            };
            const TD: React.CSSProperties = {
              padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
            };
            const si = (col: string) =>
              seasonSort.col === col ? (seasonSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
            const thC = (col: string) =>
              seasonSort.col === col ? '#CBD5E1' : '#475569';
            const toggle = (col: string) => setSeasonSort(prev =>
              prev.col === col ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }
            );
            const computed = seasonGroupedStats.map(({ seasonId, seasonLabel, teamName, stats: ss }) => {
              const n = ss.length;
              const sum = (k: keyof MatchStat) => ss.reduce((acc, m) => acc + (((m[k] as number) || 0)), 0);
              const avg = (k: keyof MatchStat) => n > 0 ? Math.round((sum(k) / n) * 10) / 10 : 0;
              const withEval = ss.filter(s => s.eval !== null);
              const evalAvg = withEval.length > 0
                ? Math.round(withEval.reduce((a, s) => a + (s.eval ?? 0), 0) / withEval.length * 10) / 10
                : null;
              const withPm = ss.filter(s => s.plusMinus !== null);
              const pmAvg = withPm.length > 0
                ? Math.round(withPm.reduce((a, s) => a + (s.plusMinus ?? 0), 0) / withPm.length * 10) / 10
                : null;
              return {
                seasonId, seasonLabel, teamName: teamName || '', n,
                fg2m: sum('fg2m'), fg2a: sum('fg2a'),
                fg3m: sum('fg3m'), fg3a: sum('fg3a'),
                ftm: sum('ftm'), fta: sum('fta'),
                starters: ss.filter(s => s.starter).length, evalAvg, pmAvg,
                avgMin: avg('min'), avgPts: avg('pts'),
                avgRo: avg('ro'), avgRd: avg('rd'),
                avgPd: avg('pd'), avgCt: avg('ct'),
                avgInt: avg('intercepts'), avgBp: avg('bp'),
              };
            });
            const sorted = [...computed].sort((a, b) => {
              const m = seasonSort.dir === 'asc' ? 1 : -1;
              switch (seasonSort.col) {
                case 'season': return m * a.seasonLabel.localeCompare(b.seasonLabel);
                case 'mj':     return m * (a.n - b.n);
                case 'tit':    return m * (a.starters - b.starters);
                case 'min':    return m * (a.avgMin - b.avgMin);
                case 'pts':    return m * (a.avgPts - b.avgPts);
                case 'fg2':    return m * ((a.fg2a > 0 ? a.fg2m / a.fg2a : 0) - (b.fg2a > 0 ? b.fg2m / b.fg2a : 0));
                case 'fg3':    return m * ((a.fg3a > 0 ? a.fg3m / a.fg3a : 0) - (b.fg3a > 0 ? b.fg3m / b.fg3a : 0));
                case 'ft':     return m * ((a.fta  > 0 ? a.ftm  / a.fta  : 0) - (b.fta  > 0 ? b.ftm  / b.fta  : 0));
                case 'rt':     return m * ((a.avgRo + a.avgRd) - (b.avgRo + b.avgRd));
                case 'pd':     return m * (a.avgPd - b.avgPd);
                case 'ct':     return m * (a.avgCt - b.avgCt);
                case 'int':    return m * (a.avgInt - b.avgInt);
                case 'bp':     return m * (a.avgBp - b.avgBp);
                case 'eval':   return m * ((a.evalAvg ?? -99) - (b.evalAvg ?? -99));
                case 'pm':     return m * ((a.pmAvg ?? -99) - (b.pmAvg ?? -99));
                default:       return 0;
              }
            });
            return (
              <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th onClick={() => toggle('season')} style={{ ...TH, textAlign: 'left', color: thC('season') }}>Saison{si('season')}</th>
                      <th style={{ ...TH, textAlign: 'left', cursor: 'default' }}>Équipe</th>
                      <th onClick={() => toggle('mj')}    style={{ ...TH, color: thC('mj') }}>MJ{si('mj')}</th>
                      <th onClick={() => toggle('tit')}   style={{ ...TH, color: thC('tit') }}>Tit{si('tit')}</th>
                      <th onClick={() => toggle('min')}   style={{ ...TH, color: thC('min') }}>MIN{si('min')}</th>
                      <th onClick={() => toggle('pts')}   style={{ ...TH, color: thC('pts') }}>PTS{si('pts')}</th>
                      <th style={{ ...TH, cursor: 'default' }}>2PT</th>
                      <th onClick={() => toggle('fg2')}   style={{ ...TH, color: thC('fg2') }}>2PT%{si('fg2')}</th>
                      <th style={{ ...TH, cursor: 'default' }}>3PT</th>
                      <th onClick={() => toggle('fg3')}   style={{ ...TH, color: thC('fg3') }}>3PT%{si('fg3')}</th>
                      <th style={{ ...TH, cursor: 'default' }}>LF</th>
                      <th onClick={() => toggle('ft')}    style={{ ...TH, color: thC('ft') }}>LF%{si('ft')}</th>
                      <th style={{ ...TH, cursor: 'default' }}>RO</th>
                      <th style={{ ...TH, cursor: 'default' }}>RD</th>
                      <th onClick={() => toggle('rt')}    style={{ ...TH, color: thC('rt') }}>RT{si('rt')}</th>
                      <th onClick={() => toggle('pd')}    style={{ ...TH, color: thC('pd') }}>PD{si('pd')}</th>
                      <th onClick={() => toggle('ct')}    style={{ ...TH, color: thC('ct') }}>CT{si('ct')}</th>
                      <th onClick={() => toggle('int')}   style={{ ...TH, color: thC('int') }}>INT{si('int')}</th>
                      <th onClick={() => toggle('bp')}    style={{ ...TH, color: thC('bp') }}>BP{si('bp')}</th>
                      <th onClick={() => toggle('eval')}  style={{ ...TH, color: thC('eval') }}>EVAL{si('eval')}</th>
                      <th onClick={() => toggle('pm')}    style={{ ...TH, color: thC('pm') }}>±{si('pm')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(({ seasonId, seasonLabel, teamName, n, fg2m, fg2a, fg3m, fg3a, ftm, fta, starters, evalAvg, pmAvg, avgMin, avgPts, avgRo, avgRd, avgPd, avgCt, avgInt, avgBp }, i) => {
                      const fg2Pct = shotPct(fg2m, fg2a);
                      const fg3Pct = shotPct(fg3m, fg3a);
                      const ftPct  = shotPct(ftm, fta);
                      return (
                        <tr key={seasonId} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                          <td style={{ ...TD, color: '#F1F5F9', textAlign: 'left', fontWeight: 600 }}>{seasonLabel}</td>
                          <td style={{ ...TD, textAlign: 'left' }}>{teamName || '—'}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{n}</td>
                          <td style={TD}>{starters}</td>
                          <td style={TD}>{avgMin}</td>
                          <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{avgPts}</td>
                          <td style={TD}>{fg2m}/{fg2a}</td>
                          <td style={TD}>{fg2Pct !== null ? `${fg2Pct}%` : '—'}</td>
                          <td style={TD}>{fg3m}/{fg3a}</td>
                          <td style={TD}>{fg3Pct !== null ? `${fg3Pct}%` : '—'}</td>
                          <td style={TD}>{ftm}/{fta}</td>
                          <td style={TD}>{ftPct  !== null ? `${ftPct}%`  : '—'}</td>
                          <td style={TD}>{avgRo}</td>
                          <td style={TD}>{avgRd}</td>
                          <td style={{ ...TD, color: '#F1F5F9' }}>{Math.round((avgRo + avgRd) * 10) / 10}</td>
                          <td style={TD}>{avgPd}</td>
                          <td style={TD}>{avgCt}</td>
                          <td style={TD}>{avgInt}</td>
                          <td style={TD}>{avgBp}</td>
                          <td style={{ ...TD, color: evalColor(evalAvg), fontWeight: evalAvg !== null ? 700 : 400 }}>{evalAvg !== null ? evalAvg : '—'}</td>
                          <td style={{ ...TD, fontWeight: 700, color: pmAvg === null ? '#475569' : pmAvg > 0 ? '#00E5A0' : pmAvg < 0 ? '#EF4444' : '#94A3B8' }}>{pmAvg !== null ? (pmAvg > 0 ? `+${pmAvg}` : pmAvg) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()
        ) : perfFilteredStats.length === 0 ? (
          <EmptyState message="Aucune statistique pour cette période." />
        ) : (() => {
          const rows = perfFilteredStats;
          const TH: React.CSSProperties = {
            padding: '7px 10px', color: '#475569', fontSize: '0.68rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
            whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A',
            position: 'sticky', top: 0, backgroundColor: '#161920', zIndex: 1,
            cursor: 'pointer', userSelect: 'none',
          };
          const TD: React.CSSProperties = {
            padding: '7px 10px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
          };
          const SEP: React.CSSProperties = { borderLeft: '1px solid #334155' };
          const fmt = (v: number | null, suffix = '') => v !== null ? `${v}${suffix}` : '—';
          const si = (col: string, sort: { col: string; dir: 'asc' | 'desc' }) =>
            sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
          const thC = (col: string, sort: { col: string; dir: 'asc' | 'desc' }) =>
            sort.col === col ? '#CBD5E1' : '#475569';
          const toggleB = (col: string) => setBasicSort(prev =>
            prev.col === col ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }
          );
          const toggleA = (col: string) => setAdvSort(prev =>
            prev.col === col ? { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }
          );
          const sum = (key: keyof MatchStat) => rows.reduce((acc, m) => acc + (((m[key] as number) || 0)), 0);
          const n = rows.length;
          const avg = (key: keyof MatchStat) => n > 0 ? Math.round(sum(key) / n * 10) / 10 : 0;
          const evalCol = (v: number | null) => evalColor(v, statThresholds);
          const ortgCol = (v: number | null) => v === null ? '#475569' : ortgColor(v, statThresholds);
          const sortedBasic = [...rows].sort((a, b) => {
            const mult = basicSort.dir === 'asc' ? 1 : -1;
            switch (basicSort.col) {
              case 'date':   return mult * (a.date ?? '').localeCompare(b.date ?? '');
              case 'opp':    return mult * (a.opponent ?? '').localeCompare(b.opponent ?? '');
              case 'tit':    return mult * ((a.starter ? 1 : 0) - (b.starter ? 1 : 0));
              case 'min':    return mult * ((a.min ?? 0) - (b.min ?? 0));
              case 'pts':    return mult * (a.pts - b.pts);
              case 'fg2':    return mult * (a.fg2m - b.fg2m);
              case 'fg2pct': return mult * ((a.fg2a > 0 ? a.fg2m / a.fg2a : -1) - (b.fg2a > 0 ? b.fg2m / b.fg2a : -1));
              case 'fg3':    return mult * (a.fg3m - b.fg3m);
              case 'fg3pct': return mult * ((a.fg3a > 0 ? a.fg3m / a.fg3a : -1) - (b.fg3a > 0 ? b.fg3m / b.fg3a : -1));
              case 'ft':     return mult * (a.ftm - b.ftm);
              case 'ftpct':  return mult * ((a.fta  > 0 ? a.ftm  / a.fta  : -1) - (b.fta  > 0 ? b.ftm  / b.fta  : -1));
              case 'ro':     return mult * (a.ro - b.ro);
              case 'rd':     return mult * (a.rd - b.rd);
              case 'rt':     return mult * ((a.ro + a.rd) - (b.ro + b.rd));
              case 'pd':     return mult * (a.pd - b.pd);
              case 'ct':     return mult * (a.ct - b.ct);
              case 'int':    return mult * ((a.intercepts ?? 0) - (b.intercepts ?? 0));
              case 'bp':     return mult * (a.bp - b.bp);
              case 'fte':    return mult * ((a.fte ?? 0) - (b.fte ?? 0));
              case 'fp':     return mult * ((a.fpr ?? 0) - (b.fpr ?? 0));
              case 'eval':   return mult * ((a.eval ?? -99) - (b.eval ?? -99));
              case 'pm':     return mult * ((a.plusMinus ?? 0) - (b.plusMinus ?? 0));
              default:       return 0;
            }
          });
          const advRows = rows.map(m => ({ ...m, adv: calcPlayerAdvanced(m, teamStatsMap.get(m.matchId ?? '')) }));
          const sortedAdv = [...advRows].sort((a, b) => {
            const mult = advSort.dir === 'asc' ? 1 : -1;
            switch (advSort.col) {
              case 'date':  return mult * (a.date ?? '').localeCompare(b.date ?? '');
              case 'opp':   return mult * (a.opponent ?? '').localeCompare(b.opponent ?? '');
              case 'pts':   return mult * (a.pts - b.pts);
              case 'usg':   return mult * ((a.adv.usagePct ?? -1) - (b.adv.usagePct ?? -1));
              case 'ortg':  return mult * ((a.adv.offRating ?? -1) - (b.adv.offRating ?? -1));
              case 'efg':   return mult * ((a.adv.efgPct ?? -1) - (b.adv.efgPct ?? -1));
              case 'ftr':   return mult * ((a.adv.ftRate ?? -1) - (b.adv.ftRate ?? -1));
              case 'bppos': return mult * ((a.adv.bpPerPoss ?? -1) - (b.adv.bpPerPoss ?? -1));
              case 'ast':   return mult * ((a.adv.astPct ?? -1) - (b.adv.astPct ?? -1));
              case 'tov':   return mult * ((a.adv.tovPct ?? -1) - (b.adv.tovPct ?? -1));
              case 'oreb':  return mult * ((a.adv.orebPct ?? -1) - (b.adv.orebPct ?? -1));
              case 'dreb':  return mult * ((a.adv.drebPct ?? -1) - (b.adv.drebPct ?? -1));
              case 'treb':  return mult * ((a.adv.trebPct ?? -1) - (b.adv.trebPct ?? -1));
              case 'pprod': return mult * ((a.adv.ptsProd ?? -1) - (b.adv.ptsProd ?? -1));
              default:      return 0;
            }
          });
          const avgAdvField = (key: string) => {
            const vals = advRows.map(m => (m.adv as unknown as Record<string, number | null>)[key]).filter((v): v is number => v !== null);
            return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
          };
          const avgAdvPts = n > 0 ? Math.round(rows.reduce((a, m) => a + m.pts, 0) / n * 10) / 10 : null;
          const totalFg2m = sum('fg2m'), totalFg2a = sum('fg2a');
          const totalFg3m = sum('fg3m'), totalFg3a = sum('fg3a');
          const totalFtm  = sum('ftm'),  totalFta  = sum('fta');
          const fg2Pct = shotPct(totalFg2m, totalFg2a);
          const fg3Pct = shotPct(totalFg3m, totalFg3a);
          const ftPct  = shotPct(totalFtm, totalFta);
          const withEval = rows.filter(m => m.eval !== null);
          const avgEval = withEval.length > 0
            ? Math.round(withEval.reduce((a, m) => a + (m.eval ?? 0), 0) / withEval.length * 10) / 10
            : null;
          const avgPm = n > 0 ? Math.round(rows.reduce((acc, m) => acc + (m.plusMinus ?? 0), 0) / n * 10) / 10 : 0;
          const wins = rows.filter(m => m.result === 'win').length;
          const losses = n - wins;
          const TOTALS: React.CSSProperties = { borderTop: '2px solid #2A2F3A', backgroundColor: 'rgba(255,255,255,0.035)' };
          const TL: React.CSSProperties = { padding: '7px 10px', fontSize: '0.78rem', textAlign: 'left', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
          return (
          <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 8 }}>
            {statsView === 'basic' ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th onClick={() => toggleB('date')} style={{ ...TH, textAlign: 'left', width: 60, minWidth: 60, maxWidth: 60, color: thC('date', basicSort) }}>Date{si('date', basicSort)}</th>
                    <th onClick={() => toggleB('opp')}  style={{ ...TH, textAlign: 'left', color: thC('opp', basicSort) }}>Adv{si('opp', basicSort)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>L/E</th>
                    <th style={{ ...TH, cursor: 'default' }}>Score</th>
                    <th onClick={() => toggleB('tit')}  style={{ ...TH, color: thC('tit', basicSort) }}>5D{si('tit', basicSort)}</th>
                    <th onClick={() => toggleB('min')}  style={{ ...TH, color: thC('min', basicSort) }}>Min{si('min', basicSort)}</th>
                    <th onClick={() => toggleB('pts')}  style={{ ...TH, color: thC('pts', basicSort) }}>Pts{si('pts', basicSort)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>2pts</th>
                    <th onClick={() => toggleB('fg2pct')} style={{ ...TH, color: thC('fg2pct', basicSort) }}>2%{si('fg2pct', basicSort)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>3pts</th>
                    <th onClick={() => toggleB('fg3pct')} style={{ ...TH, color: thC('fg3pct', basicSort) }}>3%{si('fg3pct', basicSort)}</th>
                    <th style={{ ...TH, cursor: 'default' }}>LF</th>
                    <th onClick={() => toggleB('ftpct')}  style={{ ...TH, color: thC('ftpct', basicSort) }}>LF%{si('ftpct', basicSort)}</th>
                    <th onClick={() => toggleB('ro')}   style={{ ...TH, color: thC('ro', basicSort) }}>RO{si('ro', basicSort)}</th>
                    <th onClick={() => toggleB('rd')}   style={{ ...TH, color: thC('rd', basicSort) }}>RD{si('rd', basicSort)}</th>
                    <th onClick={() => toggleB('rt')}   style={{ ...TH, color: thC('rt', basicSort) }}>RT{si('rt', basicSort)}</th>
                    <th onClick={() => toggleB('pd')}   style={{ ...TH, color: thC('pd', basicSort) }}>Pd{si('pd', basicSort)}</th>
                    <th onClick={() => toggleB('ct')}   style={{ ...TH, color: thC('ct', basicSort) }}>Ct{si('ct', basicSort)}</th>
                    <th onClick={() => toggleB('int')}  style={{ ...TH, color: thC('int', basicSort) }}>Int{si('int', basicSort)}</th>
                    <th onClick={() => toggleB('bp')}   style={{ ...TH, color: thC('bp', basicSort) }}>Bp{si('bp', basicSort)}</th>
                    <th onClick={() => toggleB('fte')}  style={{ ...TH, color: thC('fte', basicSort) }}>Fte{si('fte', basicSort)}</th>
                    <th onClick={() => toggleB('fp')}   style={{ ...TH, color: thC('fp', basicSort) }}>Fp{si('fp', basicSort)}</th>
                    <th onClick={() => toggleB('eval')} style={{ ...TH, color: thC('eval', basicSort) }}>Eval{si('eval', basicSort)}</th>
                    <th onClick={() => toggleB('pm')}   style={{ ...TH, color: thC('pm', basicSort) }}>±{si('pm', basicSort)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBasic.map((m, i) => {
                    const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                    const fg2p = shotPct(m.fg2m, m.fg2a);
                    const fg3p = shotPct(m.fg3m, m.fg3a);
                    const ftp  = shotPct(m.ftm, m.fta);
                    const pmCol = (m.plusMinus ?? 0) > 0 ? '#00E5A0' : (m.plusMinus ?? 0) < 0 ? '#EF4444' : '#475569';
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60, maxWidth: 60 }}>{fmtShortDate(m.date)}</td>
                        <td style={{ ...TD, color: '#F1F5F9', textAlign: 'left', fontWeight: 600 }}>{m.opponent}</td>
                        <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                        <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                        <td style={TD}>{m.starter ? '✓' : '–'}</td>
                        <td style={{ ...TD, color: '#F1F5F9' }}>{m.min ?? '—'}</td>
                        <td style={{ ...TD, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                        <td style={TD}>{m.fg2m}/{m.fg2a}</td>
                        <td style={{ ...TD, color: '#94A3B8' }}>{fg2p !== null ? `${fg2p}%` : '—'}</td>
                        <td style={TD}>{m.fg3m}/{m.fg3a}</td>
                        <td style={{ ...TD, color: '#94A3B8' }}>{fg3p !== null ? `${fg3p}%` : '—'}</td>
                        <td style={TD}>{m.ftm}/{m.fta}</td>
                        <td style={{ ...TD, color: '#94A3B8' }}>{ftp !== null ? `${ftp}%` : '—'}</td>
                        <td style={TD}>{m.ro}</td>
                        <td style={TD}>{m.rd}</td>
                        <td style={{ ...TD, color: '#F1F5F9' }}>{m.ro + m.rd}</td>
                        <td style={TD}>{m.pd}</td>
                        <td style={TD}>{m.ct}</td>
                        <td style={TD}>{m.intercepts}</td>
                        <td style={TD}>{m.bp}</td>
                        <td style={TD}>{m.fte}</td>
                        <td style={TD}>{m.fpr}</td>
                        <td style={{ ...TD, color: evalCol(m.eval ?? null), fontWeight: 700 }}>{m.eval ?? '—'}</td>
                        <td style={{ ...TD, color: pmCol, fontWeight: 700 }}>{m.plusMinus != null ? (m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus) : '—'}</td>
                      </tr>
                    );
                  })}
                  <tr style={TOTALS}>
                    <td style={{ ...TL, textAlign: 'left' }}>{n} matchs · {wins}V {losses}D</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={TD}>{rows.filter(m => m.starter).length}</td>
                    <td style={TD}>{avg('min')}</td>
                    <td style={{ ...TD, color: '#F1F5F9', fontWeight: 700 }}>{avg('pts')}</td>
                    <td style={{ ...TD, color: '#64748B', fontSize: '0.7rem' }}>{Math.round(totalFg2m/n*10)/10}/{Math.round(totalFg2a/n*10)/10}</td>
                    <td style={{ ...TD, color: '#475569' }}>{fg2Pct !== null ? `${fg2Pct}%` : '—'}</td>
                    <td style={{ ...TD, color: '#64748B', fontSize: '0.7rem' }}>{Math.round(totalFg3m/n*10)/10}/{Math.round(totalFg3a/n*10)/10}</td>
                    <td style={{ ...TD, color: '#475569' }}>{fg3Pct !== null ? `${fg3Pct}%` : '—'}</td>
                    <td style={{ ...TD, color: '#64748B', fontSize: '0.7rem' }}>{Math.round(totalFtm/n*10)/10}/{Math.round(totalFta/n*10)/10}</td>
                    <td style={{ ...TD, color: '#475569' }}>{ftPct !== null ? `${ftPct}%` : '—'}</td>
                    <td style={TD}>{avg('ro')}</td>
                    <td style={TD}>{avg('rd')}</td>
                    <td style={{ ...TD, color: '#F1F5F9' }}>{Math.round((avg('ro') + avg('rd')) * 10) / 10}</td>
                    <td style={TD}>{avg('pd')}</td>
                    <td style={TD}>{avg('ct')}</td>
                    <td style={TD}>{avg('intercepts')}</td>
                    <td style={TD}>{avg('bp')}</td>
                    <td style={TD}>{avg('fte')}</td>
                    <td style={TD}>{avg('fpr')}</td>
                    <td style={{ ...TD, color: evalCol(avgEval), fontWeight: 700 }}>{avgEval !== null ? avgEval : '—'}</td>
                    <td style={{ ...TD, color: avgPm > 0 ? '#00E5A0' : avgPm < 0 ? '#EF4444' : '#475569', fontWeight: 700 }}>{avgPm > 0 ? `+${avgPm}` : avgPm}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...TH, cursor: 'default', textAlign: 'left', width: 60, minWidth: 60, maxWidth: 60, verticalAlign: 'middle' }}>Date</th>
                    <th rowSpan={2} style={{ ...TH, cursor: 'default', textAlign: 'left', verticalAlign: 'middle' }}>Adv</th>
                    <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>L/E</th>
                    <th rowSpan={2} style={{ ...TH, cursor: 'default', verticalAlign: 'middle' }}>Score</th>
                    <th colSpan={5} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Impact offensif</th>
                    <th colSpan={4} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Playmaking</th>
                    <th colSpan={3} style={{ ...TH, ...SEP, borderBottom: 'none', fontSize: '0.6rem', letterSpacing: '0.08em', cursor: 'default' }}>Rebonds</th>
                  </tr>
                  <tr>
                    <th onClick={() => toggleA('pts')}   style={{ ...TH, ...SEP, color: thC('pts', advSort) }}>Pts{si('pts', advSort)}</th>
                    <th onClick={() => toggleA('usg')}   style={{ ...TH, color: thC('usg', advSort) }}>USG%{si('usg', advSort)}</th>
                    <th onClick={() => toggleA('ortg')}  style={{ ...TH, color: thC('ortg', advSort) }}>ORtg{si('ortg', advSort)}</th>
                    <th onClick={() => toggleA('efg')}   style={{ ...TH, color: thC('efg', advSort) }}>eFG%{si('efg', advSort)}</th>
                    <th onClick={() => toggleA('ftr')}   style={{ ...TH, color: thC('ftr', advSort) }}>FT Rate{si('ftr', advSort)}</th>
                    <th onClick={() => toggleA('pprod')} style={{ ...TH, ...SEP, color: thC('pprod', advSort) }}>Pts générés{si('pprod', advSort)}</th>
                    <th onClick={() => toggleA('ast')}   style={{ ...TH, color: thC('ast', advSort) }}>%PD{si('ast', advSort)}</th>
                    <th onClick={() => toggleA('tov')}   style={{ ...TH, color: thC('tov', advSort) }}>%BP{si('tov', advSort)}</th>
                    <th onClick={() => toggleA('bppos')} style={{ ...TH, color: thC('bppos', advSort) }}>BP/poss{si('bppos', advSort)}</th>
                    <th onClick={() => toggleA('treb')}  style={{ ...TH, ...SEP, color: thC('treb', advSort) }}>%TREB{si('treb', advSort)}</th>
                    <th onClick={() => toggleA('dreb')}  style={{ ...TH, color: thC('dreb', advSort) }}>%DREB{si('dreb', advSort)}</th>
                    <th onClick={() => toggleA('oreb')}  style={{ ...TH, color: thC('oreb', advSort) }}>%OREB{si('oreb', advSort)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAdv.map((m, i) => {
                    const resCol = m.result === 'win' ? '#00E5A0' : '#EF4444';
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #1E2229', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ ...TD, textAlign: 'left', width: 60, minWidth: 60, maxWidth: 60 }}>{fmtShortDate(m.date)}</td>
                        <td style={{ ...TD, color: '#F1F5F9', textAlign: 'left', fontWeight: 600 }}>{m.opponent}</td>
                        <td style={TD}>{m.homeAway === 'home' ? 'D' : 'E'}</td>
                        <td style={{ ...TD, color: resCol, fontWeight: 700 }}>{m.scoreUs}-{m.scoreThem}</td>
                        <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 800 }}>{m.pts}</td>
                        <td style={TD}>{fmt(m.adv.usagePct, '%')}</td>
                        <td style={{ ...TD, color: ortgCol(m.adv.offRating) }}>{fmt(m.adv.offRating)}</td>
                        <td style={TD}>{fmt(m.adv.efgPct, '%')}</td>
                        <td style={TD}>{fmt(m.adv.ftRate)}</td>
                        <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(m.adv.ptsProd)}</td>
                        <td style={TD}>{fmt(m.adv.astPct, '%')}</td>
                        <td style={TD}>{fmt(m.adv.tovPct, '%')}</td>
                        <td style={TD}>{fmt(m.adv.bpPerPoss)}</td>
                        <td style={{ ...TD, ...SEP }}>{fmt(m.adv.trebPct, '%')}</td>
                        <td style={TD}>{fmt(m.adv.drebPct, '%')}</td>
                        <td style={TD}>{fmt(m.adv.orebPct, '%')}</td>
                      </tr>
                    );
                  })}
                  <tr style={TOTALS}>
                    <td style={{ ...TL, textAlign: 'left' }}>{n} matchs · {wins}V {losses}D</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={{ ...TD, color: '#64748B' }}>—</td>
                    <td style={{ ...TD, ...SEP, color: '#F1F5F9', fontWeight: 700 }}>{avgAdvPts}</td>
                    <td style={TD}>{fmt(avgAdvField('usagePct'), '%')}</td>
                    {(() => { const v = avgAdvField('offRating'); return <td style={{ ...TD, color: ortgCol(v) }}>{fmt(v)}</td>; })()}
                    <td style={TD}>{fmt(avgAdvField('efgPct'), '%')}</td>
                    <td style={TD}>{fmt(avgAdvField('ftRate'))}</td>
                    <td style={{ ...TD, ...SEP, color: '#00E5A0', fontWeight: 700 }}>{fmt(avgAdvField('ptsProd'))}</td>
                    <td style={TD}>{fmt(avgAdvField('astPct'), '%')}</td>
                    <td style={TD}>{fmt(avgAdvField('tovPct'), '%')}</td>
                    <td style={TD}>{fmt(avgAdvField('bpPerPoss'))}</td>
                    <td style={{ ...TD, ...SEP }}>{fmt(avgAdvField('trebPct'), '%')}</td>
                    <td style={TD}>{fmt(avgAdvField('drebPct'), '%')}</td>
                    <td style={TD}>{fmt(avgAdvField('orebPct'), '%')}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
          );
        })()}
      </Card>
      </>}

      {/* ── Modal déliaison roster ── */}
      {/* ── Modal édition joueur ── */}
      {showEdit && (
        <Modal onClose={() => setShowEdit(false)} maxWidth={520} overlayOpacity={0.7} style={{ padding: '28px' }}>
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
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
              <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
              <div style={{ position: 'relative' }}>
                <PlayerAvatar player={player} size={72} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                  {photoUploading
                    ? <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    : <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 600 }}>Changer</span>
                  }
                </div>
              </div>
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>
                {photoUploading ? 'Envoi…' : 'Photo de profil'}
              </span>
            </label>
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
        </Modal>
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
    setLoading(true);
    setFetchError('');
    playersApi.list()
      .then(setPlayers)
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
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
        <EmptyState
          message={search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur dans cette organisation.'}
          size="lg"
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {filtered.map(player => (
            <div key={player.id} onClick={() => navigate(`/individual-analyze/${player.id}`)}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A066')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}>
              <PlayerAvatar player={player} size={48} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: 0 }}>{player.lastName}</p>
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '2px 0' }}>{player.firstName}</p>
                <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>#{player.number} · {player.position.split(' ')[0]}</p>
              </div>
              <StatusBadge status={player.status} size="sm" />
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal onClose={closeForm} maxWidth={520} overlayOpacity={0.7} style={{ padding: '28px' }}>
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
        </Modal>
      )}
    </div>
  );
}
