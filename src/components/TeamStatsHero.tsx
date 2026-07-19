import { useState, type ReactNode } from 'react';
import { ortgColor, drtgColor } from '../data';
import { SlideCarousel, CarouselDots } from './SlideCarousel';
import type { TeamMatchStat } from '../data/types';
import type { StatThresholds } from '../contexts/TeamSeasonContext';

interface TeamStatsHeroProps {
  teamName: string;
  category: string;
  seasonLabel: string;
  /** Stats collectives déjà filtrées sur la période à représenter */
  teamStats: TeamMatchStat[];
  statThresholds: StatThresholds;
}

interface ChipDef { key: string; label: string; minWidth: number; node: ReactNode }

// Même largeur pour les 6 chips (Bilan avait 64 vs 44-52 pour les autres) — sinon les chips au
// contenu court laissent un espace vide avant le séparateur suivant, rompant le rythme visuel.
const CHIP_WIDTH = 60;

function ChipCell({ label, minWidth, children }: { label: string; minWidth: number; children: ReactNode }) {
  return (
    <div style={{ minWidth, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
      <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {children}
    </div>
  );
}

function ChipDivider({ accent }: { accent: string }) {
  return <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${accent}25`, flexShrink: 0 }} />;
}

/** Ligne de chips serrée (desktop) — un filet vertical entre chaque chip. */
function ChipRowTight({ chips, accent }: { chips: ChipDef[]; accent: string }) {
  const nodes: ReactNode[] = [];
  chips.forEach((c, i) => {
    if (i > 0) nodes.push(<ChipDivider key={`div-${c.key}`} accent={accent} />);
    nodes.push(<ChipCell key={c.key} label={c.label} minWidth={c.minWidth}>{c.node}</ChipCell>);
  });
  return <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 44 }}>{nodes}</div>;
}

/** Ligne de chips étalée sur toute la largeur (mobile) — pas de filet, l'espacement fait le travail. */
function ChipRowSpread({ chips }: { chips: ChipDef[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: 44 }}>
      {chips.map(c => <ChipCell key={c.key} label={c.label} minWidth={c.minWidth}>{c.node}</ChipCell>)}
    </div>
  );
}

/** Bandeau d'identité équipe — bilan V/D, points marqués/concédés, différentiel, ORtg/DRtg. Repris tel quel de Statistiques collectives pour rester identique partout où l'équipe est représentée.
 * Desktop : tout sur une ligne. Mobile : carrousel 3 slides (identité / bilan+points / diff+ratings) pour rester sur une seule ligne de hauteur, chips étalées sur toute la largeur. */
export function TeamStatsHero({ teamName, category, seasonLabel, teamStats, statThresholds }: TeamStatsHeroProps) {
  const [slide, setSlide] = useState(0);
  const matchCount   = teamStats.length;
  const wins         = teamStats.filter(m => m.result === 'win').length;
  const losses       = matchCount - wins;
  const winPct       = matchCount > 0 ? wins / matchCount : 0;
  const heroAccent   = matchCount === 0 ? '#475569' : winPct > 0.6 ? '#00E5A0' : winPct >= 0.4 ? '#F59E0B' : '#EF4444';
  const avgScoreUs   = matchCount > 0 ? Math.round(teamStats.reduce((a, m) => a + m.scoreUs,   0) / matchCount * 10) / 10 : null;
  const avgScoreThem = matchCount > 0 ? Math.round(teamStats.reduce((a, m) => a + m.scoreThem, 0) / matchCount * 10) / 10 : null;
  const heroDiff     = avgScoreUs !== null && avgScoreThem !== null ? Math.round((avgScoreUs - avgScoreThem) * 10) / 10 : null;
  const validORtg    = teamStats.filter(m => m.offRating > 0);
  const avgORtg      = validORtg.length > 0 ? Math.round(validORtg.reduce((a, m) => a + m.offRating, 0) / validORtg.length * 10) / 10 : null;
  const validDRtg    = teamStats.filter(m => m.defRating > 0);
  const avgDRtg      = validDRtg.length > 0 ? Math.round(validDRtg.reduce((a, m) => a + m.defRating, 0) / validDRtg.length * 10) / 10 : null;
  const teamInitials = teamName.split(' ').map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('');

  const identityChip = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: 44 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: `${heroAccent}18`, border: `2px solid ${heroAccent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: heroAccent, fontWeight: 800, fontSize: '0.85rem', letterSpacing: '-0.02em' }}>{teamInitials}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamName}</div>
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {category} · {seasonLabel}
          {matchCount > 0 && ` · ${matchCount} match${matchCount > 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );

  const bilanChips: ChipDef[] = [
    {
      key: 'bilan', label: 'Bilan', minWidth: CHIP_WIDTH, node: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#00E5A0', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{wins}V</span>
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{losses}D</span>
        </div>
      ),
    },
    { key: 'ptsmoy', label: 'Pts moy', minWidth: CHIP_WIDTH, node: <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreUs ?? '—'}</span> },
    { key: 'ptsconc', label: 'Pts conc', minWidth: CHIP_WIDTH, node: <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreThem ?? '—'}</span> },
  ];

  const ratingsChips: ChipDef[] = [
    {
      key: 'diff', label: 'Diff', minWidth: CHIP_WIDTH, node: (
        <span style={{ color: heroDiff === null ? '#475569' : heroDiff > 0 ? '#00E5A0' : heroDiff < 0 ? '#EF4444' : '#94A3B8', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
          {heroDiff === null ? '—' : heroDiff > 0 ? `+${heroDiff}` : heroDiff}
        </span>
      ),
    },
    {
      key: 'ortg', label: 'ORtg', minWidth: CHIP_WIDTH, node: (
        <span style={{ color: avgORtg !== null ? ortgColor(avgORtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
          {avgORtg ?? '—'}
        </span>
      ),
    },
    {
      key: 'drtg', label: 'DRtg', minWidth: CHIP_WIDTH, node: (
        <span style={{ color: avgDRtg !== null ? drtgColor(avgDRtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
          {avgDRtg ?? '—'}
        </span>
      ),
    },
  ];

  const slides = [
    identityChip,
    <ChipRowSpread chips={bilanChips} />,
    <ChipRowSpread chips={ratingsChips} />,
  ];

  return (
    <>
      {/* ── Desktop uniquement : tout sur une ligne, chiffres collés à droite. Même seuil (lg) que
          ResponsiveTabNav — en dessous, la nav bascule déjà en mode mobile, le hero doit suivre. ── */}
      <div className="hidden lg:flex" style={{ backgroundColor: `${heroAccent}10`, border: `1px solid ${heroAccent}40`, borderLeft: `4px solid ${heroAccent}`, borderRadius: 8, padding: '14px 16px', marginBottom: 14, alignItems: 'center', gap: 20 }}>
        {/* flex:1 ici (pas sur identityChip lui-même, réutilisé tel quel côté mobile) — c'est ce
            qui pousse le bloc de chiffres contre le bord droit de la card. */}
        <div style={{ flex: 1, minWidth: 0 }}>{identityChip}</div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, flexShrink: 0 }}>
          <ChipRowTight chips={bilanChips} accent={heroAccent} />
          <ChipDivider accent={heroAccent} />
          <ChipRowTight chips={ratingsChips} accent={heroAccent} />
        </div>
      </div>

      {/* ── Mobile + tablette (< lg) : carrousel 3 slides (identité / bilan+points / diff+ratings),
          chips étalées sur toute la largeur de la card plutôt que regroupées au centre ── */}
      <div className="lg:hidden" style={{ backgroundColor: `${heroAccent}10`, border: `1px solid ${heroAccent}40`, borderLeft: `4px solid ${heroAccent}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
        <SlideCarousel items={slides} index={slide} setIndex={setSlide} renderItem={s => s} />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <CarouselDots count={slides.length} index={slide} onSelect={setSlide} />
        </div>
      </div>
    </>
  );
}
