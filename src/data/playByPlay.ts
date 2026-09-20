/**
 * Play-by-play d'un match : le flux d'actions mis à plat, une ligne par action, prêt à écrire en
 * CSV. Fonctions pures, aucun rendu ni téléchargement.
 *
 * C'est la seule sortie qui rend la saisie EXPLOITABLE AILLEURS — tableur, arbitrage d'un
 * désaccord avec la feuille de marque officielle, archive. Le score courant est recalculé ligne à
 * ligne plutôt que stocké : il se relit comme la feuille de marque papier, où l'on suit l'écart
 * action après action.
 */
import { EVENT_LABELS, eventPoints, byGameTime } from './matchEvents';
import { periodLabel, formatGameClock } from './liveTrackingAnalysis';
import { shotEventValue, shotZone, ZONE_LABELS } from './shotChart';
import type { MatchEvent, LineupSide } from './types';

export interface PlayByPlayNames {
  /** Nom des deux équipes, tels qu'affichés à l'écran. */
  us: string;
  them: string;
  /** Nom d'un joueur de notre effectif, par id. */
  player: (id: string) => string;
  /** Nom d'un joueur adverse, par id. Les actions adverses anonymes n'en ont pas. */
  opponent: (id: string) => string;
}

export const PLAY_BY_PLAY_HEADER = [
  'Quart-temps', 'Temps', 'Équipe', 'Joueur', 'Action', 'Résultat', 'Points',
  'Zone', 'X (m)', 'Y (m)', 'Score nous', 'Score eux',
] as const;

export interface PlayByPlayEntry {
  seq: number;
  side: LineupSide;
  quarter: number;
  gameTimeSeconds: number;
  /** Vide pour une action adverse pointée en anonyme — cas normal et fréquent, pas une donnée
   *  manquante. */
  author: string;
  action: string;
  outcome: '' | 'Réussi' | 'Manqué';
  points: number;
  /** Vide pour un tir saisi sans position : il compte au score et au boxscore, mais n'appartient
   *  à aucune zone. */
  zone: string;
  x?: number;
  y?: number;
  /** Score APRÈS cette action. */
  scoreUs: number;
  scoreThem: number;
}

/**
 * Une entrée par action, dans l'ordre de saisie, avec le score courant. C'est la forme lue à
 * l'écran ; le CSV n'en est qu'un aplatissement (`playByPlayRows`). Une seule construction pour
 * les deux, sinon l'export et l'affichage finissent par ne plus raconter la même chose.
 */
export function playByPlayEntries(events: MatchEvent[], names: PlayByPlayNames): PlayByPlayEntry[] {
  const score = { us: 0, them: 0 };

  return [...events].sort(byGameTime).map(e => {
    const points = eventPoints(e);
    score[e.side] += points;

    const value = shotEventValue(e);
    const positioned = e.x !== undefined && e.y !== undefined;

    return {
      seq: e.seq,
      side: e.side,
      quarter: e.quarter,
      gameTimeSeconds: e.gameTimeSeconds,
      author: e.side === 'us'
        ? (e.playerId ? names.player(e.playerId) : '')
        : (e.opponentPlayerId ? names.opponent(e.opponentPlayerId) : ''),
      action: e.type === 'shot' && value !== null ? `Tir à ${value} pts` : EVENT_LABELS[e.type],
      outcome: e.made === undefined ? '' : e.made ? 'Réussi' : 'Manqué',
      points,
      zone: positioned ? ZONE_LABELS[shotZone(e.x!, e.y!)] : '',
      x: positioned ? e.x : undefined,
      y: positioned ? e.y : undefined,
      scoreUs: score.us,
      scoreThem: score.them,
    };
  });
}

/**
 * Le même play-by-play, aplati pour le CSV — colonnes dans l'ordre de `PLAY_BY_PLAY_HEADER`.
 *
 * La colonne « Temps » est le DÉCOMPTE du quart-temps, comme partout ailleurs et comme la feuille
 * de marque officielle : ce fichier sert justement à arbitrer un désaccord avec elle, il doit se
 * lire dans le même sens. D'où `periodDurationSeconds`, que la forme stockée (temps écoulé) ne
 * suffit pas à convertir.
 */
export function playByPlayRows(
  events: MatchEvent[], names: PlayByPlayNames, periodDurationSeconds: number,
): string[][] {
  return playByPlayEntries(events, names).map(e => [
    periodLabel(e.quarter),
    formatGameClock(e.quarter, e.gameTimeSeconds, periodDurationSeconds),
    e.side === 'us' ? names.us : names.them,
    e.author,
    e.action,
    e.outcome,
    e.points > 0 ? String(e.points) : '',
    e.zone,
    e.x !== undefined ? e.x.toFixed(2) : '',
    e.y !== undefined ? e.y.toFixed(2) : '',
    String(e.scoreUs),
    String(e.scoreThem),
  ]);
}
