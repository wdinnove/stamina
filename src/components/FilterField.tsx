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

// Couleurs fixes par groupe (identité A/B, pas de sémantique bien/mal) — partagées par tous les
// sélecteurs des onglets Comparer (par période, par match, par saison, par joueur) et par le rendu
// graphique de PlayerCompareStatBlocks, pour que le violet/vert désigne toujours "groupe A/B".
export const GROUP_A_COLOR = '#8B5CF6';
export const GROUP_B_COLOR = '#00E5A0';

/** Hauteur fixe des containers de groupe (période/joueur/saison/match des onglets Comparer),
 * pour un centrage vertical identique quel que soit le contenu (select, bouton, ou trio de champs). */
export const GROUP_PICKER_HEIGHT = 40;

/** Boîte encadrée de la couleur du groupe, hauteur fixe et contenu centré verticalement, pastille
 * accolée directement au(x) champ(s) sur une seule ligne (pas de libellé "Groupe A/B" séparé). */
export function GroupPickerBox({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div style={{
      flex: 1, minWidth: 240, height: GROUP_PICKER_HEIGHT, display: 'flex', alignItems: 'center', gap: 8,
      border: `1px solid ${color}40`, borderRadius: 8, padding: '0 12px',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
