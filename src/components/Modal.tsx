import type { ReactNode, CSSProperties } from 'react';

interface ModalProps {
  /** Appelé à la fermeture (bouton X, annuler…) */
  onClose?: () => void;
  /** Ferme aussi au clic sur le fond sombre en dehors de la boîte (défaut: false — un clic
   *  extérieur accidentel ne doit pas faire perdre une saisie en cours dans un formulaire) */
  closeOnBackdropClick?: boolean;
  maxWidth?: number | string;
  maxHeight?: string;
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

/** Coquille commune (fond + boîte centrée) à toutes les modales de l'app — le header/contenu/footer
 *  restent entièrement à la charge de l'appelant, seul le fond+conteneur est mutualisé ici.
 *  NB : plusieurs appelants passent un `zIndex` explicite (110, 200, 1000…) pour s'empiler
 *  au-dessus d'une AUTRE modale déjà ouverte (ex. confirmation de suppression par-dessus un
 *  formulaire d'édition) — ne pas changer ce défaut sans vérifier ces empilements. */
export function Modal({
  onClose, closeOnBackdropClick = false, maxWidth = 480, maxHeight = '90vh', zIndex = 100,
  overlayOpacity = 0.75, scrollOverlay = true, align = 'center', style, className, children,
}: ModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: `rgba(0,0,0,${overlayOpacity})`, zIndex,
        display: 'flex', alignItems: align, justifyContent: 'center', padding: 16,
        ...(scrollOverlay ? { overflowY: 'auto' as const } : {}),
      }}
      onClick={onClose && closeOnBackdropClick ? (e => { if (e.target === e.currentTarget) onClose(); }) : undefined}
    >
      <div className={className} style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12,
        width: '100%', maxWidth, maxHeight, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', margin: 'auto',
        ...style,
      }}>
        {children}
      </div>
    </div>
  );
}
