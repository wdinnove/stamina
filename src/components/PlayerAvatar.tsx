import { positionColors } from '../data/config';
import type { Player } from '../data/types';

interface PlayerAvatarProps {
  player: Player;
  size?: number;
}

export function PlayerAvatar({ player, size = 40 }: PlayerAvatarProps) {
  const initials = `${player.firstName[0]}${player.lastName[0]}`;
  const bg = positionColors[player.position] ?? '#475569';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${bg}33, ${bg}66)`,
      border: `2px solid ${bg}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.35, color: bg,
      flexShrink: 0, userSelect: 'none', fontFamily: 'Inter, sans-serif',
    }}>
      {initials}
    </div>
  );
}
