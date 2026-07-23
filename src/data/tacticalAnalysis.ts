/**
 * Agrégation des données tactiques (import CSV vidéo) — fonctions pures, même
 * convention que `crossAnalysis.ts`/`pca.ts`. Agnostique du nombre de matchs :
 * sert aussi bien le rapport par match que le rapport agrégé sur la saison.
 */
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption } from './types';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';

export interface RentabiliteThresholds {
  vert: number;
  bleu: number;
  ambre: number;
}
const DEFAULT_THRESHOLDS: RentabiliteThresholds = { vert: 1, bleu: 0.6, ambre: 0.3 };

/** Coloration centralisée de la rentabilité — seuils par défaut si aucun n'est fourni (ex. catégorie non chargée). */
export function rentabiliteColor(v: number, thresholds: RentabiliteThresholds = DEFAULT_THRESHOLDS): string {
  if (v >= thresholds.vert)  return '#00E5A0';
  if (v >= thresholds.bleu)  return '#3B82F6';
  if (v >= thresholds.ambre) return '#F59E0B';
  return '#EF4444';
}

export function categoryThresholds(category: TacticalCategory): RentabiliteThresholds {
  return { vert: category.rentabiliteSeuilVert, bleu: category.rentabiliteSeuilBleu, ambre: category.rentabiliteSeuilAmbre };
}

export interface DimensionOptionRow {
  label: string;
  actions: number;
  sharePct: number;
  /** Somme de la dimension "Valeur" sur les actions ayant cette option — null si aucune valeur numérique. */
  valeur: number | null;
  /** Moyenne de la dimension "Valeur" sur les actions ayant cette option — null si aucune valeur numérique. */
  rentabilite: number | null;
}

export interface DimensionTable {
  dimension: TacticalDimension;
  rows: DimensionOptionRow[];
  totalActions: number;
  totalValeur: number | null;
  totalRentabilite: number | null;
}

export interface CategoryTacticalReport {
  category: TacticalCategory;
  totalActions: number;
  /** Moyenne de la dimension "Valeur" sur toutes les actions de la catégorie — null si pas de dimension "Valeur". */
  rentabilite: number | null;
  /** false si la catégorie n'a aucune dimension nommée "Valeur" — la rentabilité ne peut alors jamais être calculée. */
  hasValueDimension: boolean;
  /** Une table par dimension de la catégorie — la dimension "Valeur" elle-même n'y figure pas (info non exploitable seule). */
  dimensionTables: DimensionTable[];
}

/** Repère la dimension "Valeur" d'une catégorie, par nom normalisé. */
export function findValueDimension(dimensions: TacticalDimension[], categoryId: string): TacticalDimension | undefined {
  return dimensions.find(d => d.categoryId === categoryId && normalizeTacticalName(d.name) === 'valeur');
}

/** eventId -> valeur numérique de la dimension "Valeur" (absent si non numérique ou dimension introuvable). */
export function buildValueByEvent(events: TacticalEvent[], categoryId: string, valueDimension: TacticalDimension | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!valueDimension) return map;
  for (const event of events) {
    if (event.categoryId !== categoryId) continue;
    const value = event.values.find(v => v.dimensionId === valueDimension.id);
    if (!value) continue;
    const n = parseFloat(value.label.replace(',', '.'));
    if (!Number.isNaN(n)) map.set(event.id, n);
  }
  return map;
}

/**
 * Table Option / Actions / Répartition % / Valeur / Rentabilité pour une dimension d'une
 * catégorie. `expectedOptions` (catalogue configuré, dans l'ordre voulu) fait apparaître une
 * ligne à 0 pour tout ce qui n'a aucune action sur la période — sans catalogue (défaut),
 * seules les valeurs effectivement observées apparaissent, triées par volume (comportement
 * historique inchangé).
 */
export function buildDimensionTable(
  events: TacticalEvent[],
  categoryId: string,
  dimension: TacticalDimension,
  valueByEvent: Map<string, number>,
  expectedOptions: string[] = [],
): DimensionTable {
  const counts = new Map<string, number>();
  const sums = new Map<string, number>();
  const sumCounts = new Map<string, number>();

  for (const label of expectedOptions) counts.set(label, 0);

  for (const event of events) {
    if (event.categoryId !== categoryId) continue;
    const value = event.values.find(v => v.dimensionId === dimension.id);
    if (!value) continue;
    counts.set(value.label, (counts.get(value.label) ?? 0) + 1);
    const v = valueByEvent.get(event.id);
    if (v !== undefined) {
      sums.set(value.label, (sums.get(value.label) ?? 0) + v);
      sumCounts.set(value.label, (sumCounts.get(value.label) ?? 0) + 1);
    }
  }

  const totalActions = [...counts.values()].reduce((a, b) => a + b, 0);
  const makeRow = (label: string): DimensionOptionRow => {
    const actions = counts.get(label) ?? 0;
    const sc = sumCounts.get(label) ?? 0;
    return {
      label,
      actions,
      sharePct: totalActions > 0 ? actions / totalActions : 0,
      valeur: sc > 0 ? sums.get(label)! : null,
      rentabilite: sc > 0 ? sums.get(label)! / sc : null,
    };
  };

  const expectedSet = new Set(expectedOptions);
  const extraLabels = [...counts.keys()]
    .filter(label => !expectedSet.has(label))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const rows = [...expectedOptions.map(makeRow), ...extraLabels.map(makeRow)];

  const totalSum = [...sums.values()].reduce((a, b) => a + b, 0);
  const totalSumCount = [...sumCounts.values()].reduce((a, b) => a + b, 0);

  return {
    dimension,
    rows,
    totalActions,
    totalValeur: totalSumCount > 0 ? totalSum : null,
    totalRentabilite: totalSumCount > 0 ? totalSum / totalSumCount : null,
  };
}

/** Rapport complet d'une catégorie : une table par dimension (hors "Valeur"), + rentabilité globale. */
export function buildCategoryReport(
  events: TacticalEvent[],
  category: TacticalCategory,
  dimensions: TacticalDimension[],
  options: TacticalDimensionOption[] = [],
): CategoryTacticalReport {
  const categoryDimensions = dimensions
    .filter(d => d.categoryId === category.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryEvents = events.filter(e => e.categoryId === category.id);

  const valueDimension = findValueDimension(categoryDimensions, category.id);
  const valueByEvent = buildValueByEvent(events, category.id, valueDimension);

  const dimensionTables = categoryDimensions
    .filter(d => d.id !== valueDimension?.id)
    .map(d => {
      const expectedOptions = options
        .filter(o => o.dimensionId === d.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(o => o.label);
      return buildDimensionTable(events, category.id, d, valueByEvent, expectedOptions);
    });

  const values = categoryEvents.map(e => valueByEvent.get(e.id)).filter((v): v is number => v !== undefined);
  const rentabilite = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return {
    category,
    totalActions: categoryEvents.length,
    rentabilite,
    hasValueDimension: !!valueDimension,
    dimensionTables,
  };
}

export interface CategoryEvolutionPoint {
  matchId: string;
  date: string;
  label: string;
  actions: number;
  rentabilite: number | null;
}

/**
 * Évolution match par match d'une catégorie (Actions + Rentabilité), pour les
 * matchs de `matchesInOrder` qui ont au moins une action de cette catégorie —
 * un match sans action n'apparaît pas dans la série (pas de point à 0 trompeur).
 * Réutilise `buildCategoryReport` par match, pas de calcul dupliqué.
 */
export function buildCategoryEvolution(
  events: TacticalEvent[],
  matchesInOrder: { id: string; date: string; label: string }[],
  category: TacticalCategory,
  dimensions: TacticalDimension[],
): CategoryEvolutionPoint[] {
  const points: CategoryEvolutionPoint[] = [];
  for (const match of matchesInOrder) {
    const matchEvents = events.filter(e => e.matchId === match.id);
    if (matchEvents.length === 0) continue;
    const report = buildCategoryReport(matchEvents, category, dimensions);
    if (report.totalActions === 0) continue;
    points.push({
      matchId: match.id,
      date: match.date,
      label: match.label,
      actions: report.totalActions,
      rentabilite: report.rentabilite,
    });
  }
  return points;
}

/**
 * Évolution match par match d'UNE dimension précise (Actions + Rentabilité de cette dimension
 * seule, pas de toute la catégorie) — même filtrage "pas de point si aucune action ce match-là"
 * que `buildCategoryEvolution`. Réutilise `buildDimensionTable` par match.
 */
export function buildDimensionEvolution(
  events: TacticalEvent[],
  matchesInOrder: { id: string; date: string; label: string }[],
  categoryId: string,
  dimension: TacticalDimension,
  valueDimension: TacticalDimension | undefined,
): CategoryEvolutionPoint[] {
  const points: CategoryEvolutionPoint[] = [];
  for (const match of matchesInOrder) {
    const matchEvents = events.filter(e => e.matchId === match.id);
    if (matchEvents.length === 0) continue;
    const valueByEvent = buildValueByEvent(matchEvents, categoryId, valueDimension);
    const table = buildDimensionTable(matchEvents, categoryId, dimension, valueByEvent);
    if (table.totalActions === 0) continue;
    points.push({
      matchId: match.id,
      date: match.date,
      label: match.label,
      actions: table.totalActions,
      rentabilite: table.totalRentabilite,
    });
  }
  return points;
}

export interface CrossMatrixCell {
  actions: number;
  rentabilite: number | null;
}

export interface CrossMatrix {
  /** Libellés de la dimension X, triés par volume décroissant. */
  optionsX: string[];
  /** Libellés de la dimension Y, triés par volume décroissant. */
  optionsY: string[];
  /** Clé = `${labelX}::${labelY}`. */
  cells: Map<string, CrossMatrixCell>;
  totalActions: number;
}

/**
 * Matrice croisée de deux dimensions d'une même catégorie : ne compte que les
 * événements ayant une valeur sur LES DEUX dimensions (sinon pas de cellule à
 * incrémenter côté X ou Y).
 */
export function buildCrossMatrix(
  events: TacticalEvent[],
  categoryId: string,
  dimensionX: TacticalDimension,
  dimensionY: TacticalDimension,
  valueByEvent: Map<string, number>,
): CrossMatrix {
  const cellCounts = new Map<string, number>();
  const cellSums = new Map<string, number>();
  const cellSumCounts = new Map<string, number>();
  const xTotals = new Map<string, number>();
  const yTotals = new Map<string, number>();

  for (const event of events) {
    if (event.categoryId !== categoryId) continue;
    const vx = event.values.find(v => v.dimensionId === dimensionX.id);
    const vy = event.values.find(v => v.dimensionId === dimensionY.id);
    if (!vx || !vy) continue;
    const key = `${vx.label}::${vy.label}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
    xTotals.set(vx.label, (xTotals.get(vx.label) ?? 0) + 1);
    yTotals.set(vy.label, (yTotals.get(vy.label) ?? 0) + 1);
    const v = valueByEvent.get(event.id);
    if (v !== undefined) {
      cellSums.set(key, (cellSums.get(key) ?? 0) + v);
      cellSumCounts.set(key, (cellSumCounts.get(key) ?? 0) + 1);
    }
  }

  const optionsX = [...xTotals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  const optionsY = [...yTotals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);

  const cells = new Map<string, CrossMatrixCell>();
  for (const [key, actions] of cellCounts) {
    const sc = cellSumCounts.get(key) ?? 0;
    cells.set(key, { actions, rentabilite: sc > 0 ? cellSums.get(key)! / sc : null });
  }

  return { optionsX, optionsY, cells, totalActions: [...cellCounts.values()].reduce((a, b) => a + b, 0) };
}
