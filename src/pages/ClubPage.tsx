import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Search, Users, X, AlertCircle, CheckCircle, Calendar, Save, Building2, Settings } from 'lucide-react';
import { teamsApi, playersApi, configApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { PlayerAvatar, StatusBadge } from '../components';
import type { Team, Player, Organization } from '../data/types';

const PRESET_COLORS = ['#3B82F6','#00E5A0','#F59E0B','#8B5CF6','#EF4444','#EC4899','#06B6D4','#F97316'];
const POSITIONS: Player['position'][] = ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

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
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input placeholder="Rechercher une équipe…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <button onClick={() => setShowForm(true)}
          style={{ marginLeft: 12, padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Plus size={14} /> Nouvelle équipe
        </button>
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
            <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
              {search ? 'Aucun résultat.' : 'Aucune équipe.'}
            </p>
          )}
          {filtered.map(team => (
            <div key={team.id}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: team.color + '22', border: `1px solid ${team.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Users size={16} style={{ color: team.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>{team.name}</div>
                <div style={{ color: '#475569', fontSize: '0.75rem' }}>{team.category}</div>
              </div>
              {team.currentSeason && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 4, color: '#00E5A0', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>
                  <CheckCircle size={10} /> {team.currentSeason}
                </span>
              )}
              <button onClick={() => navigate(`/teams/${team.id}`)}
                style={{ padding: '5px 12px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0 }}>
                Gérer
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: 28, width: '100%', maxWidth: 460 }}>
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
          </div>
        </div>
      )}
    </>
  );
}

// ── Onglet Joueurs ─────────────────────────────────────────────────────────────
const emptyPlayerForm = {
  firstName: '', lastName: '', number: '',
  position: 'Meneur' as Player['position'],
  birthDate: '', nationality: 'FR',
  hand: 'right' as Player['hand'],
  height: '', weight: '', contractEnd: '',
};

function PlayersTab() {
  const navigate = useNavigate();

  const [players,  setPlayers]  = useState<Player[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState('');
  const [search,   setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(emptyPlayerForm);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState('');

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

  return (
    <>
      <div className="flex flex-col md:flex-row" style={{ gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input placeholder="Rechercher un joueur…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
          <option value="all">Tous statuts</option>
          <option value="active">Actif</option>
          <option value="injured">Blessé</option>
          <option value="limited">Limité</option>
          <option value="suspended">Suspendu</option>
          <option value="unavailable">Indisponible</option>
        </select>
        <button onClick={() => setShowForm(true)}
          style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Plus size={14} /> Nouveau joueur
        </button>
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
        <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
          {search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {filtered.map(player => (
            <div key={player.id}
              onClick={() => navigate(`/players/${player.id}`, { state: { from: '/players' } })}
              style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A066')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}>
              <PlayerAvatar player={player} size={48} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>{player.lastName}</p>
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '2px 0' }}>{player.firstName}</p>
                <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>#{player.number} · {player.position.split(' ')[0]}</p>
              </div>
              <StatusBadge status={player.status} size="sm" />
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
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
          </div>
        </div>
      )}
    </>
  );
}

// ── Onglet Configuration club ──────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.75rem', fontWeight: 600,
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
    <div style={{ maxWidth: 720 }}>
      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '20px 24px' }}>
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
        {msg && <p style={{ color: msg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '4px 0 0' }}>{msg.text}</p>}
        <button onClick={save} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#00E5A0', color: '#0A0C10', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: 16 }}>
          <Save size={14} />{saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
const TABS = [
  { key: 'Informations', icon: Building2 },
  { key: 'Équipes',      icon: Users },
  { key: 'Joueurs',      icon: Calendar },
] as const;
type Tab = typeof TABS[number]['key'];

export default function ClubPage() {
  const { orgId, orgRole } = useTeamSeason();
  const [tab, setTab] = useState<Tab>('Informations');

  // null = rôle en cours de chargement → on bloque aussi (évite le flash de l'UI admin)
  if (orgRole !== 'admin') {
    return (
      <div className="p-4 md:p-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        {orgRole === null ? (
          <Spinner />
        ) : (
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Settings size={22} style={{ color: '#EF4444' }} />
            </div>
            <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Accès restreint</h2>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>La configuration du club est réservée aux administrateurs de l'organisation.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Club</h1>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2A2F3A' }}>
        {TABS.map(({ key, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer',
              color: tab === key ? '#00E5A0' : '#64748B',
              fontWeight: tab === key ? 700 : 400, fontSize: '0.88rem',
              borderBottom: tab === key ? '2px solid #00E5A0' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Icon size={13} />{key}
          </button>
        ))}
      </div>

      {tab === 'Informations' && <OrgConfigTab />}
      {tab === 'Équipes'      && <TeamsTab />}
      {tab === 'Joueurs'      && <PlayersTab />}
    </div>
  );
}
