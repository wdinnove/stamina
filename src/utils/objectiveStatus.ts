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

/**
 * Valeur d'un objectif sur UN SEUL match — pour la fiche match, où la question n'est pas de gérer
 * les objectifs mais de savoir si celui-ci a été tenu ce jour-là.
 *
 * Renvoie `null` si l'indicateur n'est pas mesurable sur un match (charge, bien-être, assiduité) :
 * un objectif de RPE n'a rien à dire d'un match donné.
 */
export function evaluateObjectiveAt(
  objective: Objective, scope: CrossScope, date: string,
  extraTeamIndicators: IndicatorDef[] = [],
): { value: number; met: boolean } | null {
  const def = indicatorByKey(objective.indicatorKey, extraTeamIndicators);
  if (!def || def.domain !== 'match') return null;

  // Fenêtre réduite au jour du match, avec la même agrégation qu'ailleurs des deux côtés :
  // `periodValueOf` côté joueuse, `teamPeriodValue` côté équipe. Sur un seul match les deux
  // coïncident avec la valeur du match — sauf plateau/tournoi, où la série fusionnerait les deux
  // matchs du jour en un point moyenné alors que le ratio de sommes les additionne correctement.
  const value = scope.player
    ? periodValueOf(def, scope.player, date, date)
    : scope.team && def.teamPeriodValue
      ? def.teamPeriodValue(scope.team, date, date)
      : getSeries(def, scope, date, date)[0]?.value ?? null;
  if (value === null) return null;

  return { value, met: compare(value, objective.comparator, objective.thresholdValue) };
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

  // Les deux périmètres agrègent désormais de la même façon — ratio de sommes pour un ratio,
  // moyenne sur les MATCHS pour un volume (§ 4) — via `periodValueOf` côté joueuse et
  // `def.teamPeriodValue` côté équipe. Le périmètre équipe retombait auparavant sur la moyenne de
  // la série, c'est-à-dire la moyenne des pourcentages match par match : un objectif « 3 pts ≥ 32 % »
  // évalué sur 1/1, 2/10 et 3/12 donnait 48,3 % (atteint) au lieu de 26,1 % (non atteint).
  const player = scope.player;
  const team = scope.team;

  /**
   * « k derniers matchs » se découpe sur la LISTE DES MATCHS, pas sur des bornes de dates.
   *
   * Une fenêtre exprimée en dates ne peut pas séparer deux matchs joués le même jour : sur un
   * plateau, « 3 derniers matchs » ramenait la date du 2ᵉ match de la journée et en couvrait donc
   * 4. On restreint plutôt le périmètre aux k dernières lignes, puis on laisse `periodValueOf` /
   * `teamPeriodValue` agréger ce sous-ensemble — ils refiltrent par date, ce qui est alors sans
   * effet. C'est ce qui rend vraie la promesse du § 10 : « 3 matchs, pas 3 journées ».
   */
  const lastKMatches = <T extends { date: string }>(rows: T[], lastK: number | null): T[] => {
    const inRange = rows
      .filter(m => m.date >= from && m.date <= refEnd)
      .sort((a, b) => a.date.localeCompare(b.date));
    return lastK === null ? inRange : inRange.slice(-lastK);
  };

  const windowValue = (lastK: number | null): number | null => {
    if (player) {
      const scoped = { ...player, matchStats: lastKMatches(player.matchStats, lastK) };
      return periodValueOf(def, scoped, from, refEnd);
    }
    if (team && def.teamPeriodValue) {
      const scoped = { ...team, teamMatchStats: lastKMatches(team.teamMatchStats, lastK) };
      return def.teamPeriodValue(scoped, from, refEnd);
    }
    // Charge / bien-être / assiduité : chaque point de série est déjà une observation quotidienne,
    // la moyenne de la série est la bonne réponse — et il n'y a pas de « match » à découper.
    if (!series.length) return null;
    const slice = lastK === null ? vals : vals.slice(-lastK);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
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
