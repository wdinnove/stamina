import { useState } from 'react';
import { positionColors } from '../data/config';
import type { Player } from '../data/types';

interface PlayerAvatarProps {
  player: Player;
  size?: number;
}

export function PlayerAvatar({ player, size = 40 }: PlayerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const bg       = positionColors[player.position] ?? '#475569';
  const initials = `${player.firstName[0]}${player.lastName[0]}`;

  if (player.photoUrl && !imgError) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        overflow: 'hidden', flexShrink: 0,
        border: `2px solid ${bg}55`,
      }}>
        <img
          src={player.photoUrl}
          alt={`${player.firstName} ${player.lastName}`}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

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
