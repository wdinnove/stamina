import { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: number;
  trendLabel?: string;
  icon?: ReactNode;
  accentColor?: string;
  onClick?: () => void;
}

export function KPICard({ label, value, unit, trend, trendLabel, icon, accentColor = '#00E5A0', onClick }: KPICardProps) {
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend === undefined ? '#94A3B8' : trend > 0 ? '#00E5A0' : trend < 0 ? '#EF4444' : '#94A3B8';

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '20px',
        cursor: onClick ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = accentColor + '44'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = '#2A2F3A'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', backgroundColor: accentColor }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#94A3B8', fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {label}
        </span>
        {icon && <div style={{ color: accentColor, opacity: 0.8 }}>{icon}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ color: '#F1F5F9', fontSize: '1.8rem', fontWeight: 800, fontFamily: 'Inter', lineHeight: 1 }}>
          {value}
        </span>
        {unit && <span style={{ color: '#94A3B8', fontSize: '0.85rem' }}>{unit}</span>}
      </div>
      {(trendLabel || trend !== undefined) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
          {TrendIcon && <TrendIcon size={12} style={{ color: trendColor }} />}
          <span style={{ color: trendColor, fontSize: '0.75rem', fontWeight: 500 }}>{trendLabel}</span>
        </div>
      )}
    </div>
  );
}
