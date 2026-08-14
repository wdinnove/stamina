import type { CSSProperties } from 'react';
import { Plus } from 'lucide-react';

/**
 * Le bouton d'ajout de l'app. Même icône, même libellé (« Ajouter » + l'objet), mêmes marges
 * partout — chaque page en avait sa copie, avec son padding et sa taille de police à elle.
 *
 * Trois tenues pour trois rôles, mais un seul gabarit :
 *  - `solid`  : l'action principale d'une page ou d'une carte (fond vert) ;
 *  - `soft`   : un ajout secondaire, à côté d'autres commandes (fond sourd, bordure) ;
 *  - `dashed` : l'ajout en bas d'une liste, qui prolonge la liste plutôt que de la surmonter.
 *
 * Le libellé disparaît sous 640 px pour les deux premières — l'icône suffit dans un en-tête
 * serré. La variante `dashed`, elle, occupe sa ligne : elle le garde toujours.
 */

export type AddButtonVariant = 'solid' | 'soft' | 'dashed';

const PADDING = '8px 16px';
const RADIUS  = 7;
const GAP     = 7;
const FONT    = '0.85rem';

function look(variant: AddButtonVariant, disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      backgroundColor: variant === 'dashed' ? 'transparent' : '#1E2229',
      border: variant === 'solid' ? 'none' : `1px ${variant === 'dashed' ? 'dashed' : 'solid'} #2A2F3A`,
      color: '#475569',
    };
  }
  switch (variant) {
    case 'solid':  return { backgroundColor: '#00E5A0', border: 'none', color: '#0D0F14' };
    case 'soft':   return { backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8' };
    case 'dashed': return { backgroundColor: 'transparent', border: '1px dashed #2A2F3A', color: '#00E5A0' };
  }
}

export function AddButton({
  label, onClick, variant = 'solid', disabled = false, type = 'button', title, style,
}: {
  /** Libellé complet, objet compris : « Ajouter un exercice ». */
  label: string;
  onClick?: () => void;
  variant?: AddButtonVariant;
  disabled?: boolean;
  /** `submit` pour un bouton qui valide le petit formulaire dans lequel il vit. */
  type?: 'button' | 'submit';
  title?: string;
  /** Réservé aux cas où la disposition l'exige — pas au style du bouton lui-même. */
  style?: CSSProperties;
}) {
  const full = variant === 'dashed';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: GAP,
        padding: PADDING, borderRadius: RADIUS,
        fontWeight: 700, fontSize: FONT, whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        ...(full ? { width: '100%' } : {}),
        ...look(variant, disabled),
        ...style,
      }}
    >
      <Plus size={15} style={{ flexShrink: 0 }} />
      {full ? label : <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}
