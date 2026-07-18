import { GitCompare } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { impactLabel, type CorrelationResult } from '../utils/correlation';
import type { IndicatorDef, LagMode } from '../data/crossAnalysis';

const LAG_OPTIONS: { value: LagMode; label: string }[] = [
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

/** p formatée à la française, sans faux excès de précision */
function fmtP(p: number): string {
  if (p < 0.001) return 'p < 0,001';
  return `p = ${p.toFixed(3).replace('.', ',')}`;
}

export function CorrelationCard({ a, b, result, lagDays, onLagChange }: CorrelationCardProps) {
  const corrColor = result ? (result.r > 0 ? '#00E5A0' : '#EF4444') : '#475569';
  const pct = result ? Math.round(Math.abs(result.r) * 100) : 0;
  // Le décalage n'a aucun effet quand les deux indicateurs sont des stats de match
  // (appariement par date de match, pas de fenêtre à décaler) — le sélecteur n'a alors pas de sens.
  const lagMatters = !(a.domain === 'match' && b.domain === 'match');
  const verdictColor = result ? (result.significant ? corrColor : '#94A3B8') : '#475569';

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
          <div style={{ fontSize: '1rem', fontWeight: 800, color: verdictColor, marginBottom: 10 }}>
            {result.significant
              ? `Lien ${result.r > 0 ? 'positif' : 'négatif'} confirmé`
              : 'Aucun lien démontré'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: corrColor, lineHeight: 1, fontFamily: 'JetBrains Mono, monospace', opacity: result.significant ? 1 : 0.55 }}>
              {result.r > 0 ? '+' : ''}{result.r.toFixed(2)}
            </span>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: corrColor, borderRadius: 4, opacity: result.significant ? 1 : 0.4 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.68rem' }}>
                <span style={{ color: result.significant ? corrColor : '#64748B', fontWeight: 700 }}>
                  {result.significant ? impactLabel(result.r) : 'Non significatif'}
                </span>
                <span style={{ color: '#475569' }}>{result.n} observations · {fmtP(result.p)}</span>
              </div>
            </div>
          </div>

          {result.significant ? (
            <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.6, margin: '12px 0 0' }}>
              <span style={{ color: corrColor, fontWeight: 700 }}>{result.r > 0 ? 'Lien positif' : 'Lien négatif'}</span> :
              {' '}quand « {a.shortLabel} » est {result.r > 0 ? 'élevé, « ' + b.shortLabel + ' » tend à l\'être aussi' : 'élevé, « ' + b.shortLabel + ' » tend à être bas'}
              {' '}({fmtP(result.p)}, peu probable que ce soit dû au hasard).
              {' '}Corrélation n'est pas causalité — à interpréter avec prudence.
            </p>
          ) : (
            <p style={{ color: '#64748B', fontSize: '0.68rem', lineHeight: 1.6, margin: '12px 0 0' }}>
              Le r observé ({result.r > 0 ? '+' : ''}{result.r.toFixed(2)}) n'est pas assez net pour exclure le hasard
              sur seulement {result.n} observations ({fmtP(result.p)}). Élargissez la période pour en avoir plus,
              ou considérez qu'il n'y a pas de lien démontré entre ces deux facteurs sur les données actuelles.
            </p>
          )}
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
