import { useState, useEffect } from 'react';
import { Plus, X, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from './RichTextEditor';
import { Card } from './Card';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { RpeKpiCard } from './RpeKpiCard';
import { EmptyState } from './EmptyState';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerSelect } from './PlayerSelect';
import { MedicalRecordDetailModal } from './MedicalRecordDetailModal';
import { playerStatusColor, playerStatusLabel } from './PlayerHero';
import { rtpDaysLeft, severityConfig, typeLabels } from './MedicalCard';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { MedicalRecord, Player, PlayerStatus } from '../data/types';

const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};

const TODAY = new Date().toISOString().split('T')[0];
const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };

interface TeamMedicalOverviewProps {
  /** Effectif de l'équipe/saison courante */
  players: Player[];
  onUpdated?: () => void;
  /** Bouton "Nouvelle entrée" — masqué sur Performance collective (consultation seule), visible sur la page Médicale */
  showAddButton?: boolean;
}

function daysBetween(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T00:00:00');
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

/**
 * Vue médicale équipe (KPIs saison + blessés actifs + répartition par gravité + joueurs les plus
 * touchés + récap saison filtrable) — bloc complet partagé entre l'onglet "Historique équipe" de la
 * page Médicale et l'onglet Médical de Performance collective, pour garantir un rendu identique.
 */
export function TeamMedicalOverview({ players, onUpdated, showAddButton = true }: TeamMedicalOverviewProps) {
  const navigate = useNavigate();
  const [activeInjuries, setActiveInjuries]     = useState<MedicalRecord[]>([]);
  const [seasonInjuries, setSeasonInjuries]     = useState<MedicalRecord[]>([]);
  const [seasonAllRecords, setSeasonAllRecords] = useState<MedicalRecord[]>([]);
  const [version, setVersion] = useState(0);

  const [recapSearch,       setRecapSearch]       = useState('');
  const [recapTypeFilter,   setRecapTypeFilter]   = useState('');
  const [recapPlayerFilter, setRecapPlayerFilter] = useState('');
  const [recapStatusFilter, setRecapStatusFilter] = useState('');
  const [recapSortKey, setRecapSortKey] = useState<'date' | 'player' | 'description' | 'type' | 'severity' | 'status'>('date');
  const [recapSortDir, setRecapSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailRecord, setDetailRecord] = useState<MedicalRecord | null>(null);

  const [closeModal, setCloseModal] = useState<{ recordId: string; playerId: string; date: string; playerStatus: 'active' | 'limited' | 'injured' | 'unavailable' } | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);

  const [showForm, setShowForm]           = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [formType, setFormType]           = useState<MedicalRecord['type']>('injury');
  const [fPlayerId, setFPlayerId]         = useState('');
  const [fDate, setFDate]                 = useState(TODAY);
  const [fDesc, setFDesc]                 = useState('');
  const [fSeverity, setFSeverity]         = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [fDays, setFDays]                 = useState('');
  const [fTreatment, setFTreatment]       = useState('');
  const [fRtpDate, setFRtpDate]           = useState('');
  const [fPlayerStatus, setFPlayerStatus] = useState<PlayerStatus>('injured');
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);

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

  const injuryDays = (r: MedicalRecord): number => r.rtpDate ? daysBetween(r.date, r.rtpDate) : 0;

  const seasonCount   = teamSeasonInjuries.length;
  const seasonDays    = teamSeasonInjuries.reduce((s, r) => s + injuryDays(r), 0);
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

  const openForm = (prePlayerId?: string) => {
    setEditingRecord(null);
    setFPlayerId(prePlayerId || players[0]?.id || '');
    setFDate(TODAY); setFDesc(''); setFSeverity('mild');
    setFDays(''); setFTreatment(''); setFRtpDate('');
    setFormType('injury');
    setFPlayerStatus('injured');
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
    setFDays('');
    setFTreatment(record.treatment ?? '');
    setFRtpDate(record.rtpDate ?? '');
    const currentPlayer = players.find(p => p.id === record.playerId);
    setFPlayerStatus(currentPlayer?.status ?? (record.type === 'injury' ? 'injured' : 'active'));
    setSaveError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fPlayerId || !fDesc) { setSaveError('Le joueur et la description sont requis.'); return; }
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
        const typeLabel = typeLabels[formType] ?? formType;
        const updPlayer = players.find(p => p.id === fPlayerId);
        const updName = updPlayer ? playerNameShort(updPlayer) : undefined;
        notifyOrg('medical_updated', `${typeLabel} modifié${updName ? ` — ${updName}` : ''}`, undefined, 'player', fPlayerId);
      } else {
        await medicalApi.create({ ...payload, status: 'active' });
        const typeLabel = typeLabels[formType] ?? formType;
        const player = players.find(p => p.id === fPlayerId);
        const playerName = player ? playerNameShort(player) : undefined;
        let notifBody: string | undefined;
        if (formType === 'injury') {
          const parts: string[] = [severityConfig[fSeverity].label];
          if (fDays) parts.push(`${fDays}j blessé`);
          if (fDesc) parts.push(fDesc);
          notifBody = parts.join(' · ');
        } else {
          notifBody = fDesc || undefined;
        }
        notifyOrg('medical_added', `${typeLabel}${playerName ? ` — ${playerName}` : ''}`, notifBody, 'player', fPlayerId);
      }
      if (formType === 'injury' || formType === 'treatment') {
        await playersApi.update(fPlayerId, { status: fPlayerStatus });
      }
      setShowForm(false);
      refresh();
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
      const { recordId, playerId } = closeModal;
      await medicalApi.update(recordId, { status: 'resolved', resolvedDate: closeModal.date });
      await playersApi.update(playerId, { status: closeModal.playerStatus });
      const player = players.find(p => p.id === playerId);
      const playerName = player ? playerNameShort(player) : undefined;
      notifyOrg('medical_resolved', `Blessure clôturée${playerName ? ` — ${playerName}` : ''}`, undefined, 'player', playerId);
      setCloseModal(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la clôture');
    } finally {
      setCloseSaving(false);
    }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {showAddButton && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => openForm()} style={{ padding: '6px 12px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <Plus size={14} /> Nouvelle entrée
          </button>
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
          accent={seasonDays > 0 ? '#3B82F6' : '#00E5A0'}
          label="Jours blessés"
          value={seasonDays > 0 ? `${seasonDays}j` : '—'}
          sub="cumulés saison"
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
            {players.map(p => <option key={p.id} value={p.id}>{playerNameFull(p)}</option>)}
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
                        <td style={{ padding: '8px 8px', color: r.status === 'resolved' ? '#475569' : '#F1F5F9', fontSize: '0.8rem', textDecoration: r.status === 'resolved' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          onCloseRecord={detailRecord.status === 'active' && detailRecord.type !== 'checkup'
            ? () => { const r = detailRecord; setDetailRecord(null); setCloseModal({ recordId: r.id, playerId: r.playerId, date: TODAY, playerStatus: 'active' }); }
            : undefined}
        />
      )}

      {/* ── CLOSE MODAL ── */}
      {closeModal && (
        <Modal onClose={() => setCloseModal(null)} maxWidth={360} zIndex={110} scrollOverlay={false} style={{ padding: '24px' }}>
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
        </Modal>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} maxWidth={560} maxHeight="85vh">
          <style>{`
            @media (max-width: 539px) {
              .med-form-player-date { grid-template-columns: 1fr !important; }
              .med-form-days-rtp    { grid-template-columns: 1fr !important; }
            }
          `}</style>

          <div className="px-4 sm:px-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {editingRecord ? 'Modifier l\'entrée médicale' : 'Nouvelle entrée médicale'}
            </h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
          </div>

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

            <div className="med-form-player-date" style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: 12 }}>
              <div>
                <label style={labelStyle}>Joueur</label>
                <PlayerSelect players={players} value={fPlayerId} onChange={setFPlayerId} style={{ minWidth: 0 }} />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle} />
              </div>
            </div>

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

            {formType === 'injury' && (
              <>
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

                <div className="med-form-days-rtp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Jours blessés (estimés)</label>
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
                    <input
                      type="date" value={fRtpDate}
                      onChange={e => {
                        setFRtpDate(e.target.value);
                        if (e.target.value && fDate) {
                          setFDays(String(daysBetween(fDate, e.target.value)));
                        }
                      }}
                      style={inputStyle}
                    />
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

            {(formType === 'injury' || formType === 'treatment') && (
              <div>
                <label style={labelStyle}>Statut du joueur</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {([
                    { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
                    { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
                    { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
                    { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
                  ] as const).map(({ val, label, color }) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFPlayerStatus(val)}
                      style={{
                        padding: '8px 0',
                        borderRadius: 6,
                        border: `1px solid ${fPlayerStatus === val ? color : '#2A2F3A'}`,
                        backgroundColor: fPlayerStatus === val ? color + '18' : 'transparent',
                        color: fPlayerStatus === val ? color : '#94A3B8',
                        cursor: 'pointer', fontSize: '0.78rem',
                        fontWeight: fPlayerStatus === val ? 700 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>
                {formType === 'injury' ? 'Traitement & protocole' : 'Notes'}
              </label>
              <RichTextEditor
                value={fTreatment}
                onChange={setFTreatment}
                placeholder={
                  formType === 'injury'  ? 'Ex : Glace 3×20min/j, repos strict 48h, rééducation kiné…' :
                  formType === 'checkup' ? 'Observations, recommandations…' :
                                          'Détails du traitement, fréquence, observations…'
                }
                minHeight={76}
              />
            </div>

            {saveError && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
                {saveError}
              </div>
            )}

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
        </Modal>
      )}
    </div>
  );
}
