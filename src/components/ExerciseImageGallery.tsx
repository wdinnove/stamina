import { useState } from 'react';
import { X } from 'lucide-react';
import type { ExerciseImage } from '../data/types';

export function ExerciseImageGallery({ images, alt }: { images: ExerciseImage[]; alt: string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {images.map(img => (
          <button key={img.id} type="button" onClick={() => setLightbox(img.url)}
            style={{ padding: 0, border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in', background: '#0D0F14', width: '100%', display: 'block' }}>
            <img src={img.url} alt={alt} style={{ width: '100%', maxWidth: '100%', maxHeight: 300, height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
          </button>
        ))}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}>
          <button type="button" onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(22,25,32,0.9)', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <img src={lightbox} alt={alt} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
