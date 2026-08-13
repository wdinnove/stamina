import type { ReactNode, CSSProperties } from 'react';

/** Couleur de repli d'une catégorie sans couleur définie (exercices, séances) — le gris neutre
 *  de l'app. Partagée pour ne pas laisser un `undefined` produire des styles invalides du type
 *  `"undefined18"`, et pour ne pas répéter le littéral à chaque point d'affichage. */
export const CATEGORY_FALLBACK_COLOR = '#94A3B8';

interface BadgeProps {
  color: string;
  /** Fond du badge — défaut : `${color}22` (même convention que partout dans l'app) */
  bg?: string;
  label: ReactNode;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

/** Pastille colorée (statut/tier/type…) — mutualise le style répété dans ~30 fichiers de l'app. */
export function Badge({ color, bg, label, size = 'md', style }: BadgeProps) {
  return (
    <span style={{
      color, backgroundColor: bg ?? `${color}22`,
      fontSize: size === 'sm' ? '0.68rem' : '0.78rem',
      fontWeight: 700,
      padding: size === 'sm' ? '2px 7px' : '3px 8px',
      borderRadius: 4, whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
      ...style,
    }}>
      {label}
    </span>
  );
}
