import { indicatorByKey, getSeries, type CrossScope } from '../data/crossAnalysis';
import type { Objective, ObjectiveComparator } from '../data/types';

export interface ObjectiveWindowResult {
  label: string;
  /** Moyenne sur la fenêtre, null si aucun match dans la fenêtre */
  value: number | null;
  /** null = pas assez de données pour se prononcer */
  met: boolean | null;
}

export interface ObjectiveWindows {
  objective: Objective;
  /** [Dernier match, 3 derniers matchs, Saison] */
  windows: ObjectiveWindowResult[];
}

function compare(value: number, comparator: ObjectiveComparator, threshold: number): boolean {
  switch (comparator) {
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq':  return value === threshold;
  }
}

function windowResult(label: string, values: number[], comparator: ObjectiveComparator, threshold: number): ObjectiveWindowResult {
  if (!values.length) return { label, value: null, met: null };
  const value = values.reduce((a, b) => a + b, 0) / values.length;
  return { label, value, met: compare(value, comparator, threshold) };
}

/** Valeur d'un objectif (domaine Match uniquement) sur 3 fenêtres fixes — dernier match, 3 derniers
 * matchs, saison — indépendamment du filtre de période actif ailleurs sur la page. */
export function evaluateObjectiveWindows(objective: Objective, scope: CrossScope, seasonStart?: string, seasonEnd?: string): ObjectiveWindows {
  const def = indicatorByKey(objective.indicatorKey);
  if (!def) return { objective, windows: [] };

  const today = new Date().toLocaleDateString('sv');
  const refEnd = seasonEnd && seasonEnd < today ? seasonEnd : today;
  const from = seasonStart ?? '2000-01-01';

  const series = getSeries(def, scope, from, refEnd).sort((a, b) => a.date.localeCompare(b.date));
  const vals = series.map(p => p.value);

  return {
    objective,
    windows: [
      windowResult('Dernier match', vals.slice(-1), objective.comparator, objective.thresholdValue),
      windowResult('3 derniers matchs', vals.slice(-3), objective.comparator, objective.thresholdValue),
      windowResult('Saison', vals, objective.comparator, objective.thresholdValue),
    ],
  };
}
