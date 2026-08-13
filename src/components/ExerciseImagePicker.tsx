import { useRef } from 'react';
import { Upload, X, PencilRuler, Pencil } from 'lucide-react';
import { DropzoneEmptyState } from './DropzoneEmptyState';

/** Quota commun aux images téléversées et aux schémas dessinés dans l'app. */
export const MAX_EXERCISE_IMAGES = 6;

export interface ExerciseImagePickerItem {
  key: string;
  url: string;
  /** Image produite par l'éditeur de schéma : rouvrable, là où un upload n'est que supprimable. */
  isDiagram?: boolean;
}

export function ExerciseImagePicker({
  items, onAdd, onRemove, onCreateDiagram, onEditDiagram, disabled,
}: {
  items: ExerciseImagePickerItem[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  /** Absent = pas d'éditeur de schéma proposé (l'appelant ne sait pas l'enregistrer). */
  onCreateDiagram?: () => void;
  onEditDiagram?: (key: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const remaining = MAX_EXERCISE_IMAGES - items.length;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length > 0) onAdd(files);
    if (ref.current) ref.current.value = '';
  }

  const iconBtn = (onClick: () => void, title: string, color: string, children: React.ReactNode) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: 4, background: 'rgba(13,15,20,0.88)', border: `1px solid ${color}66`,
        borderRadius: 5, color, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex',
      }}>
      {children}
    </button>
  );

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple onChange={pick} style={{ display: 'none' }} disabled={disabled} />

      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 10, marginBottom: 10 }}>
          {items.map(item => (
            <div key={item.key} style={{ position: 'relative', height: 130, borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2F3A', background: '#0D0F14' }}>
              <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: item.isDiagram ? 'contain' : 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 4 }}>
                {item.isDiagram && onEditDiagram && iconBtn(() => onEditDiagram(item.key), 'Modifier le schéma', '#00E5A0', <Pencil size={11} />)}
                {iconBtn(() => onRemove(item.key), 'Supprimer', '#EF4444', <X size={11} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <DropzoneEmptyState
            icon={<Upload size={18} />}
            label="Ajouter des images"
            onClick={() => ref.current?.click()}
            disabled={disabled}
            style={{ flex: '1 1 0', minWidth: 0, height: 74, flexDirection: 'column' }}
          />
          {onCreateDiagram && (
            <DropzoneEmptyState
              icon={<PencilRuler size={18} />}
              label="Dessiner un schéma"
              onClick={onCreateDiagram}
              disabled={disabled}
              style={{ flex: '1 1 0', minWidth: 0, height: 74, flexDirection: 'column' }}
            />
          )}
        </div>
      ) : (
        <div style={{ color: '#475569', fontSize: '0.72rem' }}>
          Maximum de {MAX_EXERCISE_IMAGES} images atteint.
        </div>
      )}
    </div>
  );
}
