import { useMemo } from 'react';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useMatchClock } from '../hooks/useMatchClock';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { scoreTimeline, detectRuns, quarterSplits, absoluteSeconds, DEFAULT_MIN_RUN_POINTS } from '../data/matchFlow';
import { periodLabel, formatClock } from '../data/liveTrackingAnalysis';
import type { Match } from '../data/types';

/**
 * Déroulé du match : la courbe d'écart, les séries sans réponse, et le détail quart-temps par
 * quart-temps — tout ce que le boxscore ne dit pas parce qu'il n'a pas d'axe du temps.
 *
 * Un match perdu de 4 après avoir mené de 15 et un match perdu de 4 sans jamais mener produisent
 * le même boxscore. Ce sont deux matchs différents, et deux causeries d'après-match différentes.
 */

export interface MatchFlowPanelProps {
  match: Match;
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 8px',
};

/** Repère géométrique de la courbe, en unités de viewBox. La hauteur est fixe : l'écart se lit en
 *  graduations, pas en pixels. */
const CHART = { w: 1000, h: 260, padTop: 16, padBottom: 26, padLeft: 34, padRight: 8 };

export function MatchFlowPanel({ match }: MatchFlowPanelProps) {
  const { selected } = useTeamSeason();
  const teamColor   = selected?.team.color ?? '#00E5A0';
  const ourTeamName = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';
  const clock = useMatchClock(match.id);
  const period = clock.periodDurationSeconds;

  const { events, lastQuarter, lastElapsedSeconds, hasData, loading, error } = useMatchTracking(match.id);

  const timeline = useMemo(() => scoreTimeline(events, period), [events, period]);
  const runs     = useMemo(() => detectRuns(events, period), [events, period]);
  const splits   = useMemo(() => quarterSplits(events), [events]);

  /** Fin de l'axe : le dernier instant enregistré, arrondi à la fin du quart-temps en cours —
   *  sinon la courbe s'arrête au milieu du graphique sur un match suivi jusqu'au bout. */
  const endSeconds = useMemo(
    () => Math.max(absoluteSeconds(lastQuarter, period, period), absoluteSeconds(lastQuarter, lastElapsedSeconds, period), period),
    [lastQuarter, lastElapsedSeconds, period],
  );

  const maxAbsDiff = useMemo(
    () => Math.max(6, ...timeline.map(p => Math.abs(p.diff))),
    [timeline],
  );

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (!hasData) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune saisie en direct pour ce match.</p>
        <p style={{ margin: '8px 0 0' }}>
          Le déroulé se construit depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Saisie des stats</strong>, qui
          date chaque panier. Un match importé par feuille de marque n'en contient pas : elle donne des
          totaux, pas une chronologie.
        </p>
      </div>
    );
  }

  const x = (seconds: number) => CHART.padLeft + (seconds / endSeconds) * (CHART.w - CHART.padLeft - CHART.padRight);
  const y = (diff: number) => {
    const usable = CHART.h - CHART.padTop - CHART.padBottom;
    return CHART.padTop + usable / 2 - (diff / maxAbsDiff) * (usable / 2);
  };

  // Courbe en ESCALIER : le score saute au panier, il ne progresse pas linéairement entre deux.
  // Une ligne droite entre deux paniers laisserait lire des écarts qui n'ont jamais existé.
  const path = timeline
    .map((p, i) => (i === 0 ? `M ${x(p.seconds)} ${y(p.diff)}` : `L ${x(p.seconds)} ${y(timeline[i - 1].diff)} L ${x(p.seconds)} ${y(p.diff)}`))
    .join(' ');
  const last = timeline[timeline.length - 1];
  const closing = `L ${x(endSeconds)} ${y(last.diff)}`;

  const quarterBounds = Array.from({ length: lastQuarter }, (_, i) => (i + 1) * period).filter(s => s < endSeconds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        .flow-cell { padding: 7px 8px; font-size: 0.76rem; text-align: right; color: #CBD5E1; }
        .flow-cell:first-child { text-align: left; color: #F1F5F9; }
        .flow-head { padding: 6px 8px; font-size: 0.62rem; text-align: right; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .flow-head:first-child { text-align: left; }
      `}</style>

      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <p style={SECTION_TITLE}>Écart au fil du match</p>
          <p style={{ color: '#64748B', fontSize: '0.74rem', margin: '0 0 8px' }}>
            Score final saisi : <strong style={{ color: '#F1F5F9' }}>{last.us} — {last.them}</strong>
          </p>
        </div>

        <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} style={{ width: '100%', display: 'block' }} role="img"
          aria-label={`Écart entre ${ourTeamName} et ${opponentName} au fil du match, de ${-maxAbsDiff} à +${maxAbsDiff} points`}>
          {/* Zone au-dessus de zéro = on mène. La teinter évite d'avoir à lire l'axe pour savoir
              de quel côté on est. */}
          <rect x={CHART.padLeft} y={CHART.padTop} width={CHART.w - CHART.padLeft - CHART.padRight}
            height={(CHART.h - CHART.padTop - CHART.padBottom) / 2} fill={teamColor} opacity={0.05} />

          {[maxAbsDiff, Math.round(maxAbsDiff / 2), 0, -Math.round(maxAbsDiff / 2), -maxAbsDiff].map(v => (
            <g key={v}>
              <line x1={CHART.padLeft} x2={CHART.w - CHART.padRight} y1={y(v)} y2={y(v)}
                stroke={v === 0 ? '#475569' : '#1E2229'} strokeWidth={v === 0 ? 1.5 : 1} />
              <text x={CHART.padLeft - 6} y={y(v) + 4} textAnchor="end" fill="#475569" fontSize={11}>
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}

          {quarterBounds.map((s, i) => (
            <g key={s}>
              <line x1={x(s)} x2={x(s)} y1={CHART.padTop} y2={CHART.h - CHART.padBottom} stroke="#2A2F3A" strokeDasharray="3 4" />
              <text x={x(s)} y={CHART.h - 8} textAnchor="middle" fill="#475569" fontSize={11}>{periodLabel(i + 2)}</text>
            </g>
          ))}
          <text x={x(0) + 4} y={CHART.h - 8} textAnchor="start" fill="#475569" fontSize={11}>{periodLabel(1)}</text>

          {/* Les séries sans réponse en bandeau : c'est le moment du match, pas une valeur. */}
          {runs.map((r, i) => (
            <rect key={i} x={x(r.startSeconds)} y={CHART.padTop} width={Math.max(2, x(r.endSeconds) - x(r.startSeconds))}
              height={CHART.h - CHART.padTop - CHART.padBottom}
              fill={r.side === 'us' ? teamColor : '#EF4444'} opacity={0.12} />
          ))}

          <path d={`${path} ${closing}`} fill="none" stroke={teamColor} strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      </div>

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Séries sans réponse ({DEFAULT_MIN_RUN_POINTS} points ou plus)</p>
        {runs.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
            Aucune série de {DEFAULT_MIN_RUN_POINTS} points sans réponse : les paniers ont alterné tout le match.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runs.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${r.side === 'us' ? `${teamColor}55` : '#EF444455'}`,
                backgroundColor: r.side === 'us' ? `${teamColor}0F` : '#EF44440F',
              }}>
                <span style={{ color: r.side === 'us' ? teamColor : '#EF4444', fontWeight: 800, fontSize: '0.95rem', minWidth: 46 }}>
                  {r.points}-0
                </span>
                <span style={{ color: '#CBD5E1', fontSize: '0.8rem', flex: 1 }}>
                  {r.side === 'us' ? ourTeamName : opponentName}
                  <span style={{ color: '#64748B' }}>
                    {' · '}{periodLabel(r.startQuarter)} {formatClock(r.startSeconds - (r.startQuarter - 1) * period)}
                    {r.endQuarter !== r.startQuarter || r.endSeconds !== r.startSeconds
                      ? ` → ${periodLabel(r.endQuarter)} ${formatClock(r.endSeconds - (r.endQuarter - 1) * period)}`
                      : ''}
                  </span>
                </span>
                <span style={{ color: '#64748B', fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {signed(r.diffBefore)} → <span style={{ color: '#F1F5F9' }}>{signed(r.diffAfter)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Quart-temps par quart-temps</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                {['', 'Marqués', 'Encaissés', 'Écart', '2 pts', '3 pts', 'LF', 'RO', 'BP', 'Poss.'].map((h, i) => (
                  <th key={i} className="flow-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {splits.map(s => (
                <tr key={s.quarter} style={{ borderBottom: '1px solid #1E2229' }}>
                  <td className="flow-cell">{periodLabel(s.quarter)}</td>
                  <td className="flow-cell" style={{ fontWeight: 700, color: '#F1F5F9' }}>{s.pointsUs}</td>
                  <td className="flow-cell">{s.pointsThem}</td>
                  <td className="flow-cell" style={{ fontWeight: 700, color: s.diff > 0 ? '#00E5A0' : s.diff < 0 ? '#EF4444' : '#64748B' }}>
                    {signed(s.diff)}
                  </td>
                  <td className="flow-cell">{s.us.fg2m}/{s.us.fg2a}</td>
                  <td className="flow-cell">{s.us.fg3m}/{s.us.fg3a}</td>
                  <td className="flow-cell">{s.us.ftm}/{s.us.fta}</td>
                  <td className="flow-cell">{s.us.ro}</td>
                  <td className="flow-cell">{s.us.bp}</td>
                  <td className="flow-cell">{s.us.possessions.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#475569', fontSize: '0.73rem', margin: '10px 0 0' }}>
          Les colonnes de tir sont les nôtres. L'écart, lui, est celui du quart-temps seul — pas le cumul.
        </p>
      </div>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
