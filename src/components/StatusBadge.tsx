import { statusConfig } from '../data/config';
import type { PlayerStatus } from '../data/types';

interface StatusBadgeProps {
  status: PlayerStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = statusConfig[status];
  return (
    <span style={{
      color: cfg.color, backgroundColor: cfg.bg,
      fontSize: size === 'sm' ? '0.7rem' : '0.75rem',
      padding: size === 'sm' ? '2px 6px' : '3px 8px',
      borderRadius: 4, fontWeight: 600, letterSpacing: '0.02em',
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: size === 'sm' ? 5 : 6, height: size === 'sm' ? 5 : 6, borderRadius: '50%', backgroundColor: cfg.color, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}
