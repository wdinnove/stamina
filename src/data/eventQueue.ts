/**
 * Règles de la file d'attente des actions de match — fonctions pures, sans réseau ni stockage.
 * L'exécution vit dans `api/matchEventQueue.ts` ; seules les décisions sont ici, pour être
 * testables et pour que `src/data` reste indépendant de `src/api`.
 */
import type { MatchEvent } from './types';

export type QueuedOp =
  | { kind: 'insert'; event: MatchEvent }
  | { kind: 'delete'; matchId: string; seq: number };

/**
 * Ce que devient la file quand on annule une action.
 *
 * Si son insertion n'est pas encore partie, les deux opérations s'annulent : on la retire, on
 * n'empile rien. Sans ça, un aller-retour hors réseau (saisir puis annuler) envoyait au retour une
 * insertion suivie d'une suppression — inutile dans le meilleur cas, et dans le pire une
 * suppression orpheline qui échouait indéfiniment si l'insertion avait été rejetée.
 */
export function queueDelete(queue: QueuedOp[], matchId: string, seq: number): QueuedOp[] {
  const i = queue.findIndex(
    op => op.kind === 'insert' && op.event.matchId === matchId && op.event.seq === seq,
  );
  if (i >= 0) return [...queue.slice(0, i), ...queue.slice(i + 1)];
  return [...queue, { kind: 'delete', matchId, seq }];
}
