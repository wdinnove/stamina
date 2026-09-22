/**
 * Règles de la file d'attente des actions de match — fonctions pures, sans réseau ni stockage.
 * L'exécution vit dans `api/matchEventQueue.ts` ; seules les décisions sont ici, pour être
 * testables et pour que `src/data` reste indépendant de `src/api`.
 */
import type { MatchEvent } from './types';

/** Quart-temps et instantané de cinq recalculés d'une action — un seul bloc tout-ou-rien, jamais
 *  trois champs indépendants : les trois voyagent ou reculent toujours ensemble. */
export interface EventTimePatch { quarter: number; onCourt: string[]; onCourtThem: string[] }

export type QueuedOp =
  | { kind: 'insert'; event: MatchEvent }
  | { kind: 'update'; matchId: string; seq: number; gameTimeSeconds: number; patch?: EventTimePatch }
  | { kind: 'delete'; matchId: string; seq: number };

const sameRow = (op: QueuedOp, matchId: string, seq: number) =>
  op.kind === 'insert'
    ? op.event.matchId === matchId && op.event.seq === seq
    : op.matchId === matchId && op.seq === seq;

/**
 * Ce que devient la file quand on annule une action.
 *
 * Si son insertion n'est pas encore partie, les deux opérations s'annulent : on la retire, on
 * n'empile rien. Sans ça, un aller-retour hors réseau (saisir puis annuler) envoyait au retour une
 * insertion suivie d'une suppression — inutile dans le meilleur cas, et dans le pire une
 * suppression orpheline qui échouait indéfiniment si l'insertion avait été rejetée.
 */
export function queueDelete(queue: QueuedOp[], matchId: string, seq: number): QueuedOp[] {
  const pending = queue.filter(op => !sameRow(op, matchId, seq));
  // Une correction encore en file sur une action qu'on supprime n'a plus d'objet : la laisser
  // partirait un update sur une ligne absente, qui échouerait indéfiniment et bloquerait la file.
  if (pending.length < queue.length && queue.some(op => op.kind === 'insert' && sameRow(op, matchId, seq))) {
    return pending;
  }
  return [...pending, { kind: 'delete', matchId, seq }];
}

/**
 * Ce que devient la file quand on corrige le temps d'une action.
 *
 * Si son insertion n'est pas encore partie, c'est ELLE qu'on corrige : empiler un update derrière
 * enverrait deux requêtes là où une suffit, et surtout l'update arriverait sur une ligne que le
 * serveur vient à peine de recevoir. Sinon, une seule correction survit par action — la dernière.
 *
 * Un `patch` absent sur CETTE correction ne doit pas effacer celui d'une correction précédente
 * encore en file (offline) : sans ce report, corriger le quart-temps d'une action puis, avant
 * l'envoi, ne retoucher que son temps aurait fait partir au serveur le temps sans le quart-temps —
 * la première correction, jamais réellement annulée, disparaissait en silence.
 */
export function queueUpdate(
  queue: QueuedOp[], matchId: string, seq: number, gameTimeSeconds: number,
  patch?: EventTimePatch,
): QueuedOp[] {
  const i = queue.findIndex(op => op.kind === 'insert' && sameRow(op, matchId, seq));
  if (i >= 0) {
    const op = queue[i] as { kind: 'insert'; event: MatchEvent };
    return [
      ...queue.slice(0, i),
      { kind: 'insert', event: { ...op.event, gameTimeSeconds, ...(patch ?? {}) } },
      ...queue.slice(i + 1),
    ];
  }
  const previous = queue.find(op => op.kind === 'update' && sameRow(op, matchId, seq)) as
    | { kind: 'update'; patch?: EventTimePatch }
    | undefined;
  return [
    ...queue.filter(op => !(op.kind === 'update' && sameRow(op, matchId, seq))),
    { kind: 'update', matchId, seq, gameTimeSeconds, patch: patch ?? previous?.patch },
  ];
}
