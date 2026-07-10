import React from 'react';

export function Card({ children, style, className, onClick, accentColor }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  accentColor?: string;
}) {
  return (
    <div className={className} onClick={onClick} style={{
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

export function CardTitle({ icon, children, info, right, mb = 10, align = 'center' }: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Contenu non-interactif (badge, compteur…) affiché à côté du titre — reste sur la même ligne que lui au lieu de passer avec les boutons */
  info?: React.ReactNode;
  right?: React.ReactNode;
  mb?: number;
  align?: React.CSSProperties['alignItems'];
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 8, alignItems: align, justifyContent: 'space-between', marginBottom: mb }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {icon && <span>{icon}</span>}
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            {children}
          </p>
        </div>
        {info && <span style={{ color: '#475569', fontSize: '0.72rem', textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>{info}</span>}
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center' }}>{right}</div>}
    </div>
  );
}
