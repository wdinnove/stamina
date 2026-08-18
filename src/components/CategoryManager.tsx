import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X, Tag } from 'lucide-react';
import { teamCategoriesApi, NEW_CATEGORY_PALETTE } from '../api/categories';
import { ConfigCard } from './ConfigCard';
import { AddButton } from './AddButton';
import type { CategoryScope, TeamCategory } from '../data/types';

/**
 * La carte de configuration des catégories d'une équipe, quelle que soit leur portée :
 * exercices, réunions, séances. Un seul écran, parce que c'est un seul objet — le nom, la
 * couleur et l'ordre se règlent de la même façon partout.
 *
 * `guardDelete` change ce qu'une suppression implique. Sans lui, la ligne qui utilisait la
 * catégorie devient simplement « sans catégorie » — c'est acceptable pour un exercice ou une
 * réunion. Pour une séance, la catégorie EST sa qualification : on refuse alors de supprimer
 * tant qu'elle sert, en disant combien de séances sont concernées.
 */

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

function iconBtnStyle(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, cursor: 'pointer', padding: 5, display: 'flex', flexShrink: 0 };
}

function CategoryRow({
  category, usedBy, usageNoun, onRenamed, onRemoved, onMove, canMoveUp, canMoveDown, moving,
}: {
  category: TeamCategory;
  /** Nombre de lignes qui s'en servent — `null` quand la portée n'est pas gardée. */
  usedBy: number | null;
  usageNoun: string;
  onRenamed: (c: TeamCategory) => void;
  onRemoved: (id: string) => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');

  const locked = usedBy !== null && usedBy > 0;

  function cancelEdit() {
    setEditing(false);
    setName(category.name);
    setColor(category.color);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) { cancelEdit(); return; }
    if (trimmed === category.name && color === category.color) { setEditing(false); return; }
    setSaving(true); setError('');
    try {
      const updated = await teamCategoriesApi.update(category.id, { name: trimmed, color });
      onRenamed(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally { setSaving(false); }
  }

  async function remove() {
    setRemoving(true); setError('');
    try {
      await teamCategoriesApi.remove(category.id);
      onRemoved(category.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setRemoving(false);
    }
  }

  if (confirmingDelete) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, marginBottom: 2 }}>
        <span style={{ color: '#F1F5F9', fontSize: '0.82rem' }}>Supprimer « {category.name} » ?</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setConfirmingDelete(false)}
            style={{ padding: '4px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.75rem' }}>
            Annuler
          </button>
          <button type="button" onClick={remove} disabled={removing}
            style={{ padding: '4px 10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 5, color: '#fff', cursor: removing ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
            {removing ? '…' : 'Oui'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <button type="button" onClick={() => onMove(-1)} disabled={!canMoveUp || moving} title="Monter"
            style={{ ...iconBtnStyle(canMoveUp ? '#94A3B8' : '#2A2F3A'), padding: 1, cursor: (!canMoveUp || moving) ? 'not-allowed' : 'pointer' }}>
            <ChevronUp size={13} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={!canMoveDown || moving} title="Descendre"
            style={{ ...iconBtnStyle(canMoveDown ? '#94A3B8' : '#2A2F3A'), padding: 1, cursor: (!canMoveDown || moving) ? 'not-allowed' : 'pointer' }}>
            <ChevronDown size={13} />
          </button>
        </div>
        {editing ? (
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            style={{ width: 26, height: 26, border: '1px solid #2A2F3A', borderRadius: 6, padding: 1, backgroundColor: '#1E2229', cursor: 'pointer', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: category.color, flexShrink: 0 }} />
        )}
        {editing ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancelEdit(); }}
            style={{ ...inputStyle, flex: 1, padding: '5px 8px' }} />
        ) : (
          <span style={{ flex: 1, color: '#F1F5F9', fontSize: '0.85rem' }}>{category.name}</span>
        )}
        {!editing && usedBy !== null && usedBy > 0 && (
          <span style={{ color: '#475569', fontSize: '0.72rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {usedBy} {usageNoun}{usedBy > 1 ? 's' : ''}
          </span>
        )}
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={saving} title="Enregistrer" style={iconBtnStyle('#00E5A0')}><Check size={14} /></button>
            <button type="button" onClick={cancelEdit} title="Annuler" style={iconBtnStyle('#94A3B8')}><X size={14} /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} title="Renommer" style={iconBtnStyle('#94A3B8')}><Pencil size={13} /></button>
            <button type="button" onClick={() => setConfirmingDelete(true)} disabled={locked}
              title={locked ? `Utilisée : renommez-la plutôt, ou déplacez les ${usageNoun}s concernées` : 'Supprimer'}
              style={{ ...iconBtnStyle(locked ? '#2A2F3A' : '#EF4444'), cursor: locked ? 'not-allowed' : 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: '0.72rem', margin: '0 0 4px 20px' }}>{error}</p>}
    </div>
  );
}

export function CategoryManager({ teamId, scope, title, description, guardDelete = false, usageNoun = 'séance' }: {
  teamId: string;
  scope: CategoryScope;
  title: string;
  description: React.ReactNode;
  guardDelete?: boolean;
  /** Ce qu'on compte quand `guardDelete` est actif — au singulier, le pluriel s'ajoute seul. */
  usageNoun?: string;
}) {
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [usage,      setUsage]      = useState<Record<string, number>>({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [newName,    setNewName]    = useState('');
  const [newColor,   setNewColor]   = useState(NEW_CATEGORY_PALETTE[0]);
  const [adding,     setAdding]     = useState(false);
  const [addError,   setAddError]   = useState('');
  const [moving,     setMoving]     = useState(false);

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      teamCategoriesApi.list(teamId, scope),
      guardDelete ? teamCategoriesApi.usage(teamId, scope) : Promise.resolve({}),
    ])
      .then(([list, counts]) => { setCategories(list); setUsage(counts); })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [teamId, scope, guardDelete]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setAddError('Cette catégorie existe déjà.');
      return;
    }
    setAdding(true); setAddError('');
    try {
      const created = await teamCategoriesApi.create(teamId, scope, trimmed, newColor);
      setCategories(prev => [...prev, created]);
      setNewName('');
      setNewColor(NEW_CATEGORY_PALETTE[(categories.length + 1) % NEW_CATEGORY_PALETTE.length]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAdding(false);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const a = categories[index];
    const b = categories[targetIndex];
    const reordered = [...categories];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setCategories(reordered);
    setMoving(true);
    setError('');
    try {
      await Promise.all([
        teamCategoriesApi.update(a.id, { position: b.position }),
        teamCategoriesApi.update(b.id, { position: a.position }),
      ]);
      setCategories(prev => prev.map(c => {
        if (c.id === a.id) return { ...c, position: b.position };
        if (c.id === b.id) return { ...c, position: a.position };
        return c;
      }));
    } catch (e) {
      setCategories(categories);
      setError(e instanceof Error ? e.message : 'Erreur de réorganisation');
    } finally {
      setMoving(false);
    }
  }

  return (
    <ConfigCard icon={<Tag size={14} color="#00E5A0" />} title={title} description={description}>
      {loading && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>}
      {error && <p style={{ color: '#EF4444', fontSize: '0.82rem' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ marginBottom: 16 }}>
          {categories.map((c, i) => (
            <CategoryRow key={c.id} category={c}
              usedBy={guardDelete ? (usage[c.id] ?? 0) : null}
              usageNoun={usageNoun}
              onRenamed={updated => setCategories(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onRemoved={id => setCategories(prev => prev.filter(x => x.id !== id))}
              onMove={direction => move(i, direction)}
              canMoveUp={i > 0}
              canMoveDown={i < categories.length - 1}
              moving={moving}
            />
          ))}
          {categories.length === 0 && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Aucune catégorie.</p>}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, borderTop: '1px solid #2A2F3A', paddingTop: 16 }}>
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
          style={{ width: 36, height: 36, border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, backgroundColor: '#1E2229', cursor: 'pointer', flexShrink: 0 }} />
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nouvelle catégorie…" style={{ ...inputStyle, flex: 1 }} />
        <AddButton type="submit" label={adding ? 'Ajout…' : 'Ajouter une catégorie'} disabled={adding || !newName.trim()} />
      </form>
      {addError && <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{addError}</p>}
    </ConfigCard>
  );
}
