import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, AlertCircle, Plus, Trash2, Search, ListChecks, Video, Upload, Download, GripVertical } from 'lucide-react';
import { tacticalConfigApi } from '../api/tacticalConfig';
import type { TacticalConfigImportResult } from '../api/tacticalConfig';
import { tacticalActionsApi } from '../api/tacticalEvents';
import { normalizeTacticalName, serializeTacticalConfigCsv } from '../utils/tacticalCsvParser';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { useUrlState } from '../hooks/useUrlState';
import { ConfigCard, ConfigAction } from './ConfigCard';
import { TacticalConfigImportModal } from './TacticalConfigImportModal';

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

/** Champ + bouton "Ajouter …" auto-contenu — réutilisé pour catégorie/dimension/option. */
function AddItemRow({ placeholder, addLabel, onAdd }: { placeholder: string; addLabel: string; onAdd: (label: string) => void }) {
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
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}

/** Zone de collage d'une liste d'options (une par ligne) — pratique pour initialiser en une fois
 *  le catalogue d'une dimension plutôt que de saisir chaque option séparément. */
function BulkPasteOptions({ onAddMany }: { onAddMany: (labels: string[]) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleSubmit() {
    const labels = [...new Set(text.split('\n').map(l => l.trim()).filter(Boolean))];
    if (labels.length === 0) return;
    setAdding(true);
    await onAddMany(labels);
    setAdding(false);
    setText('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, fontSize: '0.7rem', alignSelf: 'flex-start' }}>
        <ListChecks size={11} /> Coller une liste…
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
      <textarea
        value={text} onChange={e => setText(e.target.value)} placeholder={'Une option par ligne…'} rows={3} autoFocus
        style={{ padding: '4px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, color: '#F1F5F9', fontSize: '0.76rem', resize: 'vertical', maxWidth: 220, fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleSubmit} disabled={adding || !text.trim()} style={{ background: 'none', border: 'none', color: adding || !text.trim() ? '#334155' : '#00E5A0', cursor: adding || !text.trim() ? 'not-allowed' : 'pointer', fontSize: '0.74rem', fontWeight: 700, padding: 2 }}>
          {adding ? 'Ajout…' : 'Ajouter tout'}
        </button>
        <button onClick={() => { setOpen(false); setText(''); }} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.74rem', padding: 2 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

const thresholdInputStyle: React.CSSProperties = {
  width: 56, padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 4, color: '#F1F5F9', fontSize: '0.76rem',
};

function ThresholdsEditor({ category, onSave, onInverseeChange }: {
  category: TacticalCategory;
  onSave: (t: { vert: number; bleu: number; ambre: number }) => void;
  onInverseeChange: (inversee: boolean) => void;
}) {
  const [vert, setVert] = useState(category.rentabiliteSeuilVert);
  const [bleu, setBleu] = useState(category.rentabiliteSeuilBleu);
  const [ambre, setAmbre] = useState(category.rentabiliteSeuilAmbre);
  const inversee = category.rentabiliteInversee;

  useEffect(() => {
    setVert(category.rentabiliteSeuilVert);
    setBleu(category.rentabiliteSeuilBleu);
    setAmbre(category.rentabiliteSeuilAmbre);
  }, [category.id, category.rentabiliteSeuilVert, category.rentabiliteSeuilBleu, category.rentabiliteSeuilAmbre]);

  const commit = () => onSave({ vert, bleu, ambre });
  const cmp = inversee ? '≤' : '≥';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: '#94A3B8', flexWrap: 'wrap' }}>
      <span>Seuils de rentabilité :</span>
      <span style={{ color: '#00E5A0' }}>Vert {cmp}</span>
      <input type="number" step="0.1" value={vert} onChange={e => setVert(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
      <span style={{ color: '#3B82F6' }}>Bleu {cmp}</span>
      <input type="number" step="0.1" value={bleu} onChange={e => setBleu(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
      <span style={{ color: '#F59E0B' }}>Ambre {cmp}</span>
      <input type="number" step="0.1" value={ambre} onChange={e => setAmbre(parseFloat(e.target.value) || 0)} onBlur={commit} style={thresholdInputStyle} />
      <label title="Catégorie défensive : une valeur basse (peu de points concédés) est la meilleure — inverse le sens des seuils ci-dessus."
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 6, cursor: 'pointer', color: inversee ? '#F1F5F9' : '#94A3B8' }}>
        <input type="checkbox" checked={inversee} onChange={e => onInverseeChange(e.target.checked)} style={{ accentColor: '#00E5A0', cursor: 'pointer' }} />
        Inversée (défense)
      </label>
    </div>
  );
}

/** Une option en pastille : clic pour renommer, croix pour supprimer, glisser pour réordonner. */
function OptionChip({ option, onRename, onDelete, onDragStart, onDragOver, onDrop, dragging }: {
  option: TacticalDimensionOption;
  onRename: (label: string) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dragging: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(option.label);

  if (editing) {
    return (
      <input
        value={draft} autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onRename(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onRename(draft); setEditing(false); }
          if (e.key === 'Escape') { setDraft(option.label); setEditing(false); }
        }}
        style={{ padding: '2px 8px', backgroundColor: '#1E2229', border: '1px solid #00E5A040', borderRadius: 4, color: '#F1F5F9', fontSize: '0.74rem', width: Math.max(70, draft.length * 7 + 24) }}
      />
    );
  }
  return (
    <span
      draggable
      onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 4px 2px 8px', borderRadius: 4,
        border: '1px solid #2A2F3A', backgroundColor: '#1E2229', color: '#CBD5E1', fontSize: '0.74rem',
        cursor: 'grab', opacity: dragging ? 0.4 : 1,
      }}>
      <span onClick={() => { setDraft(option.label); setEditing(true); }} style={{ cursor: 'text' }}>{option.label}</span>
      <button onClick={onDelete} title={`Supprimer ${option.label}`}
        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, display: 'flex' }}>
        <X size={11} />
      </button>
    </span>
  );
}

/**
 * Catalogue d'une dimension. Les options sont des pastilles plutôt qu'une liste verticale de
 * lignes à chevrons : une dimension en compte couramment une dizaine, et réordonner coûtait
 * autant de clics — et autant d'écritures — que de rangs à franchir. Un glisser-déposer, une
 * seule écriture.
 */
function OptionsEditor({ dimensionId, options, onAdd, onAddMany, onRename, onReorder, onDelete }: {
  dimensionId: string;
  options: TacticalDimensionOption[];
  onAdd: (label: string) => void;
  onAddMany: (labels: string[]) => Promise<void>;
  onRename: (option: TacticalDimensionOption, label: string) => void;
  onReorder: (siblings: TacticalDimensionOption[], from: number, to: number) => void;
  onDelete: (option: TacticalDimensionOption) => void;
}) {
  const sorted = options.filter(o => o.dimensionId === dimensionId).sort((a, b) => a.sortOrder - b.sortOrder);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {sorted.map((opt, i) => (
          <OptionChip
            key={opt.id}
            option={opt}
            dragging={dragIndex === i}
            onRename={label => onRename(opt, label)}
            onDelete={() => onDelete(opt)}
            onDragStart={() => setDragIndex(i)}
            onDragOver={e => { if (dragIndex !== null) e.preventDefault(); }}
            onDrop={e => { e.preventDefault(); if (dragIndex !== null) onReorder(sorted, dragIndex, i); setDragIndex(null); }}
          />
        ))}
        {sorted.length === 0 && (
          <span style={{ color: '#334155', fontSize: '0.74rem' }}>Aucune option — toute valeur du CSV sera acceptée et ajoutée ici.</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <AddItemRow placeholder="Nouvelle option…" addLabel="Ajouter" onAdd={onAdd} />
        <BulkPasteOptions onAddMany={onAddMany} />
      </div>
    </div>
  );
}

type DeletedSnapshot =
  | { kind: 'category'; label: string; category: TacticalCategory; dims: TacticalDimension[]; opts: TacticalDimensionOption[] }
  | { kind: 'dimension'; label: string; dimension: TacticalDimension; opts: TacticalDimensionOption[] }
  | { kind: 'option'; label: string; option: TacticalDimensionOption };

const UNDO_TIMEOUT_MS = 8000;

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
  const [search, setSearch] = useUrlState('recherche', '');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [lastDeleted, setLastDeleted] = useState<DeletedSnapshot | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importSummary, setImportSummary] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragCategory, setDragCategory] = useState<number | null>(null);
  const [dragDimension, setDragDimension] = useState<number | null>(null);
  /** Nombre d'actions importées sur la catégorie affichée — sert à prévenir avant une suppression. */
  const [selectedActionCount, setSelectedActionCount] = useState(0);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    tacticalConfigApi.getForTeam(teamId)
      .then(({ categories, dimensions, options }) => { setCategories(categories); setDimensions(dimensions); setOptions(options); })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [teamId]);

  /** Recharge tout après un import de configuration : les créations viennent de la base
   *  (identifiants, rangs), pas d'un état local reconstruit à la main. */
  async function handleConfigImported(result: TacticalConfigImportResult) {
    setShowImport(false);
    setError('');
    const created = [
      result.createdCategories && `${result.createdCategories} catégorie${result.createdCategories > 1 ? 's' : ''}`,
      result.createdDimensions && `${result.createdDimensions} dimension${result.createdDimensions > 1 ? 's' : ''}`,
      result.createdOptions && `${result.createdOptions} option${result.createdOptions > 1 ? 's' : ''}`,
    ].filter(Boolean).join(', ');
    const existing = result.existingCategories + result.existingDimensions + result.existingOptions;
    setImportSummary(
      `Configuration importée — ${created || 'rien'} créé${existing > 0 ? ` (${existing} élément${existing > 1 ? 's' : ''} déjà présent${existing > 1 ? 's' : ''}, conservé${existing > 1 ? 's' : ''})` : ''}.`,
    );
    try {
      const config = await tacticalConfigApi.getForTeam(teamId);
      setCategories(config.categories); setDimensions(config.dimensions); setOptions(config.options);
    } catch (e) { reportError(e); }
  }



  useEffect(() => () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); }, []);

  /** Exporte la configuration au format lu par l'import : aller-retour vers un tableur. */
  function handleExportCsv() {
    const csv = serializeTacticalConfigCsv(
      [...categories].sort((a, b) => a.sortOrder - b.sortOrder).map(category => ({
        name: category.name,
        dimensions: dimensions
          .filter(d => d.categoryId === category.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(dimension => ({
            name: dimension.name,
            options: options
              .filter(o => o.dimensionId === dimension.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(o => o.label),
          })),
      })),
    );
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'configuration_tactique.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function toggleCategorySelected(id: string) {
    setSelectedCategoryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function reportError(e: unknown) {
    setError(e instanceof Error ? e.message : 'Erreur');
  }

  function announceDeletion(snapshot: DeletedSnapshot) {
    setLastDeleted(snapshot);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => setLastDeleted(null), UNDO_TIMEOUT_MS);
  }

  async function handleAddCategory(name: string) {
    setError('');
    // max(sortOrder)+1, pas categories.length : après une suppression, .length ne correspond plus
    // au prochain rang libre et peut entrer en collision avec une catégorie déjà existante.
    const nextOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
    try {
      const created = await tacticalConfigApi.createCategory(teamId, name, nextOrder);
      setCategories(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  async function handleDeleteCategory(cat: TacticalCategory) {
    setError('');
    const prevCategories = categories;
    const catDims = dimensions.filter(d => d.categoryId === cat.id);
    const catDimIds = new Set(catDims.map(d => d.id));
    const catOpts = options.filter(o => catDimIds.has(o.dimensionId));
    setCategories(prev => prev.filter(c => c.id !== cat.id));
    try {
      await tacticalConfigApi.deleteCategory(cat.id);
      setDimensions(prev => prev.filter(d => d.categoryId !== cat.id));
      setOptions(prev => prev.filter(o => !catDimIds.has(o.dimensionId)));
      announceDeletion({ kind: 'category', label: cat.name, category: cat, dims: catDims, opts: catOpts });
    } catch (e) {
      setCategories(prevCategories);
      setError(friendlyDeleteError(e, cat.name));
    }
  }

  async function handleBulkDeleteCategories() {
    setError('');
    const ids = [...selectedCategoryIds];
    setSelectedCategoryIds(new Set());
    setBulkMode(false);
    for (const id of ids) {
      const cat = categories.find(c => c.id === id);
      if (cat) await handleDeleteCategory(cat);
    }
  }

  async function handleUndoDelete() {
    if (!lastDeleted) return;
    const snapshot = lastDeleted;
    setLastDeleted(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    try {
      if (snapshot.kind === 'category') {
        const newCat = await tacticalConfigApi.createCategory(teamId, snapshot.category.name, snapshot.category.sortOrder);
        await Promise.all([
          tacticalConfigApi.updateCategoryColor(newCat.id, snapshot.category.color),
          tacticalConfigApi.updateCategoryThresholds(newCat.id, {
            vert: snapshot.category.rentabiliteSeuilVert, bleu: snapshot.category.rentabiliteSeuilBleu, ambre: snapshot.category.rentabiliteSeuilAmbre,
          }),
          tacticalConfigApi.updateCategoryRentabiliteInversee(newCat.id, snapshot.category.rentabiliteInversee),
        ]);
        setCategories(prev => [...prev, {
          ...newCat, color: snapshot.category.color,
          rentabiliteSeuilVert: snapshot.category.rentabiliteSeuilVert,
          rentabiliteSeuilBleu: snapshot.category.rentabiliteSeuilBleu,
          rentabiliteSeuilAmbre: snapshot.category.rentabiliteSeuilAmbre,
          rentabiliteInversee: snapshot.category.rentabiliteInversee,
        }]);
        // Slot et code sont calculés sur les frères DÉJÀ créés : l'état React n'étant pas encore
        // à jour dans la boucle, on accumule localement, sinon toutes les dimensions de la
        // catégorie restaurée réclameraient le slot 0.
        const restoredDims: TacticalDimension[] = [];
        const restoredOpts: TacticalDimensionOption[] = [];
        for (const dim of snapshot.dims) {
          const newDim = await tacticalConfigApi.createDimension(teamId, newCat.id, dim.name, dim.sortOrder, restoredDims);
          restoredDims.push(newDim);
          setDimensions(prev => [...prev, newDim]);
          for (const opt of snapshot.opts.filter(o => o.dimensionId === dim.id)) {
            const newOpt = await tacticalConfigApi.createOption(teamId, newDim.id, opt.label, opt.sortOrder, restoredOpts);
            restoredOpts.push(newOpt);
            setOptions(prev => [...prev, newOpt]);
          }
        }
      } else if (snapshot.kind === 'dimension') {
        const newDim = await tacticalConfigApi.createDimension(teamId, snapshot.dimension.categoryId, snapshot.dimension.name, snapshot.dimension.sortOrder, dimensions);
        setDimensions(prev => [...prev, newDim]);
        const restoredOpts: TacticalDimensionOption[] = [];
        for (const opt of snapshot.opts) {
          const newOpt = await tacticalConfigApi.createOption(teamId, newDim.id, opt.label, opt.sortOrder, restoredOpts);
          restoredOpts.push(newOpt);
          setOptions(prev => [...prev, newOpt]);
        }
      } else {
        const newOpt = await tacticalConfigApi.createOption(teamId, snapshot.option.dimensionId, snapshot.option.label, snapshot.option.sortOrder, options);
        setOptions(prev => [...prev, newOpt]);
      }
    } catch (e) { reportError(e); }
  }

  async function handleRenameCategory(cat: TacticalCategory, name: string) {
    if (!name.trim() || name === cat.name) return;
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name } : c));
    try { await tacticalConfigApi.renameCategory(cat.id, name); } catch (e) { reportError(e); }
  }


  async function handleThresholds(cat: TacticalCategory, t: { vert: number; bleu: number; ambre: number }) {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, rentabiliteSeuilVert: t.vert, rentabiliteSeuilBleu: t.bleu, rentabiliteSeuilAmbre: t.ambre } : c));
    try { await tacticalConfigApi.updateCategoryThresholds(cat.id, t); } catch (e) { reportError(e); }
  }

  async function handleInverseeChange(cat: TacticalCategory, inversee: boolean) {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, rentabiliteInversee: inversee } : c));
    try { await tacticalConfigApi.updateCategoryRentabiliteInversee(cat.id, inversee); } catch (e) { reportError(e); }
  }

  async function handleColorChange(cat: TacticalCategory, color: string) {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, color } : c));
    try { await tacticalConfigApi.updateCategoryColor(cat.id, color); } catch (e) { reportError(e); }
  }

  async function handleAddDimension(categoryId: string, name: string) {
    setError('');
    const siblings = dimensions.filter(d => d.categoryId === categoryId);
    const nextOrder = siblings.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;
    try {
      const created = await tacticalConfigApi.createDimension(teamId, categoryId, name, nextOrder, dimensions);
      setDimensions(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  async function handleDeleteDimension(dim: TacticalDimension) {
    setError('');
    const prevDimensions = dimensions;
    const dimOpts = options.filter(o => o.dimensionId === dim.id);
    setDimensions(prev => prev.filter(d => d.id !== dim.id));
    try {
      await tacticalConfigApi.deleteDimension(dim.id);
      setOptions(prev => prev.filter(o => o.dimensionId !== dim.id));
      announceDeletion({ kind: 'dimension', label: dim.name, dimension: dim, opts: dimOpts });
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


  async function handleAddOption(dimensionId: string, label: string) {
    const siblings = options.filter(o => o.dimensionId === dimensionId);
    const nextOrder = siblings.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;
    try {
      const created = await tacticalConfigApi.createOption(teamId, dimensionId, label, nextOrder, options);
      setOptions(prev => [...prev, created]);
    } catch (e) { reportError(e); }
  }

  /** Une seule requête pour toute la liste collée — les rangs et les codes sont calculés en
   *  série côté API sur le catalogue courant, donc sans collision. */
  async function handleAddManyOptions(dimensionId: string, labels: string[]) {
    setError('');
    try {
      const created = await tacticalConfigApi.createOptions(teamId, labels.map(label => ({ dimensionId, label })), options);
      setOptions(prev => [...prev, ...created]);
    } catch (e) { reportError(e); }
  }

  async function handleRenameOption(option: TacticalDimensionOption, label: string) {
    if (!label.trim() || label === option.label) return;
    setOptions(prev => prev.map(o => o.id === option.id ? { ...o, label } : o));
    try { await tacticalConfigApi.renameOption(option.id, label); } catch (e) { reportError(e); }
  }


  async function handleDeleteOption(option: TacticalDimensionOption) {
    const prevOptions = options;
    setOptions(prev => prev.filter(o => o.id !== option.id));
    try {
      await tacticalConfigApi.deleteOption(option.id);
      announceDeletion({ kind: 'option', label: option.label, option });
    } catch (e) {
      setOptions(prevOptions);
      reportError(e);
    }
  }

  /**
   * Déplacement d'un rang à un autre, appliqué en UNE écriture par geste — les chevrons
   * précédents écrivaient à chaque clic, soit autant d'allers-retours que de rangs franchis.
   */
  function reordered<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  async function handleReorderCategories(from: number, to: number) {
    if (from === to) return;
    const prevCategories = categories;
    const next = reordered([...categories].sort((a, b) => a.sortOrder - b.sortOrder), from, to);
    const orderMap = new Map(next.map((c, i) => [c.id, i]));
    setCategories(prev => prev.map(c => ({ ...c, sortOrder: orderMap.get(c.id) ?? c.sortOrder })));
    try { await tacticalConfigApi.reorderCategories(next.map(c => c.id)); } catch (e) { setCategories(prevCategories); reportError(e); }
  }

  async function handleReorderDimensions(siblings: TacticalDimension[], from: number, to: number) {
    if (from === to) return;
    const prevDimensions = dimensions;
    const next = reordered(siblings, from, to);
    const orderMap = new Map(next.map((d, i) => [d.id, i]));
    // sortOrder seulement : `slot` est figé, c'est lui qui adresse les valeurs déjà stockées.
    setDimensions(prev => prev.map(d => orderMap.has(d.id) ? { ...d, sortOrder: orderMap.get(d.id)! } : d));
    try { await tacticalConfigApi.reorderDimensions(next.map(d => d.id)); } catch (e) { setDimensions(prevDimensions); reportError(e); }
  }

  async function handleReorderOptions(siblings: TacticalDimensionOption[], from: number, to: number) {
    if (from === to) return;
    const prevOptions = options;
    const next = reordered(siblings, from, to);
    const orderMap = new Map(next.map((o, i) => [o.id, i]));
    setOptions(prev => prev.map(o => orderMap.has(o.id) ? { ...o, sortOrder: orderMap.get(o.id)! } : o));
    try { await tacticalConfigApi.reorderOptions(next.map(o => o.id)); } catch (e) { setOptions(prevOptions); reportError(e); }
  }


  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const normalizedSearch = normalizeTacticalName(search);
  const filteredCategories = normalizedSearch
    ? sortedCategories.filter(c => normalizeTacticalName(c.name).includes(normalizedSearch))
    : sortedCategories;

  const selected = sortedCategories.find(c => c.id === selectedId) ?? filteredCategories[0] ?? null;

  // Compte chargé à la catégorie affichée, pas pour toute l'équipe : un HEAD qui ne rend qu'un
  // entier, là où compter côté client aurait rapatrié une ligne par action. Purement informatif,
  // donc un échec ne doit pas empêcher de configurer.
  const selectedCategoryId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedCategoryId) { setSelectedActionCount(0); return; }
    let cancelled = false;
    tacticalActionsApi.countForCategory(selectedCategoryId)
      .then(n => { if (!cancelled) setSelectedActionCount(n); })
      .catch(() => { if (!cancelled) setSelectedActionCount(0); });
    return () => { cancelled = true; };
  }, [selectedCategoryId]);
  const selectedDimensions = selected
    ? dimensions.filter(d => d.categoryId === selected.id).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return (
    <ConfigCard
      icon={<Video size={14} color="#00E5A0" />}
      title="Statistiques tactiques"
      action={
        <>
          <ConfigAction icon={<Download size={14} />} tone="neutral" hideLabelOnMobile onClick={handleExportCsv}>
            Exporter
          </ConfigAction>
          <ConfigAction icon={<Upload size={14} />} tone="neutral" hideLabelOnMobile onClick={() => { setImportSummary(''); setShowImport(true); }}>
            Importer un CSV
          </ConfigAction>
        </>
      }
      description={
        <>
          {categories.length} catégorie{categories.length > 1 ? 's' : ''} · {dimensions.length} dimension{dimensions.length > 1 ? 's' : ''} · {options.length} option{options.length > 1 ? 's' : ''}
          {' — '}les catégories et dimensions sont aussi créées automatiquement à l'import d'un CSV de match, et une valeur
          inconnue rencontrée à l'import est ajoutée au catalogue. Tenir ce catalogue à jour ici évite qu'une faute de frappe
          y entre toute seule, et fait apparaître les options sans action dans les rapports.
        </>
      }>

      <style>{`
        .tactical-config-panes { display: grid; grid-template-columns: minmax(220px, 320px) minmax(0, 1fr); gap: 16px; align-items: start; }
        @media (max-width: 860px) { .tactical-config-panes { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      {showImport && (
        <TacticalConfigImportModal
          teamId={teamId}
          categories={categories}
          dimensions={dimensions}
          options={options}
          onClose={() => setShowImport(false)}
          onImported={handleConfigImported}
        />
      )}

      {importSummary && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <span style={{ color: '#00E5A0', fontSize: '0.8rem', flex: 1 }}>{importSummary}</span>
          <button onClick={() => setImportSummary('')} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2 }}>
            <X size={13} />
          </button>
        </div>
      )}

      {loading && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>}
      {error && (
        <p style={{ color: '#EF4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={13} />{error}
        </p>
      )}

      {lastDeleted && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <span style={{ color: '#94A3B8', fontSize: '0.8rem', flex: 1 }}>« {lastDeleted.label} » supprimé.</span>
          <button onClick={handleUndoDelete} style={{ background: 'none', border: 'none', color: '#00E5A0', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', padding: 2 }}>
            Annuler
          </button>
        </div>
      )}

      {!loading && sortedCategories.length === 0 && (
        <p style={{ color: '#475569', fontSize: '0.82rem' }}>
          Aucune catégorie tactique pour l'instant — importez un CSV de configuration, un premier CSV de match, ou créez-en une ci-dessous.
        </p>
      )}

      {!loading && (
        <div className="tactical-config-panes">
          {/* ── Volet gauche : les catégories ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {sortedCategories.length > 0 && (
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                <input
                  value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une catégorie…"
                  style={{ width: '100%', padding: '6px 8px 6px 26px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#F1F5F9', fontSize: '0.8rem', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {sortedCategories.length > 0 && filteredCategories.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.8rem' }}>Aucune catégorie ne correspond à « {search} ».</p>
            )}

            {filteredCategories.map(cat => {
              const index = sortedCategories.indexOf(cat);
              const catDimensions = dimensions.filter(d => d.categoryId === cat.id);
              const catOptions = options.filter(o => catDimensions.some(d => d.id === o.dimensionId));
              const isSelected = selected?.id === cat.id;
              return (
                <div
                  key={cat.id}
                  draggable={!bulkMode && !normalizedSearch}
                  onDragStart={() => setDragCategory(index)}
                  onDragOver={e => { if (dragCategory !== null) e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); if (dragCategory !== null) handleReorderCategories(dragCategory, index); setDragCategory(null); }}
                  onClick={() => { if (!bulkMode) setSelectedId(cat.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6,
                    border: `1px solid ${isSelected ? '#00E5A040' : '#2A2F3A'}`,
                    backgroundColor: isSelected ? 'rgba(0,229,160,0.06)' : '#161920',
                    cursor: bulkMode ? 'default' : 'pointer', opacity: dragCategory === index ? 0.4 : 1,
                  }}>
                  {bulkMode && (
                    <input type="checkbox" checked={selectedCategoryIds.has(cat.id)} onChange={() => toggleCategorySelected(cat.id)}
                      style={{ accentColor: '#00E5A0', cursor: 'pointer', flexShrink: 0 }} />
                  )}
                  <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cat.color, flexShrink: 0 }} />
                  <span style={{ color: isSelected ? '#F1F5F9' : '#CBD5E1', fontWeight: isSelected ? 700 : 500, fontSize: '0.84rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.name}
                  </span>
                  <span style={{ color: '#475569', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {catDimensions.length} dim · {catOptions.length} opt
                  </span>
                </div>
              );
            })}

            {!bulkMode && <AddItemRow placeholder="Nouvelle catégorie…" addLabel="Ajouter une catégorie" onAdd={handleAddCategory} />}

            {sortedCategories.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                <button
                  onClick={() => { setBulkMode(v => !v); setSelectedCategoryIds(new Set()); }}
                  style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 5, color: bulkMode ? '#00E5A0' : '#94A3B8', cursor: 'pointer', fontSize: '0.74rem', padding: '5px 9px' }}
                >
                  {bulkMode ? 'Terminer la sélection' : 'Sélectionner plusieurs'}
                </button>
                {bulkMode && selectedCategoryIds.size > 0 && (
                  <button onClick={handleBulkDeleteCategories} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, color: '#EF4444', cursor: 'pointer', fontSize: '0.74rem', padding: '5px 9px' }}>
                    <Trash2 size={12} /> Supprimer ({selectedCategoryIds.size})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Volet droit : la catégorie choisie ── */}
          {selected && !bulkMode && (
            <div style={{ border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input type="color" value={selected.color} onChange={e => handleColorChange(selected, e.target.value)} title="Couleur de la catégorie"
                  style={{ width: 22, height: 22, border: '1px solid #2A2F3A', borderRadius: 5, padding: 1, backgroundColor: '#1E2229', cursor: 'pointer', flexShrink: 0 }} />
                <EditableLabel value={selected.name} bold onSave={name => handleRenameCategory(selected, name)} />
                <span style={{ marginLeft: 'auto' }}>
                  <ConfirmableDeleteButton onDelete={() => handleDeleteCategory(selected)} itemLabel={selected.name} />
                </span>
              </div>

              <ThresholdsEditor
                category={selected}
                onSave={t => handleThresholds(selected, t)}
                onInverseeChange={v => handleInverseeChange(selected, v)}
              />

              {selectedActionCount > 0 && (
                <p style={{ color: '#64748B', fontSize: '0.72rem', margin: 0, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                  <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  {selectedActionCount} action{selectedActionCount > 1 ? 's' : ''} déjà importée{selectedActionCount > 1 ? 's' : ''} sur cette catégorie — supprimer
                  une dimension ou une option en efface les valeurs des analyses. Renommer, en revanche, est sans effet sur les données.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedDimensions.map((dim, di) => (
                  <div
                    key={dim.id}
                    draggable
                    onDragStart={() => setDragDimension(di)}
                    onDragOver={e => { if (dragDimension !== null) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); if (dragDimension !== null) handleReorderDimensions(selectedDimensions, dragDimension, di); setDragDimension(null); }}
                    style={{ borderTop: '1px solid rgba(42,47,58,0.6)', paddingTop: 10, opacity: dragDimension === di ? 0.4 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GripVertical size={12} color="#334155" style={{ cursor: 'grab', flexShrink: 0 }} />
                      <EditableLabel value={dim.name} onSave={name => handleRenameDimension(dim, name)} />
                      <span style={{ marginLeft: 'auto' }}>
                        <ConfirmableDeleteButton onDelete={() => handleDeleteDimension(dim)} itemLabel={dim.name} />
                      </span>
                    </div>
                    <OptionsEditor
                      dimensionId={dim.id}
                      options={options}
                      onAdd={label => handleAddOption(dim.id, label)}
                      onAddMany={labels => handleAddManyOptions(dim.id, labels)}
                      onRename={handleRenameOption}
                      onReorder={handleReorderOptions}
                      onDelete={handleDeleteOption}
                    />
                  </div>
                ))}
                {selectedDimensions.length === 0 && <span style={{ color: '#475569', fontSize: '0.78rem' }}>Aucune dimension.</span>}
                <AddItemRow placeholder="Nouvelle dimension…" addLabel="Ajouter une dimension" onAdd={name => handleAddDimension(selected.id, name)} />
              </div>
            </div>
          )}
        </div>
      )}
    </ConfigCard>
  );
}
