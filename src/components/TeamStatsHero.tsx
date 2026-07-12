import { ortgColor, drtgColor } from '../data';
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

/** Bandeau d'identité équipe — bilan V/D, points marqués/concédés, différentiel, ORtg/DRtg. Repris tel quel de Statistiques collectives pour rester identique partout où l'équipe est représentée. */
export function TeamStatsHero({ teamName, category, seasonLabel, teamStats, statThresholds }: TeamStatsHeroProps) {
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

  return (
    <div style={{ backgroundColor: `${heroAccent}10`, border: `1px solid ${heroAccent}40`, borderLeft: `4px solid ${heroAccent}`, borderRadius: 8, padding: '14px 4px 14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {/* Logo initiales */}
      <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: `${heroAccent}18`, border: `2px solid ${heroAccent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: heroAccent, fontWeight: 800, fontSize: '0.85rem', letterSpacing: '-0.02em' }}>{teamInitials}</span>
      </div>

      {/* Nom + saison */}
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>{teamName}</div>
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>
          {category} · {seasonLabel}
          {matchCount > 0 && ` · ${matchCount} match${matchCount > 1 ? 's' : ''}`}
        </p>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-3 sm:flex sm:items-stretch sm:gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#2A2F3A]">

        {/* Bilan */}
        <div style={{ minWidth: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Bilan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: '#00E5A0', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{wins}V</span>
            <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{losses}D</span>
          </div>
        </div>

        <div className="hidden sm:block" style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

        {/* Pts marqués */}
        <div style={{ minWidth: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pts moy</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreUs ?? '—'}</span>
          </div>
        </div>

        <div className="hidden sm:block" style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

        {/* Pts concédés */}
        <div style={{ minWidth: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pts conc</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
            <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgScoreThem ?? '—'}</span>
          </div>
        </div>

        <div className="hidden sm:block" style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

        {/* Différentiel */}
        <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Diff</div>
          <span style={{ color: heroDiff === null ? '#475569' : heroDiff > 0 ? '#00E5A0' : heroDiff < 0 ? '#EF4444' : '#94A3B8', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {heroDiff === null ? '—' : heroDiff > 0 ? `+${heroDiff}` : heroDiff}
          </span>
        </div>

        <div className="hidden sm:block" style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

        {/* ORtg */}
        <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ORtg</div>
          <span style={{ color: avgORtg !== null ? ortgColor(avgORtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {avgORtg ?? '—'}
          </span>
        </div>

        <div className="hidden sm:block" style={{ width: 1, alignSelf: 'stretch', backgroundColor: `${heroAccent}25`, flexShrink: 0 }} />

        {/* DRtg */}
        <div style={{ minWidth: 44, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          <div style={{ color: '#475569', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DRtg</div>
          <span style={{ color: avgDRtg !== null ? drtgColor(avgDRtg, statThresholds) : '#475569', fontWeight: 700, fontSize: '1rem', fontFamily: 'JetBrains Mono, monospace' }}>
            {avgDRtg ?? '—'}
          </span>
        </div>

      </div>
    </div>
  );
}
