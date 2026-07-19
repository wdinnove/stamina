import { useRef, type ReactNode, type PointerEvent } from 'react';

/** Navigation au doigt/souris (pointer events) pour les cartes carrousel — swipe gauche/droite. */
export function useSwipeCarousel(count: number, index: number, setIndex: (i: number) => void) {
  const startX = useRef<number | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => { startX.current = e.clientX; },
    onPointerUp: (e: PointerEvent) => {
      if (startX.current === null || count <= 1) return;
      const delta = e.clientX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < 30) return;
      setIndex(delta < 0 ? (index + 1) % count : (index - 1 + count) % count);
    },
    style: { touchAction: 'pan-y' as const, userSelect: 'none' as const },
  };
}

/** Points de navigation partagés par toutes les cartes carrousel de l'app. */
export function CarouselDots({ count, index, onSelect }: { count: number; index: number; onSelect: (i: number) => void }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} onClick={() => onSelect(i)} aria-label={`Élément ${i + 1}`}
          style={{
            width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
            backgroundColor: i === index ? '#CBD5E1' : '#2A2F3A',
          }} />
      ))}
    </div>
  );
}

/**
 * Piste défilante partagée par les cartes carrousel — anime le passage d'un élément à
 * l'autre (slide) au lieu d'un remplacement instantané, et gère nativement le swipe.
 */
export function SlideCarousel<T>({ items, index, setIndex, renderItem }: {
  items: T[]; index: number; setIndex: (i: number) => void; renderItem: (item: T) => ReactNode;
}) {
  const swipe = useSwipeCarousel(items.length, index, setIndex);
  const clamped = Math.min(index, Math.max(items.length - 1, 0));
  return (
    <div style={{ overflow: 'hidden' }} onPointerDown={swipe.onPointerDown} onPointerUp={swipe.onPointerUp}>
      <div style={{ display: 'flex', transform: `translateX(-${clamped * 100}%)`, transition: 'transform 0.3s ease', ...swipe.style }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: '0 0 100%', minWidth: 0 }}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
