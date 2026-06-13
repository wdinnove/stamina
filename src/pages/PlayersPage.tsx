import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Plus, Search, ArrowLeft, Activity, Heart,
  Stethoscope, CheckSquare, BarChart2, X, AlertCircle, Edit,
} from 'lucide-react';
import { playersApi } from '../api';
import { StatusBadge, PlayerAvatar } from '../components';
import { getPlayerRPE, getPlayerWellness, getPlayerMedical, getPlayerActions, formatDate, getAge } from '../data';
import type { Player } from '../data/types';

const POSITIONS: Player['position'][] = ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const flagEmoji: Record<string, string> = { FR: '🇫🇷', ES: '🇪🇸', CI: '🇨🇮', MA: '🇲🇦', IT: '🇮🇹' };

function PlayerProfile({ playerId }: { playerId: string }) {
  const navigate = useNavigate();
  const [player, setPlayer]     = useState<Player | null>(null);
  const [loadingP, setLoadingP] = useState(true);

  useEffect(() => {
    playersApi.getById(playerId).then(setPlayer).finally(() => setLoadingP(false));
  }, [playerId]);

  if (loadingP) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
        <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!player) return <div style={{ padding: 24, color: '#EF4444' }}>Joueur introuvable</div>;

  const rpe            = getPlayerRPE(playerId);
  const wellness       = getPlayerWellness(playerId);
  const medical        = getPlayerMedical(playerId);
  const actions        = getPlayerActions(playerId);
  const lastRPE        = rpe[0];
  const lastWellness   = wellness[0];
  const activeMedical  = medical.filter(m => m.status === 'active');
  const pendingActions = actions.filter(a => a.status !== 'done').length;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/players')}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <ArrowLeft size={16} /> Joueurs
        </button>
        <span style={{ color: '#2A2F3A' }}>|</span>
        <h2 style={{ color: '#F1F5F9', margin: 0 }}>{player.firstName} {player.lastName}</h2>
        <span style={{ color: '#475569', fontSize: '0.9rem' }}>#{player.number}</span>
        <div style={{ marginLeft: 'auto' }}>
          <button style={{ padding: '6px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Edit size={14} /> Modifier
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <PlayerAvatar player={player} size={72} />
          <StatusBadge status={player.status} />
        </div>
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              ['Nom',            `${player.lastName} ${player.firstName}`],
              ['Née le',         `${formatDate(player.birthDate)} (${getAge(player.birthDate)} ans)`],
              ['Nationalité',    `${flagEmoji[player.nationality] ?? ''} ${player.nationality}`],
              ['Poste',          player.position],
              ['Main forte',     player.hand === 'right' ? 'Droite' : player.hand === 'left' ? 'Gauche' : 'Les deux'],
              ['Taille / Poids', player.height && player.weight ? `${player.height} cm / ${player.weight} kg` : '—'],
              ['N° maillot',     `#${player.number}`],
              ['Fin contrat',    player.contractEnd ? formatDate(player.contractEnd) : '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ paddingBottom: 8, borderBottom: '1px solid #2A2F3A' }}>
                <p style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>{k}</p>
                <p style={{ color: '#F1F5F9', fontSize: '0.82rem', margin: 0 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Effort RPE', icon: Activity,   path: '/rpe'              },
          { label: 'Émotions',   icon: Heart,       path: '/wellness'         },
          { label: 'Médical',    icon: Stethoscope, path: '/medical'          },
          { label: 'Actions',    icon: CheckSquare, path: '/actions'          },
          { label: 'Stats',      icon: BarChart2,   path: `/stats/${playerId}` },
        ].map(({ label, icon: Icon, path }) => (
          <button key={label} onClick={() => navigate(path)}
            style={{ padding: '8px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#F1F5F9'; e.currentTarget.style.borderColor = '#00E5A0'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.borderColor = '#2A2F3A'; }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Dernière RPE</p>
          {lastRPE ? (
            <>
              <p style={{ color: '#F1F5F9', fontSize: '1.4rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{lastRPE.rpe}</p>
              <p style={{ color: '#475569', fontSize: '0.75rem', margin: '4px 0 0' }}>{formatDate(lastRPE.date)} · {lastRPE.duration} min</p>
            </>
          ) : <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune saisie</p>}
        </div>

        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Bien-être</p>
          {lastWellness ? (
            <>
              <p style={{ color: lastWellness.score < 5 ? '#EF4444' : lastWellness.score < 7 ? '#F59E0B' : '#00E5A0', fontSize: '1.4rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                {lastWellness.score}
              </p>
              <p style={{ color: '#475569', fontSize: '0.75rem', margin: '4px 0 0' }}>{formatDate(lastWellness.date)} · /10</p>
            </>
          ) : <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune saisie</p>}
        </div>

        <div style={{ backgroundColor: '#161920', border: `1px solid ${activeMedical.length > 0 ? 'rgba(239,68,68,0.3)' : '#2A2F3A'}`, borderRadius: 8, padding: '16px' }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Alerte médicale</p>
          {activeMedical.length > 0
            ? activeMedical.map(m => <p key={m.id} style={{ color: '#EF4444', fontSize: '0.82rem', margin: 0 }}>🔴 {m.description}</p>)
            : <p style={{ color: '#00E5A0', fontSize: '0.82rem', margin: 0 }}>✓ Aucune alerte active</p>}
        </div>

        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px' }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Actions en attente</p>
          <p style={{ color: pendingActions > 0 ? '#F59E0B' : '#00E5A0', fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{pendingActions}</p>
          <p style={{ color: '#475569', fontSize: '0.75rem', margin: '4px 0 0' }}>action{pendingActions > 1 ? 's' : ''} non réalisée{pendingActions > 1 ? 's' : ''}</p>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  firstName: '', lastName: '', number: '',
  position:  'Meneur' as Player['position'],
  birthDate: '', nationality: 'FR',
  hand:      'right' as Player['hand'],
  height: '', weight: '', contractEnd: '',
};

export default function PlayersPage() {
  const { id }   = useParams();
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
    if (id) return;
    setLoading(true);
    setFetchError('');
    playersApi.list()
      .then(setPlayers)
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (id) return <PlayerProfile playerId={id} />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const created = await playersApi.create({
        organizationId: '',   // overwritten by create() from profile
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
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Joueurs</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Nouvelle joueur
        </button>
      </div>

      {fetchError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{fetchError}</span>
        </div>
      )}

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            placeholder="Rechercher une joueur..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 32px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}>
          <option value="all">Tous statuts</option>
          <option value="active">Active</option>
          <option value="injured">Blessé</option>
          <option value="limited">Limité</option>
          <option value="suspended">Suspendu</option>
          <option value="unavailable">Indisponible</option>
        </select>
      </div>

      {/* Contenu */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
          {search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucune joueur dans cette organisation.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {filtered.map(player => (
            <div key={player.id} onClick={() => navigate(`/players/${player.id}`)}
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

      {/* Modal nouvelle joueur */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouvelle joueur</h2>
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
                  <input required type="number" min={0} max={99} value={form.number}
                    onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poste *</label>
                  <select required value={form.position}
                    onChange={e => setForm(f => ({ ...f, position: e.target.value as Player['position'] }))}
                    style={{ ...inputStyle, width: '100%' }}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Main forte</label>
                  <select value={form.hand}
                    onChange={e => setForm(f => ({ ...f, hand: e.target.value as Player['hand'] }))}
                    style={{ ...inputStyle, width: '100%' }}>
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
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
