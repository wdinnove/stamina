import type { ReactNode } from 'react';

interface RpeKpiCardProps {
  accent: string;
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  labelColor?: string;
  /** Désactive la mise en majuscules du label (défaut: true) */
  labelUppercase?: boolean;
  sub?: ReactNode;
  /** Variante compacte (padding réduit, sans bordure pleine, valeur plus petite) — pour grilles denses */
  compact?: boolean;
}

export function RpeKpiCard({ accent, label, value, valueColor, labelColor = '#94A3B8', labelUppercase = true, sub, compact = false }: RpeKpiCardProps) {
  return (
    <div style={{
      backgroundColor: compact ? '#1E2229' : '#161920',
      border: compact ? undefined : '1px solid #2A2F3A',
      borderLeft: `3px solid ${accent}`,
      borderRadius: compact ? 6 : 8,
      padding: compact ? '10px' : '14px 16px',
    }}>
      <p style={{ color: labelColor, fontSize: compact ? '0.68rem' : '0.7rem', textTransform: labelUppercase ? 'uppercase' : 'none', letterSpacing: labelUppercase ? '0.05em' : undefined, margin: compact ? '0 0 3px' : '0 0 6px' }}>{label}</p>
      <p style={{ color: valueColor ?? accent, fontSize: compact ? '1.1rem' : '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{value}</p>
      {sub != null && <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}
