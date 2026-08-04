import { PROFILES_V1 } from './profiles/v1';
import { DIMENSIONS_V1 } from './dimensions/v1';
import { CATEGORY_LABELS } from './profiles/categories';

/** Une entrée sélectionnable dans le classement d'équipe (profil ou dimension) — regroupée par
 *  catégorie pour l'affichage, comme les indicateurs de `IndicatorSelect` sont groupés par domaine. */
export interface ArchetypeSelection { kind: 'profile' | 'dimension'; key: string; label: string; group: string }

export const ARCHETYPE_SELECTIONS: ArchetypeSelection[] = [
  ...PROFILES_V1.filter(p => p.status !== 'planned').map(p => ({ kind: 'profile' as const, key: p.key, label: p.label, group: CATEGORY_LABELS[p.category] })),
  ...DIMENSIONS_V1.filter(d => d.status !== 'planned').map(d => ({ kind: 'dimension' as const, key: d.key, label: d.label, group: 'Dimensions' })),
];
