import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Pencil, Check, X, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { tacticalConfigApi } from '../api/tacticalConfig';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { Card, CardTitle } from './Card';

function friendlyDeleteError(e: unknown, itemLabel: string): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes('foreign key') || message.includes('violates')) {
    return `Impossible de supprimer « ${itemLabel} » : des matchs importés l'utilisent. Renommez-la à la place.`;
  }
  return message;
}

function EditableLabel({ value, onSave, bold }: { value: string; onSave: (v: string) => void; bold?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#F1F5F9', fontWeight: bold ? 700 : 500, fontSize: bold ? '0.9rem' : '0.82rem' }}>{value}</span>
        <button onClick={() => { setDraft(value); setEditing(true); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
          <Pencil size={11} />
        </button>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        style={{ padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #00E5A040', borderRadius: 4, color: '#F1F5F9', fontSize: '0.82rem' }}
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', padding: 2 }}>
        <Check size={13} />
      </button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
        <X size={13} />
      </button>
    </span>
  );
}

function ReorderButtons({ onUp, onDown, canUp, canDown }: { onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <button onClick={onUp} disabled={!canUp} style={{ background: 'none', border: 'none', color: canUp ? '#94A3B8' : '#2A2F3A', cursor: canUp ? 'pointer' : 'default', padding: 2 }}>
        <ChevronUp size={13} />
      </button>
      <button onClick={onDown} disabled={!canDown} style={{ background: 'none', border: 'none', color: canDown ? '#94A3B8' : '#2A2F3A', cursor: canDown ? 'pointer' : 'default', padding: 2 }}>
        <ChevronDown size={13} />
      </button>
    </span>
  );
}

/** Icône supprimer avec confirmation inline auto-contenue — réutilisée pour catégorie/dimension. */
function ConfirmableDeleteButton({ onDelete, itemLabel }: { onDelete: () => void; itemLabel: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#EF4444', fontSize: '0.68rem' }}>Supprimer ?</span>
        <button onClick={() => { onDelete(); setConfirming(false); }} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 2, fontWeight: 700, fontSize: '0.72rem' }}>
          Oui
        </button>
        <button onClick={() => setConfirming(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}>
          <X size={12} />
        </button>
      </span>
    );
  }
  return (
    <button onClick={() => setConfirming(true)} title={`Supprimer ${itemLabel}`} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
      <Trash2 size={13} />
    </button>
  );
}

/** Champ + bouton "Ajouter" auto-contenu — réutilisé pour catégorie/dimension/option. */
function AddItemRow({ placeholder, onAdd }: { placeholder: string; onAdd: (label: string) => void }) {
  const [value, setValue] = useState('');

  function handleAdd() {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        placeholder={placeholder}
        style={{ padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, color: '#F1F5F9', fontSize: '0.76rem', flex: 1, maxWidth: 220 }}
      />
      <button onClick={handleAdd} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', padding: 2, fontSize: '0.76rem' }}>
        <Plus size={12} /> Ajouter
      </button>
    </div>
  );
}

const thresholdInputStyle: React.CSSProperties = {
  width: 56, padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 4, color: '#F1F5F9', fontSize: '0.76rem',
};

function ThresholdsEditor({ category, onSave }: {
  category: TacticalCategory;
  onSave: (t: { vert: number; bleu: number; ambre: number }) => void;
}) {
  const [vert, setVert] = useState(category.rentabiliteSeuilVert);
  const [bleu, setBleu] = useState(category.rentabiliteSeuilBleu);
  const [ambre, setAmbre] = useState(category.rentabiliteSeuilAmbre);

  useEffect(() => {
    setVert(category.rentabiliteSeuilVert);
    setBleu(category.rentabiliteSeuilBleu);
    setAmbre(category.rentabiliteSeuilAmbre);
  }, [category.id, category.rentabiliteSeuilVert, category.rentabiliteSeuilBleu, category.rentabiliteSeuilAmbre]);

  const commit = () => onSave({ vert, bleu, ambre });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: '#94A3B8', flexWrap: 'wrap' }}>
      <span>Seuils de rentabilité :</span>
      <span style={{ color: '#00E5A0' }}>Vert ≥</span>
      <input type="number" step="0.1" value={vert} onChange={e => setVert(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
      <span style={{ color: '#3B82F6' }}>Bleu ≥</span>
      <input type="number" step="0.1" value={bleu} onChange={e => setBleu(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
      <span style={{ color: '#F59E0B' }}>Ambre ≥</span>
      <input type="number" step="0.1" value={ambre} onChange={e => setAmbre(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
    </div>
  );
}

function OptionsEditor({ dimensionId, options, onAdd, onRename, onMove, onDelete }: {
  dimensionId: string;
  options: TacticalDimensionOption[];
  onAdd: (label: string) => void;
  onRename: (option: TacticalDimensionOption, label: string) => void;
  onMove: (siblings: TacticalDimensionOption[], index: number, direction: -1 | 1) => void;
  onDelete: (option: TacticalDimensionOption) => void;
}) {
  const sorted = options.filter(o => o.dimensionId === dimensionId).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ marginTop: 6, paddingLeft: 4 }}>
      <p style={{ color: '#334155', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
        Options attendues
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sorted.map((opt, i) => (
          <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <EditableLabel value={opt.label} onSave={label => onRename(opt, label)} />
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <ReorderButtons onUp={() => onMove(sorted, i, -1)} onDown={() => onMove(sorted, i, 1)} canUp={i > 0} canDown={i < sorted.length - 1} />
              <button onClick={() => onDelete(opt)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
                <X size={12} />
              </button>
            </span>
          </div>
        ))}
        {sorted.length === 0 && <span style={{ color: '#334155', fontSize: '0.74rem' }}>Aucune — toute valeur du CSV sera acceptée sans avertissement.</span>}
        <AddItemRow placeholder="Nouvelle option…" onAdd={onAdd} />
      </div>
    </div>
  );
}

/**
 * Gestion des catégories/dimensions tactiques d'une équipe — auto-créées à
 * l'import du CSV vidéo, cet écran permet de créer/renommer/réordonner/supprimer,
 * de régler les seuils de coloration de la rentabilité par catégorie, et de curer
 * le catalogue d'options attendues de chaque dimension (jamais auto-créé par
 * l'import — sert à faire apparaître des lignes à 0 et à détecter les valeurs
 * inattendues, sans jamais bloquer un import).
 */
export function TacticalConfigManager({ teamId }: { teamId: string }) {
  const [categories, setCategories] = useState<TacticalCategory[]>([]);
  const [dimensions, setDimensions] = useState<TacticalDimension[]>([]);
  const [options, setOptions] = useState<TacticalDimensionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError('');
    tacticalConfigApi.getForTeam(teamId)
      .then(({ categories, dimensions, options }) => { setCategories(categories); setDimensions(dimensions); setOptions(options); })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [teamId]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function reportError(e: unknown) {
    setError(e instanceof Error ? e.message : 'Erreur');
  }

  async function handleAddCategory(name: string) {
    setError('');
    try {
      const created = await tacticalConfigApi.createCategory(teamId, name, categories.length);
      setCategories(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  async function handleDeleteCategory(cat: TacticalCategory) {
    setError('');
    const prevCategories = categories;
    setCategories(prev => prev.filter(c => c.id !== cat.id));
    try {
      await tacticalConfigApi.deleteCategory(cat.id);
      setDimensions(prev => prev.filter(d => d.categoryId !== cat.id));
    } catch (e) {
      setCategories(prevCategories);
      setError(friendlyDeleteError(e, cat.name));
    }
  }

  async function handleRenameCategory(cat: TacticalCategory, name: string) {
    if (!name.trim() || name === cat.name) return;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name } : c));
    try { await tacticalConfigApi.renameCategory(cat.id, name); } catch (e) { reportError(e); }
  }

  async function handleMoveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const orderMap = new Map(reordered.map((c, i) => [c.id, i]));
    setCategories(prev => prev.map(c => orderMap.has(c.id) ? { ...c, sortOrder: orderMap.get(c.id)! } : c));
    try { await tacticalConfigApi.reorderCategories(reordered.map(c => c.id)); } catch (e) { reportError(e); }
  }

  async function handleThresholds(cat: TacticalCategory, t: { vert: number; bleu: number; ambre: number }) {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, rentabiliteSeuilVert: t.vert, rentabiliteSeuilBleu: t.bleu, rentabiliteSeuilAmbre: t.ambre } : c));
    try { await tacticalConfigApi.updateCategoryThresholds(cat.id, t); } catch (e) { reportError(e); }
  }

  async function handleColorChange(cat: TacticalCategory, color: string) {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, color } : c));
    try { await tacticalConfigApi.updateCategoryColor(cat.id, color); } catch (e) { reportError(e); }
  }

  async function handleAddDimension(categoryId: string, name: string) {
    setError('');
    const siblings = dimensions.filter(d => d.categoryId === categoryId);
    try {
      const created = await tacticalConfigApi.createDimension(teamId, categoryId, name, siblings.length);
      setDimensions(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  async function handleDeleteDimension(dim: TacticalDimension) {
    setError('');
    const prevDimensions = dimensions;
    setDimensions(prev => prev.filter(d => d.id !== dim.id));
    try {
      await tacticalConfigApi.deleteDimension(dim.id);
      setOptions(prev => prev.filter(o => o.dimensionId !== dim.id));
    } catch (e) {
      setDimensions(prevDimensions);
      setError(friendlyDeleteError(e, dim.name));
    }
  }

  async function handleRenameDimension(dim: TacticalDimension, name: string) {
    if (!name.trim() || name === dim.name) return;
    setDimensions(prev => prev.map(d => d.id === dim.id ? { ...d, name } : d));
    try { await tacticalConfigApi.renameDimension(dim.id, name); } catch (e) { reportError(e); }
  }

  async function handleMoveDimension(categoryId: string, siblings: TacticalDimension[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const orderMap = new Map(reordered.map((d, i) => [d.id, i]));
    setDimensions(prev => prev.map(d => orderMap.has(d.id) ? { ...d, sortOrder: orderMap.get(d.id)! } : d));
    try { await tacticalConfigApi.reorderDimensions(reordered.map(d => d.id)); } catch (e) { reportError(e); }
  }

  async function handleAddOption(dimensionId: string, label: string) {
    const siblings = options.filter(o => o.dimensionId === dimensionId);
    try {
      const created = await tacticalConfigApi.createOption(teamId, dimensionId, label, siblings.length);
      setOptions(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  async function handleRenameOption(option: TacticalDimensionOption, label: string) {
    if (!label.trim() || label === option.label) return;
    setOptions(prev => prev.map(o => o.id === option.id ? { ...o, label } : o));
    try { await tacticalConfigApi.renameOption(option.id, label); } catch (e) { reportError(e); }
  }

  async function handleMoveOption(siblings: TacticalDimensionOption[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const orderMap = new Map(reordered.map((o, i) => [o.id, i]));
    setOptions(prev => prev.map(o => orderMap.has(o.id) ? { ...o, sortOrder: orderMap.get(o.id)! } : o));
    try { await tacticalConfigApi.reorderOptions(reordered.map(o => o.id)); } catch (e) { reportError(e); }
  }

  async function handleDeleteOption(option: TacticalDimensionOption) {
    setOptions(prev => prev.filter(o => o.id !== option.id));
    try { await tacticalConfigApi.deleteOption(option.id); } catch (e) { reportError(e); }
  }

  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card style={{ padding: '20px 24px', borderRadius: 10, marginBottom: 20 }}>
      <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
        <CardTitle>Statistiques tactiques</CardTitle>
      </div>
      <p style={{ color: '#64748B', fontSize: '0.8rem', marginTop: 0, marginBottom: 16 }}>
        Catégories et dimensions sont créées automatiquement lors de l'import d'un CSV de match, mais peuvent aussi
        être ajoutées ici à la main — cet écran permet de créer/renommer/réordonner/supprimer, de régler les seuils
        de couleur de la rentabilité par catégorie, et de définir par dimension les options attendues (facultatif :
        sans catalogue, toute valeur du CSV est acceptée telle quelle).
      </p>

      {loading && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>}
      {error && (
        <p style={{ color: '#EF4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} />{error}
        </p>
      )}
      {!loading && sortedCategories.length === 0 && (
        <p style={{ color: '#475569', fontSize: '0.82rem' }}>
          Aucune catégorie tactique pour l'instant — importez un premier CSV de match, ou créez-en une ci-dessous.
        </p>
      )}

      {!loading && sortedCategories.map((cat, i) => {
        const catDimensions = dimensions.filter(d => d.categoryId === cat.id).sort((a, b) => a.sortOrder - b.sortOrder);
        const isOpen = expanded.has(cat.id);
        return (
          <div key={cat.id} style={{ border: '1px solid #2A2F3A', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: '#161920', flexWrap: 'wrap' }}>
              <button onClick={() => toggle(cat.id)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2 }}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <input type="color" value={cat.color} onChange={e => handleColorChange(cat, e.target.value)} title="Couleur de la catégorie"
                style={{ width: 22, height: 22, border: '1px solid #2A2F3A', borderRadius: 5, padding: 1, backgroundColor: '#1E2229', cursor: 'pointer', flexShrink: 0 }} />
              <EditableLabel value={cat.name} bold onSave={name => handleRenameCategory(cat, name)} />
              <span style={{ color: '#475569', fontSize: '0.72rem' }}>· {catDimensions.length} dimension{catDimensions.length > 1 ? 's' : ''}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ReorderButtons
                  onUp={() => handleMoveCategory(i, -1)} onDown={() => handleMoveCategory(i, 1)}
                  canUp={i > 0} canDown={i < sortedCategories.length - 1}
                />
                <ConfirmableDeleteButton onDelete={() => handleDeleteCategory(cat)} itemLabel={cat.name} />
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: '10px 12px 12px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <ThresholdsEditor category={cat} onSave={t => handleThresholds(cat, t)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {catDimensions.map((dim, di) => (
                    <div key={dim.id} style={{ borderTop: '1px solid rgba(42,47,58,0.6)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <EditableLabel value={dim.name} onSave={name => handleRenameDimension(dim, name)} />
                        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ReorderButtons
                            onUp={() => handleMoveDimension(cat.id, catDimensions, di, -1)}
                            onDown={() => handleMoveDimension(cat.id, catDimensions, di, 1)}
                            canUp={di > 0} canDown={di < catDimensions.length - 1}
                          />
                          <ConfirmableDeleteButton onDelete={() => handleDeleteDimension(dim)} itemLabel={dim.name} />
                        </span>
                      </div>
                      <OptionsEditor
                        dimensionId={dim.id}
                        options={options}
                        onAdd={label => handleAddOption(dim.id, label)}
                        onRename={handleRenameOption}
                        onMove={handleMoveOption}
                        onDelete={handleDeleteOption}
                      />
                    </div>
                  ))}
                  {catDimensions.length === 0 && <span style={{ color: '#475569', fontSize: '0.78rem' }}>Aucune dimension.</span>}
                  <AddItemRow placeholder="Nouvelle dimension…" onAdd={name => handleAddDimension(cat.id, name)} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 8 }}>
        <AddItemRow placeholder="Nouvelle catégorie…" onAdd={handleAddCategory} />
      </div>
    </Card>
  );
}
