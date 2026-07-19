import { strengthWord } from '../utils/correlation';
import type { WinFactor } from '../data/pca';

interface WinFactorsListProps {
  factors: WinFactor[];
  maxItems?: number;
  minCorr?: number;
}

const HIGH_IS_GOOD_COLOR = '#06B6D4';
const LOW_IS_GOOD_COLOR = '#F59E0B';
const LOW_CONFIDENCE_MATCHES = 8;

function FactorRow({ f, color }: { f: WinFactor; color: string }) {
  const pct = Math.round(Math.abs(f.corr) * 100);
  const lowConfidence = f.n < LOW_CONFIDENCE_MATCHES;
  return (
    <div
      className="grid items-center gap-3 [grid-template-columns:minmax(140px,220px)_1fr_130px] sm:[grid-template-columns:minmax(140px,220px)_1fr_60px_130px]"
      style={{ opacity: lowConfidence ? 0.72 : 1 }}
    >
      <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600 }}>{f.label}</span>
      <div className="hidden sm:block" style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
      </div>
      <span className="sm:hidden" style={{ color, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
        {pct}%
      </span>
      <span className="hidden sm:inline" style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {lowConfidence ? 'tendance fragile' : ''}
      </span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {strengthWord(Math.abs(f.corr))}
      </span>
    </div>
  );
}

export function WinFactorsList({ factors, maxItems = 8, minCorr = 0.15 }: WinFactorsListProps) {
  const shown = factors.filter(f => Math.abs(f.corr) >= minCorr).slice(0, maxItems);

  if (shown.length === 0) {
    return (
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        Pas de tendance nette à signaler pour l'instant — encore quelques matchs, et le classement se précisera.
      </p>
    );
  }

  const team = shown.filter(f => !f.key.startsWith('opp_'));
  const opponent = shown.filter(f => f.key.startsWith('opp_'));

  return (
    <div>
      <p style={{ color: '#64748B', fontSize: '0.68rem', margin: '0 0 16px' }}>
        {shown.length} statistique{shown.length > 1 ? 's' : ''} les plus corrélées avec le résultat, sur {factors.length} suivies (corrélation ≥ {Math.round(minCorr * 100)}%).
      </p>

      {team.length > 0 && (
        <div style={{ marginBottom: opponent.length > 0 ? 24 : 0 }}>
          <h4 style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Nos statistiques
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {team.map(f => (
              <FactorRow key={f.key} f={f} color={f.corr > 0 ? HIGH_IS_GOOD_COLOR : LOW_IS_GOOD_COLOR} />
            ))}
          </div>
        </div>
      )}

      {opponent.length > 0 && (
        <div>
          <h4 style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Statistiques adverses
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {opponent.map(f => (
              <FactorRow key={f.key} f={f} color={f.corr > 0 ? HIGH_IS_GOOD_COLOR : LOW_IS_GOOD_COLOR} />
            ))}
          </div>
        </div>
      )}

      <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.7, margin: '20px 0 0' }}>
        <span style={{ color: HIGH_IS_GOOD_COLOR, fontWeight: 700 }}>Cyan</span> : l'équipe gagne davantage quand cette statistique est élevée.
        <br />
        <span style={{ color: LOW_IS_GOOD_COLOR, fontWeight: 700 }}>Ambre</span> : l'équipe gagne davantage quand cette statistique est basse.
        <br />
        Corrélation, pas causalité : certaines statistiques se recoupent entre elles (l'eFG% dérive des tirs à 2 et 3 points, l'ORtg et le DRtg agrègent plusieurs lignes ci-dessus) — un signal fort sur plusieurs lignes peut refléter une seule et même information comptée deux fois. À lire comme une tendance, pas un plan d'action isolé, surtout quand la mention « tendance fragile » apparaît.
      </p>
    </div>
  );
}
