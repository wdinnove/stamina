import { useState, useEffect } from 'react';
import { Plus, X, AlertCircle, Pencil } from 'lucide-react';
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

type Tab = 'infirmary' | 'record';

const TAB_SLUGS: Record<string, Tab> = {
  infirmary: 'infirmary',
  record:    'record',
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
    else if (t === 'record') {
      const pid = allPlayers[0]?.id ?? '';
      navigate(pid ? `/medical/record/${pid}` : '/medical/record', { replace: true });
    }
  };

  const setSelectedPlayerId = (id: string) => navigate(`/medical/record/${id}`, { replace: true });

  const [teamPlayers, setTeamPlayers]       = useState<Player[]>([]);
  const [allPlayers, setAllPlayers]         = useState<Player[]>([]);
  const [activeInjuries, setActiveInjuries] = useState<MedicalRecord[]>([]);
  const [seasonInjuries, setSeasonInjuries] = useState<MedicalRecord[]>([]);
  const [playerRecords, setPlayerRecords]   = useState<MedicalRecord[]>([]);
  const [version, setVersion]               = useState(0);

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

  // Load records for selected player
  useEffect(() => {
    if (!selectedPlayerId) return;
    medicalApi.getByPlayer(selectedPlayerId).then(setPlayerRecords);
  }, [selectedPlayerId, version]);

  const teamPlayerIds      = new Set(teamPlayers.map(p => p.id));
  const teamInjuries       = activeInjuries.filter(r => teamPlayerIds.has(r.playerId));
  const teamSeasonInjuries = seasonInjuries.filter(r => teamPlayerIds.has(r.playerId));
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
      <div style={{ padding: 24 }}>
        <p style={{ color: '#94A3B8' }}>Sélectionnez une équipe pour accéder au suivi médical.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Suivi Médical</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {(['infirmary', 'record'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: activeTab === tab ? '#1E2229' : 'transparent', color: activeTab === tab ? '#F1F5F9' : '#94A3B8' }}>
              {tab === 'infirmary' ? 'Infirmerie' : 'Dossier joueur'}
            </button>
          ))}
        </div>
      </div>

      {/* ── INFIRMARY TAB ── */}
      {activeTab === 'infirmary' && (
        <div>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ color: '#F1F5F9', margin: 0 }}>Blessés actuellement ({teamInjuries.length})</h3>
              <button onClick={() => openForm()} style={{ padding: '6px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={13} /> Nouvelle entrée
              </button>
            </div>

            {teamInjuries.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>Aucune blessure active</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {teamInjuries.map(record => {
                const player = playerById(record.playerId);
                if (!player) return null;
                const days = record.rtpDate ? rtpDaysLeft(record.rtpDate) : null;
                const sev  = record.severity ? severityConfig[record.severity] : null;
                return (
                  <div key={record.id} style={{ backgroundColor: '#1E2229', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PlayerAvatar player={player} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                          <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{player.firstName} {player.lastName}</span>
                          <StatusBadge status={player.status} size="sm" />
                          {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                        </div>
                        <p style={{ color: '#EF4444', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 2px' }}>🔴 {record.description}</p>
                        <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ color: days !== null && days <= 3 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {fmtDate(record.date)}{days !== null ? ` · RTP J+${days}` : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 5 }}>
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

          {/* Stats */}
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ color: '#F1F5F9', margin: 0 }}>Statistiques blessures (équipe)</h3>

            {/* En cours */}
            <div>
              <p style={{ color: '#EF4444', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px', fontWeight: 600 }}>En cours</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Blessés actives',  value: String(activeCount),                          color: '#EF4444' },
                  { label: 'Jours d\'absence',  value: activeDays  > 0 ? activeDays  + 'j' : '—',   color: '#F59E0B' },
                  { label: 'Joueurs touchés', value: String(activePlayers),                         color: '#3B82F6' },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: '12px 14px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `3px solid ${stat.color}` }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 5px' }}>{stat.label}</p>
                    <p style={{ color: '#F1F5F9', fontSize: '1.1rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #2A2F3A' }} />

            {/* Saison */}
            <div>
              <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px', fontWeight: 600 }}>Sur la saison</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total blessures',   value: String(seasonCount),                          color: '#475569' },
                  { label: 'Jours d\'absence',  value: seasonDays  > 0 ? seasonDays  + 'j' : '—',   color: '#475569' },
                  { label: 'Joueurs touchés', value: String(seasonPlayers),                         color: '#475569' },
                ].map(stat => (
                  <div key={stat.label} style={{ padding: '12px 14px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `3px solid ${stat.color}` }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 5px' }}>{stat.label}</p>
                    <p style={{ color: '#F1F5F9', fontSize: '1.1rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECORD TAB ── */}
      {activeTab === 'record' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              style={{ padding: '8px 14px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none' }}
            >
              {allPlayers.map(p => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </select>
            <button onClick={() => openForm(selectedPlayerId)} style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Nouvelle entrée
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: color + '20', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>
                            {typeIcons[record.type]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{record.description}</span>
                              {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                            </div>
                            <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            <span style={{ color: days !== null && days <= 3 ? '#00E5A0' : '#F59E0B', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {fmtDate(record.date)}{days !== null ? ` · ${rtpLabel} J+${days}` : ''}
                            </span>
                            <div style={{ display: 'flex', gap: 5 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: color + '20', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>
                            {typeIcons[record.type]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem' }}>{record.description}</span>
                              {sev && <span style={{ color: sev.color, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '1px 5px', borderRadius: 3 }}>{sev.label}</span>}
                            </div>
                            <p style={{ color: record.treatment ? '#CBD5E1' : '#475569', fontSize: '0.8rem', margin: 0 }}>💊 {record.treatment || '—'}</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            <span style={{ color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {fmtDate(record.date)}{totalDays !== null && totalDays > 0 ? ` · ${totalDays}j` : ''}
                            </span>
                            <button onClick={() => openEdit(record)} style={{ padding: '3px 9px', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 3 }}>
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
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {editingRecord ? 'Modifier l\'entrée médicale' : 'Nouvelle entrée médicale'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            {/* Type selector */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
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

            <form style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleSave}>

              {/* Joueur + Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: 12 }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
