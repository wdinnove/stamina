import { GitCompare } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { impactLabel, type CorrelationResult } from '../utils/correlation';
import type { IndicatorDef, LagMode } from '../data/crossAnalysis';

export const LAG_OPTIONS: { value: LagMode; label: string }[] = [
  { value: 'week', label: 'Moy. sem.' },
  { value: 0,      label: 'Jour J' },
  { value: 3,      label: 'J-3' },
  { value: 7,      label: 'J-7' },
];

interface CorrelationCardProps {
  a: IndicatorDef;
  b: IndicatorDef;
  result: CorrelationResult | null;
  lagDays: LagMode;
  onLagChange: (days: LagMode) => void;
}

/** Phrase décrivant comment les deux indicateurs sont appariés (ancrage match, décalage…) */
function pairingHint(a: IndicatorDef, b: IndicatorDef, lag: LagMode): string {
  const aIsMatch = a.domain === 'match';
  const bIsMatch = b.domain === 'match';
  if (aIsMatch && bIsMatch) return 'Indicateurs appariés match par match.';
  if (aIsMatch !== bIsMatch) {
    const predictor = aIsMatch ? b : a;
    if (lag === 'week') return `« ${predictor.shortLabel} » = moyenne des 7 jours avant chaque match.`;
    return lag
      ? `« ${predictor.shortLabel} » mesuré ${lag} j avant chaque match.`
      : `« ${predictor.shortLabel} » mesuré juste avant chaque match.`;
  }
  if (lag === 'week') return `« ${a.shortLabel} » = moyenne des 7 jours avant chaque « ${b.shortLabel} ».`;
  return lag
    ? `« ${a.shortLabel} » mesuré ${lag} j avant « ${b.shortLabel} ».`
    : 'Indicateurs appariés jour par jour.';
}

export function CorrelationCard({ a, b, result, lagDays, onLagChange }: CorrelationCardProps) {
  const corrColor = result ? (result.r > 0 ? '#00E5A0' : '#EF4444') : '#475569';
  const pct = result ? Math.round(Math.abs(result.r) * 100) : 0;
  // Le décalage n'a aucun effet quand les deux indicateurs sont des stats de match
  // (appariement par date de match, pas de fenêtre à décaler) — le sélecteur n'a alors pas de sens.
  const lagMatters = !(a.domain === 'match' && b.domain === 'match');

  return (
    <Card>
      <CardTitle icon={<GitCompare size={12} style={{ color: '#00E5A0' }} />} mb={4}
        right={
          lagMatters ? (
            <div style={{ display: 'flex', gap: 2, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, padding: 2 }}>
              {LAG_OPTIONS.map(o => (
                <button key={o.value} onClick={() => onLagChange(o.value)}
                  style={{ padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.68rem',
                    backgroundColor: lagDays === o.value ? '#2A2F3A' : 'transparent',
                    color: lagDays === o.value ? '#F1F5F9' : '#475569', transition: 'all 0.12s' }}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : undefined
        }>
        Corrélation
      </CardTitle>
      <p style={{ color: '#475569', fontSize: '0.7rem', margin: '0 0 12px' }}>{pairingHint(a, b, lagDays)}</p>

      {result ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: corrColor, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
              {result.r > 0 ? '+' : ''}{result.r.toFixed(2)}
            </span>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: corrColor, borderRadius: 4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.68rem' }}>
                <span style={{ color: corrColor, fontWeight: 700 }}>{impactLabel(result.r)}</span>
                <span style={{ color: '#475569' }}>{result.n} observations</span>
              </div>
            </div>
          </div>

          <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.6, margin: '12px 0 0' }}>
            <span style={{ color: corrColor, fontWeight: 700 }}>{result.r > 0 ? 'Lien positif' : 'Lien négatif'}</span> :
            {' '}quand « {a.shortLabel} » est {result.r > 0 ? 'élevé, « ' + b.shortLabel + ' » tend à l\'être aussi' : 'élevé, « ' + b.shortLabel + ' » tend à être bas'}.
            {' '}Corrélation n'est pas causalité — à interpréter avec prudence sur de petits échantillons.
          </p>
        </>
      ) : (
        <div style={{ padding: '20px 0', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.6 }}>
          Pas assez de données appariées sur cette période (minimum 5 observations où les deux indicateurs existent).
          Élargissez la période ou choisissez d'autres indicateurs.
        </div>
      )}
    </Card>
  );
}
