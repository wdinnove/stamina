import { User, ChevronDown } from 'lucide-react';
import { playerNameFull } from '../utils/playerName';

interface PlayerSelectOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface PlayerSelectProps {
  players: PlayerSelectOption[];
  value: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function PlayerSelect({ players, value, onChange, style, disabled }: PlayerSelectProps) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 200, ...style }}>
      <User size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%', padding: '8px 30px 8px 32px', backgroundColor: '#1E2229',
          border: '1px solid #00E5A050', borderRadius: 6, color: '#F1F5F9',
          fontSize: '0.85rem', fontWeight: 600, outline: 'none', appearance: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {players.map(p => (
          <option key={p.id} value={p.id}>{playerNameFull(p)}</option>
        ))}
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 8, color: '#475569', pointerEvents: 'none' }} />
    </div>
  );
}
