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
  /** true pour une catégorie où une valeur basse est meilleure (défense) — inverse le sens de
   *  comparaison aux seuils. false par défaut (attaque : plus haut = meilleur). */
  inversee?: boolean;
}
const DEFAULT_THRESHOLDS: RentabiliteThresholds = { vert: 1, bleu: 0.6, ambre: 0.3 };

/** Coloration centralisée de la rentabilité — seuils par défaut si aucun n'est fourni (ex. catégorie non chargée). */
export function rentabiliteColor(v: number, thresholds: RentabiliteThresholds = DEFAULT_THRESHOLDS): string {
  if (thresholds.inversee) {
    if (v <= thresholds.vert)  return '#00E5A0';
    if (v <= thresholds.bleu)  return '#3B82F6';
    if (v <= thresholds.ambre) return '#F59E0B';
    return '#EF4444';
  }
  if (v >= thresholds.vert)  return '#00E5A0';
  if (v >= thresholds.bleu)  return '#3B82F6';
  if (v >= thresholds.ambre) return '#F59E0B';
  return '#EF4444';
}

export function categoryThresholds(category: TacticalCategory): RentabiliteThresholds {
  return {
    vert: category.rentabiliteSeuilVert, bleu: category.rentabiliteSeuilBleu, ambre: category.rentabiliteSeuilAmbre,
    inversee: category.rentabiliteInversee,
  };
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

/** Fusion de plusieurs options d'une même dimension en une seule ligne sommée (ex. "P-SIDE 4" + "P-SIDE 5"). */
export interface RowGroupDef {
  label?: string;
  options: string[];
}

/**
 * Table Option / Actions / Répartition % / Valeur / Rentabilité pour une dimension d'une
 * catégorie. `expectedOptions` (catalogue configuré, dans l'ordre voulu) fait apparaître une
 * ligne à 0 pour tout ce qui n'a aucune action sur la période — sans catalogue (défaut),
 * seules les valeurs effectivement observées apparaissent, triées par volume (comportement
 * historique inchangé). `groups` fusionne certaines options en une seule ligne sommée (actions
 * et valeur sommées) — la rentabilité de la ligne fusionnée reste un calcul (valeur/actions
 * ayant une valeur numérique), jamais une somme de rentabilités.
 */
export function buildDimensionTable(
  events: TacticalEvent[],
  categoryId: string,
  dimension: TacticalDimension,
  valueByEvent: Map<string, number>,
  expectedOptions: string[] = [],
  groups: RowGroupDef[] = [],
): DimensionTable {
  // Tout est indexé par libellé NORMALISÉ (accents, casse, espaces), jamais par libellé brut.
  // Les valeurs d'événements sont stockées telles qu'elles arrivent du CSV : deux exports écrivant
  // « Panier » et « panier » produisaient deux lignes distinctes ici, alors que l'attribut de
  // rentabilité correspondant (`buildTacticalIndicators`, crossAnalysis.ts) normalise et n'en voit
  // qu'une. Le rapport tactique et l'indicateur qui porte le même nom donnaient donc deux
  // rentabilités différentes — l'une pouvait être verte et l'autre rouge.
  const counts = new Map<string, number>();
  const sums = new Map<string, number>();
  const sumCounts = new Map<string, number>();
  /** normalisé -> libellé affiché : celui du catalogue s'il existe, sinon le premier observé. */
  const display = new Map<string, string>();

  for (const label of expectedOptions) {
    const key = normalizeTacticalName(label);
    counts.set(key, 0);
    display.set(key, label); // le catalogue configuré est la référence d'affichage
  }

  for (const event of events) {
    if (event.categoryId !== categoryId) continue;
    const value = event.values.find(v => v.dimensionId === dimension.id);
    if (!value) continue;
    const key = normalizeTacticalName(value.label);
    if (!display.has(key)) display.set(key, value.label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const v = valueByEvent.get(event.id);
    if (v !== undefined) {
      sums.set(key, (sums.get(key) ?? 0) + v);
      sumCounts.set(key, (sumCounts.get(key) ?? 0) + 1);
    }
  }

  const groupedAwayKeys = new Set<string>();
  for (const group of groups) {
    if (group.options.length < 2) continue; // un groupe d'une seule option n'a aucun effet
    let mergedCount = 0, mergedSum = 0, mergedSumCount = 0, anyPresent = false;
    for (const opt of group.options) {
      const key = normalizeTacticalName(opt);
      if (counts.has(key)) anyPresent = true;
      mergedCount += counts.get(key) ?? 0;
      mergedSum += sums.get(key) ?? 0;
      mergedSumCount += sumCounts.get(key) ?? 0;
      counts.delete(key); sums.delete(key); sumCounts.delete(key);
      groupedAwayKeys.add(key);
    }
    if (!anyPresent) continue;
    const mergedLabel = group.label?.trim() || group.options.join(' + ');
    const mergedKey = normalizeTacticalName(mergedLabel);
    counts.set(mergedKey, mergedCount);
    sums.set(mergedKey, mergedSum);
    sumCounts.set(mergedKey, mergedSumCount);
    display.set(mergedKey, mergedLabel);
  }

  const totalActions = [...counts.values()].reduce((a, b) => a + b, 0);
  const makeRow = (key: string): DimensionOptionRow => {
    const actions = counts.get(key) ?? 0;
    const sc = sumCounts.get(key) ?? 0;
    return {
      label: display.get(key) ?? key,
      actions,
      sharePct: totalActions > 0 ? actions / totalActions : 0,
      valeur: sc > 0 ? sums.get(key)! : null,
      rentabilite: sc > 0 ? sums.get(key)! / sc : null,
    };
  };

  const remainingExpected = expectedOptions
    .map(normalizeTacticalName)
    .filter(key => !groupedAwayKeys.has(key));
  const expectedSet = new Set(remainingExpected);
  const extraKeys = [...counts.keys()]
    .filter(key => !expectedSet.has(key))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  const rows = [...remainingExpected.map(makeRow), ...extraKeys.map(makeRow)];

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

/** Référence à une option précise d'une dimension d'une catégorie — brique d'une ligne de tableau personnalisé. */
export interface CustomTableOptionRef {
  categoryId: string;
  dimensionId: string;
  option: string;
}

/** Une ligne d'un tableau personnalisé : une option seule, ou plusieurs options fusionnées (même dimension ou non) en une ligne sommée. */
export interface CustomTableRowDef {
  label?: string;
  refs: CustomTableOptionRef[];
}

export interface CustomTableResult {
  rows: DimensionOptionRow[];
  totalActions: number;
  totalValeur: number | null;
  totalRentabilite: number | null;
}

/**
 * Construit un tableau dont chaque ligne est composée librement par l'utilisateur : une option
 * de n'importe quelle dimension/catégorie, ou plusieurs fusionnées en une seule ligne sommée
 * (actions et valeur sommées sur tous les `refs` de la ligne — la rentabilité reste un calcul,
 * jamais une somme). `sharePct` est calculé sur le total des lignes définies, pas sur un total
 * de dimension — chaque ligne est traitée comme "l'option" d'un tableau synthétique.
 */
export function buildCustomTableRows(events: TacticalEvent[], dimensions: TacticalDimension[], rowDefs: CustomTableRowDef[]): CustomTableResult {
  const valueByEventByCategory = new Map<string, Map<string, number>>();
  function valueByEventFor(categoryId: string): Map<string, number> {
    let m = valueByEventByCategory.get(categoryId);
    if (!m) {
      const categoryDimensions = dimensions.filter(d => d.categoryId === categoryId);
      const valueDimension = findValueDimension(categoryDimensions, categoryId);
      m = buildValueByEvent(events, categoryId, valueDimension);
      valueByEventByCategory.set(categoryId, m);
    }
    return m;
  }

  const raw = rowDefs.map(def => {
    let actions = 0, sum = 0, sumCount = 0;
    const labels: string[] = [];
    for (const ref of def.refs) {
      const dim = dimensions.find(d => d.id === ref.dimensionId && d.categoryId === ref.categoryId);
      if (!dim) continue;
      labels.push(ref.option);
      const valueByEvent = valueByEventFor(ref.categoryId);
      // Comparaison sur le libellé normalisé, comme `buildDimensionTable` : sinon une ligne
      // personnalisée visant « Panier » raterait les événements écrits « panier ».
      const refKey = normalizeTacticalName(ref.option);
      for (const event of events) {
        if (event.categoryId !== ref.categoryId) continue;
        const value = event.values.find(v => v.dimensionId === dim.id);
        if (!value || normalizeTacticalName(value.label) !== refKey) continue;
        actions++;
        const v = valueByEvent.get(event.id);
        if (v !== undefined) { sum += v; sumCount++; }
      }
    }
    return { label: def.label?.trim() || labels.join(' + ') || '—', actions, sum, sumCount };
  });

  const totalActions = raw.reduce((a, r) => a + r.actions, 0);
  const rows: DimensionOptionRow[] = raw.map(r => ({
    label: r.label,
    actions: r.actions,
    sharePct: totalActions > 0 ? r.actions / totalActions : 0,
    valeur: r.sumCount > 0 ? r.sum : null,
    rentabilite: r.sumCount > 0 ? r.sum / r.sumCount : null,
  }));

  const totalSum = raw.reduce((a, r) => a + r.sum, 0);
  const totalSumCount = raw.reduce((a, r) => a + r.sumCount, 0);

  return {
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
  // categoryEvents (déjà filtrés), pas events : buildValueByEvent/buildDimensionTable refiltrent
  // de toute façon par categoryId en interne, mais partir de la liste complète de la saison leur
  // ferait rescanner inutilement tous les événements des AUTRES catégories, à chaque dimension.
  const valueByEvent = buildValueByEvent(categoryEvents, category.id, valueDimension);

  const dimensionTables = categoryDimensions
    .filter(d => d.id !== valueDimension?.id)
    .map(d => {
      const expectedOptions = options
        .filter(o => o.dimensionId === d.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(o => o.label);
      return buildDimensionTable(categoryEvents, category.id, d, valueByEvent, expectedOptions);
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
  // Même indexation normalisée que `buildDimensionTable`, sinon deux variantes de casse ouvriraient
  // deux lignes (ou deux colonnes) pour la même option, chacune avec la moitié des actions.
  const display = new Map<string, string>();

  for (const event of events) {
    if (event.categoryId !== categoryId) continue;
    const vx = event.values.find(v => v.dimensionId === dimensionX.id);
    const vy = event.values.find(v => v.dimensionId === dimensionY.id);
    if (!vx || !vy) continue;
    const kx = normalizeTacticalName(vx.label);
    const ky = normalizeTacticalName(vy.label);
    if (!display.has(kx)) display.set(kx, vx.label);
    if (!display.has(ky)) display.set(ky, vy.label);
    const key = `${kx}::${ky}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
    xTotals.set(kx, (xTotals.get(kx) ?? 0) + 1);
    yTotals.set(ky, (yTotals.get(ky) ?? 0) + 1);
    const v = valueByEvent.get(event.id);
    if (v !== undefined) {
      cellSums.set(key, (cellSums.get(key) ?? 0) + v);
      cellSumCounts.set(key, (cellSumCounts.get(key) ?? 0) + 1);
    }
  }

  const optionsX = [...xTotals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => display.get(key) ?? key);
  const optionsY = [...yTotals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => display.get(key) ?? key);

  // L'agrégation se fait en normalisé, mais les clés exposées sont les libellés d'affichage : le
  // contrat de `cells` est « `${labelX}::${labelY}` » avec les libellés de `optionsX`/`optionsY`,
  // et c'est comme ça que les consommateurs y accèdent.
  const cells = new Map<string, CrossMatrixCell>();
  for (const [key, actions] of cellCounts) {
    const [kx, ky] = key.split('::');
    const displayKey = `${display.get(kx) ?? kx}::${display.get(ky) ?? ky}`;
    const sc = cellSumCounts.get(key) ?? 0;
    cells.set(displayKey, { actions, rentabilite: sc > 0 ? cellSums.get(key)! / sc : null });
  }

  return { optionsX, optionsY, cells, totalActions: [...cellCounts.values()].reduce((a, b) => a + b, 0) };
}
