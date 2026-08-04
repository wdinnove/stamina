import { ChevronDown } from 'lucide-react';
import { ARCHETYPE_SELECTIONS, type ArchetypeSelection } from '../data/archetypes';

interface ArchetypeSelectProps {
  value: ArchetypeSelection;
  onChange: (selection: ArchetypeSelection) => void;
  style?: React.CSSProperties;
}

/** Sélecteur de profil/dimension groupé par catégorie — même style que IndicatorSelect. */
export function ArchetypeSelect({ value, onChange, style }: ArchetypeSelectProps) {
  const groups: string[] = [];
  const byGroup = new Map<string, ArchetypeSelection[]>();
  ARCHETYPE_SELECTIONS.forEach(s => {
    if (!byGroup.has(s.group)) { byGroup.set(s.group, []); groups.push(s.group); }
    byGroup.get(s.group)!.push(s);
  });
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200, flex: 1, ...style }}>
      <select
        value={`${value.kind}:${value.key}`}
        onChange={e => {
          const [kind, key] = e.target.value.split(':') as [ArchetypeSelection['kind'], string];
          const found = ARCHETYPE_SELECTIONS.find(s => s.kind === kind && s.key === key);
          if (found) onChange(found);
        }}
        style={{
          width: '100%', padding: '8px 30px 8px 12px', backgroundColor: '#1E2229',
          border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
          fontSize: '0.82rem', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer',
        }}
      >
        {groups.map(g => (
          <optgroup key={g} label={g}>
            {byGroup.get(g)!.map(s => (
              <option key={`${s.kind}:${s.key}`} value={`${s.kind}:${s.key}`}>{s.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 8, color: '#475569', pointerEvents: 'none' }} />
    </div>
  );
}
