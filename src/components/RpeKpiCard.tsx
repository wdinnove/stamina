import type { ReactNode } from 'react';

interface RpeKpiCardProps {
  accent: string;
  label: ReactNode;
  value: ReactNode;
  valueColor?: string;
  sub?: ReactNode;
}

export function RpeKpiCard({ accent, label, value, valueColor, sub }: RpeKpiCardProps) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '14px 16px' }}>
      <p style={{ color: '#94A3B8', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>{label}</p>
      <p style={{ color: valueColor ?? accent, fontSize: '1.5rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>{value}</p>
      {sub != null && <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>{sub}</p>}
    </div>
  );
}
