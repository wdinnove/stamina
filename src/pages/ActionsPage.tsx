import { useState, useEffect } from 'react';
import { Plus, X, Clock, CheckCircle, Circle, AlertCircle, Search } from 'lucide-react';
import { actionsApi } from '../api/actions';
import { playersApi } from '../api/players';
import { staffApi }   from '../api/staff';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useLocation, useNavigate } from 'react-router';
import { categoryConfig, priorityConfig } from '../data/config';
import { PlayerAvatar } from '../components';
import type { Action, ActionStatus, ActionCategory, ActionPriority, Player, StaffMember } from '../data/types';

const TODAY = new Date().toISOString().slice(0, 10);
const _eow = new Date(TODAY);
_eow.setDate(_eow.getDate() + (7 - (_eow.getDay() || 7)));
const END_OF_WEEK = _eow.toISOString().slice(0, 10);

const emptyForm = {
  playerId:    '',
  title:       '',
  description: '',
  category:    'medical' as ActionCategory,
  priority:    'normal'  as ActionPriority,
  dueDate:     TODAY,
  assignedTo:  '',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

export default function ActionsPage() {
  const { selected } = useTeamSeason();
  const location = useLocation();
  const navigate = useNavigate();
  const locState = location.state as { playerId?: string; playerName?: string; from?: string } | null;

  const [acts,         setActs]         = useState<Action[]>([]);
  const [players,      setPlayers]      = useState<Player[]>([]);
  const [staff,        setStaff]        = useState<StaffMember[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState(emptyForm);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [staffError,   setStaffError]   = useState('');
  const [playerFilter,   setPlayerFilter]   = useState<string>(locState?.playerId ?? '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [search,         setSearch]         = useState('');

  useEffect(() => {
    Promise.all([actionsApi.list(), playersApi.list()])
      .then(([actions, ps]) => { setActs(actions); setPlayers(ps); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setStaffError('');
    staffApi.listByTeam(selected.team.id)
      .then(setStaff)
      .catch(err => { setStaffError(err?.message ?? String(err)); setStaff([]); });
  }, [selected?.team.id]);

  const getPlayer    = (id: string) => players.find(p => p.id === id);
  const getStaffName = (id: string) => {
    const s = staff.find(m => m.id === id);
    return s ? `${s.firstName} ${s.lastName}` : id;
  };

  const visibleActs = acts.filter(a => {
    if (playerFilter   && a.playerId !== playerFilter)    return false;
    if (categoryFilter && a.category !== categoryFilter)  return false;
    if (priorityFilter && a.priority !== priorityFilter)  return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !(a.description ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const thisWeek = visibleActs.filter(a => a.status !== 'done' && a.dueDate <= END_OF_WEEK);
  const later    = visibleActs.filter(a => a.status !== 'done' && a.dueDate > END_OF_WEEK);
  const done     = visibleActs.filter(a => a.status === 'done');
  const hasFilters = !!(playerFilter || categoryFilter || priorityFilter || search);

  async function toggleDone(id: string) {
    const action = acts.find(a => a.id === id);
    if (!action) return;
    const next: ActionStatus = action.status === 'done' ? 'todo' : 'done';
    const prev = action.status;
    setActs(as => as.map(a => a.id === id ? { ...a, status: next } : a));
    try {
      await actionsApi.update(id, { status: next });
    } catch {
      setActs(as => as.map(a => a.id === id ? { ...a, status: prev } : a));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.playerId || !form.title || !form.dueDate || !form.assignedTo) {
      setFormError('Joueur, titre, date et responsable sont obligatoires.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const created = await actionsApi.create({
        playerId:    form.playerId,
        title:       form.title,
        description: form.description || undefined,
        category:    form.category,
        priority:    form.priority,
        dueDate:     form.dueDate,
        assignedTo:  form.assignedTo,
        status:      'todo',
      });
      setActs(prev => [...prev, created].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
      setShowForm(false);
      setForm(emptyForm);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  const ActionCard = ({ action, showDate = true }: { action: Action; showDate?: boolean }) => {
    const player   = getPlayer(action.playerId);
    const catCfg   = categoryConfig[action.category];
    const priCfg   = priorityConfig[action.priority];
    const isOverdue = action.dueDate < TODAY && action.status !== 'done';
    const isDone    = action.status === 'done';

    return (
      <div style={{
        backgroundColor: '#161920',
        border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : '#2A2F3A'}`,
        borderRadius: 8, padding: '12px 14px',
        opacity: isDone ? 0.6 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button
            onClick={() => toggleDone(action.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDone ? '#00E5A0' : '#475569', padding: 0, marginTop: 2, flexShrink: 0 }}
          >
            {isDone ? <CheckCircle size={18} /> : <Circle size={18} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Ligne 1 : joueur + date */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
              {player && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <PlayerAvatar player={player} size={20} />
                  <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.lastName} {player.firstName[0]}.</span>
                </div>
              )}
              {showDate && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, color: isOverdue ? '#EF4444' : action.dueDate === TODAY ? '#F59E0B' : '#94A3B8', fontSize: '0.72rem', fontWeight: isOverdue ? 700 : 400 }}>
                  <Clock size={11} />
                  {isOverdue
                    ? `Échue J-${Math.abs(Math.ceil((new Date(action.dueDate).getTime() - new Date(TODAY).getTime()) / 86400000))}`
                    : action.dueDate === TODAY ? 'Aujourd\'hui'
                    : action.dueDate.slice(5).replace('-', '/')}
                </span>
              )}
            </div>
            {/* Ligne 2 : titre */}
            <p style={{ color: isDone ? '#475569' : '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 4px', textDecoration: isDone ? 'line-through' : 'none' }}>
              {action.title}
            </p>
            {action.description && (
              <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 6px' }}>{action.description}</p>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: catCfg.color, fontSize: '0.7rem', backgroundColor: catCfg.color + '18', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>
                {catCfg.label}
              </span>
              <span style={{ color: priCfg.color, fontSize: '0.7rem', fontWeight: 600 }}>
                {priCfg.label}
              </span>
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>Assigné : {getStaffName(action.assignedTo)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>
          <span className="hidden sm:inline">Actions  </span>
          <span className="sm:hidden">Actions</span>
        </h1>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <Plus size={16} /><span className="hidden sm:inline">Nouvelle action</span>
        </button>
      </div>

      <style>{`@media (max-width: 639px) { .act-filters { flex-direction: column !important; } .act-filters > * { flex: none !important; width: 100% !important; } }`}</style>
      <div className="act-filters" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 10px 8px 30px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ position: 'relative', flex: '0 1 160px' }}>
          <select value={playerFilter} onChange={e => setPlayerFilter(e.target.value)}
            style={{ width: '100%', padding: playerFilter ? '8px 28px 8px 10px' : '8px 10px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: playerFilter ? '#F1F5F9' : '#475569', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">Tous les joueurs</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.lastName} {p.firstName[0]}.</option>)}
          </select>
          {playerFilter && <button onClick={() => setPlayerFilter('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, display: 'flex', lineHeight: 1 }}><X size={11} /></button>}
        </div>
        <div style={{ position: 'relative', flex: '0 1 140px' }}>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            style={{ width: '100%', padding: categoryFilter ? '8px 28px 8px 10px' : '8px 10px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: categoryFilter ? '#F1F5F9' : '#475569', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">Toutes catégories</option>
            {Object.entries(categoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {categoryFilter && <button onClick={() => setCategoryFilter('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, display: 'flex', lineHeight: 1 }}><X size={11} /></button>}
        </div>
        <div style={{ position: 'relative', flex: '0 1 140px' }}>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            style={{ width: '100%', padding: priorityFilter ? '8px 28px 8px 10px' : '8px 10px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: priorityFilter ? '#F1F5F9' : '#475569', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
            <option value="">Toutes priorités</option>
            {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {priorityFilter && <button onClick={() => setPriorityFilter('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, display: 'flex', lineHeight: 1 }}><X size={11} /></button>}
        </div>
      </div>

      {locState?.from && playerFilter === locState.playerId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button onClick={() => navigate(locState.from!)}
            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.78rem', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Retour au profil
          </button>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, alignItems: 'start' }}>
          <div style={{ backgroundColor: '#0F1117', border: '1px solid #1E2229', borderRadius: 10, padding: '14px 14px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: '0.88rem' }}>Cette semaine</span>
              <span style={{ backgroundColor: '#F59E0B22', color: '#F59E0B', borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{thisWeek.length}</span>
            </div>
            {thisWeek.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action cette semaine.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{thisWeek.map(a => <ActionCard key={a.id} action={a} />)}</div>
            }
          </div>

          <div style={{ backgroundColor: '#0F1117', border: '1px solid #1E2229', borderRadius: 10, padding: '14px 14px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: '#3B82F6', fontWeight: 700, fontSize: '0.88rem' }}>Plus tard</span>
              <span style={{ backgroundColor: '#3B82F622', color: '#3B82F6', borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{later.length}</span>
            </div>
            {later.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action à venir.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{later.map(a => <ActionCard key={a.id} action={a} />)}</div>
            }
          </div>

          <div style={{ backgroundColor: '#0F1117', border: '1px solid #1E2229', borderRadius: 10, padding: '14px 14px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ color: '#475569', fontWeight: 700, fontSize: '0.88rem' }}>Historique</span>
              <span style={{ backgroundColor: '#47556922', color: '#475569', borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{done.length}</span>
            </div>
            {done.length === 0
              ? <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action terminée.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{done.map(a => <ActionCard key={a.id} action={a} />)}</div>
            }
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <style>{`
            @media (max-width: 539px) {
              .act-form-2col { grid-template-columns: 1fr !important; }
            }
          `}</style>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="px-4 sm:px-7" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 16, borderBottom: '1px solid #2A2F3A' }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Nouvelle action</h2>
              <button onClick={() => { setShowForm(false); setFormError(''); setForm(emptyForm); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

            <form className="px-4 sm:px-7" style={{ paddingTop: 18, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleSubmit}>

              {formError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px' }}>
                  <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
                </div>
              )}

              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Joueur concerné *</label>
                <select required value={form.playerId} onChange={e => setForm(f => ({ ...f, playerId: e.target.value }))} style={inputStyle}>
                  <option value="">Sélectionner un joueur…</option>
                  {players.map(p => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Titre de l'action *</label>
                <input type="text" required placeholder="Ex : Séance kiné matin" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} />
              </div>
              <div className="act-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Catégorie</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ActionCategory }))} style={inputStyle}>
                    {Object.entries(categoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Priorité</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ActionPriority }))} style={inputStyle}>
                    {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="act-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date limite *</label>
                  <input type="date" required value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Assigné à *</label>
                  <select required value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} style={inputStyle}>
                    <option value="">Sélectionner un membre…</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.role}</option>)}
                  </select>
                  {staffError && <p style={{ color: '#EF4444', fontSize: '0.7rem', margin: '4px 0 0' }}>{staffError}</p>}
                  {!staffError && staff.length === 0 && !selected && <p style={{ color: '#F59E0B', fontSize: '0.7rem', margin: '4px 0 0' }}>Sélectionnez d'abord une équipe.</p>}
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Description / Consigne</label>
                <textarea placeholder="Description détaillée de l'action..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => { setShowForm(false); setFormError(''); setForm(emptyForm); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.88rem' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
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
