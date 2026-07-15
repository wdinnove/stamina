import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Plus, Search, X, AlertCircle,
} from 'lucide-react';
import { playersApi } from '../api';
import { StatusBadge, PlayerAvatar, EmptyState, Modal } from '../components';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

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
                <p style={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.02em', margin: 0 }}>{playerNameFull(player)}</p>
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
