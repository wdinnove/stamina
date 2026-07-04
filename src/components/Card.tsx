import React from 'react';

export function Card({ children, style, onClick, accentColor }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  accentColor?: string;
}) {
  return (
    <div onClick={onClick} style={{
      backgroundColor: '#161920',
      border: accentColor ? `1px solid ${accentColor}35` : '1px solid #2A2F3A',
      borderLeft: accentColor ? `3px solid ${accentColor}` : '1px solid #2A2F3A',
      borderRadius: 8,
      padding: '14px 16px',
      cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function CardTitle({ icon, children, right, mb = 10 }: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  mb?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <span>{icon}</span>}
        <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          {children}
        </p>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
