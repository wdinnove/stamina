import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FilterField, filterControlStyle } from './FilterField';

/** Dropdown adversaires à cases à cocher — même mécanique ouverture/fermeture (useRef + mousedown)
 *  que le sélecteur de matchs des onglets Comparer, mais keyé par nom d'adversaire. */
function OpponentDropdown({ opponents, selected, onToggle }: {
  opponents: string[]; selected: Set<string>; onToggle: (opponent: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = selected.size === 0
    ? 'Tous les adversaires'
    : selected.size === 1
      ? [...selected][0]
      : `${selected.size} adversaires`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ ...filterControlStyle, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none' }}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <ChevronDown size={13} style={{ color: '#475569', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 200,
          backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 300,
          maxHeight: 260, overflowY: 'auto',
        }}>
          {opponents.length === 0 ? (
            <div style={{ padding: '10px 12px', color: '#475569', fontSize: '0.78rem' }}>Aucun adversaire</div>
          ) : opponents.map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #1E2229', fontSize: '0.78rem' }}>
              <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} style={{ accentColor: '#00E5A0', cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export type TacticalHomeAwayFilter = 'all' | 'home' | 'away';
export type TacticalResultFilter = 'all' | 'win' | 'loss';

interface TacticalFilterBarProps {
  opponents: string[];
  selectedOpponents: Set<string>;
  onToggleOpponent: (opponent: string) => void;
  homeAway: TacticalHomeAwayFilter;
  onHomeAway: (v: TacticalHomeAwayFilter) => void;
  result: TacticalResultFilter;
  onResult: (v: TacticalResultFilter) => void;
}

/** 3 filtres tactiques (adversaires, lieu, résultat), au même style que les autres champs de
 *  `DateRangeCard` (fieldset `FilterField`) — destiné à être passé dans son slot `extra`. */
export function TacticalFilterBar({ opponents, selectedOpponents, onToggleOpponent, homeAway, onHomeAway, result, onResult }: TacticalFilterBarProps) {
  return (
    <>
      <FilterField legend="Adversaires" width={170}>
        <OpponentDropdown opponents={opponents} selected={selectedOpponents} onToggle={onToggleOpponent} />
      </FilterField>
      <FilterField legend="Lieu">
        <select value={homeAway} onChange={e => onHomeAway(e.target.value as TacticalHomeAwayFilter)} style={filterControlStyle}>
          <option value="all">Tous</option>
          <option value="home">Domicile</option>
          <option value="away">Extérieur</option>
        </select>
      </FilterField>
      <FilterField legend="Résultat">
        <select value={result} onChange={e => onResult(e.target.value as TacticalResultFilter)} style={filterControlStyle}>
          <option value="all">Tous</option>
          <option value="win">Victoires</option>
          <option value="loss">Défaites</option>
        </select>
      </FilterField>
    </>
  );
}
