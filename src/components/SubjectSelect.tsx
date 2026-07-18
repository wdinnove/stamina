import { User, Users, ChevronDown } from 'lucide-react';
import { playerNameFull } from '../utils/playerName';

/** Valeur sentinelle du sélecteur pour désigner l'équipe plutôt qu'un joueur précis */
export const TEAM_SUBJECT = 'team';

interface SubjectSelectPlayer { id: string; firstName: string; lastName: string }

interface SubjectSelectProps {
  players: SubjectSelectPlayer[];
  /** Id joueur, ou TEAM_SUBJECT */
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

/** Sélecteur de sujet pour un côté d'une corrélation : un joueur précis, ou l'équipe */
export function SubjectSelect({ players, value, onChange, style }: SubjectSelectProps) {
  const isTeam = value === TEAM_SUBJECT;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: 180, flex: 1, ...style }}>
      {isTeam
        ? <Users size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />
        : <User size={15} style={{ position: 'absolute', left: 10, color: '#00E5A0', pointerEvents: 'none' }} />}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 30px 8px 32px', backgroundColor: '#1E2229',
          border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
          fontSize: '0.82rem', fontWeight: 600, outline: 'none', appearance: 'none', cursor: 'pointer',
        }}
      >
        <option value={TEAM_SUBJECT}>Équipe</option>
        <optgroup label="Joueurs">
          {players.map(p => (
            <option key={p.id} value={p.id}>{playerNameFull(p)}</option>
          ))}
        </optgroup>
      </select>
      <ChevronDown size={15} style={{ position: 'absolute', right: 8, color: '#475569', pointerEvents: 'none' }} />
    </div>
  );
}
