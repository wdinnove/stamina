import { importanceConfig } from '../data/config';
import type { Objective } from '../data/types';

/** Fond de colonne si un objectif actif existe sur cet indicateur, sinon undefined (pas de style ajouté) */
export function objectiveColumnBg(indicatorKey: string, objectives: Objective[]): string | undefined {
  const objective = objectives.find(o => o.active && o.indicatorKey === indicatorKey);
  return objective ? importanceConfig[objective.importance].bg : undefined;
}
