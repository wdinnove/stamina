import { impactLabel, type PlayerImpact } from '../data/pca';

interface PlayerImpactListProps {
  impacts: PlayerImpact[];
}

const MATCHES_COL = 60;
const LABEL_COL = 130;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {impacts.map(f => {
          const pct = Math.round(Math.abs(f.corr) * 100);
          const color = f.corr > 0 ? '#00E5A0' : '#EF4444';
          return (
            <div key={f.playerId} style={{ display: 'grid', gridTemplateColumns: `minmax(140px, 220px) 1fr ${MATCHES_COL}px ${LABEL_COL}px`, alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600 }}>{f.label}</span>
              <div style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap', textAlign: 'right' }}>{f.n} matchs</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {impactLabel(f.corr)}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.5, margin: '16px 0 0', borderTop: '1px solid #2A2F3A', paddingTop: 10 }}>
        Plus la barre est verte et longue, plus ce joueur hausse son niveau les soirs de victoire. À l'inverse, une barre rouge signifie que
        ses meilleures performances sont surtout arrivées lors de défaites — ça ne veut pas dire qu'il en est responsable : le temps de jeu,
        le niveau de l'adversaire ou le scénario du match y sont aussi pour beaucoup. À lire comme une tendance à surveiller, pas comme un
        verdict, surtout sur un petit nombre de matchs.
      </p>
    </div>
  );
}
