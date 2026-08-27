import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { medicalApi } from '../api/medical';
import { Badge } from './Badge';
import { RpeKpiCard } from './RpeKpiCard';
import { EmptyState } from './EmptyState';
import { PlayerAvatar } from './PlayerAvatar';
import { MedicalRecordDetailModal } from './MedicalRecordDetailModal';
import { MedicalRecordFormModal } from './MedicalRecordFormModal';
import { MedicalRecordStatusModal } from './MedicalRecordStatusModal';
import type { MedicalStatusAction } from './MedicalRecordStatusModal';
import { playerStatusColor, playerStatusLabel } from './PlayerHero';
import { severityConfig, typeLabels } from './MedicalCard';
import { rtpDaysLeft, injuryDays, sumInjuryDays } from '../utils/medical';
import { useUrlState, useUrlPatch, useUrlSort } from '../hooks/useUrlState';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { MedicalRecord, Player } from '../data/types';
import { AddButton } from './AddButton';

const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};

/** Valeurs acceptées dans l'URL pour le récap saison — une autre y ramène le défaut. Mêmes noms
 *  de paramètres que le récap de la page Médicale : c'est le même tableau, sur une autre route. */
const RECAP_TYPES     = ['', 'injury', 'treatment', 'checkup'] as const;
type  RecapType       = typeof RECAP_TYPES[number];
const RECAP_STATUSES  = ['', 'active', 'resolved'] as const;
type  RecapStatus     = typeof RECAP_STATUSES[number];
const RECAP_SORT_KEYS = ['date', 'player', 'description', 'type', 'severity', 'status'] as const;
type  RecapSortKey    = typeof RECAP_SORT_KEYS[number];


interface TeamMedicalOverviewProps {
  /** Effectif de l'équipe/saison courante */
  players: Player[];
  onUpdated?: () => void;
  /** Bouton "Ajouter une entrée" — masqué sur Performance collective (consultation seule), visible sur la page Médicale */
  showAddButton?: boolean;
}

/**
 * Vue médicale équipe (KPIs saison + blessés actifs + répartition par gravité + joueurs les plus
 * touchés + récap saison filtrable) — bloc complet partagé entre l'onglet "Historique équipe" de la
 * page Médicale et l'onglet Médical de Performance collective, pour garantir un rendu identique.
 */
export function TeamMedicalOverview({ players, onUpdated, showAddButton = true }: TeamMedicalOverviewProps) {
  const { selected, canEditTeamData } = useTeamSeason();
  const teamId = selected?.team.id;
  const navigate = useNavigate();
  const [activeInjuries, setActiveInjuries]     = useState<MedicalRecord[]>([]);
  const [seasonInjuries, setSeasonInjuries]     = useState<MedicalRecord[]>([]);
  const [seasonAllRecords, setSeasonAllRecords] = useState<MedicalRecord[]>([]);
  const [version, setVersion] = useState(0);

  const [recapSearch,       setRecapSearch]       = useUrlState('recherche', '');
  const [recapTypeFilter,   setRecapTypeFilter]   = useUrlState('type',   '', { allowed: RECAP_TYPES });
  const [recapPlayerFilter, setRecapPlayerFilter] = useUrlState('joueur', '');
  const [recapStatusFilter, setRecapStatusFilter] = useUrlState('statut', '', { allowed: RECAP_STATUSES });
  const { sortKey: recapSortKey, sortDir: recapSortDir, toggleSort } =
    useUrlSort<RecapSortKey>({ key: 'date', dir: 'desc' }, { allowed: RECAP_SORT_KEYS });
  const patchRecap = useUrlPatch();
  const [detailRecord, setDetailRecord] = useState<MedicalRecord | null>(null);

  const [statusAction, setStatusAction] = useState<{ action: MedicalStatusAction; record: MedicalRecord } | null>(null);

  const [showForm, setShowForm]           = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);

  useEffect(() => { medicalApi.getActiveInjuries().then(setActiveInjuries); }, [version]);
  useEffect(() => { medicalApi.list({ type: 'injury' }).then(setSeasonInjuries); }, [version]);
  useEffect(() => { medicalApi.list().then(setSeasonAllRecords); }, [version]);

  const teamPlayerIds     = new Set(players.map(p => p.id));
  const teamInjuries      = activeInjuries.filter(r => teamPlayerIds.has(r.playerId));
  const teamSeasonInjuries = seasonInjuries.filter(r => teamPlayerIds.has(r.playerId));
  const teamAllRecords = seasonAllRecords
    .filter(r => teamPlayerIds.has(r.playerId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const playerById = (id: string) => players.find(p => p.id === id);


  const seasonCount   = teamSeasonInjuries.length;
  const seasonDaysTotal = sumInjuryDays(teamSeasonInjuries);
  const seasonPlayers = new Set(teamSeasonInjuries.map(r => r.playerId)).size;
  const limitedPlayers = players.filter(p => p.status === 'limited').length;

  const severityCounts = { mild: 0, moderate: 0, severe: 0 };
  teamSeasonInjuries.forEach(r => { if (r.severity) severityCounts[r.severity]++; });

  const injuryByPlayer = teamSeasonInjuries.reduce<Record<string, number>>((acc, r) => {
    acc[r.playerId] = (acc[r.playerId] ?? 0) + 1;
    return acc;
  }, {});
  const topInjuredPlayers = Object.entries(injuryByPlayer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, count]) => ({ player: players.find(p => p.id === pid), count }))
    .filter(x => x.player);

  const refresh = () => { setVersion(v => v + 1); onUpdated?.(); };

  const openForm = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const openEdit = (record: MedicalRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  // ── Récap saison — filtres + tri ──────────────────────────────────────────
  const filtered = teamAllRecords.filter(r => {
    if (recapTypeFilter   && r.type     !== recapTypeFilter)   return false;
    if (recapPlayerFilter && r.playerId !== recapPlayerFilter) return false;
    if (recapStatusFilter && r.status   !== recapStatusFilter) return false;
    if (recapSearch) {
      const q = recapSearch.toLowerCase();
      const p = players.find(pl => pl.id === r.playerId);
      const name = p ? `${p.firstName} ${p.lastName}`.toLowerCase() : '';
      if (!r.description.toLowerCase().includes(q) && !name.includes(q)) return false;
    }
    return true;
  });
  const hasFilter = !!(recapTypeFilter || recapPlayerFilter || recapStatusFilter || recapSearch);

  const severityRank = { mild: 1, moderate: 2, severe: 3 } as const;
  const dir = recapSortDir === 'asc' ? 1 : -1;
  const sorted = [...filtered].sort((a, b) => {
    switch (recapSortKey) {
      case 'date':        return a.date.localeCompare(b.date) * dir;
      case 'player': {
        const pa = players.find(pl => pl.id === a.playerId)?.lastName ?? '';
        const pb = players.find(pl => pl.id === b.playerId)?.lastName ?? '';
        return pa.localeCompare(pb) * dir;
      }
      case 'description': return a.description.localeCompare(b.description) * dir;
      case 'type':        return typeLabels[a.type].localeCompare(typeLabels[b.type]) * dir;
      case 'severity':    return ((a.severity ? severityRank[a.severity] : 0) - (b.severity ? severityRank[b.severity] : 0)) * dir;
      case 'status':      return a.status.localeCompare(b.status) * dir;
      default:            return 0;
    }
  });

  const sortArrow = (key: typeof recapSortKey) => recapSortKey === key
    ? <span style={{ fontSize: '0.6rem', marginLeft: 3 }}>{recapSortDir === 'asc' ? '▲' : '▼'}</span>
    : null;
  const thBase: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', cursor: 'pointer', userSelect: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {showAddButton && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <AddButton label="Ajouter une entrée" onClick={() => openForm()} />
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10 }}>
        <RpeKpiCard
          accent={teamInjuries.length > 0 ? '#EF4444' : '#00E5A0'}
          label="Blessés actifs"
          value={String(teamInjuries.length)}
          sub={`${new Set(teamInjuries.map(r => r.playerId)).size} joueurs`}
        />
        <RpeKpiCard
          accent={limitedPlayers > 0 ? '#F59E0B' : '#00E5A0'}
          label="Limités actifs"
          value={String(limitedPlayers)}
          sub={`${limitedPlayers} joueur${limitedPlayers > 1 ? 's' : ''}`}
        />
        <RpeKpiCard
          accent={seasonCount > 0 ? '#F59E0B' : '#00E5A0'}
          label="Blessures saison"
          value={String(seasonCount)}
          sub={`${seasonPlayers} joueurs touchés`}
        />
        <RpeKpiCard
          accent={seasonDaysTotal.days > 0 ? '#3B82F6' : '#00E5A0'}
          label="Jours blessés"
          value={seasonDaysTotal.days > 0 ? `${seasonDaysTotal.days}j` : '—'}
          // Blessures sans date de fin connue : signalées plutôt que comptées pour 0.
          sub={seasonDaysTotal.undated > 0
            ? `cumulés saison · ${seasonDaysTotal.undated} sans date de fin`
            : 'cumulés saison'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14 }}>

        {/* Blessés actifs */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
          <h3 style={{ color: '#94A3B8', margin: '0 0 12px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Blessés actifs <span style={{ color: '#EF4444', fontWeight: 800 }}>{teamInjuries.length > 0 ? `(${teamInjuries.length})` : ''}</span>
          </h3>
          {teamInjuries.length === 0
            ? <p style={{ color: '#00E5A0', fontSize: '0.85rem', margin: 0 }}>✓ Aucune blessure active</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {teamInjuries.map(r => {
                  const p = playerById(r.playerId);
                  if (!p) return null;
                  const rtpDaysLeftVal = r.rtpDate ? rtpDaysLeft(r.rtpDate) : null;
                  const rtpColor = rtpDaysLeftVal === null ? '#475569' : rtpDaysLeftVal <= 3 ? '#00E5A0' : '#F59E0B';
                  return (
                    <div key={r.id} onClick={() => navigate(`/performance-individuelle/${p.id}/vue-ensemble`)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <PlayerAvatar player={p} size={26} />
                      <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></span>
                      <span style={{
                        color: playerStatusColor[p.status], backgroundColor: `${playerStatusColor[p.status]}18`,
                        fontSize: '0.66rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                      }}>{playerStatusLabel[p.status]}</span>
                      <span style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 0 auto', minWidth: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                      <span style={{ color: rtpColor, fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, minWidth: 70, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {r.rtpDate ? fmtDate(r.rtpDate) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Saison : répartition + joueurs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
            <h3 style={{ color: '#94A3B8', margin: '0 0 12px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Répartition par gravité</h3>
            {seasonCount === 0
              ? <p style={{ color: '#00E5A0', fontSize: '0.82rem', margin: 0 }}>✓ Aucune blessure</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([
                    { key: 'mild',     label: 'Légères',  color: '#F59E0B' },
                    { key: 'moderate', label: 'Modérées', color: '#fb923c' },
                    { key: 'severe',   label: 'Graves',   color: '#EF4444' },
                  ] as const).map(({ key, label, color }) => {
                    const count = severityCounts[key];
                    const pct   = seasonCount > 0 ? Math.round((count / seasonCount) * 100) : 0;
                    return (
                      <div key={key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>{label}</span>
                          <span style={{ color: color, fontSize: '0.75rem', fontWeight: 700 }}>{count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 6, backgroundColor: '#1E2229', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>

          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px', flex: 1 }}>
            <h3 style={{ color: '#94A3B8', margin: '0 0 12px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joueurs les plus touchés</h3>
            {topInjuredPlayers.length === 0
              ? <p style={{ color: '#00E5A0', fontSize: '0.82rem', margin: 0 }}>✓ Aucune blessure</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topInjuredPlayers.map(({ player: p, count }) => {
                    if (!p) return null;
                    const pct = Math.round((count / seasonCount) * 100);
                    return (
                      <div key={p.id} onClick={() => navigate(`/performance-individuelle/${p.id}/vue-ensemble`)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <PlayerAvatar player={p} size={26} />
                        <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, flex: 1 }}><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 5, backgroundColor: '#1E2229', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#EF4444', borderRadius: 3 }} />
                          </div>
                          <span style={{ color: '#EF4444', fontSize: '0.75rem', fontWeight: 700, minWidth: 20, textAlign: 'right' }}>{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* Récap saison — tous types */}
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ color: '#94A3B8', margin: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Récap saison
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['injury', 'treatment', 'checkup'] as const).map(t => (
              <Badge key={t} color={typeColors[t]} bg={typeColors[t] + '18'} size="sm"
                label={<>{typeLabels[t]} · {teamAllRecords.filter(r => r.type === t).length}</>}
                style={{ fontSize: '0.7rem', fontWeight: 600, borderRadius: 3 }} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2" style={{ marginBottom: 14 }}>
          <div className="w-full sm:w-auto" style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input
              placeholder="Rechercher…"
              value={recapSearch}
              onChange={e => setRecapSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px 7px 28px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select value={recapTypeFilter} onChange={e => setRecapTypeFilter(e.target.value as RecapType)}
            className="w-full sm:w-auto"
            style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapTypeFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">Tous types</option>
            <option value="injury">Blessure</option>
            <option value="treatment">Traitement</option>
            <option value="checkup">Bilan santé</option>
          </select>
          <select value={recapPlayerFilter} onChange={e => setRecapPlayerFilter(e.target.value)}
            className="w-full sm:w-auto"
            style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapPlayerFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box', flex: '0 1 140px' }}>
            <option value="">Tous joueurs</option>
            {players.map(p => <option key={p.id} value={p.id}>{playerNameFull(p)}</option>)}
          </select>
          <select value={recapStatusFilter} onChange={e => setRecapStatusFilter(e.target.value as RecapStatus)}
            className="w-full sm:w-auto"
            style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapStatusFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">Tous statuts</option>
            <option value="active">En cours</option>
            <option value="resolved">Clôturé</option>
          </select>
          {hasFilter && (
            <button onClick={() => patchRecap({ recherche: null, type: null, joueur: null, statut: null })}
              className="w-full sm:w-auto"
              style={{ padding: '7px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <X size={12} /> Effacer
            </button>
          )}
        </div>

        {filtered.length === 0
          ? <EmptyState message={hasFilter ? 'Aucun résultat.' : 'Aucune entrée médicale cette saison.'} size="sm" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '20%' }} />
                  <col />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#1A1E26' }}>
                    <th onClick={() => toggleSort('date')} style={{ ...thBase, color: recapSortKey === 'date' ? '#94A3B8' : '#475569' }}>Date{sortArrow('date')}</th>
                    <th onClick={() => toggleSort('player')} style={{ ...thBase, color: recapSortKey === 'player' ? '#94A3B8' : '#475569' }}>Joueur{sortArrow('player')}</th>
                    <th onClick={() => toggleSort('description')} style={{ ...thBase, color: recapSortKey === 'description' ? '#94A3B8' : '#475569' }}>Description{sortArrow('description')}</th>
                    <th onClick={() => toggleSort('type')} style={{ ...thBase, color: recapSortKey === 'type' ? '#94A3B8' : '#475569' }}>Type{sortArrow('type')}</th>
                    <th onClick={() => toggleSort('severity')} style={{ ...thBase, color: recapSortKey === 'severity' ? '#94A3B8' : '#475569' }}>Gravité{sortArrow('severity')}</th>
                    <th onClick={() => toggleSort('status')} style={{ ...thBase, color: recapSortKey === 'status' ? '#94A3B8' : '#475569' }}>Statut{sortArrow('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const p   = players.find(pl => pl.id === r.playerId);
                    const sev = r.severity ? severityConfig[r.severity] : null;
                    const col = typeColors[r.type] ?? '#94A3B8';
                    return (
                      <tr key={r.id} onClick={() => setDetailRecord(r)} style={{ borderBottom: '1px solid #1E2229', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1E222940')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '8px 8px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDate(r.date)}</td>
                        <td style={{ padding: '8px 8px', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p && <PlayerAvatar player={p} size={18} />}
                            <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p ? <><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></> : '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 8px', color: r.status === 'resolved' ? '#475569' : '#F1F5F9', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.description}
                        </td>
                        <td style={{ padding: '8px 8px' }}>
                          <Badge color={col} bg={col + '18'} size="sm" label={typeLabels[r.type]} style={{ fontSize: '0.7rem', fontWeight: 600 }} />
                        </td>
                        <td style={{ padding: '8px 8px', color: sev?.color ?? '#475569', fontSize: '0.75rem', fontWeight: 600 }}>{sev?.label ?? '—'}</td>
                        <td style={{ padding: '8px 8px' }}>
                          {r.status === 'resolved'
                            ? <span style={{ color: '#00E5A0', fontSize: '0.7rem', fontWeight: 600 }}>✓ Clôturé</span>
                            : <span style={{ color: '#F59E0B', fontSize: '0.7rem', fontWeight: 600 }}>En cours</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* ── DETAIL RECORD MODAL ── */}
      {detailRecord && (
        <MedicalRecordDetailModal
          record={detailRecord}
          player={players.find(pl => pl.id === detailRecord.playerId)}
          onClose={() => setDetailRecord(null)}
          onEdit={() => { const r = detailRecord; setDetailRecord(null); openEdit(r); }}
          canEdit={canEditTeamData}
          onCloseRecord={detailRecord.status === 'active'
            ? () => { const r = detailRecord; setDetailRecord(null); setStatusAction({ action: 'close', record: r }); }
            : undefined}
          onReopen={detailRecord.status === 'resolved'
            ? () => { const r = detailRecord; setDetailRecord(null); setStatusAction({ action: 'reopen', record: r }); }
            : undefined}
        />
      )}

      {/* ── CLOSE / REOPEN MODAL ── */}
      {statusAction && (
        <MedicalRecordStatusModal
          action={statusAction.action}
          record={statusAction.record}
          player={players.find(pl => pl.id === statusAction.record.playerId)}
          teamId={teamId}
          onCancel={() => setStatusAction(null)}
          onDone={refresh}
        />
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <MedicalRecordFormModal
          players={players}
          record={editingRecord}
          onClose={() => setShowForm(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
