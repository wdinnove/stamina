/**
 * Play-by-play d'un match : le flux d'actions mis à plat, une ligne par action, prêt à écrire en
 * CSV. Fonctions pures, aucun rendu ni téléchargement.
 *
 * C'est la seule sortie qui rend la saisie EXPLOITABLE AILLEURS — tableur, arbitrage d'un
 * désaccord avec la feuille de marque officielle, archive. Le score courant est recalculé ligne à
 * ligne plutôt que stocké : il se relit comme la feuille de marque papier, où l'on suit l'écart
 * action après action.
 */
import { EVENT_LABELS, eventPoints } from './matchEvents';
import { periodLabel, formatClock } from './liveTrackingAnalysis';
import { shotEventValue, shotZone, ZONE_LABELS } from './shotChart';
import type { MatchEvent } from './types';

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

/**
 * Une ligne par action, dans l'ordre de saisie.
 *
 * Deux colonnes méritent une explication :
 *   • `Joueur` est vide pour une action adverse pointée en anonyme — c'est un cas normal et
 *     fréquent, pas une donnée manquante.
 *   • `Zone` est vide pour un tir saisi sans position : il compte au score et au boxscore, mais
 *     n'appartient à aucune zone.
 */
export function playByPlayRows(events: MatchEvent[], names: PlayByPlayNames): string[][] {
  const score = { us: 0, them: 0 };

  return [...events].sort((a, b) => a.seq - b.seq).map(e => {
    const points = eventPoints(e);
    score[e.side] += points;

    const author = e.side === 'us'
      ? (e.playerId ? names.player(e.playerId) : '')
      : (e.opponentPlayerId ? names.opponent(e.opponentPlayerId) : '');

    const value = shotEventValue(e);
    const action = e.type === 'shot' && value !== null ? `Tir à ${value} pts` : EVENT_LABELS[e.type];
    const outcome = e.made === undefined ? '' : e.made ? 'Réussi' : 'Manqué';
    const positioned = e.x !== undefined && e.y !== undefined;

    return [
      periodLabel(e.quarter),
      formatClock(e.gameTimeSeconds),
      e.side === 'us' ? names.us : names.them,
      author,
      action,
      outcome,
      points > 0 ? String(points) : '',
      positioned ? ZONE_LABELS[shotZone(e.x!, e.y!)] : '',
      positioned ? e.x!.toFixed(2) : '',
      positioned ? e.y!.toFixed(2) : '',
      String(score.us),
      String(score.them),
    ];
  });
}
