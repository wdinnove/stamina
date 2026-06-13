import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Plus, Search, Users, Edit, X, AlertCircle, Calendar, CheckCircle } from 'lucide-react';
import { teamsApi, seasonsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Team, Season } from '../data/types';

const PRESET_COLORS = ['#3B82F6','#00E5A0','#F59E0B','#8B5CF6','#EF4444','#EC4899','#06B6D4','#F97316'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

export default function TeamsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { reload: reloadContext } = useTeamSeason();

  // ── liste des équipes ──────────────────────────────────────────
  const [teams, setTeams]               = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [fetchError, setFetchError]     = useState('');
  const [search, setSearch]             = useState('');

  // ── formulaire nouvelle équipe ─────────────────────────────────
  const [showTeamForm, setShowTeamForm]   = useState(false);
  const [teamForm, setTeamForm]           = useState({ name: '', category: '', color: '#3B82F6' });
  const [savingTeam, setSavingTeam]       = useState(false);
  const [teamFormError, setTeamFormError] = useState('');

  // ── formulaire édition équipe ──────────────────────────────────
  const [editingTeam, setEditingTeam]     = useState<Team | null>(null);
  const [editForm, setEditForm]           = useState({ name: '', category: '', color: '#3B82F6' });
  const [savingEdit, setSavingEdit]       = useState(false);
  const [editFormError, setEditFormError] = useState('');

  // ── vue détail ─────────────────────────────────────────────────
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // ── saisons ────────────────────────────────────────────────────
  const [seasons, setSeasons]               = useState<Season[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [seasonError, setSeasonError]       = useState('');
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonForm, setSeasonForm]         = useState({ label: '', startDate: '', endDate: '', totalGames: '' });
  const [savingSeason, setSavingSeason]     = useState(false);

  useEffect(() => {
    const initTeamId = (location.state as { teamId?: string } | null)?.teamId;
    teamsApi.list()
      .then(data => {
        setTeams(data);
        if (initTeamId) {
          const team = data.find(t => t.id === initTeamId);
          if (team) setSelectedTeam(team);
        }
      })
      .catch(err => setFetchError(err.message))
      .finally(() => setLoadingTeams(false));
  }, []);

  useEffect(() => {
    if (!selectedTeam) return;
    setLoadingSeasons(true);
    setSeasonError('');
    seasonsApi.listByTeam(selectedTeam.id)
      .then(setSeasons)
      .catch(err => setSeasonError(err.message))
      .finally(() => setLoadingSeasons(false));
  }, [selectedTeam]);

  const q = search.toLowerCase();
  const filtered = teams.filter(t => t.name.toLowerCase().includes(q));

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamFormError('');
    setSavingTeam(true);
    try {
      const created = await teamsApi.create({
        name:     teamForm.name,
        category: teamForm.category,
        color:    teamForm.color,
      });
      setTeams(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowTeamForm(false);
      setTeamForm({ name: '', category: '', color: '#3B82F6' });
    } catch (err: unknown) {
      setTeamFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSavingTeam(false);
    }
  };

  const handleSeasonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setSavingSeason(true);
    setSeasonError('');
    try {
      const created = await seasonsApi.create({
        teamId:     selectedTeam.id,
        label:      seasonForm.label,
        startDate:  seasonForm.startDate,
        endDate:    seasonForm.endDate,
        totalGames: seasonForm.totalGames ? parseInt(seasonForm.totalGames) : undefined,
        isCurrent:  seasons.length === 0,
      });
      setSeasons(prev => [created, ...prev]);
      reloadContext();
      setShowSeasonForm(false);
      setSeasonForm({ label: '', startDate: '', endDate: '', totalGames: '' });
    } catch (err: unknown) {
      setSeasonError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSavingSeason(false);
    }
  };

  const openEditForm = (team: Team) => {
    setEditingTeam(team);
    setEditForm({ name: team.name, category: team.category, color: team.color });
    setEditFormError('');
  };

  const closeEditForm = () => { setEditingTeam(null); setEditFormError(''); };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;
    setEditFormError('');
    setSavingEdit(true);
    try {
      await teamsApi.update(editingTeam.id, editForm);
      const updated: Team = { ...editingTeam, ...editForm };
      setTeams(prev => prev.map(t => t.id === editingTeam.id ? updated : t).sort((a, b) => a.name.localeCompare(b.name)));
      if (selectedTeam?.id === editingTeam.id) setSelectedTeam(updated);
      closeEditForm();
    } catch (err: unknown) {
      setEditFormError(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSetCurrent = async (season: Season) => {
    if (!selectedTeam || season.isCurrent) return;
    try {
      await seasonsApi.setCurrent(season.id, selectedTeam.id);
      setSeasons(prev => prev.map(s => ({ ...s, isCurrent: s.id === season.id })));
      setTeams(prev => prev.map(t => t.id === selectedTeam.id ? { ...t, currentSeason: season.label } : t));
      setSelectedTeam(t => t ? { ...t, currentSeason: season.label } : t);
    } catch (err: unknown) {
      setSeasonError(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  // ── vue détail ─────────────────────────────────────────────────
  if (selectedTeam) {
    return (
      <div style={{ padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSelectedTeam(null)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem' }}>
            ← Retour
          </button>
          <span style={{ color: '#2A2F3A' }}>|</span>
          <h2 style={{ color: '#F1F5F9', margin: 0 }}>{selectedTeam.name}</h2>
          {selectedTeam.currentSeason && (
            <span style={{ padding: '2px 8px', backgroundColor: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 4, color: '#00E5A0', fontSize: '0.72rem', fontWeight: 600 }}>
              {selectedTeam.currentSeason}
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => openEditForm(selectedTeam!)}
              style={{ padding: '6px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Edit size={14} /> Modifier
            </button>
          </div>
        </div>

        {/* Infos équipe */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
          <h4 style={{ color: '#94A3B8', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.06em', marginBottom: 12 }}>Infos équipe</h4>
          {([
            ['Nom',          selectedTeam.name],
            ['Catégorie',    selectedTeam.category],
            ['Organisation', selectedTeam.organizationName ?? '—'],
            ['Joueurs',     (selectedTeam.playerCount ?? 0).toString()],
            ['Créée le',     selectedTeam.createdAt ? new Date(selectedTeam.createdAt).toLocaleDateString('fr-FR') : '—'],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #2A2F3A' }}>
              <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>{k}</span>
              <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Saisons */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ color: '#F1F5F9', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: '#94A3B8' }} /> Saisons
            </h3>
            <button onClick={() => setShowSeasonForm(v => !v)}
              style={{ padding: '6px 12px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> Nouvelle saison
            </button>
          </div>

          {seasonError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <AlertCircle size={13} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{seasonError}</span>
            </div>
          )}

          {/* Formulaire nouvelle saison */}
          {showSeasonForm && (
            <form onSubmit={handleSeasonSubmit}
              style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.78rem' }}>Label *</label>
                  <input required placeholder="2025/2026" value={seasonForm.label}
                    onChange={e => setSeasonForm(f => ({ ...f, label: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.78rem' }}>Nb journées</label>
                  <input type="number" placeholder="26" value={seasonForm.totalGames}
                    onChange={e => setSeasonForm(f => ({ ...f, totalGames: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.78rem' }}>Date de début *</label>
                  <input required type="date" value={seasonForm.startDate}
                    onChange={e => setSeasonForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.78rem' }}>Date de fin *</label>
                  <input required type="date" value={seasonForm.endDate}
                    onChange={e => setSeasonForm(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowSeasonForm(false)}
                  style={{ padding: '7px 16px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Annuler
                </button>
                <button type="submit" disabled={savingSeason}
                  style={{ padding: '7px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                  {savingSeason ? 'Création...' : 'Créer'}
                </button>
              </div>
            </form>
          )}

          {/* Liste des saisons */}
          {loadingSeasons ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <div style={{ width: 20, height: 20, border: '2px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : seasons.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0, textAlign: 'center', padding: '16px 0' }}>
              Aucune saison créée.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {seasons.map(season => (
                <div key={season.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', backgroundColor: season.isCurrent ? 'rgba(0,229,160,0.06)' : '#1E2229', border: `1px solid ${season.isCurrent ? 'rgba(0,229,160,0.25)' : '#2A2F3A'}`, borderRadius: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>{season.label}</span>
                      {season.isCurrent && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#00E5A0', fontSize: '0.7rem', fontWeight: 600 }}>
                          <CheckCircle size={12} /> En cours
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: 2 }}>
                      {season.startDate} → {season.endDate}
                      {season.totalGames && ` · J${season.totalGames}`}
                    </div>
                  </div>
                  {!season.isCurrent && (
                    <button onClick={() => handleSetCurrent(season)}
                      style={{ padding: '4px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      Définir courante
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Roster */}
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ color: '#F1F5F9', margin: 0 }}>Roster</h3>
            <button onClick={() => navigate('/players')}
              style={{ padding: '6px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Migration joueurs à venir.</p>
        </div>

        {editingTeam && <EditTeamModal
          form={editForm} onChange={setEditForm} onSubmit={handleEditSubmit}
          onClose={closeEditForm} saving={savingEdit} error={editFormError}
          colors={PRESET_COLORS} inputStyle={inputStyle}
        />}
      </div>
    );
  }

  // ── vue liste ──────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Équipes</h1>
        <button onClick={() => setShowTeamForm(true)}
          style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Nouvelle équipe
        </button>
      </div>

      {fetchError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 20 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{fetchError}</span>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
        <input placeholder="Rechercher une équipe..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 10px 8px 32px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {loadingTeams ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 && !fetchError && (
            <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
              {search ? 'Aucun résultat.' : "Aucune équipe pour l'instant."}
            </p>
          )}
          {filtered.map(team => (
            <div key={team.id}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>

              {/* Couleur + nom équipe */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: team.color + '22', border: `1px solid ${team.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={18} style={{ color: team.color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.9rem' }}>{team.name}</span>
                  <span style={{ color: '#475569', fontSize: '0.8rem', marginLeft: 8 }}>{team.category}</span>
                </div>
              </div>

              {/* Saison courante */}
              {team.currentSeason && (
                <span style={{ padding: '1px 7px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 4, color: '#00E5A0', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                  {team.currentSeason}
                </span>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setSelectedTeam(team)}
                  style={{ padding: '5px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Voir
                </button>
                <button onClick={() => openEditForm(team)}
                  style={{ padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Edit size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingTeam && <EditTeamModal
        form={editForm} onChange={setEditForm} onSubmit={handleEditSubmit}
        onClose={closeEditForm} saving={savingEdit} error={editFormError}
        colors={PRESET_COLORS} inputStyle={inputStyle}
      />}

      {/* Modal nouvelle équipe */}
      {showTeamForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouvelle équipe</h2>
              <button onClick={() => { setShowTeamForm(false); setTeamFormError(''); }}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {teamFormError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{teamFormError}</span>
              </div>
            )}

            <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Nom de l'équipe *</label>
                <input required placeholder="Ex : NF2 Féminine" value={teamForm.name}
                  onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Catégorie *</label>
                <input required placeholder="NF2, U21, U18…" value={teamForm.category}
                  onChange={e => setTeamForm(f => ({ ...f, category: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', display: 'block', marginBottom: 8, fontSize: '0.82rem' }}>Couleur</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => setTeamForm(f => ({ ...f, color: c }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', backgroundColor: c,
                        border: teamForm.color === c ? `3px solid #F1F5F9` : '3px solid transparent',
                        cursor: 'pointer', boxShadow: teamForm.color === c ? `0 0 0 2px ${c}` : 'none',
                        transition: 'all 0.12s',
                      }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => { setShowTeamForm(false); setTeamFormError(''); }}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={savingTeam}
                  style={{ flex: 1, padding: '10px', backgroundColor: savingTeam ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: savingTeam ? '#475569' : '#0D0F14', cursor: savingTeam ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {savingTeam ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modale d'édition réutilisable ──────────────────────────────────────────
function EditTeamModal({ form, onChange, onSubmit, onClose, saving, error, colors, inputStyle }: {
  form: { name: string; category: string; color: string };
  onChange: React.Dispatch<React.SetStateAction<{ name: string; category: string; color: string }>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  error: string;
  colors: string[];
  inputStyle: React.CSSProperties;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#F1F5F9', margin: 0 }}>Modifier l'équipe</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Nom de l'équipe *</label>
            <input required value={form.name} onChange={e => onChange(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Catégorie *</label>
            <input required value={form.category} onChange={e => onChange(f => ({ ...f, category: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', display: 'block', marginBottom: 8, fontSize: '0.82rem' }}>Couleur</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {colors.map(c => (
                <button key={c} type="button" onClick={() => onChange(f => ({ ...f, color: c }))}
                  style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: c, border: form.color === c ? '3px solid #F1F5F9' : '3px solid transparent', cursor: 'pointer', boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none', transition: 'all 0.12s' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Annuler
            </button>
            <button type="submit" disabled={saving}
              style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
