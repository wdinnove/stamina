import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, Users, X, AlertCircle, CheckCircle, Building2, Pencil, Trash2, Lock, UserCog } from 'lucide-react';
import { teamsApi, playersApi, configApi, teamRolesApi } from '../api';
import type { AssignableProfile } from '../api/teamRoles';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { PlayerAvatar, StatusBadge, EmptyState, ConfigCard, ConfigStack, ConfigAction, ConfigSaveAction, ConfigMessage, Modal, PlayerEditModal } from '../components';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { Team, Player, Organization, TeamRole, TeamRoleAssignment } from '../data/types';

const PRESET_COLORS = ['#3B82F6','#00E5A0','#F59E0B','#8B5CF6','#EF4444','#EC4899','#06B6D4','#F97316'];
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

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = { padding: '10px 14px', color: '#F1F5F9', fontSize: '0.85rem' };

// Colonnes partagées avec la table Effectif (ConfigPage.tsx) — mêmes largeurs, seule la colonne Actions diffère.
const PLAYER_TABLE_COL_WIDTHS = { player: '34%', position: '20%', number: '10%', status: '16%', actions: '20%' };

const spinStyle = `@keyframes spin { to { transform: rotate(360deg); } }`;

function Spinner() {
  return (
    <>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{spinStyle}</style>
    </>
  );
}

// ── Onglet Équipes ─────────────────────────────────────────────────────────────
function TeamsTab() {
  const navigate = useNavigate();
  const { reload: reloadCtx } = useTeamSeason();

  const [teams,     setTeams]     = useState<Team[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [fetchErr,  setFetchErr]  = useState('');
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ name: '', category: '', color: '#3B82F6' });
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  useEffect(() => {
    setLoading(true);
    teamsApi.list()
      .then(setTeams)
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = teams.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      const created = await teamsApi.create(form);
      setTeams(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      reloadCtx();
      setShowForm(false);
      setForm({ name: '', category: '', color: '#3B82F6' });
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfigCard
      icon={<Users size={14} color="#00E5A0" />}
      title="Équipes"
      action={
        <ConfigAction icon={<Plus size={14} />} onClick={() => setShowForm(true)} hideLabelOnMobile>
          Nouvelle équipe
        </ConfigAction>
      }>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
        <input placeholder="Rechercher une équipe…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 32 }} />
      </div>

      {fetchErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <AlertCircle size={13} style={{ color: '#EF4444' }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{fetchErr}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 && (
            <EmptyState message={search ? 'Aucun résultat.' : 'Aucune équipe.'} size="lg" />
          )}
          {filtered.map(team => (
            <div key={team.id}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: team.color + '22', border: `1px solid ${team.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Users size={16} style={{ color: team.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</div>
                <div style={{ color: '#475569', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.category}</div>
              </div>
              {team.currentSeason && (
                <span className="hidden sm:flex" style={{ alignItems: 'center', gap: 4, padding: '2px 8px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 4, color: '#00E5A0', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                  <CheckCircle size={10} /> {team.currentSeason}
                </span>
              )}
              <button onClick={() => navigate(`/equipes/${team.id}`)}
                style={{ padding: '5px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0 }}>
                Gérer
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal maxWidth={460} scrollOverlay={false} style={{ padding: 28 }} onClose={() => { setShowForm(false); setFormErr(''); }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouvelle équipe</h2>
            <button onClick={() => { setShowForm(false); setFormErr(''); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          {formErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              <AlertCircle size={13} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formErr}</span>
            </div>
          )}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Nom *</label>
              <input required placeholder="NF2 Féminine" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#94A3B8', display: 'block', marginBottom: 5, fontSize: '0.82rem' }}>Catégorie *</label>
              <input required placeholder="NF2, U21…" value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#94A3B8', display: 'block', marginBottom: 8, fontSize: '0.82rem' }}>Couleur</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: c, border: form.color === c ? '3px solid #F1F5F9' : '3px solid transparent', cursor: 'pointer', transition: 'all 0.12s' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => { setShowForm(false); setFormErr(''); }}
                style={{ flex: 1, padding: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: 10, backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {saving ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </ConfigCard>
  );
}

// ── Onglet Joueurs ─────────────────────────────────────────────────────────────
const emptyPlayerForm = {
  firstName: '', lastName: '', number: '',
  position: 'Meneur' as Player['position'],
  status: 'active' as Player['status'],
  birthDate: '', nationality: 'FR',
  hand: 'right' as Player['hand'],
  height: '', weight: '', contractEnd: '', email: '',
};

function PlayersTab() {
  const [players,  setPlayers]  = useState<Player[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const [search,   setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(emptyPlayerForm);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  const [deleting,      setDeleting]      = useState(false);
  const [deleteErr,     setDeleteErr]     = useState('');

  useEffect(() => {
    setLoading(true);
    playersApi.list()
      .then(setPlayers)
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = players.filter(p => {
    const nameMatch   = `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === 'all' || p.status === statusFilter;
    return nameMatch && statusMatch;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormErr('');
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
        email:       form.email       || undefined,
      });
      setPlayers(prev => [...prev, created].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setShowForm(false);
      setForm(emptyPlayerForm);
    } catch (err: unknown) {
      setFormErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  const closeForm = () => { setShowForm(false); setFormErr(''); setForm(emptyPlayerForm); };

  function handlePlayerSaved(updated: Player) {
    setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p).sort((a, b) => a.lastName.localeCompare(b.lastName)));
    setEditingPlayer(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleteErr('');
    setDeleting(true);
    try {
      await playersApi.delete(confirmDelete.id);
      setPlayers(prev => prev.filter(p => p.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err: unknown) {
      setDeleteErr(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ConfigCard
      icon={<Users size={14} color="#00E5A0" />}
      title="Joueurs"
      action={
        <ConfigAction icon={<Plus size={14} />} onClick={() => setShowForm(true)} hideLabelOnMobile>
          Nouveau joueur
        </ConfigAction>
      }>
      <div className="flex flex-col sm:flex-row" style={{ gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input placeholder="Rechercher un joueur…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full sm:w-auto"
          style={{ padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', minWidth: 140 }}>
          <option value="all">Tous statuts</option>
          <option value="active">Actif</option>
          <option value="injured">Blessé</option>
          <option value="limited">Limité</option>
          <option value="suspended">Suspendu</option>
          <option value="unavailable">Indisponible</option>
        </select>
      </div>

      {fetchErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <AlertCircle size={13} style={{ color: '#EF4444' }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{fetchErr}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur.'}
          size="lg"
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: PLAYER_TABLE_COL_WIDTHS.player }} />
              <col style={{ width: PLAYER_TABLE_COL_WIDTHS.position }} />
              <col style={{ width: PLAYER_TABLE_COL_WIDTHS.number }} />
              <col style={{ width: PLAYER_TABLE_COL_WIDTHS.status }} />
              <col style={{ width: PLAYER_TABLE_COL_WIDTHS.actions }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={thStyle}>Joueur</th>
                <th style={thStyle}>Poste</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>N°</th>
                <th style={thStyle}>Statut</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player, i) => (
                <tr key={player.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1E2229' : 'none' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PlayerAvatar player={player} size={30} />
                      <div style={{ fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(player)}</span><span className="md:hidden">{playerNameShort(player)}</span></div>
                    </div>
                  </td>
                  <td style={tdStyle}>{player.position}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>#{player.number}</td>
                  <td style={tdStyle}><StatusBadge status={player.status} size="sm" /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingPlayer(player)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>
                        <Pencil size={11} /> Modifier
                      </button>
                      <button onClick={() => { setConfirmDelete(player); setDeleteErr(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#EF4444', cursor: 'pointer', fontSize: '0.72rem' }}>
                        <Trash2 size={11} /> Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal maxWidth={520} style={{ padding: 28 }} onClose={closeForm}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouveau joueur</h2>
            <button onClick={closeForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          {formErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              <AlertCircle size={13} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formErr}</span>
            </div>
          )}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <input required type="number" min={0} max={99} value={form.number}
                  onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poste *</label>
                <select required value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value as Player['position'] }))}
                  style={{ ...inputStyle }}>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Main forte</label>
                <select value={form.hand}
                  onChange={e => setForm(f => ({ ...f, hand: e.target.value as Player['hand'] }))}
                  style={{ ...inputStyle }}>
                  <option value="right">Droite</option>
                  <option value="left">Gauche</option>
                  <option value="both">Les deux</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nationalité</label>
                <input maxLength={2} placeholder="FR" value={form.nationality}
                  onChange={e => setForm(f => ({ ...f, nationality: e.target.value.toUpperCase() }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Taille (cm)</label>
                <input type="number" min={140} max={230} value={form.height}
                  onChange={e => setForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poids (kg)</label>
                <input type="number" min={40} max={150} value={form.weight}
                  onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Fin de contrat</label>
              <input type="date" value={form.contractEnd}
                onChange={e => setForm(f => ({ ...f, contractEnd: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email du joueur</label>
              <input type="email" placeholder="joueur@example.com" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={closeForm}
                style={{ flex: 1, padding: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: 10, backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {saving ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingPlayer && (
        <PlayerEditModal player={editingPlayer} onClose={() => setEditingPlayer(null)} onSaved={handlePlayerSaved} />
      )}

      {confirmDelete && (
        <Modal maxWidth={400} zIndex={200} scrollOverlay={false} style={{ padding: 24 }} onClose={() => setConfirmDelete(null)}>
          <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Supprimer ce joueur ?</h2>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
            <strong style={{ color: '#F1F5F9' }}>{playerNameFull(confirmDelete)}</strong>
          </p>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 20px' }}>
            Ce joueur et toutes ses données associées (RPE, bien-être, médical…) seront définitivement supprimés.
          </p>
          {deleteErr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              <AlertCircle size={13} style={{ color: '#EF4444' }} />
              <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{deleteErr}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmDelete(null)} disabled={deleting}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
              Annuler
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </ConfigCard>
  );
}

// ── Onglet Rôles (superadmin uniquement) : assignation libre profil × équipe × rôle ──
const ROLE_LABELS: Record<TeamRole, string> = { admin: 'Admin', editor: 'Éditeur', viewer: 'Lecture seule' };

function RolesTab() {
  const { orgId } = useTeamSeason();
  const [teams,       setTeams]       = useState<Team[]>([]);
  const [profiles,    setProfiles]    = useState<AssignableProfile[]>([]);
  const [assignments, setAssignments] = useState<TeamRoleAssignment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [fetchErr,    setFetchErr]    = useState('');
  const [saving,      setSaving]      = useState(false);

  const [form, setForm] = useState({ teamId: '', profileId: '', role: 'editor' as TeamRole });

  function load() {
    if (!orgId) return;
    setLoading(true);
    Promise.all([teamsApi.list(), teamRolesApi.listAssignableProfiles(orgId), teamRolesApi.listByOrg(orgId)])
      .then(([t, p, a]) => { setTeams(t); setProfiles(p); setAssignments(a); })
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [orgId]);

  function profileLabel(id: string) {
    const p = profiles.find(pr => pr.id === id);
    return p ? `${p.firstName} ${p.lastName}` : '—';
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!form.teamId || !form.profileId) return;
    setSaving(true);
    setFetchErr('');
    try {
      await teamRolesApi.upsert(form.teamId, form.profileId, form.role);
      setForm(f => ({ ...f, profileId: '' }));
      load();
    } catch (err: unknown) {
      setFetchErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(a: TeamRoleAssignment, role: TeamRole) {
    try {
      await teamRolesApi.upsert(a.teamId, a.profileId, role);
      setAssignments(prev => prev.map(x => x.teamId === a.teamId && x.profileId === a.profileId ? { ...x, role } : x));
    } catch (err: unknown) {
      setFetchErr(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function handleRemove(a: TeamRoleAssignment) {
    try {
      await teamRolesApi.remove(a.teamId, a.profileId);
      setAssignments(prev => prev.filter(x => !(x.teamId === a.teamId && x.profileId === a.profileId)));
    } catch (err: unknown) {
      setFetchErr(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function handleToggleSuperadmin(p: AssignableProfile) {
    const next = p.orgRole === 'superadmin' ? 'member' : 'superadmin';
    try {
      await teamRolesApi.setOrgRole(p.id, next);
      setProfiles(prev => prev.map(x => x.id === p.id ? { ...x, orgRole: next } : x));
    } catch (err: unknown) {
      setFetchErr(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner /></div>;

  return (
    <ConfigStack>
      {fetchErr && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px' }}>
          <AlertCircle size={13} style={{ color: '#EF4444' }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{fetchErr}</span>
        </div>
      )}

      <ConfigCard
        icon={<UserCog size={14} color="#00E5A0" />}
        title="Superadmins"
        description="Accès total à l'organisation : configuration club, toutes les équipes, assignation des rôles.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {profiles.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6 }}>
              <span style={{ color: '#F1F5F9', fontSize: '0.85rem' }}>{p.firstName} {p.lastName}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.78rem', color: p.orgRole === 'superadmin' ? '#00E5A0' : '#64748B' }}>
                <input type="checkbox" checked={p.orgRole === 'superadmin'} onChange={() => handleToggleSuperadmin(p)} />
                Superadmin
              </label>
            </div>
          ))}
        </div>
      </ConfigCard>

      <ConfigCard
        icon={<Lock size={14} color="#00E5A0" />}
        title="Rôles par équipe"
        description="Tous les utilisateurs de l'organisation peuvent être assignés à n'importe quelle équipe.">
        <form onSubmit={handleAssign} className="flex flex-col sm:flex-row" style={{ gap: 8, marginBottom: 16 }}>
          <select required value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Équipe…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select required value={form.profileId} onChange={e => setForm(f => ({ ...f, profileId: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Utilisateur…</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
          </select>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamRole }))} style={{ ...inputStyle, flex: 1 }}>
            {(Object.keys(ROLE_LABELS) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button type="submit" disabled={saving}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
            <Plus size={14} />Assigner
          </button>
        </form>

        {assignments.length === 0 ? (
          <EmptyState message="Aucun rôle assigné." size="lg" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  <th style={thStyle}>Équipe</th>
                  <th style={thStyle}>Utilisateur</th>
                  <th style={thStyle}>Rôle</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {assignments.map(a => (
                  <tr key={`${a.teamId}-${a.profileId}`} style={{ borderBottom: '1px solid #1E2229' }}>
                    <td style={tdStyle}>{a.teamName ?? teams.find(t => t.id === a.teamId)?.name ?? '—'}</td>
                    <td style={tdStyle}>{a.firstName || a.lastName ? `${a.firstName} ${a.lastName}` : profileLabel(a.profileId)}</td>
                    <td style={tdStyle}>
                      <select value={a.role} onChange={e => handleRoleChange(a, e.target.value as TeamRole)} style={{ ...inputStyle, padding: '4px 8px', width: 'auto' }}>
                        {(Object.keys(ROLE_LABELS) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button onClick={() => handleRemove(a)} title="Retirer"
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ConfigCard>
    </ConfigStack>
  );
}

// ── Onglet Configuration club ──────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

function OrgConfigTab() {
  const [org,     setOrg]     = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ name: '', address: '', city: '', phone: '', email: '', website: '' });

  useEffect(() => {
    setLoading(true);
    configApi.getMyOrg().then(o => {
      if (o) {
        setOrg(o);
        setForm({ name: o.name ?? '', address: o.address ?? '', city: o.city ?? '', phone: o.phone ?? '', email: o.email ?? '', website: o.website ?? '' });
      }
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!org) return;
    setSaving(true);
    setMsg(null);
    try {
      await configApi.updateOrg(org.id, {
        name: form.name,
        address: form.address || undefined,
        city:    form.city    || undefined,
        phone:   form.phone   || undefined,
        email:   form.email   || undefined,
        website: form.website || undefined,
      });
      setMsg({ ok: true, text: 'Club mis à jour.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}><Spinner /></div>
  );

  return (
    <ConfigCard
      icon={<Building2 size={14} color="#00E5A0" />}
      title="Informations du club"
      action={<ConfigSaveAction loading={saving} onClick={save} />}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
          <div style={{ marginBottom: 14, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Nom du club</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mon Club" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Adresse</label>
            <input style={inputStyle} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="12 rue de la Paix" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Ville</label>
            <input style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Lyon" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Téléphone</label>
            <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+33 4 00 00 00 00" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Email</label>
            <input type="email" style={inputStyle} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@club.fr" />
          </div>
          <div style={{ marginBottom: 14, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Site web</label>
            <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://monclub.fr" />
          </div>
        </div>
        <ConfigMessage msg={msg} />
    </ConfigCard>
  );
}

// ── Sections club ──────────────────────────────────────────────────────────────
// La navigation (et le contrôle d'accès superadmin) vit dans ConfigurationPage :
// ici on ne fait que rendre la section demandée.
export const CLUB_SECTIONS = [
  { key: 'info',    label: 'Informations' },
  { key: 'teams',   label: 'Équipes' },
  { key: 'players', label: 'Joueurs' },
  { key: 'roles',   label: 'Rôles' },
] as const;

export type ClubSection = typeof CLUB_SECTIONS[number]['key'];

export function ClubConfigSection({ section }: { section: ClubSection }) {
  return (
    <>
      {section === 'info'    && <OrgConfigTab />}
      {section === 'teams'   && <TeamsTab />}
      {section === 'players' && <PlayersTab />}
      {section === 'roles'   && <RolesTab />}
    </>
  );
}
