import { EmptyState } from './EmptyState';
import type { TeamMatchStat } from '../data/types';

/** Même intitulé de section que les tableaux de l'onglet voisin. */
const TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: 0,
};

/**
 * Les quatre facteurs de Dean Oliver pour UN match, les nôtres face à ceux de l'adversaire.
 *
 * Extraits de `MatchDetailPage` — quatre-vingts lignes de JSX inline dans une page qui en compte
 * deux mille, sans autre entrée que `teamStats`. Leur onglet suit Stats avancées : c'en est la
 * lecture collective, et les deux se consultent l'un après l'autre.
 *
 * Ils ne dépendent QUE des totaux collectifs : un match sans aucune ligne individuelle (import
 * partiel, adversaire suivi en anonyme) les affiche quand même.
 */
export function MatchFourFactors({ teamStats, opponentName }: {
  teamStats: TeamMatchStat | null;
  opponentName: string;
}) {
  if (!teamStats) {
    return (
      <div>
        <p style={TITLE}>Four factors</p>
        <EmptyState message="Statistiques collectives requises — elles viennent de l'import de feuille de marque ou de la publication d'une saisie." />
      </div>
    );
  }

  const oppFga = teamStats.opp_fg2a + teamStats.opp_fg3a;
  const oppFtRate = oppFga > 0 ? Math.round(teamStats.opp_fta / oppFga * 100) / 100 : null;
  const factors: { label: string; desc: string; weight: string; own: number | null; opp: number | null; higherIsBetter: boolean; fmt: (v: number) => string }[] = [
    { label: 'eFG%', desc: 'Efficacité au tir pondérant le 3pts', weight: '40%', own: teamStats.efgPct, opp: teamStats.opp_efgPct, higherIsBetter: true, fmt: v => `${v}%` },
    { label: 'TO%', desc: 'Balles perdues par 100 possessions', weight: '25%', own: teamStats.toPct, opp: teamStats.opp_toPct, higherIsBetter: false, fmt: v => `${v}%` },
    { label: 'OREB%', desc: 'Part des rebonds offensifs captés', weight: '20%', own: teamStats.orebPct, opp: teamStats.opp_orebPct, higherIsBetter: true, fmt: v => `${v}%` },
    { label: 'FT Rate', desc: 'Lancers-francs obtenus par tir tenté', weight: '15%', own: teamStats.ftRate, opp: oppFtRate, higherIsBetter: true, fmt: v => v.toFixed(2) },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={TITLE}>Four factors</p>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
        {factors.map(f => {
          const ownBetter = f.own !== null && f.opp !== null && (f.higherIsBetter ? f.own > f.opp : f.own < f.opp);
          const oppBetter = f.own !== null && f.opp !== null && (f.higherIsBetter ? f.opp > f.own : f.opp < f.own);
          const maxVal = Math.max(f.own ?? 0, f.opp ?? 0, 0.01);
          const ownPct = f.own !== null ? Math.min((f.own / maxVal) * 100, 100) : 0;
          const oppPct = f.opp !== null ? Math.min((f.opp / maxVal) * 100, 100) : 0;
          return (
            <div key={f.label} className="p-3 sm:p-4" style={{ backgroundColor: '#1E2229', border: `1px solid ${ownBetter ? '#00E5A020' : oppBetter ? '#EF444420' : '#2A2F3A'}`, borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#F1F5F9', fontWeight: 800, fontSize: '1rem' }}>{f.label}</span>
                    <span style={{ fontSize: '0.6rem', color: '#334155', backgroundColor: '#0D1117', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{f.weight}</span>
                  </div>
                  <span style={{ color: '#334155', fontSize: '0.65rem', display: 'block', marginTop: 2 }}>{f.desc}</span>
                </div>
                {ownBetter && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#00E5A0', backgroundColor: '#00E5A012', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>✓ Avantage</span>}
                {oppBetter && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#EF4444', backgroundColor: '#EF444412', padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>✗ Désavantage</span>}
              </div>
              {/* Mon équipe */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Mon équipe</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: ownBetter ? '#00E5A0' : oppBetter ? '#EF4444' : '#F1F5F9', fontFamily: 'JetBrains Mono, monospace' }}>
                    {f.own !== null ? f.fmt(f.own) : '—'}
                  </span>
                </div>
                <div style={{ height: 6, backgroundColor: '#2A2F3A', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${ownPct}%`, backgroundColor: ownBetter ? '#22C55E' : oppBetter ? '#EF4444' : '#475569', borderRadius: 4 }} />
                </div>
              </div>
              {/* Adversaire */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{opponentName}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}>
                    {f.opp !== null ? f.fmt(f.opp) : '—'}
                  </span>
                </div>
                <div style={{ height: 6, backgroundColor: '#2A2F3A', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${oppPct}%`, backgroundColor: '#475569', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: '0.68rem', color: '#2A2F3A', textAlign: 'center' }}>
        Modèle Dean Oliver — les poids indiqués reflètent l'importance relative de chaque facteur.
      </p>
    </div>
  );
}
