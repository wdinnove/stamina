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
  const [title, setTitle] = useState(initialWidget?.title ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  function buildConfig(): Record<string, unknown> | null {
    if (!categoryId) return null;
    if (needsTwoDimensions) {
      if (!dimensionId || !dimensionIdY || dimensionId === dimensionIdY) return null;
      return { dimensionIdX: dimensionId, dimensionIdY, displayMode };
    }
    if (optionalDimension) {
      return dimensionId ? { dimensionId } : {};
    }
    if (needsOneDimension) {
      if (!dimensionId) return null;
      if (type === 'period_comparison') {
        if (!rangeA.from || !rangeA.to || !rangeB.from || !rangeB.to) return null;
        return { dimensionId, periodA: { from: rangeA.from, to: rangeA.to }, periodB: { from: rangeB.from, to: rangeB.to } };
      }
      return { dimensionId };
    }
    return {};
  }

  const draftConfig = buildConfig();
  const draftWidget: WidgetLike | null = draftConfig ? { type, categoryId, title: title || null, config: draftConfig } : null;

  async function handleSave() {
    if (!draftWidget) {
      setError(
        needsTwoDimensions ? 'Choisissez une catégorie et deux dimensions différentes.'
        : type === 'period_comparison' ? 'Choisissez une catégorie, une dimension, et les deux périodes à comparer.'
        : 'Choisissez une catégorie et une dimension.'
      );
      return;
    }
    setSaving(true);
    setError('');
    const input: TacticalWidgetInput = { type, categoryId, title: title || null, config: draftWidget.config };
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
        <div style={{ flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Type de bloc</label>
            <select value={type} onChange={e => { setType(e.target.value as TacticalWidgetType); setDimensionId(''); setDimensionIdY(''); }} style={selectStyle}>
              {(Object.entries(WIDGET_TYPE_LABELS) as [TacticalWidgetType, string][]).map(([t, label]) => (
                <option key={t} value={t}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setDimensionId(''); setDimensionIdY(''); }} style={selectStyle}>
              <option value="">Choisir…</option>
              {availableCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {(needsOneDimension || needsTwoDimensions || optionalDimension) && categoryId && (
            <div>
              <label style={labelStyle}>{needsTwoDimensions ? 'Dimension X' : 'Dimension'}</label>
              <select value={dimensionId} onChange={e => setDimensionId(e.target.value)} style={selectStyle}>
                <option value="">{optionalDimension ? 'Toute la catégorie' : 'Choisir…'}</option>
                {categoryDimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {needsTwoDimensions && categoryId && (
            <div>
              <label style={labelStyle}>Dimension Y</label>
              <select value={dimensionIdY} onChange={e => setDimensionIdY(e.target.value)} style={selectStyle}>
                <option value="">Choisir…</option>
                {categoryDimensions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {needsTwoDimensions && categoryId && (
            <div>
              <label style={labelStyle}>Affichage</label>
              <select value={displayMode} onChange={e => setDisplayMode(e.target.value as 'table' | 'chart')} style={selectStyle}>
                <option value="table">Tableau croisé</option>
                <option value="chart">Graphique (une ligne par option Y)</option>
              </select>
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
        <div style={{ flex: '1 1 340px', minWidth: 300 }}>
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
        <button type="button" onClick={handleSave} disabled={!draftWidget || saving}
          style={{ padding: '9px 22px', backgroundColor: (!draftWidget || saving) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (!draftWidget || saving) ? '#475569' : '#0D0F14', fontWeight: 700, cursor: (!draftWidget || saving) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
          {saving ? 'Enregistrement…' : mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </Modal>
  );
}
