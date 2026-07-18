import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Coque partagée des cartes "hero" : icône ronde + titre, liseré latéral coloré selon l'état,
 * contenu libre au milieu, flèche + libellé en bas à droite vers la page liée (facultatif —
 * une carte purement informative peut omettre `ctaLabel`/`onOpen`).
 */
export function HeroCardShell({ icon, iconBg, title, ctaLabel, onOpen, children, footerLeft, headerRight, borderColor = '#475569' }: {
  icon: ReactNode; iconBg: string; title: string;
  ctaLabel?: string; onOpen?: () => void; children: ReactNode;
  /** Contenu optionnel affiché à gauche de la dernière ligne (ex. points du carrousel). */
  footerLeft?: ReactNode;
  /** Contenu optionnel affiché en haut à droite (ex. badge V/D). */
  headerRight?: ReactNode;
  /** Couleur du liseré latéral, reflétant l'état des données de la carte. */
  borderColor?: string;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10, padding: '18px 20px', minHeight: 160,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%', backgroundColor: iconBg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <p style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</p>
        </div>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </div>

      {children}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 6 }}>{footerLeft}</div>
        {ctaLabel && onOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0 4px 12px', marginRight: -4 }}>
            <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 500 }}>{ctaLabel}</span>
            <ArrowRight size={14} color="#475569" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Variante "stats" — N gros chiffres (ou libellés courts) côte à côte (ex. Infirmerie). */
export function HeroCard({ icon, iconBg, title, stats, ctaLabel, onOpen, headerRight, borderColor }: {
  icon: ReactNode; iconBg: string; title: string;
  stats: { value: number | string; label: string; color: string; decimals?: number }[];
  ctaLabel?: string; onOpen?: () => void;
  headerRight?: ReactNode;
  borderColor?: string;
}) {
  return (
    <HeroCardShell icon={icon} iconBg={iconBg} title={title} ctaLabel={ctaLabel} onOpen={onOpen} headerRight={headerRight} borderColor={borderColor}>
      <div style={{ display: 'flex', gap: 24 }}>
        {stats.map(s => {
          const isNumber = typeof s.value === 'number';
          const displayValue = isNumber && s.decimals !== undefined ? (s.value as number).toFixed(s.decimals) : s.value;
          return (
            <div key={s.label}>
              <div style={{
                color: isNumber && s.value === 0 ? '#475569' : s.color,
                fontSize: isNumber ? '1.7rem' : '1.1rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
                fontFamily: isNumber ? 'JetBrains Mono, monospace' : undefined,
              }}>
                {displayValue}
              </div>
              <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </HeroCardShell>
  );
}
