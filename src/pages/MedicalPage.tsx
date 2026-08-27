import { useState, useEffect, useRef } from 'react';
import { X, Search, Pill, Ambulance, Users } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useNavigate, useParams } from 'react-router';
import { PlayerAvatar, PlayerSelect, EmptyState, PlayerMedicalOverview, InjuryRecordCard, MedicalRecordDetailModal, MedicalRecordFormModal, MedicalRecordStatusModal, RpeKpiCard, Card, CardTitle, Badge, playerStatusColor, playerStatusLabel, AddButton } from '../components';
import type { PlayerMedicalViewHandle, MedicalStatusAction } from '../components';
import { rtpDaysLeft, sumInjuryDays } from '../utils/medical';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { MedicalRecord, Player } from '../data/types';

const severityConfig = {
  mild:     { label: 'Léger',  color: '#F59E0B' },
  moderate: { label: 'Modéré', color: '#fb923c' },
  severe:   { label: 'Grave',  color: '#EF4444' },
};

const typeLabels: Record<string, string> = {
  injury: 'Blessure', checkup: 'Bilan santé', treatment: 'Traitement',
};

const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};

type Tab = 'infirmary' | 'record' | 'team';

const TAB_SLUGS: Record<string, Tab> = {
  infirmerie: 'infirmary',
  joueur:     'record',
  equipe:     'team',
};


export default function MedicalPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate     = useNavigate();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab        = TAB_SLUGS[tabSlug ?? ''] ?? 'infirmary';
  const selectedPlayerId: string = activeTab === 'record' ? (urlId ?? '') : '';

  const setActiveTab = (t: Tab) => {
    if (t === 'infirmary' && selected) navigate(`/medical/infirmerie/${selected.team.id}`, { replace: true });
    else if (t === 'team'      && selected) navigate(`/medical/equipe/${selected.team.id}`,      { replace: true });
    else if (t === 'record') {
      const pid = teamPlayers[0]?.id ?? '';
      navigate(pid ? `/medical/joueur/${pid}` : '/medical/joueur', { replace: true });
    }
  };

  const setSelectedPlayerId = (id: string) => navigate(`/medical/joueur/${id}`, { replace: true });

  const [teamPlayers, setTeamPlayers]         = useState<Player[]>([]);
  const [activeInjuries, setActiveInjuries]   = useState<MedicalRecord[]>([]);
  const [seasonInjuries, setSeasonInjuries]   = useState<MedicalRecord[]>([]);
  const [seasonAllRecords, setSeasonAllRecords] = useState<MedicalRecord[]>([]);
  const [playerRecords, setPlayerRecords]     = useState<MedicalRecord[]>([]);

  // Recap filters + detail modal
  const [recapSearch,       setRecapSearch]       = useState('');
  const [recapTypeFilter,   setRecapTypeFilter]   = useState('');
  const [recapPlayerFilter, setRecapPlayerFilter] = useState('');
  const [recapStatusFilter, setRecapStatusFilter] = useState('');
  const [recapSortKey, setRecapSortKey] = useState<'date' | 'player' | 'description' | 'type' | 'severity' | 'status'>('date');
  const [recapSortDir, setRecapSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailRecord,      setDetailRecord]      = useState<MedicalRecord | null>(null);
  const [version, setVersion]                 = useState(0);
  const [recordView, setRecordView]           = useState<'section' | 'date'>('date');
  const playerMedicalViewRef = useRef<PlayerMedicalViewHandle>(null);

  // Clôture / déclôture d'une entrée — la modale porte l'écriture (cf. MedicalRecordStatusModal).
  const [statusAction, setStatusAction] = useState<{ action: MedicalStatusAction; record: MedicalRecord } | null>(null);

  // form
  const [showForm, setShowForm]       = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);

  // Team players
  useEffect(() => {
    if (!selected) return;
    setTeamPlayers([]);
    playersApi.listBySeason(selected.season.id).then(list => {
      setTeamPlayers(list);
      if (activeTab === 'record') {
        if (!urlId && list[0]?.id) {
          navigate(`/medical/joueur/${list[0].id}`, { replace: true });
        } else if (urlId && list.length > 0 && !list.some(p => p.id === urlId)) {
          // Le joueur dans l'URL n'appartient pas à l'équipe/saison sélectionnée.
          navigate('/', { replace: true });
        }
      }
    });
  }, [selected?.season.id, version]);

  // Load active injuries
  useEffect(() => {
    if (!selected) return;
    setActiveInjuries([]);
    medicalApi.getActiveInjuries().then(setActiveInjuries);
  }, [version, selected?.season.id]);

  // Load all injuries for season stats
  useEffect(() => {
    if (!selected) return;
    setSeasonInjuries([]);
    medicalApi.list({ type: 'injury' }).then(setSeasonInjuries);
  }, [version, selected?.season.id]);

  // Load all records (all types) for team recap
  useEffect(() => {
    if (!selected) return;
    setSeasonAllRecords([]);
    medicalApi.list().then(setSeasonAllRecords);
  }, [version, selected?.season.id]);

  // Load records for selected player
  useEffect(() => {
    if (!selectedPlayerId) return;
    medicalApi.getByPlayer(selectedPlayerId).then(setPlayerRecords);
  }, [selectedPlayerId, version]);

  const teamPlayerIds      = new Set(teamPlayers.map(p => p.id));
  const teamInjuries       = activeInjuries.filter(r => teamPlayerIds.has(r.playerId));
  const teamSeasonInjuries = seasonInjuries.filter(r => teamPlayerIds.has(r.playerId));
  const teamActiveAll      = seasonAllRecords
    .filter(r => teamPlayerIds.has(r.playerId) && r.status === 'active' && r.type !== 'checkup')
    .sort((a, b) => b.date.localeCompare(a.date));
  const recInjuries   = playerRecords.filter(r => r.type === 'injury');
  const recTreatments = playerRecords.filter(r => r.type === 'treatment');
  const allCheckups   = playerRecords.filter(r => r.type === 'checkup');
  const activePlayerInjury = [...recInjuries].sort((a, b) => b.date.localeCompare(a.date)).find(r => r.status === 'active') ?? null;
  const lastPlayerInjury    = [...recInjuries].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const selectedPlayer     = teamPlayers.find(p => p.id === selectedPlayerId);
  const playerById         = (id: string) => teamPlayers.find(p => p.id === id);

  // `injuryDaysActive` et `injuryDaysSeason` avaient des commentaires distincts pour un corps
  // identique : la distinction annoncée n'existait pas. Elle vit maintenant dans `injuryDays`
  // (utils/medical) — jours constatés pour une blessure clôturée, prévus pour une active — et une
  // seule fonction suffit. `undated` compte les blessures sans date de fin connue, qui étaient
  // silencieusement comptées pour 0 jour.

  // Stats — actif
  const activeCount    = teamInjuries.length;
  const activeDaysTotal = sumInjuryDays(teamInjuries);
  const activePlayers  = new Set(teamInjuries.map(r => r.playerId)).size;

  // Stats — saison
  const seasonCount    = teamSeasonInjuries.length;
  const seasonDaysTotal = sumInjuryDays(teamSeasonInjuries);
  const seasonPlayers  = new Set(teamSeasonInjuries.map(r => r.playerId)).size;

  // Stats — joueur sélectionné (onglet Historique joueur)
  const playerSeasonInjuries = recInjuries.filter(r =>
    (!selected?.season.startDate || r.date >= selected.season.startDate) &&
    (!selected?.season.endDate   || r.date <= selected.season.endDate)
  );
  const playerSeasonDays  = sumInjuryDays(playerSeasonInjuries).days;

  const openForm = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const openEdit = (record: MedicalRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <p style={{ color: '#94A3B8' }}>Sélectionnez une équipe pour accéder au suivi médical.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Médical</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {([
            { id: 'infirmary', label: 'Infirmerie',        short: 'Infirmerie' },
            { id: 'record',    label: 'Historique joueur', short: 'Joueur'  },
            { id: 'team',      label: 'Historique équipe', short: 'Équipe' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab.id ? '#1E2229' : 'transparent', color: activeTab === tab.id ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sub-header : équipe en cours ou sélection joueur + actions */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {activeTab === 'record' ? (
          teamPlayers.length === 0 ? (
            <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucun joueur dans l'effectif pour cette saison.</span>
          ) : (
            <PlayerSelect players={teamPlayers} value={selectedPlayerId} onChange={setSelectedPlayerId} />
          )
        ) : (
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
        )}

        {activeTab === 'infirmary' && canEditTeamData && (
          <AddButton label="Ajouter une entrée" onClick={() => openForm()} />
        )}

        {activeTab === 'record' && selectedPlayerId && canEditTeamData && (
          <AddButton label="Ajouter une entrée" onClick={() => playerMedicalViewRef.current?.openForm()} />
        )}

        {activeTab === 'team' && canEditTeamData && (
          <AddButton label="Ajouter une entrée" onClick={() => openForm()} />
        )}
      </div>

      {/* ── INFIRMARY TAB ── */}
      {activeTab === 'infirmary' && (() => {
        // Plus proche date de reprise/fin estimée en premier ; sans date connue, en fin de liste.
        const byRtpAsc = (a: MedicalRecord, b: MedicalRecord) => {
          if (!a.rtpDate && !b.rtpDate) return 0;
          if (!a.rtpDate) return 1;
          if (!b.rtpDate) return -1;
          return a.rtpDate.localeCompare(b.rtpDate);
        };
        const activeInjuriesList   = teamActiveAll.filter(r => r.type === 'injury').sort(byRtpAsc);
        const activeTreatmentsList = teamActiveAll.filter(r => r.type === 'treatment').sort(byRtpAsc);

        const renderRecord = (record: MedicalRecord) => {
          const player = playerById(record.playerId);
          if (!player) return null;
          return (
            <InjuryRecordCard
              key={record.id}
              record={record}
              player={player}
              onEdit={() => { if (canEditTeamData) openEdit(record); }}
              onClose={canEditTeamData ? () => setStatusAction({ action: 'close', record }) : undefined}
              onClick={() => setDetailRecord(record)}
              navigate={navigate}
            />
          );
        };

        return (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
              <Card accentColor="#EF4444">
                <CardTitle icon={<Ambulance size={13} color="#EF4444" />}>
                  Blessures {activeInjuriesList.length > 0 ? `(${activeInjuriesList.length})` : ''}
                </CardTitle>
                {activeInjuriesList.length === 0 ? (
                  <p style={{ color: '#00E5A0', fontSize: '0.82rem', margin: 0 }}>✓ Aucune blessure active</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {activeInjuriesList.map(renderRecord)}
                  </div>
                )}
              </Card>
              <Card accentColor="#00E5A0">
                <CardTitle icon={<Pill size={13} color="#00E5A0" />}>
                  Traitements en cours {activeTreatmentsList.length > 0 ? `(${activeTreatmentsList.length})` : ''}
                </CardTitle>
                {activeTreatmentsList.length === 0 ? (
                  <p style={{ color: '#00E5A0', fontSize: '0.82rem', margin: 0 }}>✓ Aucun traitement en cours</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {activeTreatmentsList.map(renderRecord)}
                  </div>
                )}
              </Card>
            </div>
          </div>
        );
      })()}

      {/* ── TEAM TAB ── */}
      {activeTab === 'team' && (() => {
        const injuredIds     = new Set(teamInjuries.map(r => r.playerId));
        const limitedPlayers = teamPlayers.filter(p => p.status === 'limited').length;

        const severityCounts = { mild: 0, moderate: 0, severe: 0 };
        teamSeasonInjuries.forEach(r => { if (r.severity) severityCounts[r.severity]++; });

        const injuryByPlayer = teamSeasonInjuries.reduce<Record<string, number>>((acc, r) => {
          acc[r.playerId] = (acc[r.playerId] ?? 0) + 1;
          return acc;
        }, {});
        const topInjuredPlayers = Object.entries(injuryByPlayer)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([pid, count]) => ({ player: teamPlayers.find(p => p.id === pid), count }))
          .filter(x => x.player);

        const teamAllRecords = seasonAllRecords
          .filter(r => teamPlayerIds.has(r.playerId))
          .sort((a, b) => b.date.localeCompare(a.date));

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                // Les blessures sans date de fin connue sont hors du total : le dire plutôt que de
                // laisser croire que le cumul les couvre.
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

                {/* Par gravité */}
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

                {/* Joueurs les plus touchés */}
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
            {(() => {
              const filtered = teamAllRecords.filter(r => {
                if (recapTypeFilter   && r.type     !== recapTypeFilter)   return false;
                if (recapPlayerFilter && r.playerId !== recapPlayerFilter) return false;
                if (recapStatusFilter && r.status   !== recapStatusFilter) return false;
                if (recapSearch) {
                  const q = recapSearch.toLowerCase();
                  const p = teamPlayers.find(pl => pl.id === r.playerId);
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
                    const pa = teamPlayers.find(pl => pl.id === a.playerId)?.lastName ?? '';
                    const pb = teamPlayers.find(pl => pl.id === b.playerId)?.lastName ?? '';
                    return pa.localeCompare(pb) * dir;
                  }
                  case 'description': return a.description.localeCompare(b.description) * dir;
                  case 'type':        return typeLabels[a.type].localeCompare(typeLabels[b.type]) * dir;
                  case 'severity':    return ((a.severity ? severityRank[a.severity] : 0) - (b.severity ? severityRank[b.severity] : 0)) * dir;
                  case 'status':      return a.status.localeCompare(b.status) * dir;
                  default:            return 0;
                }
              });

              const toggleSort = (key: typeof recapSortKey) => {
                if (recapSortKey === key) {
                  setRecapSortDir(d => d === 'asc' ? 'desc' : 'asc');
                } else {
                  setRecapSortKey(key);
                  setRecapSortDir('desc');
                }
              };
              const sortArrow = (key: typeof recapSortKey) => recapSortKey === key
                ? <span style={{ fontSize: '0.6rem', marginLeft: 3 }}>{recapSortDir === 'asc' ? '▲' : '▼'}</span>
                : null;
              const thBase: React.CSSProperties = { padding: '7px 8px', textAlign: 'left', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', cursor: 'pointer', userSelect: 'none' };

              return (
                <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
                  {/* Header */}
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

                  {/* Filtres */}
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
                    <select value={recapTypeFilter} onChange={e => setRecapTypeFilter(e.target.value)}
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
                      {teamPlayers.map(p => <option key={p.id} value={p.id}>{playerNameFull(p)}</option>)}
                    </select>
                    <select value={recapStatusFilter} onChange={e => setRecapStatusFilter(e.target.value)}
                      className="w-full sm:w-auto"
                      style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapStatusFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}>
                      <option value="">Tous statuts</option>
                      <option value="active">En cours</option>
                      <option value="resolved">Clôturé</option>
                    </select>
                    {hasFilter && (
                      <button onClick={() => { setRecapSearch(''); setRecapTypeFilter(''); setRecapPlayerFilter(''); setRecapStatusFilter(''); }}
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
                                const p   = teamPlayers.find(pl => pl.id === r.playerId);
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
              );
            })()}

          </div>
        );
      })()}

      {/* ── RECORD TAB ── */}
      {activeTab === 'record' && (
        <div>
          {selectedPlayer && selectedPlayerId && (
            <PlayerMedicalOverview
              key={selectedPlayerId}
              ref={playerMedicalViewRef}
              player={selectedPlayer}
              playerId={selectedPlayerId}
              currentInjury={activePlayerInjury}
              lastInjury={lastPlayerInjury}
              seasonInjuryCount={playerSeasonInjuries.length}
              seasonInjuryDays={playerSeasonDays}
              onUpdated={() => setVersion(v => v + 1)}
            />
          )}
        </div>
      )}

      {/* ── DETAIL RECORD MODAL ── */}
      {detailRecord && (
        <MedicalRecordDetailModal
          record={detailRecord}
          player={teamPlayers.find(pl => pl.id === detailRecord.playerId)}
          onClose={() => setDetailRecord(null)}
          onEdit={() => { if (!canEditTeamData) return; const r = detailRecord; setDetailRecord(null); openEdit(r); }}
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
          player={teamPlayers.find(pl => pl.id === statusAction.record.playerId)}
          teamId={selected?.team.id}
          onCancel={() => setStatusAction(null)}
          onDone={() => setVersion(v => v + 1)}
        />
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <MedicalRecordFormModal
          players={teamPlayers}
          defaultPlayerId={selectedPlayerId || undefined}
          record={editingRecord}
          onClose={() => setShowForm(false)}
          onSaved={() => setVersion(v => v + 1)}
        />
      )}
    </div>
  );
}

