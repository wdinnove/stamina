import { impactLabel, type WinFactor } from '../data/pca';

interface WinFactorsListProps {
  factors: WinFactor[];
  maxItems?: number;
  minCorr?: number;
}

const LABEL_COL = 130;

export function WinFactorsList({ factors, maxItems = 8, minCorr = 0.15 }: WinFactorsListProps) {
  const shown = factors.filter(f => Math.abs(f.corr) >= minCorr).slice(0, maxItems);

  if (shown.length === 0) {
    return (
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        Pas de tendance nette à signaler pour l'instant — encore quelques matchs, et le classement se précisera.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {shown.map(f => {
          const pct = Math.round(Math.abs(f.corr) * 100);
          const color = f.corr > 0 ? '#00E5A0' : '#EF4444';
          return (
            <div key={f.label} style={{ display: 'grid', gridTemplateColumns: `minmax(140px, 220px) 1fr ${LABEL_COL}px`, alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600 }}>{f.label}</span>
              <div className="hidden sm:block" style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
              </div>
              <span className="sm:hidden" style={{ color, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                {pct}%
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {impactLabel(f.corr)}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.7, margin: '20px 0 0' }}>
        <span style={{ color: '#00E5A0', fontWeight: 700 }}>Vert</span> : l'équipe gagne davantage quand cette statistique est élevée.
        <br />
        <span style={{ color: '#EF4444', fontWeight: 700 }}>Rouge</span> : l'équipe gagne davantage quand cette statistique est basse.
      </p>
    </div>
  );
}
