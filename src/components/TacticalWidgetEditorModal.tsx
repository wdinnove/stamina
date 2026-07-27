import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { tacticalDashboardApi } from '../api/tacticalDashboard';
import type { TacticalWidgetInput } from '../api/tacticalDashboard';
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption, TacticalDashboardWidget, TacticalWidgetType } from '../data/types';
import type { TacticalMatchRef } from './TacticalReport';
import { Modal } from './Modal';
import { WIDGET_TYPE_LABELS, EmptyNote, renderTacticalWidgetContent } from './tacticalWidgetRenderer';
import type { WidgetLike } from './tacticalWidgetRenderer';
import { useDateRange, PeriodFields } from './DateRangeCard';
import { GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '7px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 5, color: '#F1F5F9', fontSize: '0.82rem', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#64748B', fontSize: '0.68rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

interface Props {
  mode: 'create' | 'edit';
  teamId: string;
  /** Widget existant (édition) ou à dupliquer (pré-remplissage en mode création) — sans id en duplication. */
  initialWidget?: TacticalDashboardWidget | (WidgetLike & { id?: undefined });
  sortOrder: number;
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
  matches: TacticalMatchRef[];
  onSaved: (widget: TacticalDashboardWidget) => void;
  onClose: () => void;
}

/** Modale de création/édition d'un bloc du tableau de bord, avec prévisualisation en direct. */
export function TacticalWidgetEditorModal({ mode, teamId, initialWidget, sortOrder, events, categories, dimensions, options, matches, onSaved, onClose }: Props) {
  const [type, setType] = useState<TacticalWidgetType>(initialWidget?.type ?? 'dimension_table');
  const [categoryId, setCategoryId] = useState(initialWidget?.categoryId ?? '');
  const [dimensionId, setDimensionId] = useState(
    typeof initialWidget?.config.dimensionId === 'string' ? initialWidget.config.dimensionId
    : typeof initialWidget?.config.dimensionIdX === 'string' ? initialWidget.config.dimensionIdX
    : ''
  );
  const [dimensionIdY, setDimensionIdY] = useState(typeof initialWidget?.config.dimensionIdY === 'string' ? initialWidget.config.dimensionIdY : '');
  const [displayMode, setDisplayMode] = useState<'table' | 'chart'>(initialWidget?.config.displayMode === 'chart' ? 'chart' : 'table');
  const [widthSpan, setWidthSpan] = useState<1 | 2>(initialWidget?.config.widthSpan === 2 ? 2 : 1);
  const [title, setTitle] = useState(initialWidget?.title ?? '');

  type CustomRef = { categoryId: string; dimensionId: string; option: string };
  type CustomRow = { label: string; refs: CustomRef[] };
  const [rows, setRows] = useState<CustomRow[]>(() => {
    const raw = initialWidget?.config.rows;
    const parsed = Array.isArray(raw)
      ? raw
          .filter((r): r is { label?: unknown; refs?: unknown } => !!r && typeof r === 'object')
          .map(r => ({
            label: typeof r.label === 'string' ? r.label : '',
            refs: Array.isArray(r.refs)
              ? r.refs.filter((x): x is CustomRef =>
                  !!x && typeof x === 'object' && typeof x.categoryId === 'string' && typeof x.dimensionId === 'string' && typeof x.option === 'string'
                )
              : [],
          }))
          .filter(r => r.refs.length > 0)
      : [];
    return parsed.length > 0 ? parsed : [{ label: '', refs: [{ categoryId: '', dimensionId: '', option: '' }] }];
  });

  type OptionGroup = { label: string; options: string[] };
  const [groups, setGroups] = useState<OptionGroup[]>(() => {
    const raw = initialWidget?.config.groups;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((g): g is { label?: unknown; options?: unknown } => !!g && typeof g === 'object')
      .map(g => ({
        label: typeof g.label === 'string' ? g.label : '',
        options: Array.isArray(g.options) ? g.options.filter((o): o is string => typeof o === 'string') : [],
      }))
      .filter(g => g.options.length >= 2);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function addRow() {
    setRows(prev => [...prev, { label: '', refs: [{ categoryId: '', dimensionId: '', option: '' }] }]);
  }
  function removeRow(ri: number) {
    setRows(prev => prev.length === 1 ? prev : prev.filter((_, j) => j !== ri));
  }
  function updateRowLabel(ri: number, label: string) {
    setRows(prev => prev.map((row, j) => j === ri ? { ...row, label } : row));
  }
  function addRefToRow(ri: number) {
    setRows(prev => prev.map((row, j) => j === ri ? { ...row, refs: [...row.refs, { categoryId: '', dimensionId: '', option: '' }] } : row));
  }
  function removeRefFromRow(ri: number, refi: number) {
    setRows(prev => prev.map((row, j) => j === ri
      ? (row.refs.length === 1 ? row : { ...row, refs: row.refs.filter((_, k) => k !== refi) })
      : row));
  }
  function updateRef(ri: number, refi: number, patch: Partial<CustomRef>) {
    setRows(prev => prev.map((row, j) => j === ri
      ? { ...row, refs: row.refs.map((ref, k) => k === refi ? { ...ref, ...patch } : ref) }
      : row));
  }

  function addGroup() {
    setGroups(prev => [...prev, { label: '', options: [] }]);
  }
  function removeGroup(gi: number) {
    setGroups(prev => prev.filter((_, j) => j !== gi));
  }
  function updateGroupLabel(gi: number, label: string) {
    setGroups(prev => prev.map((g, j) => j === gi ? { ...g, label } : g));
  }
  function addOptionToGroup(gi: number, opt: string) {
    setGroups(prev => prev.map((g, j) => j === gi ? { ...g, options: [...g.options, opt] } : g));
  }
  function removeOptionFromGroup(gi: number, oi: number) {
    setGroups(prev => prev.map((g, j) => j === gi ? { ...g, options: g.options.filter((_, k) => k !== oi) } : g));
  }

  /** Libellés d'option proposés pour une catégorie/dimension : catalogue curé (`options`) en tête,
   *  puis tout libellé observé dans les événements mais non curé (les valeurs restent libres, cf.
   *  `TacticalEventValue`) — pour ne jamais bloquer sur une dimension sans catalogue configuré. */
  function optionLabelsFor(catId: string, dimId: string): string[] {
    if (!catId || !dimId) return [];
    const curated = options.filter(o => o.dimensionId === dimId).sort((a, b) => a.sortOrder - b.sortOrder).map(o => o.label);
    const seen = new Set(curated);
    const observed: string[] = [];
    for (const e of events) {
      if (e.categoryId !== catId) continue;
      const v = e.values.find(v => v.dimensionId === dimId);
      if (v && !seen.has(v.label)) { seen.add(v.label); observed.push(v.label); }
    }
    return [...curated, ...observed.sort((a, b) => a.localeCompare(b))];
  }

  // Bornes approximatives de la période disponible, dérivées des matchs déjà chargés (pas de
  // dépendance à des bornes de saison passées en prop) — servent de repère aux préréglages des
  // deux sélecteurs de période de "Comparaison de 2 périodes".
  const sortedMatchDates = [...matches].map(m => m.date).sort();
  const seasonStartGuess = sortedMatchDates[0];
  const seasonEndGuess = sortedMatchDates[sortedMatchDates.length - 1];
  const rangeA = useDateRange(seasonStartGuess, 'phase1', seasonEndGuess);
  const rangeB = useDateRange(seasonStartGuess, 'phase2', seasonEndGuess);

  useEffect(() => {
    const periodA = initialWidget?.config.periodA as { from: string; to: string } | undefined;
    const periodB = initialWidget?.config.periodB as { from: string; to: string } | undefined;
    if (periodA?.from && periodA?.to) { rangeA.setFrom(periodA.from); rangeA.setTo(periodA.to); }
    if (periodB?.from && periodB?.to) { rangeB.setFrom(periodB.from); rangeB.setTo(periodB.to); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presentCategoryIds = new Set(events.map(e => e.categoryId));
  const availableCategories = categories
    .filter(c => presentCategoryIds.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryDimensions = dimensions
    .filter(d => d.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const needsOneDimension = type === 'dimension_table' || type === 'pie_chart' || type === 'period_comparison';
  const needsTwoDimensions = type === 'cross_matrix';
  const optionalDimension = type === 'evolution_chart';

  // true si la catégorie/dimension choisie (ou pré-remplie depuis un widget existant) n'existe
  // plus — ex. supprimée dans la config entretemps — pour ne jamais ré-enregistrer une référence
  // cassée telle quelle ; l'utilisateur doit alors resélectionner explicitement.
  const categoryIsDangling = !!categoryId && !categories.some(c => c.id === categoryId);
  const dimensionIsDangling = (id: string) => !!id && !categoryDimensions.some(d => d.id === id);

  function buildTypeConfig(): Record<string, unknown> | null {
    if (type === 'custom_table') {
      const validRows = rows
        .map(row => ({
          label: row.label.trim() || undefined,
          refs: row.refs.filter(r => r.categoryId && r.dimensionId && r.option &&
            categories.some(c => c.id === r.categoryId) &&
            dimensions.some(d => d.id === r.dimensionId && d.categoryId === r.categoryId)
          ),
        }))
        .filter(row => row.refs.length > 0);
      return validRows.length > 0 ? { rows: validRows } : null;
    }
    if (!categoryId || categoryIsDangling) return null;
    if (needsTwoDimensions) {
      if (!dimensionId || !dimensionIdY || dimensionId === dimensionIdY) return null;
      if (dimensionIsDangling(dimensionId) || dimensionIsDangling(dimensionIdY)) return null;
      return { dimensionIdX: dimensionId, dimensionIdY, displayMode };
    }
    if (optionalDimension) {
      if (dimensionIsDangling(dimensionId)) return null;
      return dimensionId ? { dimensionId } : {};
    }
    if (needsOneDimension) {
      if (!dimensionId || dimensionIsDangling(dimensionId)) return null;
      if (type === 'period_comparison') {
        if (!rangeA.from || !rangeA.to || !rangeB.from || !rangeB.to) return null;
        if (rangeA.from > rangeA.to || rangeB.from > rangeB.to) return null;
        return { dimensionId, periodA: { from: rangeA.from, to: rangeA.to }, periodB: { from: rangeB.from, to: rangeB.to } };
      }
      if (type === 'dimension_table' || type === 'pie_chart') {
        const validGroups = groups
          .map(g => ({ label: g.label.trim() || undefined, options: g.options }))
          .filter(g => g.options.length >= 2);
        return validGroups.length > 0 ? { dimensionId, groups: validGroups } : { dimensionId };
      }
      return { dimensionId };
    }
    return {};
  }

  function buildConfig(): Record<string, unknown> | null {
    const typeConfig = buildTypeConfig();
    return typeConfig ? { ...typeConfig, widthSpan } : null;
  }

  const draftConfig = buildConfig();
  const draftWidget: WidgetLike | null = draftConfig
    ? { type, categoryId: type === 'custom_table' ? null : categoryId, title: title || null, config: draftConfig }
    : null;

  function invalidMessage(): string {
    if (type === 'custom_table') return 'Choisissez au moins une catégorie, une dimension et une option pour chaque ligne.';
    if (categoryIsDangling) return 'La catégorie de ce bloc a été supprimée — choisissez-en une autre.';
    if (needsTwoDimensions && (dimensionIsDangling(dimensionId) || dimensionIsDangling(dimensionIdY))) {
      return 'Une des dimensions de ce bloc a été supprimée — resélectionnez-la.';
    }
    if (needsTwoDimensions) return 'Choisissez une catégorie et deux dimensions différentes.';
    if (dimensionIsDangling(dimensionId)) return 'La dimension de ce bloc a été supprimée — resélectionnez-la.';
    if (type === 'period_comparison') {
      if (rangeA.from > rangeA.to || rangeB.from > rangeB.to) return 'Chaque période doit avoir une date de début antérieure ou égale à sa date de fin.';
      return 'Choisissez une catégorie, une dimension, et les deux périodes à comparer.';
    }
    return 'Choisissez une catégorie et une dimension.';
  }

  async function handleSave() {
    if (!draftWidget) {
      setError(invalidMessage());
      return;
    }
    setSaving(true);
    setError('');
    const input: TacticalWidgetInput = { type, categoryId: draftWidget.categoryId, title: title || null, config: draftWidget.config };
    try {
      const saved = mode === 'edit' && initialWidget?.id
        ? await tacticalDashboardApi.updateWidget(initialWidget.id, input)
        : await tacticalDashboardApi.createWidget(teamId, input, sortOrder);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={880} overlayOpacity={0.85} zIndex={210} align="flex-start" closeOnBackdropClick style={{ flexShrink: 0 }} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2A2F3A' }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>
          {mode === 'edit' ? 'Modifier le bloc' : 'Ajouter un bloc'}
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 20 }}>
        {/* Formulaire */}
        <div style={{ flex: '1 1 280px', minWidth: 'min(260px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Type de bloc</label>
            <select value={type} onChange={e => {
              setType(e.target.value as TacticalWidgetType);
              setDimensionId(''); setDimensionIdY('');
              setGroups([]);
              setRows([{ label: '', refs: [{ categoryId: '', dimensionId: '', option: '' }] }]);
            }} style={selectStyle}>
              {(Object.entries(WIDGET_TYPE_LABELS) as [TacticalWidgetType, string][]).map(([t, label]) => (
                <option key={t} value={t}>{label}</option>
              ))}
            </select>
          </div>
          {type !== 'custom_table' && (
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setDimensionId(''); setDimensionIdY(''); }} style={selectStyle}>
              <option value="">Choisir…</option>
              {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          )}
          {type !== 'custom_table' && (needsOneDimension || needsTwoDimensions || optionalDimension) && categoryId && (
            <div>
              <label style={labelStyle}>{needsTwoDimensions ? 'Dimension X' : 'Dimension'}</label>
              <select value={dimensionId} onChange={e => { setDimensionId(e.target.value); setGroups([]); }} style={selectStyle}>
                <option value="">{optionalDimension ? 'Toute la catégorie' : 'Choisir…'}</option>
                {categoryDimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {type !== 'custom_table' && needsTwoDimensions && categoryId && (
            <div>
              <label style={labelStyle}>Dimension Y</label>
              <select value={dimensionIdY} onChange={e => setDimensionIdY(e.target.value)} style={selectStyle}>
                <option value="">Choisir…</option>
                {categoryDimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {type !== 'custom_table' && needsTwoDimensions && categoryId && (
            <div>
              <label style={labelStyle}>Affichage</label>
              <select value={displayMode} onChange={e => setDisplayMode(e.target.value as 'table' | 'chart')} style={selectStyle}>
                <option value="table">Tableau croisé</option>
                <option value="chart">Graphique (une ligne par option Y)</option>
              </select>
            </div>
          )}
          {type === 'custom_table' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>Lignes du tableau</label>
              {rows.map((row, ri) => (
                <div key={ri} style={{ border: '1px solid #2A2F3A', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input value={row.label} onChange={e => updateRowLabel(ri, e.target.value)} placeholder="Libellé de la ligne (optionnel)" style={{ ...selectStyle, flex: 1 }} />
                    <button type="button" onClick={() => removeRow(ri)} disabled={rows.length === 1}
                      style={{ background: 'none', border: 'none', color: rows.length === 1 ? '#2A2F3A' : '#94A3B8', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', padding: 4, flexShrink: 0 }}
                      title="Retirer la ligne">
                      <X size={14} />
                    </button>
                  </div>
                  {row.refs.map((ref, refi) => {
                    const refDimensions = dimensions.filter(d => d.categoryId === ref.categoryId).sort((a, b) => a.sortOrder - b.sortOrder);
                    const refOptions = optionLabelsFor(ref.categoryId, ref.dimensionId);
                    return (
                      <div key={refi} style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: row.refs.length > 1 ? 10 : 0 }}>
                        {row.refs.length > 1 && <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>+</span>}
                        <select value={ref.categoryId} onChange={e => updateRef(ri, refi, { categoryId: e.target.value, dimensionId: '', option: '' })} style={{ ...selectStyle, flex: 1 }}>
                          <option value="">Catégorie…</option>
                          {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select value={ref.dimensionId} onChange={e => updateRef(ri, refi, { dimensionId: e.target.value, option: '' })} style={{ ...selectStyle, flex: 1 }} disabled={!ref.categoryId}>
                          <option value="">Dimension…</option>
                          {refDimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select value={ref.option} onChange={e => updateRef(ri, refi, { option: e.target.value })} style={{ ...selectStyle, flex: 1 }} disabled={!ref.dimensionId}>
                          <option value="">Option…</option>
                          {refOptions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <button type="button" onClick={() => removeRefFromRow(ri, refi)} disabled={row.refs.length === 1}
                          style={{ background: 'none', border: 'none', color: row.refs.length === 1 ? '#2A2F3A' : '#94A3B8', cursor: row.refs.length === 1 ? 'not-allowed' : 'pointer', padding: 4, flexShrink: 0 }}
                          title="Retirer cette option">
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => addRefToRow(ri)}
                    style={{ alignSelf: 'flex-start', padding: '4px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>
                    + Fusionner avec une autre option
                  </button>
                </div>
              ))}
              <button type="button" onClick={addRow}
                style={{ alignSelf: 'flex-start', padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.74rem' }}>
                + Ajouter une ligne
              </button>
            </div>
          )}
          {(type === 'dimension_table' || type === 'pie_chart') && categoryId && dimensionId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Regrouper des options (optionnel)</label>
              {groups.map((g, gi) => {
                const usedElsewhere = new Set(groups.flatMap((other, oi) => oi === gi ? [] : other.options));
                const available = optionLabelsFor(categoryId, dimensionId).filter(o => !g.options.includes(o) && !usedElsewhere.has(o));
                return (
                  <div key={gi} style={{ border: '1px solid #2A2F3A', borderRadius: 6, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={g.label} onChange={e => updateGroupLabel(gi, e.target.value)} placeholder="Libellé du groupe (optionnel)" style={{ ...selectStyle, flex: 1 }} />
                      <button type="button" onClick={() => removeGroup(gi)}
                        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                        title="Retirer le groupe">
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {g.options.map((opt, oi) => (
                        <span key={oi} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 12, fontSize: '0.74rem', color: '#F1F5F9' }}>
                          {opt}
                          <button type="button" onClick={() => removeOptionFromGroup(gi, oi)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0, display: 'flex' }}>
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      {available.length > 0 && (
                        <select value="" onChange={e => { if (e.target.value) addOptionToGroup(gi, e.target.value); }} style={{ width: 'auto', padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', fontSize: '0.72rem' }}>
                          <option value="">+ option…</option>
                          {available.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="button" onClick={addGroup}
                style={{ alignSelf: 'flex-start', padding: '5px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: 'pointer', fontSize: '0.74rem' }}>
                + Regrouper des options
              </button>
            </div>
          )}
          {type === 'period_comparison' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Périodes à comparer</label>
              <GroupPickerBox color={GROUP_A_COLOR}>
                <PeriodFields
                  from={rangeA.from} to={rangeA.to} preset={rangeA.preset}
                  onPreset={p => rangeA.applyPreset(p, seasonStartGuess, seasonEndGuess)}
                  onFrom={rangeA.setFrom} onTo={rangeA.setTo}
                />
              </GroupPickerBox>
              <GroupPickerBox color={GROUP_B_COLOR}>
                <PeriodFields
                  from={rangeB.from} to={rangeB.to} preset={rangeB.preset}
                  onPreset={p => rangeB.applyPreset(p, seasonStartGuess, seasonEndGuess)}
                  onFrom={rangeB.setFrom} onTo={rangeB.setTo}
                />
              </GroupPickerBox>
            </div>
          )}
          <div>
            <label style={labelStyle}>Largeur</label>
            <select value={widthSpan} onChange={e => setWidthSpan(Number(e.target.value) === 2 ? 2 : 1)} style={selectStyle}>
              <option value={1}>1 colonne</option>
              <option value={2}>2 colonnes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Titre (optionnel)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Laisser vide pour un titre automatique" style={selectStyle} />
          </div>
          {error && (
            <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Prévisualisation */}
        <div style={{ flex: '1 1 340px', minWidth: 'min(300px, 100%)' }}>
          <label style={labelStyle}>Aperçu</label>
          <div style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16, minHeight: 160 }}>
            {draftWidget
              ? renderTacticalWidgetContent(draftWidget, { events, categories, dimensions, options, matches })
              : <EmptyNote>Complétez le formulaire pour voir l'aperçu.</EmptyNote>}
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 20px', borderTop: '1px solid #2A2F3A', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" onClick={onClose}
          style={{ padding: '9px 18px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
          Annuler
        </button>
        {/* `disabled` ne dépend que de `saving` (pas de `!draftWidget`) : un formulaire incomplet ou
            invalide reste cliquable pour afficher le message d'erreur précis — un bouton désactivé
            n'aurait jamais pu déclencher `handleSave` et expliquer pourquoi. La teinte grisée reste
            un indice visuel via `!draftWidget` sans bloquer le clic. */}
        <button type="button" onClick={handleSave} disabled={saving}
          style={{ padding: '9px 22px', backgroundColor: (!draftWidget || saving) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (!draftWidget || saving) ? '#475569' : '#0D0F14', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
          {saving ? 'Enregistrement…' : mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </Modal>
  );
}
