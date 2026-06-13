import { useNavigate } from 'react-router';
import { PlayerAvatar } from '../../../components';
import { getPlayerById } from '../../../data';

interface Alert {
  playerId: string;
  type: 'danger' | 'warning';
  message: string;
  detail: string;
}

interface AlertFeedProps {
  alerts: Alert[];
}

export function AlertFeed({ alerts }: AlertFeedProps) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {alerts.map((alert, idx) => {
        const player = getPlayerById(alert.playerId);
        if (!player) return null;
        const borderColor = alert.type === 'danger' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)';
        const dotColor    = alert.type === 'danger' ? '#EF4444' : '#F59E0B';
        return (
          <div key={idx} onClick={() => navigate(`/players/${alert.playerId}`, { state: { from: '/dashboard' } })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', backgroundColor: '#1E2229', borderRadius: 6, cursor: 'pointer', border: `1px solid ${borderColor}` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, flexShrink: 0 }} />
            <PlayerAvatar player={player} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
                {player.lastName} {player.firstName[0]}.
              </p>
              <p style={{ color: '#94A3B8', fontSize: '0.75rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {alert.message}
              </p>
            </div>
            <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0 }}>{alert.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
