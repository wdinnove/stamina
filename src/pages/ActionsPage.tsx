import { useState, useEffect } from 'react';
import { Plus, X, Clock, CheckCircle, Circle, AlertCircle } from 'lucide-react';
import { actionsApi } from '../api/actions';
import { playersApi } from '../api/players';
import { categoryConfig, priorityConfig } from '../data/config';
import { PlayerAvatar } from '../components';
import type { Action, ActionStatus, ActionCategory, ActionPriority, Player } from '../data/types';

const TODAY = new Date().toISOString().slice(0, 10);

type View = 'list' | 'kanban';

const statusColumns: { key: ActionStatus; label: string; color: string }[] = [
  { key: 'todo',        label: 'À faire',    color: '#94A3B8' },
  { key: 'in_progress', label: 'En cours',   color: '#3B82F6' },
  { key: 'waiting',     label: 'En attente', color: '#F59E0B' },
  { key: 'done',        label: 'Terminé ✅', color: '#00E5A0' },
];

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
  const [view,       setView]       = useState<View>('list');
  const [acts,       setActs]       = useState<Action[]>([]);
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(emptyForm);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  useEffect(() => {
    Promise.all([actionsApi.list(), playersApi.list()])
      .then(([actions, ps]) => { setActs(actions); setPlayers(ps); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getPlayer = (id: string) => players.find(p => p.id === id);

  const overdue  = acts.filter(a => a.status !== 'done' && a.dueDate < TODAY);
  const todayActs = acts.filter(a => a.status !== 'done' && a.dueDate === TODAY);
  const upcoming = acts.filter(a => a.status !== 'done' && a.dueDate > TODAY);
  const done     = acts.filter(a => a.status === 'done');

  async function markDone(id: string) {
    setActs(prev => prev.map(a => a.id === id ? { ...a, status: 'done' as ActionStatus } : a));
    try {
      await actionsApi.update(id, { status: 'done' });
    } catch {
      setActs(prev => prev.map(a => a.id === id ? { ...a, status: 'todo' as ActionStatus } : a));
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
            onClick={() => markDone(action.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDone ? '#00E5A0' : '#475569', padding: 0, marginTop: 2, flexShrink: 0 }}
          >
            {isDone ? <CheckCircle size={18} /> : <Circle size={18} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              {player && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PlayerAvatar player={player} size={20} />
                  <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600 }}>{player.lastName} {player.firstName[0]}.</span>
                </div>
              )}
              <span style={{ color: '#2A2F3A' }}>—</span>
              <span style={{ color: isDone ? '#475569' : '#F1F5F9', fontSize: '0.85rem', fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none' }}>
                {action.title}
              </span>
            </div>
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
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>Assigné : {action.assignedTo}</span>
            </div>
          </div>
          {showDate && (
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isOverdue ? '#EF4444' : action.dueDate === TODAY ? '#F59E0B' : '#94A3B8', fontSize: '0.75rem', fontWeight: isOverdue ? 700 : 400 }}>
                <Clock size={11} />
                {isOverdue
                  ? `Échue J-${Math.abs(Math.ceil((new Date(action.dueDate).getTime() - new Date(TODAY).getTime()) / 86400000))}`
                  : action.dueDate === TODAY ? 'Aujourd\'hui'
                  : action.dueDate.slice(5).replace('-', '/')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Section = ({ title, items, color }: { title: string; items: Action[]; color: string }) =>
    items.length > 0 ? (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ color, fontWeight: 700, fontSize: '0.88rem' }}>{title}</span>
          <span style={{ backgroundColor: color + '22', color, borderRadius: 10, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{items.length}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(a => <ActionCard key={a.id} action={a} />)}
        </div>
      </div>
    ) : null;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Actions à Réaliser</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
            {(['list', 'kanban'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: view === v ? '#1E2229' : 'transparent', color: view === v ? '#F1F5F9' : '#94A3B8' }}>
                {v === 'list' ? 'Liste' : 'Kanban'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Nouvelle action
          </button>
        </div>
      </div>

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
      ) : view === 'list' ? (
        <div>
          {acts.length === 0 && (
            <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>Aucune action. Créez-en une avec le bouton ci-dessus.</p>
          )}
          <Section title="En retard"     items={overdue}   color="#EF4444" />
          <Section title="Aujourd'hui"   items={todayActs} color="#F59E0B" />
          <Section title="À venir"       items={upcoming}  color="#3B82F6" />
          <Section title="Terminées"     items={done}      color="#00E5A0" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, overflowX: 'auto' }}>
          {statusColumns.map(col => {
            const colItems = acts.filter(a => a.status === col.key);
            return (
              <div key={col.key} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px', minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: col.color }} />
                  <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.85rem' }}>{col.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.75rem' }}>{colItems.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {colItems.map(action => {
                    const player = getPlayer(action.playerId);
                    const catCfg = categoryConfig[action.category];
                    const priCfg = priorityConfig[action.priority];
                    return (
                      <div key={action.id} style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px' }}>
                        {player && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <PlayerAvatar player={player} size={18} />
                            <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{player.lastName} {player.firstName[0]}.</span>
                          </div>
                        )}
                        <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, margin: '0 0 6px' }}>{action.title}</p>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <span style={{ color: catCfg.color, fontSize: '0.65rem', backgroundColor: catCfg.color + '18', padding: '1px 5px', borderRadius: 3 }}>{catCfg.label}</span>
                          <span style={{ color: priCfg.color, fontSize: '0.65rem', fontWeight: 600 }}>{priCfg.label}</span>
                        </div>
                        <p style={{ color: '#475569', fontSize: '0.68rem', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {action.dueDate.slice(5).replace('-', '/')}
                        </p>
                        {col.key !== 'done' && (
                          <button
                            onClick={() => markDone(action.id)}
                            style={{ marginTop: 6, width: '100%', padding: '4px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 4, color: '#475569', cursor: 'pointer', fontSize: '0.72rem' }}
                          >
                            Marquer fait
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {col.key === 'todo' && (
                    <button
                      onClick={() => setShowForm(true)}
                      style={{ padding: '8px', backgroundColor: 'transparent', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <Plus size={13} /> Ajouter
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0 }}>Nouvelle action</h2>
              <button onClick={() => { setShowForm(false); setFormError(''); setForm(emptyForm); }} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleSubmit}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date limite *</label>
                  <input type="date" required value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Assigné à *</label>
                  <input type="text" required placeholder="Nom du responsable" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Description / Consigne</label>
                <textarea placeholder="Description détaillée de l'action..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, resize: 'vertical', minHeight: 72, fontFamily: 'Inter, sans-serif' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => { setShowForm(false); setFormError(''); setForm(emptyForm); }} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>Annuler</button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
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
