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
      className="px-4 py-3 md:p-[18px_20px] min-h-[110px] md:min-h-[160px]"
      style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10, position: 'relative',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <div className="gap-2 mb-2 md:gap-3 md:mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="gap-2 md:gap-3" style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          <div
            className="w-7 h-7 md:w-[42px] md:h-[42px] [&>svg]:!w-3.5 [&>svg]:!h-3.5 md:[&>svg]:!w-5 md:[&>svg]:!h-5"
            style={{ borderRadius: '50%', backgroundColor: iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {icon}
          </div>
          <p className="text-[0.78rem] md:text-[0.95rem]" style={{ color: '#F1F5F9', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</p>
        </div>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </div>

      {children}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 6 }}>{footerLeft}</div>
        {ctaLabel && onOpen && (
          <div className="hidden md:flex" style={{ alignItems: 'center', gap: 5, padding: '4px 0 4px 12px', marginRight: -4 }}>
            <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 500 }}>{ctaLabel}</span>
            <ArrowRight size={14} color="#475569" />
          </div>
        )}
      </div>

      {ctaLabel && onOpen && (
        <ArrowRight
          size={14} color="#475569" className="md:hidden"
          style={{ position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)' }}
        />
      )}
    </div>
  );
}

/**
 * Carte "stat" du Dashboard — icône à gauche, puis un petit libellé discret, la valeur en gros/
 * gras/coloré (même traitement que le verdict de `RiskVerdictCard`) et une ligne de contexte en
 * dessous, flèche collée au bord droit. Bordure teintée + liseré gauche marqué selon la donnée
 * (même convention que `Card`/`RiskVerdictCard`).
 */
export function MiniStatCard({ icon, iconBg, title, value, valueColor, subtitle, borderColor = '#475569', onOpen }: {
  icon: ReactNode; iconBg: string;
  /** Petit libellé discret au-dessus de la valeur (ex. "MATCHS"). */
  title: string;
  /** Chiffre (police mono) ou libellé texte — affiché en gros, gras, coloré. */
  value: number | string;
  /** Couleur de la valeur — grisée par défaut si non précisée. */
  valueColor?: string;
  /** Ligne de contexte discrète sous la valeur (ex. "vs Lakers · Domicile"). */
  subtitle?: ReactNode;
  /** Couleur du liseré gauche et de la teinte de bordure, reflétant l'état des données de la carte. */
  borderColor?: string;
  onOpen?: () => void;
}) {
  const isNumber = typeof value === 'number';
  return (
    <div
      onClick={onOpen}
      className="px-3 py-4 md:px-5 md:py-[22px]"
      style={{
        backgroundColor: '#161920', border: `1px solid ${borderColor}35`, borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <div
        className="w-8 h-8 md:w-12 md:h-12 [&>svg]:!w-4 [&>svg]:!h-4 md:[&>svg]:!w-6 md:[&>svg]:!h-6"
        style={{ borderRadius: '50%', backgroundColor: iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {icon}
      </div>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <p className="text-[0.62rem] md:text-[0.68rem]" style={{ color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, margin: '0 0 2px' }}>
          {title}
        </p>
        <div
          className={isNumber ? 'text-[1.15rem] md:text-[1.35rem]' : 'text-[1.05rem] md:text-[1.2rem]'}
          style={{
            color: valueColor ?? '#475569', fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            fontFamily: isNumber ? 'JetBrains Mono, monospace' : undefined,
          }}
        >
          {value}
        </div>
        {subtitle && (
          <p className="text-[0.68rem] md:text-[0.72rem]" style={{ color: '#475569', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtitle}
          </p>
        )}
      </div>
      {onOpen && <ArrowRight size={17} color="#475569" style={{ flexShrink: 0 }} />}
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
      <div className="gap-4 md:gap-6" style={{ display: 'flex' }}>
        {stats.map(s => {
          const isNumber = typeof s.value === 'number';
          const displayValue = isNumber && s.decimals !== undefined ? (s.value as number).toFixed(s.decimals) : s.value;
          return (
            <div key={s.label}>
              <div
                className={isNumber ? 'text-[1.25rem] md:text-[1.7rem]' : 'text-[0.85rem] md:text-[1.1rem]'}
                style={{
                  color: isNumber && s.value === 0 ? '#475569' : s.color,
                  fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
                  fontFamily: isNumber ? 'JetBrains Mono, monospace' : undefined,
                }}>
                {displayValue}
              </div>
              <div className="text-[0.62rem] md:text-[0.68rem]" style={{ color: '#475569', marginTop: 5, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </HeroCardShell>
  );
}
