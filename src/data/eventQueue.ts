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

/**
 * Ce que devient la file une fois une opération ENVOYÉE avec succès — retirée par RÉFÉRENCE,
 * jamais par position (`shift()`).
 *
 * Pendant l'attente réseau d'un envoi, une nouvelle correction sur la MÊME ligne peut être tapée :
 * `queueUpdate`/`queueDelete` retirent alors l'opération en cours d'envoi et la remplacent par une
 * plus récente, ailleurs dans la file. Si `flushQueue` retirait ensuite l'élément en tête sans
 * vérifier lequel s'y trouve encore, c'est cette correction plus récente — jamais partie au
 * serveur — qui disparaîtrait à sa place. Ici, l'opération envoyée n'étant plus dans la file
 * (remplacée), on ne retire rien : la correction qui l'a remplacée reste en attente et partira au
 * tour suivant.
 */
export function settleOp(queue: QueuedOp[], op: QueuedOp): QueuedOp[] {
  const i = queue.indexOf(op);
  return i < 0 ? queue : [...queue.slice(0, i), ...queue.slice(i + 1)];
}

/**
 * Ce que devient la file juste après qu'une insertion a RÉUSSI sous son propre `seq` (pas de
 * réattribution — ce cas-là déclenche déjà une resynchronisation complète ailleurs).
 *
 * Pendant que cette insertion était en vol, une correction de temps sur la MÊME ligne a pu la
 * fusionner dans une nouvelle opération `insert` (cf. `queueUpdate`) — plus récente, donc distincte
 * de `sent` par référence. La renvoyer telle quelle la ferait INSÉRER UNE SECONDE FOIS à la
 * prochaine purge : la ligne existe déjà en base sous ce `seq` depuis l'envoi qu'on vient de
 * terminer, donc c'est une CORRECTION qu'il faut faire partir, pas une nouvelle insertion. On
 * convertit ici cette insertion fusionnée en `update` portant les mêmes données.
 */
export function reconcileInsertedRow(queue: QueuedOp[], sent: QueuedOp, matchId: string, seq: number): QueuedOp[] {
  return queue.map(op => {
    if (op === sent || op.kind !== 'insert' || !sameRow(op, matchId, seq)) return op;
    const { gameTimeSeconds, quarter, onCourt, onCourtThem } = op.event;
    return { kind: 'update', matchId, seq, gameTimeSeconds, patch: { quarter, onCourt, onCourtThem } };
  });
}

/**
 * Réconciliation complète après une insertion réussie sous son propre `seq` — orchestre
 * `reconcileInsertedRow` et couvre en plus l'ANNULATION reçue pendant l'envoi.
 *
 * `queueDelete` suppose l'insertion encore purement locale pour annuler les deux gestes sans rien
 * envoyer : une hypothèse correcte tant qu'elle est vraie, mais fausse ici puisque l'envoi vient de
 * réussir. Si plus AUCUNE trace de cette ligne ne subsiste dans la file (ni insertion fusionnée, ni
 * mise à jour), c'est qu'elle a été annulée sur cette hypothèse erronée : il faut alors reposer une
 * suppression, sous peine de laisser en base une ligne que l'écran croit annulée.
 */
export function reconcileAfterInsert(queue: QueuedOp[], sent: QueuedOp, matchId: string, seq: number): QueuedOp[] {
  if (queue.includes(sent)) return queue;   // rien ne l'a touchée pendant l'envoi
  return queue.some(op => sameRow(op, matchId, seq))
    ? reconcileInsertedRow(queue, sent, matchId, seq)
    : [...queue, { kind: 'delete', matchId, seq }];
}
