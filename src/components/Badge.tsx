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

/** Libellé de repli quand la ligne a perdu sa catégorie — supprimée depuis, ou jamais choisie.
 *  Un trou dans une colonne se lit comme un bug ; « Sans catégorie » se lit comme un état. */
export const CATEGORY_MISSING_LABEL = 'Sans catégorie';

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

/** La catégorie d'équipe telle qu'elle s'affiche partout — y compris absente. Les couleurs
 *  viennent de la configuration de l'équipe, pas d'une table figée dans le code. */
export function CategoryBadge({ name, color, size = 'md', style }: {
  name?: string;
  color?: string;
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  return (
    <Badge
      color={color ?? CATEGORY_FALLBACK_COLOR}
      label={name ?? CATEGORY_MISSING_LABEL}
      size={size}
      style={style} />
  );
}
