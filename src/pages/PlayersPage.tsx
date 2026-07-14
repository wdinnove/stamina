import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, X, AlertCircle, Edit,
} from 'lucide-react';
import { playersApi, rpeApi, wellnessApi, statsApi } from '../api';
import { StatusBadge, PlayerAvatar, PlayerHero, EmptyState, PlayerDynStatTab, useDateRange, Modal, PlayerStatsPanel } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Player, RPEEntry, WellnessEntry, MatchStat } from '../data/types';

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
  const [seasonGroupedStats, setSeasonGroupedStats] = useState<{ seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] }[]>([]);

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
  // Fetch systématiquement la superset (toutes équipes) dès que la saison est multi-équipes,
  // afin que teamStatsMap contienne les entrées nécessaires quel que soit l'état du toggle
  // "Toutes les équipes" (désormais interne à PlayerStatsPanel, donc invisible ici).
  const effectiveMatchStats = multiTeamSeason ? combinedSeasonStats : matchStats;

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
      {playerTab === 'performance' && (
        <PlayerStatsPanel
          key={`${playerId}-${selected?.season.id ?? ''}`}
          perfRange={perfRange}
          seasonStartDate={selected?.season.startDate}
          seasonEndDate={selected?.season.endDate}
          seasonGroupedStats={seasonGroupedStats}
          matchStats={matchStats}
          multiTeamSeason={multiTeamSeason}
          combinedSeasonStats={combinedSeasonStats}
          teamStatsMap={teamStatsMap}
          statThresholds={statThresholds}
        />
      )}

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
