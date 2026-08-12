import { indicatorByKey, getSeries, periodValueOf, type CrossScope, type IndicatorDef } from '../data/crossAnalysis';
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

/** Valeur d'un objectif (domaine Match uniquement) sur 3 fenêtres fixes — dernier match, 3 derniers
 * matchs, saison — indépendamment du filtre de période actif ailleurs sur la page. */
export function evaluateObjectiveWindows(
  objective: Objective, scope: CrossScope, seasonStart?: string, seasonEnd?: string,
  extraTeamIndicators: IndicatorDef[] = [],
): ObjectiveWindows {
  const def = indicatorByKey(objective.indicatorKey, extraTeamIndicators);
  if (!def) return { objective, windows: [] };

  const today = new Date().toLocaleDateString('sv');
  const refEnd = seasonEnd && seasonEnd < today ? seasonEnd : today;
  const from = seasonStart ?? '2000-01-01';

  const series = getSeries(def, scope, from, refEnd).sort((a, b) => a.date.localeCompare(b.date));
  const vals = series.map(p => p.value);

  // Périmètre joueur : la valeur de chaque fenêtre passe par `periodValueOf`, qui agrège les
  // ratios en sommant numérateur et dénominateur au lieu de moyenner les ratios de chaque match.
  // La fenêtre est traduite en bornes de dates depuis la série (les k derniers matchs joués).
  // Périmètre équipe : pas de `periodValueOf` (il est individuel), on garde la moyenne de la série.
  const player = scope.player;
  const windowValue = (lastK: number | null): number | null => {
    const dates = series.map(p => p.date);
    if (!dates.length) return null;
    const winFrom = lastK === null ? from : dates[Math.max(0, dates.length - lastK)];
    if (!player) {
      const slice = lastK === null ? vals : vals.slice(-lastK);
      return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
    }
    return periodValueOf(def, player, winFrom, refEnd);
  };

  const window = (label: string, lastK: number | null): ObjectiveWindowResult => {
    const value = windowValue(lastK);
    if (value === null) return { label, value: null, met: null };
    return { label, value, met: compare(value, objective.comparator, objective.thresholdValue) };
  };

  return {
    objective,
    windows: [
      window('Dernier match', 1),
      window('3 derniers matchs', 3),
      window('Saison', null),
    ],
  };
}
