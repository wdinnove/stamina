import { useState, useEffect } from 'react';
import { Plus, X, AlertCircle, Pencil, Search } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useNavigate, useParams } from 'react-router';
import { StatusBadge, PlayerAvatar } from '../components';
import type { MedicalRecord, Player } from '../data/types';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

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

const typeIcons: Record<string, string> = {
  injury: '🔴', checkup: '🩺', treatment: '💊',
};

type Tab = 'infirmary' | 'record' | 'team';

const TAB_SLUGS: Record<string, Tab> = {
  infirmary: 'infirmary',
  record:    'record',
  team:      'team',
};

const TODAY = new Date().toISOString().split('T')[0];

export default function MedicalPage() {
  const { selected } = useTeamSeason();
  const navigate     = useNavigate();
  const { tab: tabSlug, id: urlId } = useParams<{ tab?: string; id?: string }>();

  const activeTab: Tab        = TAB_SLUGS[tabSlug ?? ''] ?? 'infirmary';
  const selectedPlayerId: string = activeTab === 'record' ? (urlId ?? '') : '';

  const setActiveTab = (t: Tab) => {
    if (t === 'infirmary' && selected) navigate(`/medical/infirmary/${selected.team.id}`, { replace: true });
    else if (t === 'team'      && selected) navigate(`/medical/team/${selected.team.id}`,      { replace: true });
    else if (t === 'record') {
      const pid = allPlayers[0]?.id ?? '';
      navigate(pid ? `/medical/record/${pid}` : '/medical/record', { replace: true });
    }
  };

  const setSelectedPlayerId = (id: string) => navigate(`/medical/record/${id}`, { replace: true });

  const [teamPlayers, setTeamPlayers]         = useState<Player[]>([]);
  const [allPlayers, setAllPlayers]           = useState<Player[]>([]);
  const [activeInjuries, setActiveInjuries]   = useState<MedicalRecord[]>([]);
  const [seasonInjuries, setSeasonInjuries]   = useState<MedicalRecord[]>([]);
  const [seasonAllRecords, setSeasonAllRecords] = useState<MedicalRecord[]>([]);
  const [playerRecords, setPlayerRecords]     = useState<MedicalRecord[]>([]);

  // Recap filters + detail modal
  const [recapSearch,       setRecapSearch]       = useState('');
  const [recapTypeFilter,   setRecapTypeFilter]   = useState('');
  const [recapPlayerFilter, setRecapPlayerFilter] = useState('');
  const [recapStatusFilter, setRecapStatusFilter] = useState('');
  const [detailRecord,      setDetailRecord]      = useState<MedicalRecord | null>(null);
  const [version, setVersion]                 = useState(0);

  // clôture modal
  const [closeModal, setCloseModal] = useState<{ recordId: string; playerId: string; date: string; playerStatus: 'active' | 'limited' | 'injured' | 'unavailable' } | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);

  // form
  const [showForm, setShowForm]       = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [formType, setFormType]       = useState<MedicalRecord['type']>('injury');
  const [fPlayerId, setFPlayerId]     = useState('');
  const [fDate, setFDate]             = useState(TODAY);
  const [fDesc, setFDesc]             = useState('');
  const [fSeverity, setFSeverity]     = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [fLocation, setFLocation]     = useState('');
  const [fDays, setFDays]             = useState('');
  const [fTreatment, setFTreatment]   = useState('');
  const [fRtpDate, setFRtpDate]       = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);

  // Team players (for infirmary filtering)
  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id).then(setTeamPlayers);
  }, [selected?.season.id, version]);

  // All players across all teams/seasons (for record tab selector)
  useEffect(() => {
    playersApi.list().then(list => {
      setAllPlayers(list);
      if (activeTab === 'record' && !urlId && list[0]?.id) {
        navigate(`/medical/record/${list[0].id}`, { replace: true });
      }
    });
  }, [version]);

  // Load active injuries
  useEffect(() => {
    medicalApi.getActiveInjuries().then(setActiveInjuries);
  }, [version]);

  // Load all injuries for season stats
  useEffect(() => {
    medicalApi.list({ type: 'injury' }).then(setSeasonInjuries);
  }, [version]);

  // Load all records (all types) for team recap
  useEffect(() => {
    medicalApi.list().then(setSeasonAllRecords);
  }, [version]);

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
  const activeInjuryTreatment  = playerRecords.filter(r => r.status === 'active'   && r.type !== 'checkup');
  const historyInjuryTreatment = playerRecords.filter(r => r.status === 'resolved' && r.type !== 'checkup');
  const allCheckups            = playerRecords.filter(r => r.type === 'checkup');
  const selectedPlayer     = allPlayers.find(p => p.id === selectedPlayerId);
  const playerById         = (id: string) => teamPlayers.find(p => p.id === id);

  const daysBetween = (from: string, to: string): number => {
    const start = new Date(from + 'T00:00:00');
    const end   = new Date(to   + 'T00:00:00');
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  };

  // Actif : jours prévus jusqu'au RTP
  const injuryDaysActive = (r: MedicalRecord): number =>
    r.rtpDate ? daysBetween(r.date, r.rtpDate) : 0;

  // Saison : toujours rtpDate (valeur absolue planifiée, indépendante de la clôture)
  const injuryDaysSeason = (r: MedicalRecord): number =>
    r.rtpDate ? daysBetween(r.date, r.rtpDate) : 0;

  // Stats — actif
  const activeCount    = teamInjuries.length;
  const activeDays     = teamInjuries.reduce((s, r) => s + injuryDaysActive(r), 0);
  const activePlayers  = new Set(teamInjuries.map(r => r.playerId)).size;

  // Stats — saison
  const seasonCount    = teamSeasonInjuries.length;
  const seasonDays     = teamSeasonInjuries.reduce((s, r) => s + injuryDaysSeason(r), 0);
  const seasonPlayers  = new Set(teamSeasonInjuries.map(r => r.playerId)).size;

  const rtpDaysLeft = (rtpDate: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rtp   = new Date(rtpDate + 'T00:00:00');
    return Math.ceil((rtp.getTime() - today.getTime()) / 86400000);
  };

  const openForm = (prePlayerId?: string) => {
    setEditingRecord(null);
    setFPlayerId(prePlayerId || selectedPlayerId || allPlayers[0]?.id || '');
    setFDate(TODAY); setFDesc(''); setFSeverity('mild');
    setFLocation(''); setFDays(''); setFTreatment(''); setFRtpDate('');
    setFormType('injury');
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (record: MedicalRecord) => {
    setEditingRecord(record);
    setFormType(record.type);
    setFPlayerId(record.playerId);
    setFDate(record.date);
    setFDesc(record.description);
    setFSeverity(record.severity ?? 'mild');
    setFLocation(record.location ?? '');
    setFDays('');
    setFTreatment(record.treatment ?? '');
    setFRtpDate(record.rtpDate ?? '');
    setSaveError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fPlayerId || !fDesc) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        playerId:    fPlayerId,
        date:        fDate,
        type:        formType,
        description: fDesc,
        location:    undefined,
        severity:    formType === 'injury' ? fSeverity : undefined,
        daysAbsent:  formType === 'injury' && fDays ? Number(fDays) : undefined,
        treatment:   editingRecord ? (fTreatment || null) : (fTreatment || undefined),
        rtpDate:     formType === 'injury' && fRtpDate ? fRtpDate : undefined,
      };
      if (editingRecord) {
        await medicalApi.update(editingRecord.id, payload);
      } else {
        await medicalApi.create({ ...payload, status: 'active' });
        if (formType === 'injury') {
          await playersApi.update(fPlayerId, { status: 'injured' });
        }
      }
      setShowForm(false);
      setVersion(v => v + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const confirmClose = async () => {
    if (!closeModal) return;
    setCloseSaving(true);
    try {
      await medicalApi.update(closeModal.recordId, { status: 'resolved', resolvedDate: closeModal.date });
      await playersApi.update(closeModal.playerId, { status: closeModal.playerStatus });
      setCloseModal(null);
      setVersion(v => v + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la clôture');
    } finally {
      setCloseSaving(false);
    }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Médical</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {([
            { id: 'infirmary', label: 'Infirmerie', short: 'Infirmerie' },
            { id: 'team',      label: 'Vue équipe', short: 'Équipe'     },
            { id: 'record',    label: 'Dossier joueur', short: 'Dossier' },
          ] as const).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '6px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab.id ? '#1E2229' : 'transparent', color: activeTab === tab.id ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── INFIRMARY TAB ── */}
      {activeTab === 'infirmary' && (
        <div>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ color: '#F1F5F9', margin: 0 }}>En cours ({teamActiveAll.length})</h3>
              <button onClick={() => openForm()} style={{ padding: '6px 12px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <Plus size={14} /><span className="hidden sm:inline">Nouvelle entrée</span>
              </button>
            </div>

            {teamActiveAll.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>Aucune blessure ni traitement actif</p>
            )}

            <style>{`@media (min-width: 640px) { .med-card-actions { border-top: none !important; margin-top: 0 !important; padding-top: 0 !important; } }`}</style>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamActiveAll.map(record => {
                const player = playerById(record.playerId);
                if (!player) return null;
                const days = record.rtpDate ? rtpDaysLeft(record.rtpDate) : null;
                const sev  = record.severity ? severityConfig[record.severity] : null;
                const col  = typeColors[record.type] ?? '#94A3B8';
                const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                return (
                  <div key={record.id} style={{ backgroundColor: '#1E2229', border: `1px solid ${col}30`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <PlayerAvatar player={player} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{player.firstName} {player.lastName}</span>
                          <StatusBadge status={player.status} size="sm" />
                          <span style={{ color: col, fontSize: '0.7rem', fontWeight: 600, backgroundColor: col + '18', padding: '1px 5px', borderRadius: 3 }}>{typeLabels[record.type]}</span>
                          {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                        </div>
                        <p style={{ color: col, fontWeight: 600, fontSize: '0.85rem', margin: '0 0 2px' }}>{typeIcons[record.type]} {record.description}</p>
                        <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                      </div>
                      <div className="med-card-actions w-full sm:w-auto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #2A2F3A' }}>
                        <span style={{ color: days !== null && days <= 3 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {fmtDate(record.date)}{days !== null ? ` · ${rtpLabel} J+${days}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                          <button onClick={() => openEdit(record)} style={{ padding: '3px 9px', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Pencil size={11} /> Modifier
                          </button>
                          <button onClick={() => setCloseModal({ recordId: record.id, playerId: record.playerId, date: TODAY, playerStatus: 'active' })} style={{ padding: '3px 9px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 4, color: '#00E5A0', cursor: 'pointer', fontSize: '0.72rem' }}>
                            Clôturer
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── TEAM TAB ── */}
      {activeTab === 'team' && (() => {
        const totalPlayers   = teamPlayers.length;
        const injuredIds     = new Set(teamInjuries.map(r => r.playerId));
        const availablePlayers = teamPlayers.filter(p => p.status === 'active').length;
        const availPct       = totalPlayers > 0 ? Math.round((availablePlayers / totalPlayers) * 100) : 0;

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
              {[
                { label: 'Disponibilité',       value: `${availPct}%`,            sub: `${availablePlayers}/${totalPlayers} joueurs`,    color: availPct >= 80 ? '#00E5A0' : availPct >= 60 ? '#F59E0B' : '#EF4444' },
                { label: 'Blessés actifs',       value: String(teamInjuries.length), sub: `${new Set(teamInjuries.map(r => r.playerId)).size} joueurs`, color: teamInjuries.length > 0 ? '#EF4444' : '#00E5A0' },
                { label: 'Blessures saison',     value: String(seasonCount),        sub: `${seasonPlayers} joueurs touchés`,               color: '#F59E0B' },
                { label: 'Jours d\'absence',     value: seasonDays > 0 ? `${seasonDays}j` : '—', sub: 'cumulés saison',                   color: '#3B82F6' },
              ].map(kpi => (
                <div key={kpi.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
                  <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px', fontWeight: 600 }}>{kpi.label}</p>
                  <p style={{ color: kpi.color, fontSize: '1.4rem', fontWeight: 800, margin: '0 0 3px', fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</p>
                  <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Disponibilité joueurs */}
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
              <h3 style={{ color: '#F1F5F9', margin: '0 0 14px', fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disponibilité joueurs</h3>
              {teamPlayers.length === 0
                ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucun joueur dans l'équipe.</p>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {teamPlayers.map(p => {
                      const isInjured = injuredIds.has(p.id);
                      const statusColors: Record<string, string> = {
                        active: '#00E5A0', injured: '#EF4444', limited: '#F59E0B', suspended: '#8B5CF6', unavailable: '#475569',
                      };
                      const c = statusColors[p.status] ?? '#475569';
                      return (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', backgroundColor: '#1E2229', border: `1px solid ${isInjured ? 'rgba(239,68,68,0.3)' : '#2A2F3A'}`, borderRadius: 20 }}>
                          <PlayerAvatar player={p} size={22} />
                          <span style={{ color: '#F1F5F9', fontSize: '0.78rem', fontWeight: 600 }}>{p.lastName}</span>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: c, flexShrink: 0 }} />
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14 }}>

              {/* Blessés actifs */}
              <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
                <h3 style={{ color: '#F1F5F9', margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Blessés actifs <span style={{ color: '#EF4444', fontWeight: 800 }}>{teamInjuries.length > 0 ? `(${teamInjuries.length})` : ''}</span>
                </h3>
                {teamInjuries.length === 0
                  ? <p style={{ color: '#00E5A0', fontSize: '0.85rem', margin: 0 }}>✓ Aucune blessure active</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {teamInjuries.map(r => {
                        const p   = playerById(r.playerId);
                        if (!p) return null;
                        const sev = r.severity ? severityConfig[r.severity] : null;
                        const days = r.rtpDate ? rtpDaysLeft(r.rtpDate) : null;
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: '3px solid #EF4444' }}>
                            <PlayerAvatar player={p} size={28} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.82rem', margin: 0 }}>{p.lastName} {p.firstName[0]}.</p>
                              <p style={{ color: '#94A3B8', fontSize: '0.72rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</p>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              {sev && <p style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 700, margin: '0 0 2px' }}>{sev.label}</p>}
                              {days !== null && <p style={{ color: days <= 3 ? '#00E5A0' : '#F59E0B', fontSize: '0.7rem', margin: 0 }}>RTP J+{days}</p>}
                            </div>
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
                  <h3 style={{ color: '#F1F5F9', margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Répartition par gravité</h3>
                  {seasonCount === 0
                    ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucune blessure cette saison.</p>
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
                  <h3 style={{ color: '#F1F5F9', margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joueurs les plus touchés</h3>
                  {topInjuredPlayers.length === 0
                    ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucune donnée.</p>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {topInjuredPlayers.map(({ player: p, count }) => {
                          if (!p) return null;
                          const pct = Math.round((count / seasonCount) * 100);
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <PlayerAvatar player={p} size={26} />
                              <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>{p.lastName}</span>
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

              return (
                <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '18px 20px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.88rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Récap saison
                    </h3>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['injury', 'treatment', 'checkup'] as const).map(t => (
                        <span key={t} style={{ color: typeColors[t], fontSize: '0.7rem', fontWeight: 600, backgroundColor: typeColors[t] + '18', padding: '2px 7px', borderRadius: 3 }}>
                          {typeLabels[t]} · {teamAllRecords.filter(r => r.type === t).length}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Filtres */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
                      <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                      <input
                        placeholder="Rechercher…"
                        value={recapSearch}
                        onChange={e => setRecapSearch(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px 7px 28px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <select value={recapTypeFilter} onChange={e => setRecapTypeFilter(e.target.value)}
                      style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapTypeFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none' }}>
                      <option value="">Tous types</option>
                      <option value="injury">Blessure</option>
                      <option value="treatment">Traitement</option>
                      <option value="checkup">Bilan santé</option>
                    </select>
                    <select value={recapPlayerFilter} onChange={e => setRecapPlayerFilter(e.target.value)}
                      style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapPlayerFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none', flex: '0 1 140px' }}>
                      <option value="">Tous joueurs</option>
                      {teamPlayers.map(p => <option key={p.id} value={p.id}>{p.lastName} {p.firstName[0]}.</option>)}
                    </select>
                    <select value={recapStatusFilter} onChange={e => setRecapStatusFilter(e.target.value)}
                      style={{ padding: '7px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: recapStatusFilter ? '#F1F5F9' : '#475569', fontSize: '0.82rem', outline: 'none' }}>
                      <option value="">Tous statuts</option>
                      <option value="active">En cours</option>
                      <option value="resolved">Clôturé</option>
                    </select>
                    {hasFilter && (
                      <button onClick={() => { setRecapSearch(''); setRecapTypeFilter(''); setRecapPlayerFilter(''); setRecapStatusFilter(''); }}
                        style={{ padding: '7px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <X size={12} /> Effacer
                      </button>
                    )}
                  </div>

                  {filtered.length === 0
                    ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>{hasFilter ? 'Aucun résultat.' : 'Aucune entrée médicale cette saison.'}</p>
                    : (
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 480 }}>
                          {filtered.map((r, i) => {
                            const p   = teamPlayers.find(pl => pl.id === r.playerId);
                            const sev = r.severity ? severityConfig[r.severity] : null;
                            const col = typeColors[r.type] ?? '#94A3B8';
                            return (
                              <div key={r.id} onClick={() => setDetailRecord(r)}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '90px 1fr auto auto',
                                  alignItems: 'center',
                                  gap: 12,
                                  padding: '9px 10px',
                                  backgroundColor: i % 2 === 0 ? 'transparent' : '#1a1d24',
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  transition: 'background-color 0.12s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1E2229')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : '#1a1d24')}
                              >
                                <span style={{ color: '#475569', fontSize: '0.72rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                  {fmtDate(r.date)}
                                </span>
                                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {p && <PlayerAvatar player={p} size={18} />}
                                  <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600 }}>{p ? `${p.lastName} ${p.firstName[0]}.` : '—'}</span>
                                  <span style={{ color: '#2A2F3A' }}>·</span>
                                  <span style={{ color: r.status === 'resolved' ? '#475569' : '#F1F5F9', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.status === 'resolved' ? 'line-through' : 'none' }}>
                                    {r.description}
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: sev?.color ?? 'transparent', minWidth: 48, textAlign: 'right' }}>
                                  {sev?.label ?? ''}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  <span style={{ color: col, fontSize: '0.7rem', fontWeight: 600, backgroundColor: col + '18', padding: '1px 6px', borderRadius: 3 }}>
                                    {typeLabels[r.type]}
                                  </span>
                                  {r.status === 'resolved' && <span style={{ color: '#00E5A0', fontSize: '0.68rem', fontWeight: 600 }}>✓</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <select
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              style={{ flex: 1, minWidth: 180, padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}
            >
              {allPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
            <button onClick={() => openForm(selectedPlayerId)} style={{ flexShrink: 0, padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /><span className="hidden sm:inline">Nouvelle entrée</span>
            </button>
          </div>

          {selectedPlayer && (
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <PlayerAvatar player={selectedPlayer} size={44} />
              <div>
                <h3 style={{ color: '#F1F5F9', margin: 0 }}>Suivi Médical — {selectedPlayer.firstName} {selectedPlayer.lastName}</h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <StatusBadge status={selectedPlayer.status} size="sm" />
                </div>
              </div>
            </div>
          )}

          {/* ── Bloc 1 : Blessures & Traitements actifs ── */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px', marginBottom: 12 }}>
            <h4 style={{ color: '#F1F5F9', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', fontWeight: 700 }}>
              Blessures & Traitements actifs
              {activeInjuryTreatment.length > 0 && <span style={{ color: '#EF4444', marginLeft: 8 }}>({activeInjuryTreatment.length})</span>}
            </h4>
            {activeInjuryTreatment.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucune entrée active.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeInjuryTreatment.map(record => {
                    const color  = typeColors[record.type] ?? '#94A3B8';
                    const sev    = record.severity ? severityConfig[record.severity] : null;
                    const days   = record.rtpDate ? rtpDaysLeft(record.rtpDate) : null;
                    const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                    return (
                      <div key={record.id} style={{ backgroundColor: '#1E2229', border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: color + '20', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>
                            {typeIcons[record.type]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{record.description}</span>
                              {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                            </div>
                            <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                          </div>
                          <div className="med-card-actions w-full sm:w-auto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #2A2F3A' }}>
                            <span style={{ color: days !== null && days <= 3 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {fmtDate(record.date)}{days !== null ? ` · ${rtpLabel} J+${days}` : ''}
                            </span>
                            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                              <button onClick={() => openEdit(record)} style={{ padding: '3px 9px', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Pencil size={11} /> Modifier
                              </button>
                              <button onClick={() => setCloseModal({ recordId: record.id, playerId: record.playerId, date: TODAY, playerStatus: 'active' })} style={{ padding: '3px 9px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 4, color: '#00E5A0', cursor: 'pointer', fontSize: '0.72rem' }}>
                                Clôturer
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>

          {/* ── Bloc 2 : Historique blessures & traitements ── */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px', marginBottom: 12 }}>
            <h4 style={{ color: '#94A3B8', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', fontWeight: 700 }}>
              Historique blessures & traitements ({historyInjuryTreatment.length})
            </h4>
            {historyInjuryTreatment.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucun antécédent.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {historyInjuryTreatment.map(record => {
                    const color = typeColors[record.type] ?? '#94A3B8';
                    const sev   = record.severity ? severityConfig[record.severity] : null;
                    const totalDays = record.rtpDate ? daysBetween(record.date, record.rtpDate) : null;
                    return (
                      <div key={record.id} style={{ backgroundColor: '#1E2229', border: `1px solid ${color}33`, borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: color + '20', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>
                            {typeIcons[record.type]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{record.description}</span>
                              {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                            </div>
                            <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                          </div>
                          <div className="med-card-actions w-full sm:w-auto" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #2A2F3A' }}>
                            <span style={{ color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {fmtDate(record.date)}{totalDays !== null && totalDays > 0 ? ` · ${totalDays}j` : ''}
                            </span>
                            <button onClick={() => openEdit(record)} style={{ padding: '3px 9px', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                              <Pencil size={11} /> Modifier
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>

          {/* ── Bloc 3 : Bilans santé ── */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px' }}>
            <h4 style={{ color: '#3B82F6', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px', fontWeight: 700 }}>
              Bilans santé ({allCheckups.length})
            </h4>
            {allCheckups.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Aucun bilan enregistré.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allCheckups.map(record => (
                    <div key={record.id} style={{ backgroundColor: '#1E2229', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0 }}>
                          🩺
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: '#CBD5E1', fontWeight: 600, fontSize: '0.85rem' }}>{record.description}</span>
                          {record.treatment && <p style={{ color: '#475569', fontSize: '0.75rem', margin: '3px 0 0' }}>{record.treatment}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '0 0 4px' }}>{fmtDate(record.date)}</p>
                          <button onClick={() => openEdit(record)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── DETAIL RECORD MODAL ── */}
      {detailRecord && (() => {
        const p   = allPlayers.find(pl => pl.id === detailRecord.playerId);
        const sev = detailRecord.severity ? severityConfig[detailRecord.severity] : null;
        const col = typeColors[detailRecord.type] ?? '#94A3B8';
        const totalDays = detailRecord.rtpDate ? daysBetween(detailRecord.date, detailRecord.rtpDate) : null;
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 480, padding: '24px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', backgroundColor: col + '20', border: `1px solid ${col}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                    {typeIcons[detailRecord.type]}
                  </div>
                  <div>
                    <span style={{ color: col, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{typeLabels[detailRecord.type]}</span>
                    <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', margin: '2px 0 0' }}>{detailRecord.description}</p>
                  </div>
                </div>
                <button onClick={() => setDetailRecord(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4, flexShrink: 0 }}><X size={18} /></button>
              </div>

              {/* Grille de détails */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Joueur',   value: p ? `${p.firstName} ${p.lastName}` : '—' },
                  { label: 'Date',     value: `${fmtDate(detailRecord.date)} ${detailRecord.date.slice(0,4)}` },
                  { label: 'Statut',   value: detailRecord.status === 'active' ? 'En cours' : 'Clôturé', color: detailRecord.status === 'active' ? '#F59E0B' : '#00E5A0' },
                  ...(sev ? [{ label: 'Gravité', value: sev.label, color: sev.color }] : []),
                  ...(detailRecord.rtpDate ? [{ label: detailRecord.type === 'injury' ? 'Date de retour' : 'Date de fin', value: `${fmtDate(detailRecord.rtpDate)}${totalDays ? ` (${totalDays}j)` : ''}` }] : []),
                  ...(detailRecord.resolvedDate ? [{ label: 'Clôturé le', value: fmtDate(detailRecord.resolvedDate) }] : []),
                ].map(({ label, value, color }: { label: string; value: string; color?: string }) => (
                  <div key={label} style={{ padding: '10px 12px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                    <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 3px', fontWeight: 600 }}>{label}</p>
                    <p style={{ color: color ?? '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Traitement / Notes */}
              {detailRecord.treatment && (
                <div style={{ padding: '12px 14px', backgroundColor: '#1E2229', borderRadius: 6, marginBottom: 14 }}>
                  <p style={{ color: '#475569', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 5px', fontWeight: 600 }}>
                    {detailRecord.type === 'injury' ? 'Traitement & protocole' : 'Notes'}
                  </p>
                  <p style={{ color: '#CBD5E1', fontSize: '0.84rem', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{detailRecord.treatment}</p>
                </div>
              )}

              <button onClick={() => setDetailRecord(null)}
                style={{ width: '100%', padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                Fermer
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── CLOSE MODAL ── */}
      {closeModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 360, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Clôturer l'entrée</h2>
              <button onClick={() => setCloseModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Date de fin</label>
              <input
                type="date"
                value={closeModal.date}
                onChange={e => setCloseModal({ ...closeModal, date: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Statut après retour</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
                  { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
                  { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
                  { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
                ] as const).map(({ val, label, color }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCloseModal({ ...closeModal, playerStatus: val })}
                    style={{
                      padding: '8px',
                      borderRadius: 6,
                      border: `1px solid ${closeModal.playerStatus === val ? color : '#2A2F3A'}`,
                      backgroundColor: closeModal.playerStatus === val ? color + '18' : 'transparent',
                      color: closeModal.playerStatus === val ? color : '#94A3B8',
                      cursor: 'pointer', fontSize: '0.8rem',
                      fontWeight: closeModal.playerStatus === val ? 700 : 400,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCloseModal(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                Annuler
              </button>
              <button onClick={confirmClose} disabled={closeSaving || !closeModal.date} style={{ flex: 2, padding: '10px', borderRadius: 6, border: 'none', backgroundColor: closeSaving || !closeModal.date ? '#1E2229' : '#00E5A0', color: closeSaving || !closeModal.date ? '#475569' : '#0D0F14', cursor: closeSaving || !closeModal.date ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                {closeSaving ? 'Clôture…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <style>{`
            @media (max-width: 539px) {
              .med-form-player-date { grid-template-columns: 1fr !important; }
              .med-form-days-rtp    { grid-template-columns: 1fr !important; }
            }
          `}</style>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div className="px-4 sm:px-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {editingRecord ? 'Modifier l\'entrée médicale' : 'Nouvelle entrée médicale'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Type selector */}
            <div className="px-4 sm:px-6" style={{ paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {([
                  { t: 'injury'    as const, icon: '🔴', label: 'Blessure',    color: '#EF4444' },
                  { t: 'checkup'   as const, icon: '🩺', label: 'Bilan santé', color: '#3B82F6' },
                  { t: 'treatment' as const, icon: '💊', label: 'Traitement',  color: '#00E5A0' },
                ]).map(({ t, icon, label, color }) => (
                  <button key={t} type="button" onClick={() => setFormType(t)} style={{
                    padding: '12px 8px', borderRadius: 8,
                    border: `1px solid ${formType === t ? color : '#2A2F3A'}`,
                    cursor: 'pointer',
                    backgroundColor: formType === t ? color + '14' : 'transparent',
                    color: formType === t ? color : '#94A3B8',
                    fontSize: '0.8rem', fontWeight: formType === t ? 700 : 400,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <form className="px-4 sm:px-6" style={{ paddingTop: 18, paddingBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleSave}>

              {/* Joueur + Date */}
              <div className="med-form-player-date" style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Joueur</label>
                  <select value={fPlayerId} onChange={e => setFPlayerId(e.target.value)} style={inputStyle}>
                    {allPlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>
                  {formType === 'injury' ? 'Diagnostic *' : formType === 'checkup' ? 'Objet du bilan *' : 'Traitement *'}
                </label>
                <input
                  type="text" value={fDesc} onChange={e => setFDesc(e.target.value)} required
                  placeholder={
                    formType === 'injury'    ? 'Ex : Entorse cheville droite grade II' :
                    formType === 'checkup'   ? 'Ex : Bilan de mi-saison' :
                                              'Ex : Séance kiné — travail proprioception'
                  }
                  style={inputStyle}
                />
              </div>

              {/* Injury fields */}
              {formType === 'injury' && (
                <>
                  {/* Gravité */}
                  <div>
                    <label style={labelStyle}>Gravité</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([
                        { val: 'mild'     as const, label: 'Léger',  color: '#F59E0B' },
                        { val: 'moderate' as const, label: 'Modéré', color: '#fb923c' },
                        { val: 'severe'   as const, label: 'Grave',  color: '#EF4444' },
                      ]).map(({ val, label, color }) => (
                        <button type="button" key={val} onClick={() => setFSeverity(val)} style={{
                          flex: 1, padding: '9px 0',
                          borderRadius: 6, border: `1px solid ${fSeverity === val ? color : '#2A2F3A'}`,
                          backgroundColor: fSeverity === val ? color + '20' : 'transparent',
                          color: fSeverity === val ? color : '#475569',
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: fSeverity === val ? 700 : 400,
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Jours absence + Date de retour */}
                  <div className="med-form-days-rtp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Jours d'absence estimés</label>
                      <input
                        type="number" min="0" value={fDays}
                        onChange={e => {
                          setFDays(e.target.value);
                          if (e.target.value && fDate) {
                            const base = new Date(fDate + 'T00:00:00');
                            base.setDate(base.getDate() + Number(e.target.value));
                            setFRtpDate(base.toISOString().split('T')[0]);
                          }
                        }}
                        placeholder="0" style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Date de retour <span style={{ color: '#475569', fontWeight: 400 }}>— optionnel</span></label>
                      <input type="date" value={fRtpDate} onChange={e => setFRtpDate(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                </>
              )}

              {formType === 'treatment' && (
                <div>
                  <label style={labelStyle}>Date de fin <span style={{ color: '#475569', fontWeight: 400 }}>— optionnel</span></label>
                  <input type="date" value={fRtpDate} onChange={e => setFRtpDate(e.target.value)} style={inputStyle} />
                </div>
              )}

              {/* Notes / Traitement */}
              <div>
                <label style={labelStyle}>
                  {formType === 'injury' ? 'Traitement & protocole' : 'Notes'}
                </label>
                <textarea
                  value={fTreatment} onChange={e => setFTreatment(e.target.value)} rows={3}
                  placeholder={
                    formType === 'injury'    ? 'Ex : Glace 3×20min/j, repos strict 48h, rééducation kiné…' :
                    formType === 'checkup'   ? 'Observations, recommandations…' :
                                              'Détails du traitement, fréquence, observations…'
                  }
                  style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 76, fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>

              {/* Erreur */}
              {saveError && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
                  {saveError}
                </div>
              )}

              {/* Boutons */}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving || !fDesc} style={{
                  flex: 2, padding: '10px', borderRadius: 6, border: 'none',
                  backgroundColor: saving || !fDesc ? '#1E2229' : '#00E5A0',
                  color: saving || !fDesc ? '#475569' : '#0D0F14',
                  cursor: saving || !fDesc ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: '0.88rem',
                }}>
                  {saving ? 'Enregistrement…' : editingRecord ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
