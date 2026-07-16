import type { ReactNode } from 'react';

/**
 * Champ de filtre "légende sur la bordure" (fieldset/legend natif) — utilisé par DateRangeCard
 * et tout autre bloc de filtres (ex. Saison/Équipe) pour un style visuel unique et cohérent.
 */

export const FILTER_FIELD_WIDTH = 130;

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid #2A2F3A', borderRadius: 5, padding: '0 8px 4px', margin: 0,
  minWidth: 0, flexShrink: 0,
};

const legendStyle: React.CSSProperties = {
  padding: '0 4px', fontSize: '0.58rem', color: '#64748B', lineHeight: 1,
  textTransform: 'uppercase', letterSpacing: '0.03em',
};

/** Style à appliquer au select/input placé à l'intérieur d'un FilterField (sans bordure propre). */
export const filterControlStyle: React.CSSProperties = {
  border: 'none', outline: 'none', background: 'transparent',
  color: '#F1F5F9', fontSize: '0.78rem', width: '100%', padding: 0,
  colorScheme: 'dark', cursor: 'pointer',
};

export function FilterField({ legend, width = FILTER_FIELD_WIDTH, disabled, children }: {
  legend: string; width?: number; disabled?: boolean; children: ReactNode;
}) {
  return (
    <fieldset style={{ ...fieldsetStyle, width, opacity: disabled ? 0.5 : 1 }}>
      <legend style={legendStyle}>{legend}</legend>
      {children}
    </fieldset>
  );
}
