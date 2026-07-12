import { ChevronDown } from 'lucide-react';
import { DOMAIN_LABELS, type IndicatorDef } from '../data/crossAnalysis';

interface IndicatorSelectProps {
  indicators: IndicatorDef[];
  value: string;
  onChange: (key: string) => void;
  /** Indicateur à exclure (déjà choisi dans l'autre sélecteur) */
  excludeKey?: string;
  style?: React.CSSProperties;
}

/** Sélecteur d'indicateur groupé par domaine, avec pastille de couleur de la série */
export function IndicatorSelect({ indicators, value, onChange, excludeKey, style }: IndicatorSelectProps) {
  const selected = indicators.find(i => i.key === value);
  // Groupes dans l'ordre d'apparition du registre (sous-groupe explicite, sinon libellé du domaine)
  const groups: string[] = [];
  const byGroup = new Map<string, IndicatorDef[]>();
  indicators.forEach(i => {
    const g = i.group ?? DOMAIN_LABELS[i.domain];
    if (!byGroup.has(g)) { byGroup.set(g, []); groups.push(g); }
    byGroup.get(g)!.push(i);
  });
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200, flex: 1, ...style }}>
      <span style={{ position: 'absolute', left: 10, width: 10, height: 10, borderRadius: 3, backgroundColor: selected?.color ?? '#475569', pointerEvents: 'none' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 30px 8px 30px', backgroundColor: '#1E2229',
          border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
          fontSize: '0.82rem', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer',
        }}
      >
        {groups.map(g => (
          <optgroup key={g} label={g}>
            {byGroup.get(g)!.filter(i => i.key !== excludeKey).map(i => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 8, color: '#475569', pointerEvents: 'none' }} />
    </div>
  );
}
