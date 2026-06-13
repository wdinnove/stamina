import { Clock } from 'lucide-react';
import { PlayerAvatar } from '../../../components';
import { getPlayerById, categoryConfig, priorityConfig } from '../../../data';
import type { Action } from '../../../data';

interface UpcomingActionsProps {
  actions: Action[];
  refDate?: string;
}

export function UpcomingActions({ actions, refDate = '2026-01-15' }: UpcomingActionsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map(action => {
        const player = getPlayerById(action.playerId);
        const cat = categoryConfig[action.category];
        const pri = priorityConfig[action.priority];
        const isOverdue = action.dueDate < refDate;
        return (
          <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: '#1E2229', borderRadius: 6 }}>
            {player && <PlayerAvatar player={player} size={28} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {player ? `${player.lastName} ${player.firstName[0]}.` : '—'} · {action.title}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ color: cat.color, fontSize: '0.7rem', backgroundColor: cat.color + '18', padding: '2px 6px', borderRadius: 3 }}>{cat.label}</span>
              <span style={{ color: pri.color, fontSize: '0.72rem', fontWeight: 600 }}>{pri.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: isOverdue ? '#EF4444' : '#94A3B8', fontSize: '0.72rem' }}>
                <Clock size={11} />{action.dueDate.slice(5).replace('-', '/')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
