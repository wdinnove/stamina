import { useRef } from 'react';
import { ExternalLink, FileText, Upload, X } from 'lucide-react';

export function ExerciseDocumentPicker({
  fileName, fileUrl, onSelect, onRemove, disabled,
}: {
  fileName?: string;
  fileUrl?: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onSelect(f);
    if (ref.current) ref.current.value = '';
  }

  return (
    <div>
      <input ref={ref} type="file" accept="application/pdf" onChange={pick} style={{ display: 'none' }} disabled={disabled} />
      {fileName ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6 }}>
          <FileText size={16} color="#00E5A0" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#F1F5F9', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noreferrer"
              style={{ color: '#94A3B8', display: 'flex', padding: 3 }} title="Ouvrir">
              <ExternalLink size={14} />
            </a>
          )}
          <button type="button" onClick={() => ref.current?.click()} disabled={disabled}
            style={{ padding: '3px 9px', background: 'transparent', border: '1px solid #2A2F3A', borderRadius: 5, color: '#94A3B8', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '0.72rem' }}>
            Remplacer
          </button>
          <button type="button" onClick={onRemove} disabled={disabled}
            style={{ padding: '3px 7px', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 5, color: '#EF4444', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex' }}>
            <X size={11} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={disabled}
          style={{ width: '100%', padding: '14px', background: '#1E2229', border: '2px dashed #2A2F3A', borderRadius: 8, color: '#475569', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
          onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.borderColor = '#3A4049'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; }}>
          <Upload size={18} />
          <span style={{ fontSize: '0.78rem' }}>Cliquer pour choisir un PDF</span>
        </button>
      )}
    </div>
  );
}
