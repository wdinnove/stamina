import { impactLabel, type PlayerImpact } from '../data/pca';

interface PlayerImpactListProps {
  impacts: PlayerImpact[];
}

export function PlayerImpactList({ impacts }: PlayerImpactListProps) {
  if (impacts.length === 0) {
    return (
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        Impossible de dégager une tendance pour l'instant : il faut au moins 5 matchs évalués par joueur pour que le calcul ait du sens.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {impacts.map(f => {
          const pct = Math.round(Math.abs(f.corr) * 100);
          const color = f.corr > 0 ? '#00E5A0' : '#EF4444';
          return (
            <div key={f.playerId}
              className="grid items-center gap-3 [grid-template-columns:minmax(140px,220px)_1fr_130px] sm:[grid-template-columns:minmax(140px,220px)_1fr_60px_130px]">
              <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600 }}>{f.label}</span>
              <div className="hidden sm:block" style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
              </div>
              <span className="sm:hidden" style={{ color, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                {pct}%
              </span>
              <span className="hidden sm:inline" style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap', textAlign: 'right' }}>{f.n} matchs</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {impactLabel(f.corr)}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.7, margin: '20px 0 0' }}>
        <span style={{ color: '#00E5A0', fontWeight: 700 }}>Vert</span> : ce joueur est meilleur lors des victoires de l'équipe.
        <br />
        <span style={{ color: '#EF4444', fontWeight: 700 }}>Rouge</span> : ses meilleures performances arrivent plutôt lors des défaites.
        <br />
        Cela ne signifie pas qu'il en est responsable — le temps de jeu, le niveau de l'adversaire et le scénario du match jouent aussi. À considérer comme une tendance, pas un jugement, surtout sur peu de matchs.
      </p>
    </div>
  );
}
