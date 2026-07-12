import { useRef } from 'react';
import { Upload, X } from 'lucide-react';

const MAX_EXERCISE_IMAGES = 3;

export interface ExerciseImagePickerItem {
  key: string;
  url: string;
}

export function ExerciseImagePicker({
  items, onAdd, onRemove, disabled,
}: {
  items: ExerciseImagePickerItem[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const remaining = MAX_EXERCISE_IMAGES - items.length;

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length > 0) onAdd(files);
    if (ref.current) ref.current.value = '';
  }

  return (
    <div>
      <input ref={ref} type="file" accept="image/*" multiple onChange={pick} style={{ display: 'none' }} disabled={disabled} />
      <div style={{ display: 'flex', gap: 10 }}>
        {items.map(item => (
          <div key={item.key} style={{ position: 'relative', flex: '1 1 0', minWidth: 0, height: 150, borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2F3A', background: '#0D0F14' }}>
            <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <button type="button" onClick={() => onRemove(item.key)} disabled={disabled}
              style={{ position: 'absolute', top: 5, right: 5, padding: 4, background: 'rgba(13,15,20,0.88)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, color: '#EF4444', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex' }}>
              <X size={11} />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button type="button" onClick={() => ref.current?.click()} disabled={disabled}
            style={{ flex: '1 1 0', minWidth: 0, height: 150, background: '#1E2229', border: '2px dashed #2A2F3A', borderRadius: 8, color: '#475569', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = '#3A4049'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; }}>
            <Upload size={20} />
            <span style={{ fontSize: '0.75rem', textAlign: 'center', padding: '0 6px' }}>
              {items.length === 0 ? 'Ajouter des images' : `Ajouter (${remaining} max)`}
            </span>
          </button>
        )}
      </div>
      {remaining === 0 && (
        <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 6 }}>
          Maximum de {MAX_EXERCISE_IMAGES} images atteint.
        </div>
      )}
    </div>
  );
}
