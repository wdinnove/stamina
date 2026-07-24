import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { IndicatorDef } from '../data/crossAnalysis';

/** Liste repliable des attributs "Rentabilité de X / Y / Z" générés dynamiquement pour l'équipe —
 *  permet de voir ce qui est disponible pour Objectifs/Corrélations sans devoir ouvrir un de ces
 *  deux écrans et parcourir leurs sélecteurs pour le découvrir. */
export function TacticalIndicatorCatalog({ indicators }: { indicators: IndicatorDef[] }) {
  const [open, setOpen] = useState(false);
  if (indicators.length === 0) return null;

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Attributs "Rentabilité" disponibles pour Objectifs/Corrélations ({indicators.length})
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #2A2F3A', maxHeight: 260, overflowY: 'auto' }}>
          {indicators.map(def => (
            <div key={def.key} style={{ padding: '7px 12px', borderBottom: '1px solid #1E2229', fontSize: '0.78rem', color: '#F1F5F9' }}>
              {def.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
