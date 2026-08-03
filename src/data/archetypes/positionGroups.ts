import type { BasketballPosition } from '../types';

/**
 * Regroupement en 2 blocs pour le pool de comparaison (percentile) — un 3e bloc "Ailier" séparé
 * (essayé en premier) donnait des groupes de 2-3 joueurs sur un effectif amateur de 12-15,
 * beaucoup trop petits pour un percentile fiable. Mélanger ce petit groupe avec l'effectif
 * entier pour compenser (`blendWithSquadVectors`, retiré) réintroduisait le biais cross-position
 * que le découpage par poste devait justement corriger, au point d'inverser le sens du score
 * dans certains cas (voir audit). 2 blocs plus larges (6-9 joueurs chacun sur un effectif type)
 * restent assez grands pour un percentile fiable sans mélange — voir
 * `MIN_GROUP_SIZE_FOR_FULL_CONFIDENCE` pour le cas où un groupe reste petit malgré tout.
 */
export type PositionGroup = 'exterieurs' | 'interieurs';

export const POSITION_GROUP: Record<BasketballPosition, PositionGroup> = {
  'Meneur': 'exterieurs',
  'Arrière': 'exterieurs',
  'Ailier': 'exterieurs',
  'Ailier Fort': 'interieurs',
  'Pivot': 'interieurs',
};

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  exterieurs: 'Extérieurs',
  interieurs: 'Intérieurs',
};

/** Sous ce nombre de joueurs dans le groupe de comparaison, le percentile reste calculé au sein
 *  du groupe (jamais mélangé avec un pool plus large et potentiellement biaisé), mais la
 *  confiance affichée est dégradée d'un cran et un caveat explicite est ajouté — le score garde
 *  son vrai sens, on prévient juste que le pool de comparaison est petit. */
export const MIN_GROUP_SIZE_FOR_FULL_CONFIDENCE = 6;
