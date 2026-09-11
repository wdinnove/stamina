/**
 * Déroulé d'un match : comment l'écart a bougé, et quand il a basculé. Fonctions pures.
 *
 * Le boxscore dit ce qui s'est passé, jamais QUAND. Un match perdu de 4 points après avoir mené de
 * 15 et un match perdu de 4 sans jamais mener produisent le même boxscore ; ce sont deux matchs
 * différents, et c'est cette différence qu'on lit ici.
 */
import { eventPoints, teamTotalsFromEvents, type TeamTotals } from './matchEvents';
import type { MatchEvent, LineupSide } from './types';

/** Temps absolu depuis le début du match, en secondes — un axe continu par-dessus les
 *  quart-temps. `periodDurationSeconds` est supposé constant, prolongations comprises, comme
 *  partout ailleurs (cf. `lineupIntervals`). */
export function absoluteSeconds(quarter: number, gameTimeSeconds: number, periodDurationSeconds: number): number {
  return (quarter - 1) * periodDurationSeconds + gameTimeSeconds;
}

export interface TimelinePoint {
  seconds: number;
  quarter: number;
  us: number;
  them: number;
  /** Écart de notre point de vue : positif = on mène. */
  diff: number;
}

/**
 * Un point par panier marqué, plus l'origine à 0-0. Les actions sans point (rebonds, fautes) n'en
 * produisent pas : la courbe ne change de valeur que quand le score change, et y ajouter des
 * points plats la rendrait illisible sans rien apprendre.
 */
export function scoreTimeline(events: MatchEvent[], periodDurationSeconds: number): TimelinePoint[] {
  const points: TimelinePoint[] = [{ seconds: 0, quarter: 1, us: 0, them: 0, diff: 0 }];
  const score = { us: 0, them: 0 };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const pts = eventPoints(e);
    if (pts === 0) continue;
    score[e.side] += pts;
    points.push({
      seconds: absoluteSeconds(e.quarter, e.gameTimeSeconds, periodDurationSeconds),
      quarter: e.quarter,
      us: score.us,
      them: score.them,
      diff: score.us - score.them,
    });
  }
  return points;
}

export interface Run {
  side: LineupSide;
  points: number;
  startSeconds: number;
  endSeconds: number;
  startQuarter: number;
  endQuarter: number;
  /** Écart au début et à la fin de la série, de notre point de vue — c'est ce qui dit si la série
   *  a creusé une avance ou renversé le match. */
  diffBefore: number;
  diffAfter: number;
}

/** En dessous, ce n'est pas une série : deux paniers consécutifs arrivent dans tous les matchs. */
export const DEFAULT_MIN_RUN_POINTS = 6;

/**
 * Séries de points sans réponse (« un 8-0 »). Définition STRICTE : des paniers consécutifs d'un
 * seul camp, interrompus dès que l'autre marque. C'est la définition que tout le monde a en tête,
 * et surtout la seule qui ne demande pas de régler une tolérance arbitraire — un « 10-2 » dépend
 * d'un seuil que personne ne saurait justifier.
 */
export function detectRuns(
  events: MatchEvent[],
  periodDurationSeconds: number,
  minPoints: number = DEFAULT_MIN_RUN_POINTS,
): Run[] {
  const scoring = [...events].sort((a, b) => a.seq - b.seq).filter(e => eventPoints(e) > 0);
  const runs: Run[] = [];
  const score = { us: 0, them: 0 };

  let current: Run | null = null;

  const close = () => {
    if (current && current.points >= minPoints) runs.push(current);
    current = null;
  };

  for (const e of scoring) {
    const pts = eventPoints(e);
    const at = absoluteSeconds(e.quarter, e.gameTimeSeconds, periodDurationSeconds);
    const diffBefore = score.us - score.them;

    if (!current || current.side !== e.side) {
      close();
      current = {
        side: e.side, points: 0,
        startSeconds: at, endSeconds: at,
        startQuarter: e.quarter, endQuarter: e.quarter,
        diffBefore, diffAfter: diffBefore,
      };
    }

    score[e.side] += pts;
    current.points += pts;
    current.endSeconds = at;
    current.endQuarter = e.quarter;
    current.diffAfter = score.us - score.them;
  }
  close();

  return runs;
}

export interface QuarterSplit {
  quarter: number;
  pointsUs: number;
  pointsThem: number;
  /** Écart marqué SUR CE quart-temps seul, pas cumulé. */
  diff: number;
  us: TeamTotals;
  them: TeamTotals;
}

/**
 * Un bloc par quart-temps réellement joué. Les totaux sont ceux de `teamTotalsFromEvents`, donc
 * ils comptent AUSSI les actions sans auteur : un quart-temps où l'adversaire est pointé en
 * anonyme reste juste.
 */
export function quarterSplits(events: MatchEvent[]): QuarterSplit[] {
  const quarters = [...new Set(events.map(e => e.quarter))].sort((a, b) => a - b);

  return quarters.map(quarter => {
    const slice = events.filter(e => e.quarter === quarter);
    const pointsUs = slice.filter(e => e.side === 'us').reduce((s, e) => s + eventPoints(e), 0);
    const pointsThem = slice.filter(e => e.side === 'them').reduce((s, e) => s + eventPoints(e), 0);
    return {
      quarter,
      pointsUs, pointsThem, diff: pointsUs - pointsThem,
      us: teamTotalsFromEvents(slice, 'us'),
      them: teamTotalsFromEvents(slice, 'them'),
    };
  });
}
