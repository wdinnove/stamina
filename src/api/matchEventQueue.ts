import { matchEventsApi } from './matchEvents';
import { queueDelete, type QueuedOp } from '../data/eventQueue';
import type { MatchEvent } from '../data/types';

/**
 * File d'attente des écritures de la prise de statistiques en direct.
 *
 * Une salle de sport est l'endroit où le réseau tombe. Sans file, une action refusée restait
 * affichée à l'écran, n'était jamais réessayée, et disparaissait au rechargement — la divergence
 * était silencieuse, ce qui est le pire des cas pour une saisie qu'on ne peut pas refaire.
 *
 * Seules les actions (`match_events`) passent par ici, pas les rotations ni l'effectif adverse :
 * ce sont les écritures fréquentes, celles qu'on ne peut pas retrouver après coup, et les seules
 * entièrement sérialisables (ajouter un joueur adverse doit rendre un identifiant tout de suite,
 * ça ne s'attend pas).
 *
 * L'ORDRE est conservé et la file s'arrête au premier échec : rejouer une suppression avant son
 * insertion écrirait une action qui n'existe plus. Elle vit dans `localStorage`, donc elle survit
 * au rechargement et au navigateur fermé, et elle est repartagée par onglet.
 */

const KEY = 'stamina.matchEventQueue';

function read(): QueuedOp[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];  // navigation privée, quota, JSON corrompu : on repart vide plutôt que de casser l'écran
  }
}

function write(ops: QueuedOp[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch { /* quota : la file reste en mémoire pour cette session */ }
}

let queue: QueuedOp[] = read();
let flushing = false;
/** Vrai dès qu'un rang a dû être réattribué : l'état local ne correspond plus à la base. */
let needsResync = false;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** S'abonne aux changements de la file (taille, resynchronisation demandée). */
export function subscribeQueue(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function pendingCount(): number {
  return queue.length;
}

/** Vrai quand un rang a été réattribué à l'insertion : l'appelant doit recharger le match.
 *  Consommé à la lecture — le rechargement n'a lieu qu'une fois. */
export function takeResyncFlag(): boolean {
  const v = needsResync;
  needsResync = false;
  return v;
}

export function enqueueInsert(event: MatchEvent) {
  queue.push({ kind: 'insert', event });
  write(queue);
  notify();
  void flushQueue();
}

/** La règle (annuler une action pas encore partie l'efface de la file) vit dans
 *  `data/eventQueue.ts`, où elle est testée. */
export function enqueueDelete(matchId: string, seq: number) {
  queue = queueDelete(queue, matchId, seq);
  write(queue);
  notify();
  void flushQueue();
}

/**
 * Vide la file dans l'ordre, en s'arrêtant au premier échec. Rend l'erreur rencontrée (pour le
 * bandeau) ou `null` si tout est parti.
 */
export async function flushQueue(): Promise<Error | null> {
  if (flushing || queue.length === 0) return null;
  flushing = true;
  try {
    while (queue.length > 0) {
      const op = queue[0];
      try {
        if (op.kind === 'insert') {
          const seq = await matchEventsApi.insert(op.event);
          if (seq !== op.event.seq) needsResync = true;
        } else {
          await matchEventsApi.delete(op.matchId, op.seq);
        }
      } catch (err) {
        notify();
        return err instanceof Error ? err : new Error("Erreur d'enregistrement");
      }
      queue.shift();
      write(queue);
      notify();
    }
    return null;
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue());
}
