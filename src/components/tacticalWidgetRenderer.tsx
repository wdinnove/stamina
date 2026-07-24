import { AlertTriangle } from 'lucide-react';
import {
  buildDimensionTable, buildCrossMatrix, buildCategoryEvolution, buildDimensionEvolution, buildCategoryReport,
  buildCustomTableRows, findValueDimension, buildValueByEvent, categoryThresholds, rentabiliteColor,
} from '../data/tacticalAnalysis';
import type { RowGroupDef, CustomTableRowDef } from '../data/tacticalAnalysis';
import type {
  TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption,
  TacticalWidgetType,
} from '../data/types';
import { DimensionTableView, DimensionRowsTable } from './TacticalReport';
import type { TacticalMatchRef } from './TacticalReport';
import { TacticalEvolutionChart } from './TacticalEvolutionChart';
import { TacticalCrossMatrix } from './TacticalCrossMatrix';
import { TacticalCrossMatrixChart } from './TacticalCrossMatrixChart';
import { TacticalPieChart } from './TacticalPieChart';
import { TacticalPeriodComparisonChart } from './TacticalPeriodComparisonChart';

/**
 * Rendu partagé d'un bloc de tableau de bord (par type) — utilisé à la fois par
 * la grille (`TacticalDashboard`) et par la prévisualisation en direct de
 * l'éditeur de bloc (`TacticalWidgetEditorModal`), pour ne jamais dupliquer le
 * dispatcher de rendu par type.
 */

export const WIDGET_TYPE_LABELS: Record<TacticalWidgetType, string> = {
  dimension_table:   'Tableau par dimension',
  evolution_chart:   'Évolution match par match',
  cross_matrix:      'Matrice croisée (2 dimensions)',
  pie_chart:         'Camembert de répartition',
  period_comparison: 'Comparaison de 2 périodes',
  custom_table:      'Tableau personnalisé (dimensions multiples)',
};

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>{children}</p>;
}

function customTableRowDefs(config: Record<string, unknown>): CustomTableRowDef[] {
  const raw = Array.isArray(config.rows) ? config.rows : [];
  return raw
    .filter((r): r is { label?: unknown; refs?: unknown } => !!r && typeof r === 'object')
    .map(r => ({
      label: typeof r.label === 'string' ? r.label : undefined,
      refs: Array.isArray(r.refs)
        ? r.refs.filter((x): x is { categoryId: string; dimensionId: string; option: string } =>
            !!x && typeof x === 'object' && typeof x.categoryId === 'string' && typeof x.dimensionId === 'string' && typeof x.option === 'string'
          )
        : [],
    }))
    .filter(r => r.refs.length > 0);
}

function rowGroupsFromConfig(config: Record<string, unknown>): RowGroupDef[] {
  const raw = Array.isArray(config.groups) ? config.groups : [];
  return raw
    .filter((g): g is { label?: unknown; options?: unknown } => !!g && typeof g === 'object')
    .map(g => ({
      label: typeof g.label === 'string' ? g.label : undefined,
      options: Array.isArray(g.options) ? g.options.filter((o): o is string => typeof o === 'string') : [],
    }))
    .filter(g => g.options.length >= 2);
}

export interface WidgetLike {
  type: TacticalWidgetType;
  /** Null pour un bloc "custom_table" — les catégories réelles sont dans config.dimensions[].categoryId. */
  categoryId: string | null;
  title?: string | null;
  config: Record<string, unknown>;
}

export function tacticalWidgetTitle(
  widget: WidgetLike,
  categories: TacticalCategory[],
  dimensions: TacticalDimension[],
): string {
  if (widget.title) return widget.title;
  if (widget.type === 'custom_table') {
    const rowDefs = customTableRowDefs(widget.config);
    const names = rowDefs.map(r => r.label?.trim() || r.refs.map(ref => ref.option).join(' + ')).filter(Boolean);
    if (names.length === 0) return 'Tableau personnalisé';
    return names.length > 3 ? `${names.slice(0, 3).join(' · ')}…` : names.join(' · ');
  }
  const category = categories.find(c => c.id === widget.categoryId);
  const catName = category?.name ?? 'Catégorie inconnue';
  const dim = typeof widget.config.dimensionId === 'string' ? dimensions.find(d => d.id === widget.config.dimensionId) : undefined;
  const dimX = typeof widget.config.dimensionIdX === 'string' ? dimensions.find(d => d.id === widget.config.dimensionIdX) : undefined;
  const dimY = typeof widget.config.dimensionIdY === 'string' ? dimensions.find(d => d.id === widget.config.dimensionIdY) : undefined;
  if (widget.type === 'cross_matrix') return `${catName} — ${dimX?.name ?? '?'} × ${dimY?.name ?? '?'}`;
  if (widget.type === 'evolution_chart') return dim ? `${catName} — ${dim.name} — Évolution` : `${catName} — Évolution`;
  if (dim) return `${catName} — ${dim.name}`;
  return catName;
}

interface RenderContext {
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
  matches: TacticalMatchRef[];
}

export function renderTacticalWidgetContent(widget: WidgetLike, { events, categories, dimensions, options, matches }: RenderContext): React.ReactNode {
  if (widget.type === 'custom_table') {
    const rowDefs = customTableRowDefs(widget.config);
    if (rowDefs.length === 0) return <EmptyNote>Choisissez au moins une option.</EmptyNote>;
    const hasDanglingRef = rowDefs.some(r => r.refs.some(ref => !dimensions.some(d => d.id === ref.dimensionId && d.categoryId === ref.categoryId)));
    const result = buildCustomTableRows(events, dimensions, rowDefs);
    return (
      <>
        {hasDanglingRef && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.74rem', margin: '0 0 8px', padding: '5px 8px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5 }}>
            <AlertTriangle size={12} /> Une option combinée dans ce bloc a été supprimée — vérifiez sa configuration.
          </p>
        )}
        <DimensionRowsTable
          label={tacticalWidgetTitle(widget, categories, dimensions)}
          rows={result.rows}
          totalActions={result.totalActions}
          totalValeur={result.totalValeur}
          totalRentabilite={result.totalRentabilite}
        />
      </>
    );
  }

  const category = categories.find(c => c.id === widget.categoryId);
  if (!category) return <EmptyNote>Catégorie introuvable.</EmptyNote>;
  const categoryDimensions = dimensions.filter(d => d.categoryId === category.id);
  const valueDimension = findValueDimension(categoryDimensions, category.id);
  const valueByEvent = buildValueByEvent(events, category.id, valueDimension);
  const thresholds = categoryThresholds(category);
  const categoryReport = buildCategoryReport(events, category, categoryDimensions);
  const borderColor = categoryReport.rentabilite !== null ? rentabiliteColor(categoryReport.rentabilite, thresholds) : undefined;

  const warning = !valueDimension ? (
    <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.74rem', margin: '0 0 8px', padding: '5px 8px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5 }}>
      <AlertTriangle size={12} /> Aucune dimension "Valeur" — rentabilité non calculée.
    </p>
  ) : null;

  const expectedOptionsFor = (dimensionId: string): string[] =>
    options
      .filter(o => o.dimensionId === dimensionId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => o.label);

  if (widget.type === 'dimension_table' || widget.type === 'pie_chart') {
    const dim = dimensions.find(d => d.id === widget.config.dimensionId);
    if (!dim) return <EmptyNote>Choisissez une dimension.</EmptyNote>;
    const table = buildDimensionTable(events, category.id, dim, valueByEvent, expectedOptionsFor(dim.id), rowGroupsFromConfig(widget.config));
    return <>{warning}{widget.type === 'pie_chart' ? <TacticalPieChart table={table} /> : <DimensionTableView table={table} thresholds={thresholds} borderColor={borderColor} />}</>;
  }

  if (widget.type === 'cross_matrix') {
    const dimX = dimensions.find(d => d.id === widget.config.dimensionIdX);
    const dimY = dimensions.find(d => d.id === widget.config.dimensionIdY);
    if (!dimX || !dimY) return <EmptyNote>Choisissez deux dimensions.</EmptyNote>;
    const matrix = buildCrossMatrix(events, category.id, dimX, dimY, valueByEvent);
    const displayMode = widget.config.displayMode === 'chart' ? 'chart' : 'table';
    return (
      <>
        {warning}
        {displayMode === 'chart'
          ? <TacticalCrossMatrixChart matrix={matrix} labelX={dimX.name} labelY={dimY.name} />
          : <TacticalCrossMatrix matrix={matrix} labelX={dimX.name} labelY={dimY.name} thresholds={thresholds} />}
      </>
    );
  }

  if (widget.type === 'evolution_chart') {
    const dim = typeof widget.config.dimensionId === 'string' ? dimensions.find(d => d.id === widget.config.dimensionId) : undefined;
    const evolution = dim
      ? buildDimensionEvolution(events, matches, category.id, dim, valueDimension)
      : buildCategoryEvolution(events, matches, category, categoryDimensions);
    if (evolution.length < 2) return <>{warning}<EmptyNote>Pas assez de matchs sur la période sélectionnée.</EmptyNote></>;
    return <>{warning}<TacticalEvolutionChart points={evolution} /></>;
  }

  if (widget.type === 'period_comparison') {
    const dim = dimensions.find(d => d.id === widget.config.dimensionId);
    if (!dim) return <EmptyNote>Choisissez une dimension.</EmptyNote>;

    const periodA = widget.config.periodA as { from: string; to: string } | undefined;
    const periodB = widget.config.periodB as { from: string; to: string } | undefined;

    let matchesA: TacticalMatchRef[];
    let matchesB: TacticalMatchRef[];
    if (periodA?.from && periodA?.to && periodB?.from && periodB?.to) {
      matchesA = matches.filter(m => m.date >= periodA.from && m.date <= periodA.to);
      matchesB = matches.filter(m => m.date >= periodB.from && m.date <= periodB.to);
    } else {
      // Rétrocompatibilité : blocs créés avant l'ajout des périodes choisies (split auto en 2).
      if (matches.length < 2) return <>{warning}<EmptyNote>Pas assez de matchs sur la période sélectionnée.</EmptyNote></>;
      const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
      const mid = Math.ceil(sorted.length / 2);
      matchesA = sorted.slice(0, mid);
      matchesB = sorted.slice(mid);
    }
    if (matchesA.length === 0 || matchesB.length === 0) {
      return <>{warning}<EmptyNote>Aucun match dans l'une des deux périodes choisies.</EmptyNote></>;
    }

    const idsA = new Set(matchesA.map(m => m.id));
    const idsB = new Set(matchesB.map(m => m.id));
    const eventsA = events.filter(e => idsA.has(e.matchId));
    const eventsB = events.filter(e => idsB.has(e.matchId));
    const expected = expectedOptionsFor(dim.id);
    const tableA = buildDimensionTable(eventsA, category.id, dim, buildValueByEvent(eventsA, category.id, valueDimension), expected);
    const tableB = buildDimensionTable(eventsB, category.id, dim, buildValueByEvent(eventsB, category.id, valueDimension), expected);
    const sortedA = [...matchesA].sort((a, b) => a.date.localeCompare(b.date));
    const sortedB = [...matchesB].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <>
        {warning}
        <TacticalPeriodComparisonChart
          tableA={tableA} tableB={tableB}
          labelA={`${sortedA[0].date} → ${sortedA[sortedA.length - 1].date}`}
          labelB={`${sortedB[0].date} → ${sortedB[sortedB.length - 1].date}`}
        />
      </>
    );
  }

  return null;
}
