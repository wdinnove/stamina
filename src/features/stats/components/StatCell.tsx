import { ReactNode } from 'react';

/** En-tête de colonne pour les tableaux de stats */
export function Th({ children, left }: { children: ReactNode; left?: boolean }) {
  return (
    <th style={{
      color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '6px 8px', fontWeight: 600, textAlign: left ? 'left' : 'center',
      whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', background: '#1E2229',
    }}>
      {children}
    </th>
  );
}

/** Cellule de données pour les tableaux de stats */
export function Td({ children, highlight, left }: { children: ReactNode; highlight?: string; left?: boolean }) {
  return (
    <td style={{
      padding: '7px 8px', textAlign: left ? 'left' : 'center',
      color: highlight ?? '#F1F5F9',
      fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem',
      borderBottom: '1px solid #2A2F3A22',
    }}>
      {children}
    </td>
  );
}

/** Ligne de section entre les équipes ou les groupes */
export function StatRow({
  label, value, opp,
}: {
  label: string;
  value: string | number;
  opp?: string | number;
}) {
  const better  = opp !== undefined && typeof value === 'number' && typeof opp === 'number';
  const vColor  = better ? (value > opp ? '#00E5A0' : value < opp ? '#EF4444' : '#94A3B8') : '#F1F5F9';
  const oColor  = better ? (opp > value ? '#00E5A0' : opp < value ? '#EF4444' : '#94A3B8') : '#94A3B8';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: opp !== undefined ? '1fr 100px 100px' : '1fr 100px', gap: 8, padding: '6px 0', borderBottom: '1px solid #2A2F3A22', alignItems: 'center' }}>
      <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>{label}</span>
      <span style={{ color: vColor, fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{value}</span>
      {opp !== undefined && <span style={{ color: oColor, fontWeight: 700, fontSize: '0.88rem', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{opp}</span>}
    </div>
  );
}
