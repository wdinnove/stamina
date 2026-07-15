import type { ReactNode, CSSProperties, DragEvent } from 'react';
import { Plus } from 'lucide-react';

interface DropzoneEmptyStateProps {
  label: ReactNode;
  onClick?: () => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
  /** Survol drag & drop actif — bordure en accent vert (défaut: false, pas de drag-and-drop) */
  dragOver?: boolean;
  onDragOver?: (e: DragEvent<HTMLElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLElement>) => void;
  /** Icône affichée avant le label (défaut : Plus). Passer `null` pour n'afficher aucune icône. */
  icon?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}

/** Zone vide cliquable (bordure en pointillés) pour "ajouter un élément" — mutualise le style
 *  répété dans une dizaine de pages (séquences, documents, images, présences, réunions, exercices…). */
export function DropzoneEmptyState({
  label, onClick, onDrop, dragOver = false, onDragOver, onDragLeave, icon, disabled = false, style,
}: DropzoneEmptyStateProps) {
  const content = <>{icon === undefined ? <Plus size={14} /> : icon}{label}</>;
  const sharedStyle: CSSProperties = {
    border: `1px dashed ${dragOver ? '#00E5A0' : '#2A2F3A'}`, borderRadius: 8,
    padding: '20px 16px', minHeight: 60, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    textAlign: 'center', color: disabled ? '#334155' : '#475569', fontSize: '0.8rem', width: '100%',
    background: 'none', fontFamily: 'inherit',
    cursor: onClick ? (disabled ? 'not-allowed' : 'pointer') : undefined, transition: 'border-color 0.15s',
    ...style,
  };

  if (onClick) {
    return (
      <button type="button" disabled={disabled} onClick={onClick} onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} style={sharedStyle}>
        {content}
      </button>
    );
  }
  return (
    <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} style={sharedStyle}>
      {content}
    </div>
  );
}
