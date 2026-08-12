import type { ReactNode, CSSProperties } from 'react';
import { LAYER } from '../styles/layers';

interface ModalProps {
  /** Appelé à la fermeture (bouton X, annuler…) */
  onClose?: () => void;
  /** Ferme aussi au clic sur le fond sombre en dehors de la boîte (défaut: false — un clic
   *  extérieur accidentel ne doit pas faire perdre une saisie en cours dans un formulaire) */
  closeOnBackdropClick?: boolean;
  maxWidth?: number | string;
  maxHeight?: string;
  /**
   * Plan de superposition. Défaut `LAYER.modal`, qui passe au-dessus des barres de navigation.
   * Ne le surcharger que pour empiler une modale sur une AUTRE modale, et alors avec
   * `LAYER.modalOverModal` — jamais un nombre en dur.
   */
  zIndex?: number;
  overlayOpacity?: number;
  /** Le fond scrolle si le contenu dépasse la hauteur de l'écran (défaut: true) */
  scrollOverlay?: boolean;
  /** Alignement vertical de la boîte dans le fond (défaut: 'center') */
  align?: 'center' | 'flex-start';
  style?: CSSProperties;
  /** Classes Tailwind sur la boîte (ex. padding responsive) — se cumule avec `style` */
  className?: string;
  children: ReactNode;
}

/**
 * Coquille commune (fond + boîte centrée) à toutes les modales de l'app — le header/contenu/footer
 * restent entièrement à la charge de l'appelant, seul le fond+conteneur est mutualisé ici.
 *
 * Deux points à ne pas défaire :
 *
 * 1. Le plan par défaut est `LAYER.modal`, au-dessus des barres de navigation. Avec l'ancien
 *    défaut (100, sous les barres à 200), le haut et le bas d'une modale centrée passaient sous
 *    la TopBar et la barre du bas sur mobile.
 * 2. Le fond réserve `MOBILE_BAR_INSET` en haut et en bas sous `md`, et la hauteur maximale de la
 *    boîte est bornée à la zone ainsi dégagée (`min(maxHeight, 100%)`) — sinon une boîte à 85vh
 *    sur un écran de 700 px déborderait à nouveau de la zone utile.
 */
export function Modal({
  onClose, closeOnBackdropClick = false, maxWidth = 480, maxHeight = '90vh', zIndex = LAYER.modal,
  overlayOpacity = 0.75, scrollOverlay = true, align = 'center', style, className, children,
}: ModalProps) {
  return (
    <div
      className="p-4 py-[72px] md:py-4"
      style={{
        position: 'fixed', inset: 0, backgroundColor: `rgba(0,0,0,${overlayOpacity})`, zIndex,
        display: 'flex', alignItems: align, justifyContent: 'center',
        ...(scrollOverlay ? { overflowY: 'auto' as const } : {}),
      }}
      onClick={onClose && closeOnBackdropClick ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}
    >
      <div className={className} style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12,
        width: '100%', maxWidth, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', margin: 'auto',
        ...style,
        // Après `style` : la borne à la zone dégagée par le padding du fond doit gagner, même
        // quand un appelant impose sa propre maxHeight.
        maxHeight: `min(${style?.maxHeight ?? maxHeight}, 100%)`,
      }}>
        {children}
      </div>
    </div>
  );
}
