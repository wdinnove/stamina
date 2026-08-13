import { useState } from 'react';
import { Info } from 'lucide-react';
import { LAYER } from '../styles/layers';
import type { IndicatorDef } from '../data/crossAnalysis';

const SENSE_LABEL: Record<NonNullable<IndicatorDef['sense']>, string> = {
  higher:  'Plus haut = mieux',
  lower:   'Plus bas = mieux',
  context: 'Ni bon ni mauvais — sert de contexte',
};

const SENSE_COLOR: Record<NonNullable<IndicatorDef['sense']>, string> = {
  higher:  '#00E5A0',
  lower:   '#F59E0B',
  context: '#64748B',
};

interface Props {
  def: IndicatorDef;
  /** Taille de l'icône (défaut 12, adapté à un en-tête de tableau). */
  size?: number;
}

/**
 * Icône « i » qui déplie l'explication d'un indicateur, au clic et au survol.
 *
 * Le contenu vient entièrement du registre (`explain` / `formula` / `sense`) : aucun texte en dur
 * ici, sinon la même stat finirait expliquée différemment selon l'écran.
 *
 * Ouverture au CLIC et pas seulement au survol : sur mobile il n'y a pas de survol, et le
 * `title` HTML natif n'y apparaît jamais. C'est aussi pour ça que ce composant existe plutôt qu'un
 * simple attribut `title`.
 */
export function StatInfo({ def, size = 12 }: Props) {
  const [open, setOpen] = useState(false);
  if (!def.explain) return null;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`À propos de ${def.label}`}
        style={{
          background: 'none', border: 'none', padding: 0, marginLeft: 4,
          color: open ? '#94A3B8' : '#475569', cursor: 'help', display: 'inline-flex',
        }}
      >
        <Info size={size} />
      </button>

      {open && (
        <span
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: LAYER.dropdown,
            width: 'max-content', maxWidth: 280, textAlign: 'left',
            backgroundColor: '#0F1117', border: '1px solid #2A2F3A', borderRadius: 8,
            padding: '10px 12px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
            display: 'block', whiteSpace: 'normal', textTransform: 'none', letterSpacing: 'normal',
            fontWeight: 400,
          }}
        >
          <span style={{ display: 'block', color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>
            {def.label}
          </span>
          <span style={{ display: 'block', color: '#94A3B8', fontSize: '0.76rem', lineHeight: 1.5 }}>
            {def.explain}
          </span>
          {def.formula && (
            <span style={{
              display: 'block', marginTop: 7, padding: '5px 7px', borderRadius: 4,
              backgroundColor: '#161920', color: '#64748B', fontSize: '0.7rem',
              fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.45,
            }}>
              {def.formula}
            </span>
          )}
          {def.sense && (
            <span style={{ display: 'block', marginTop: 7, color: SENSE_COLOR[def.sense], fontSize: '0.68rem', fontWeight: 600 }}>
              {SENSE_LABEL[def.sense]}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
