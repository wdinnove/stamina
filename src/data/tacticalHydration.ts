/**
 * Traduction des actions stockées (codes compacts) en actions analysables (libellés).
 *
 * Le stockage ne garde qu'un entier par dimension ; toute l'analyse (`tacticalAnalysis`,
 * `crossAnalysis`, widgets) continue de raisonner en libellés. La conversion se fait ICI, une
 * seule fois au chargement, à partir du catalogue déjà en mémoire.
 *
 * Effet de bord voulu : les libellés rendus viennent tous du catalogue, ils sont donc canoniques
 * par construction. Deux orthographes du même libellé ne peuvent plus coexister dans les données,
 * ce que la normalisation à la lecture servait à rattraper.
 */
import type {
  TacticalAction, TacticalEvent, TacticalEventValue,
  TacticalDimension, TacticalDimensionOption,
} from './types';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';

/** Index des dimensions par `catégorie:slot` et de la dimension « Valeur » de chaque catégorie. */
function indexDimensions(dimensions: TacticalDimension[]) {
  const bySlot = new Map<string, TacticalDimension>();
  const valueDimension = new Map<string, TacticalDimension>();
  for (const dimension of dimensions) {
    bySlot.set(`${dimension.categoryId}:${dimension.slot}`, dimension);
    if (normalizeTacticalName(dimension.name) === 'valeur') valueDimension.set(dimension.categoryId, dimension);
  }
  return { bySlot, valueDimension };
}

/** Identité de calcul d'une action — jamais stockée, seulement une clé de regroupement stable. */
export function tacticalEventId(action: Pick<TacticalAction, 'matchId' | 'categoryId' | 'seq'>): string {
  return `${action.matchId}:${action.categoryId}:${action.seq}`;
}

export function hydrateTacticalActions(
  actions: TacticalAction[],
  dimensions: TacticalDimension[],
  options: TacticalDimensionOption[],
): TacticalEvent[] {
  const { bySlot, valueDimension } = indexDimensions(dimensions);
  const labelByCode = new Map<string, string>();
  for (const option of options) labelByCode.set(`${option.dimensionId}:${option.code}`, option.label);

  return actions.map(action => {
    const values: TacticalEventValue[] = [];

    action.options.forEach((code, slot) => {
      if (code === null || code === undefined) return;
      const dimension = bySlot.get(`${action.categoryId}:${slot}`);
      // Dimension ou option supprimée de la configuration depuis l'import : la valeur n'est plus
      // interprétable, on l'ignore plutôt que d'inventer un libellé.
      if (!dimension) return;
      const label = labelByCode.get(`${dimension.id}:${code}`);
      if (label === undefined) return;
      values.push({ dimensionId: dimension.id, label });
    });

    // La dimension « Valeur » n'occupe pas de case dans `options` : elle a sa colonne dédiée.
    const valueDim = valueDimension.get(action.categoryId);
    if (valueDim && action.valeur !== null) {
      values.push({ dimensionId: valueDim.id, label: String(action.valeur) });
    }

    return {
      id: tacticalEventId(action),
      matchId: action.matchId,
      categoryId: action.categoryId,
      sequenceNumber: action.seq,
      values,
      playerIds: action.playerIds,
    };
  });
}
