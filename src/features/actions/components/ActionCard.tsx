import { CheckCircle, Circle, Clock } from 'lucide-react';
import { PlayerAvatar } from '../../../components';
import { getPlayerById, categoryConfig, priorityConfig } from '../../../data';
import type { Action, ActionStatus } from '../../../data';

interface ActionCardProps {
  action: Action;
  showDate?: boolean;
  compact?: boolean;
  onMarkDone: (id: string) => void;
}

const REF_DATE = '2026-01-15';

export function ActionCard({ action, showDate = true, compact = false, onMarkDone }: ActionCardProps) {
  const player   = getPlayerById(action.playerId);
  const catCfg   = categoryConfig[action.category];
  const priCfg   = priorityConfig[action.priority];
  const isOverdue = action.dueDate < REF_DATE && action.status !== 'done';
  const isDone    = action.status === 'done';

  if (compact) {
    return (
      <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, padding: '10px' }}>
        {player && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <PlayerAvatar player={player} size={18} />
            <span style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{player.lastName} {player.firstName[0]}.</span>
          </div>
        )}
        <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, margin: '0 0 6px' }}>{action.title}</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ color: catCfg.color, fontSize: '0.65rem', backgroundColor: catCfg.color + '18', padding: '1px 5px', borderRadius: 3 }}>{catCfg.label}</span>
          <span style={{ color: priCfg.color, fontSize: '0.65rem', fontWeight: 600 }}>{priCfg.label}</span>
        </div>
        <p style={{ color: '#475569', fontSize: '0.68rem', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} /> {action.dueDate.slice(5).replace('-', '/')}
        </p>
        {!isDone && (
          <button onClick={() => onMarkDone(action.id)}
            style={{ marginTop: 6, width: '100%', padding: '4px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 4, color: '#475569', cursor: 'pointer', fontSize: '0.72rem' }}>
            Marquer fait
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#161920',
      border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.25)' : '#2A2F3A'}`,
      borderRadius: 8, padding: '12px 14px', opacity: isDone ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={() => onMarkDone(action.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDone ? '#00E5A0' : '#475569', padding: 0, marginTop: 2, flexShrink: 0 }}>
          {isDone ? <CheckCircle size={18} /> : <Circle size={18} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            {player && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PlayerAvatar player={player} size={20} />
                <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600 }}>{player.lastName} {player.firstName[0]}.</span>
              </div>
            )}
            <span style={{ color: '#2A2F3A' }}>—</span>
            <span style={{ color: isDone ? '#475569' : '#F1F5F9', fontSize: '0.85rem', fontWeight: 500, textDecoration: isDone ? 'line-through' : 'none' }}>
              {action.title}
            </span>
          </div>
          {action.description && (
            <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 6px' }}>{action.description}</p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: catCfg.color, fontSize: '0.7rem', backgroundColor: catCfg.color + '18', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>{catCfg.label}</span>
            <span style={{ color: priCfg.color, fontSize: '0.7rem', fontWeight: 600 }}>{priCfg.label}</span>
            <span style={{ color: '#475569', fontSize: '0.72rem' }}>Assigné : {action.assignedTo}</span>
          </div>
        </div>
        {showDate && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: isOverdue ? '#EF4444' : action.dueDate === REF_DATE ? '#F59E0B' : '#94A3B8', fontSize: '0.75rem', fontWeight: isOverdue ? 700 : 400, flexShrink: 0 }}>
            <Clock size={11} />
            {isOverdue
              ? `Échue J-${Math.abs(Math.ceil((new Date(action.dueDate).getTime() - new Date(REF_DATE).getTime()) / 86400000))}`
              : action.dueDate.slice(5).replace('-', '/')}
          </span>
        )}
      </div>
    </div>
  );
}
