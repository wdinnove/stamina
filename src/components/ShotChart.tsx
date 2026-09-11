import { DiagramCourt } from './DiagramCourt';
import { COURT_SIZE } from '../utils/diagram';
import type { MatchEvent } from '../data/types';

/**
 * Rendu des tirs sur un demi-terrain — partagé par l'écran de saisie et l'onglet d'analyse.
 *
 * La COULEUR dit l'équipe, la FORME dit la réussite (disque = réussi, croix = manqué) : deux
 * dimensions lisibles d'un coup d'œil, y compris quand les deux camps se superposent.
 *
 * Les tirs saisis sans position n'ont rien à faire ici — ils comptent au boxscore, pas à la carte.
 * C'est à l'appelant de les avoir écartés (`e.x !== undefined`).
 */

export interface ShotColors { made: string; miss: string }

/** Palette par défaut. Côté « nous », l'appelant remplace `made` par la couleur de l'équipe. */
export const SHOT_COLORS: Record<'us' | 'them', ShotColors> = {
  us:   { made: '#00E5A0', miss: '#EF4444' },
  them: { made: '#94A3B8', miss: '#64748B' },
};

/** Marqueurs d'un camp, dans le repère du demi-terrain — appelé une fois par équipe. */
export function ShotMarkers({ shots, colors, radius = 0.34 }: {
  shots: MatchEvent[]; colors: ShotColors; radius?: number;
}) {
  const arm = radius * 0.74;
  return (
    <>
      {shots.map(s => s.made
        ? <circle key={s.seq} cx={s.x} cy={s.y} r={radius} fill={colors.made} opacity={0.9} />
        : <g key={s.seq} stroke={colors.miss} strokeWidth={radius * 0.35} strokeLinecap="round" opacity={0.85}>
            <path d={`M ${s.x! - arm} ${s.y! - arm} L ${s.x! + arm} ${s.y! + arm}`} />
            <path d={`M ${s.x! + arm} ${s.y! - arm} L ${s.x! - arm} ${s.y! + arm}`} />
          </g>)}
    </>
  );
}

/** Le demi-terrain avec ses tirs, sans titre ni compteur — la brique nue. */
export function ShotCourt({ shots, colors, radius }: {
  shots: MatchEvent[]; colors: ShotColors; radius?: number;
}) {
  return (
    <svg viewBox={`0 0 ${COURT_SIZE.half.w} ${COURT_SIZE.half.h}`} style={{ width: '100%', display: 'block', borderRadius: 8 }}>
      <DiagramCourt court="half" />
      <ShotMarkers shots={shots} colors={colors} radius={radius} />
    </svg>
  );
}

/** Grille de tir d'une équipe : le terrain, ses tirs, et le compte en dessous. */
export function ShotGrid({ title, shots, colors }: {
  title: string; shots: MatchEvent[]; colors: ShotColors;
}) {
  const made = shots.filter(s => s.made).length;
  const pct = shots.length > 0 ? Math.round((made / shots.length) * 100) : null;
  return (
    <div>
      <p style={{
        color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', margin: '0 0 8px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{title}</p>
      <ShotCourt shots={shots} colors={colors} />
      <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '8px 0 0', textAlign: 'center' }}>
        {shots.length === 0 ? 'Aucun tir positionné.' : `${made}/${shots.length} · ${pct} %`}
      </p>
    </div>
  );
}
