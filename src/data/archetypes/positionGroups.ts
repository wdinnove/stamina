import type { BasketballPosition } from '../types';

/**
 * Regroupement en 3 blocs pour le pool de comparaison (percentile) — sur un effectif de 12-15
 * joueurs, 5 postes stricts donneraient des pools de 2-3 joueurs, trop petits pour un percentile
 * fiable. L'Ailier Fort est rattaché aux Intérieurs (pas aux Ailiers) : sur la plupart des
 * indicateurs (rebond, protection de cercle, faible volume de création), il est statistiquement
 * plus proche d'un Pivot que d'un Ailier.
 */
export type PositionGroup = 'exterieurs' | 'ailier' | 'interieurs';

export const POSITION_GROUP: Record<BasketballPosition, PositionGroup> = {
  'Meneur': 'exterieurs',
  'Arrière': 'exterieurs',
  'Ailier': 'ailier',
  'Ailier Fort': 'interieurs',
  'Pivot': 'interieurs',
};

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  exterieurs: 'Extérieurs',
  ailier: 'Ailiers',
  interieurs: 'Intérieurs',
};
