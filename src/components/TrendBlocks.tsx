import type { ReactNode } from 'react';

/**
 * Blocs "période vs saison" — extraits de PlayerDynStatTab pour être réutilisés par toute vue de
 * tendances (joueur ou équipe) sans dupliquer la logique de verdict / le rendu des lignes.
 */

export function deltaPct(period: number | null, season: number | null): number | null {
  if (period === null || season === null || season === 0) return null;
  return +((period - season) / Math.abs(season) * 100).toFixed(1);
}

export function fmt(v: number | null, dec = 1): string {
  if (v === null) return '—';
  return v.toFixed(dec);
}

export function zoneColor(pct: number, hib: boolean): string {
  const ok = hib ? pct > 0 : pct < 0;
  if (Math.abs(pct) >= 15) return ok ? '#00E5A0' : '#EF4444';
  if (Math.abs(pct) >= 7)  return ok ? '#4ADE80' : '#F87171';
  return ok ? '#6EE7B7' : '#FCA5A5';
}

export interface MetricRowProps {
  label: string;
  period: number | null;
  season: number | null;
  unit?: string;
  higherIsBetter?: boolean;
  dec?: number;
  sign?: boolean;
  muted?: boolean; // stat secondaire / contexte
}

// Colonnes droites à largeur fixe pour alignement parfait sur toutes les lignes
const COL = { period: 56, arrow: 22, season: 56, evo: 18 } as const;

export function MetricRow({ label, period, season, unit = '', higherIsBetter = true, dec = 1, sign = false, muted = false }: MetricRowProps) {
  const pct = deltaPct(period, season);
  const significant = !muted && pct !== null && Math.abs(pct) >= 3;
  const periodColor = muted
    ? '#475569'
    : significant ? zoneColor(pct!, higherIsBetter) : '#94A3B8';
  const evoColor = significant ? zoneColor(pct!, higherIsBetter) : pct !== null && !muted ? '#334155' : 'transparent';

  // % et " UA" s'affichent dans le chiffre, les autres unités vont dans le label
  const unitInNumber = unit === '%' || unit === ' UA';
  const unitSuffix = unitInNumber ? unit : '';
  const periodStr = period !== null ? `${sign && period > 0 ? '+' : ''}${fmt(period, dec)}${unitSuffix}` : '—';
  const seasonStr = season !== null ? `${sign && season > 0 ? '+' : ''}${fmt(season, dec)}${unitSuffix}` : '—';
  const evoStr    = pct === null || muted ? '' : significant ? (pct > 0 ? '↑' : '↓') : '=';
  const unitLabel = unit && !unitInNumber ? unit.trim() : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #1A1F28' }}>
      {/* Label + unité si pertinente */}
      <span style={{ flex: 1, fontSize: '0.7rem', color: muted ? '#3E4756' : '#64748B', lineHeight: 1.2 }}>
        {label}{unitLabel && <span style={{ color: '#334155', fontSize: '0.6rem', marginLeft: 3 }}>{unitLabel}</span>}
      </span>

      {/* Valeur période — largeur fixe, alignée à droite */}
      <span style={{ width: COL.period, flexShrink: 0, textAlign: 'right', fontSize: muted ? '0.78rem' : '0.88rem', fontWeight: 700, color: periodColor, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {periodStr}
      </span>

      {/* Flèche — largeur fixe, centrée */}
      <span style={{ width: COL.arrow, flexShrink: 0, textAlign: 'center', fontSize: '0.65rem', color: '#334155' }}>
        →
      </span>

      {/* Valeur saison — largeur fixe, alignée à gauche, blanche */}
      <span style={{ width: COL.season, flexShrink: 0, textAlign: 'left', fontSize: muted ? '0.78rem' : '0.88rem', fontWeight: 600, color: muted ? '#334155' : '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {seasonStr}
      </span>

      {/* Évolution — largeur fixe, alignée à droite */}
      <span style={{ width: COL.evo, flexShrink: 0, textAlign: 'right', fontSize: '0.62rem', fontWeight: 700, color: evoColor, whiteSpace: 'nowrap' }}>
        {evoStr}
      </span>
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, backgroundColor: '#252A35', margin: '5px 0' }} />;
}

export function SubLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#334155', fontWeight: 600, margin: '6px 0 3px' }}>
      {children}
    </div>
  );
}

export interface BadgeProps { period: number | null; season: number | null; higherIsBetter?: boolean; }

/** Verdict partagé (période vs saison) — pilote à la fois la pastille, la bordure et le titre du bloc. */
export function trendVerdict({ period, season, higherIsBetter = true }: BadgeProps) {
  const pct = deltaPct(period, season);
  const significant = pct !== null && Math.abs(pct) >= 3;
  const improved = significant && (higherIsBetter ? pct! > 0 : pct! < 0);
  const declined = significant && (higherIsBetter ? pct! < 0 : pct! > 0);
  const color = improved ? '#00E5A0' : declined ? '#EF4444' : '#475569';
  const icon  = improved ? '↑'       : declined ? '↓'       : '=';
  return { improved, declined, color, icon };
}

export function TrendBadge(props: BadgeProps) {
  const { improved, declined, color, icon } = trendVerdict(props);
  const bg = improved ? '#00E5A018' : declined ? '#EF444418' : '#1E2229';
  return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: bg, border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color, lineHeight: 1 }}>{icon}</span>
    </div>
  );
}

export interface BlockProps { title: string; subtitle?: string; children: ReactNode; badge?: BadgeProps; contentHeight?: number; }
export function Block({ title, subtitle, children, badge, contentHeight }: BlockProps) {
  const verdict = badge ? trendVerdict(badge) : null;
  const accent = verdict?.improved ? '#00E5A0' : verdict?.declined ? '#EF4444' : '#2A2F3A';
  const titleColor = verdict?.improved ? '#00E5A0' : verdict?.declined ? '#EF4444' : '#475569';
  return (
    <div style={{
      backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${accent}`,
      borderRadius: 8, padding: '12px 14px',
      ...(contentHeight !== undefined ? { height: contentHeight, display: 'flex', flexDirection: 'column' } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        {badge && <TrendBadge {...badge} />}
        <span style={{ flex: 1, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: titleColor, fontWeight: 700 }}>{title}</span>
        {subtitle && <span style={{ fontSize: '0.62rem', color: '#334155' }}>{subtitle}</span>}
      </div>
      <div style={contentHeight !== undefined ? { flex: 1, minHeight: 0, overflow: 'hidden' } : {}}>
        {children}
      </div>
    </div>
  );
}

export interface Signal { label: string; pct: number; hib: boolean; pVal: number; sVal: number; unit: string; dec: number; }

/** Constructeur de signaux pour le Résumé analytique — n'ajoute que les écarts significatifs (≥ thr%). */
export function createSignalCollector() {
  const signals: Signal[] = [];
  function add(label: string, pv: number | null, sv: number | null, unit: string, dec = 1, hib = true, thr = 5) {
    const pct = deltaPct(pv, sv);
    if (pv === null || sv === null || pct === null || Math.abs(pct) < thr) return;
    signals.push({ label, pct, hib, pVal: pv, sVal: sv, unit, dec });
  }
  return { signals, add };
}

// "en hausse/baisse" = direction réelle du chiffre (pas de la performance)
function toSentence(s: Signal): string {
  const dir = s.pct > 0 ? 'en hausse' : 'en baisse';
  return `${s.label} ${dir} de ${Math.abs(s.pct)}% · ${s.pVal.toFixed(s.dec)}${s.unit} vs ${s.sVal.toFixed(s.dec)}${s.unit} saison`;
}

/** Bloc "Résumé analytique" (signaux période vs saison triés par ampleur) — partagé joueur/équipe. */
export function AnalyticalSummary({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  const sorted   = [...signals].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const improved = sorted.filter(s => s.hib ? s.pct > 0 : s.pct < 0);
  const declined = sorted.filter(s => s.hib ? s.pct < 0 : s.pct > 0);

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', fontWeight: 700, marginBottom: 14 }}>
        Résumé analytique
      </div>

      {/* ── Mobile : 1 colonne ── */}
      <div className="flex flex-col gap-5 lg:hidden">
        {improved.length > 0 && (
          <div>
            <div style={{ fontSize: '0.63rem', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↑ En progression</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {improved.map((sig, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <span style={{ color: '#00E5A0', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↑</span>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {declined.length > 0 && (
          <div>
            <div style={{ fontSize: '0.63rem', color: '#EF4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↓ À surveiller</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {declined.map((sig, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <span style={{ color: '#EF4444', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↓</span>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop : 4 colonnes (2 ↑ + 2 ↓) ── */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px 20px' }}>
        {([0, 1] as const).map(colIdx => {
          const half = Math.ceil(improved.length / 2);
          const items = colIdx === 0 ? improved.slice(0, half) : improved.slice(half);
          return (
            <div key={`imp-${colIdx}`}>
              {colIdx === 0 && improved.length > 0 && (
                <div style={{ fontSize: '0.63rem', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↑ En progression</div>
              )}
              {colIdx === 1 && improved.length > 0 && (
                <div style={{ fontSize: '0.63rem', color: 'transparent', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>·</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map((sig, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span style={{ color: '#00E5A0', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↑</span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {([0, 1] as const).map(colIdx => {
          const half = Math.ceil(declined.length / 2);
          const items = colIdx === 0 ? declined.slice(0, half) : declined.slice(half);
          return (
            <div key={`dec-${colIdx}`}>
              {colIdx === 0 && declined.length > 0 && (
                <div style={{ fontSize: '0.63rem', color: '#EF4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↓ À surveiller</div>
              )}
              {colIdx === 1 && declined.length > 0 && (
                <div style={{ fontSize: '0.63rem', color: 'transparent', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>·</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map((sig, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span style={{ color: '#EF4444', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↓</span>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
