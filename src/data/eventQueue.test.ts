import { describe, it, expect } from 'vitest';
import { queueDelete, queueUpdate, settleOp, reconcileInsertedRow, reconcileAfterInsert, type QueuedOp } from './eventQueue';
import type { MatchEvent } from './types';

const EVENT = (seq: number, matchId = 'm1'): MatchEvent => ({
  matchId, seq, quarter: 1, gameTimeSeconds: 0, side: 'us',
  playerId: 'p1', type: 'reb_def', onCourt: [], onCourtThem: [],
});

const insert = (seq: number, matchId?: string): QueuedOp => ({ kind: 'insert', event: EVENT(seq, matchId) });

describe('queueDelete', () => {
  it('efface l\'insertion encore en attente au lieu d\'empiler une suppression', () => {
    expect(queueDelete([insert(1), insert(2)], 'm1', 2)).toEqual([insert(1)]);
  });

  it('empile une suppression quand l\'insertion est déjà partie', () => {
    expect(queueDelete([insert(3)], 'm1', 1)).toEqual([
      insert(3), { kind: 'delete', matchId: 'm1', seq: 1 },
    ]);
  });

  it('ne confond pas deux matchs de même rang', () => {
    const q = [insert(1, 'autre')];
    expect(queueDelete(q, 'm1', 1)).toEqual([...q, { kind: 'delete', matchId: 'm1', seq: 1 }]);
  });

  it('conserve l\'ordre des opérations restantes', () => {
    expect(queueDelete([insert(1), insert(2), insert(3)], 'm1', 2)).toEqual([insert(1), insert(3)]);
  });
});

describe('queueUpdate', () => {
  const ev = (seq: number, gameTimeSeconds = 100): MatchEvent => ({
    matchId: 'm1', seq, quarter: 1, gameTimeSeconds, side: 'us', type: 'ast',
    playerId: 'p1', onCourt: [], onCourtThem: [],
  });

  it('corrige l\'insertion elle-même quand elle est encore en file', () => {
    const q = queueUpdate([{ kind: 'insert', event: ev(1, 100) }], 'm1', 1, 250);
    expect(q).toHaveLength(1);
    expect(q[0]).toEqual({ kind: 'insert', event: { ...ev(1, 250) } });
  });

  it('empile un update quand l\'action est déjà partie', () => {
    expect(queueUpdate([], 'm1', 3, 250)).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 250 }]);
  });

  it('ne garde que la DERNIÈRE correction d\'une même action', () => {
    let q = queueUpdate([], 'm1', 3, 250);
    q = queueUpdate(q, 'm1', 3, 260);
    expect(q).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 260 }]);
  });

  it('ne touche pas aux corrections des autres actions', () => {
    let q = queueUpdate([], 'm1', 3, 250);
    q = queueUpdate(q, 'm1', 4, 300);
    expect(q).toHaveLength(2);
  });

  it('porte le quart-temps et l\'instantané recalculé quand l\'action change de quart-temps', () => {
    const patch = { quarter: 2, onCourt: ['a'], onCourtThem: ['b'] };
    expect(queueUpdate([], 'm1', 3, 10, patch)).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 10, patch }]);
  });

  it('applique le même correctif à une insertion encore en file', () => {
    const patch = { quarter: 2, onCourt: ['a'], onCourtThem: ['b'] };
    const q = queueUpdate([{ kind: 'insert', event: ev(1, 100) }], 'm1', 1, 10, patch);
    expect(q).toEqual([{ kind: 'insert', event: { ...ev(1, 10), ...patch } }]);
  });

  it('reporte le patch d\'une correction en attente si la nouvelle n\'en porte pas', () => {
    // Hors ligne : une 1ère correction change le quart-temps (patch en file, pas encore partie),
    // puis une 2e ne retouche que le temps dans ce même quart-temps (donc sans patch). Le patch de
    // la 1ère ne doit pas disparaître — sinon le changement de quart-temps ne partirait jamais.
    const patch = { quarter: 2, onCourt: ['a'], onCourtThem: ['b'] };
    let q = queueUpdate([], 'm1', 3, 10, patch);
    q = queueUpdate(q, 'm1', 3, 15);
    expect(q).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 15, patch }]);
  });

  it('un nouveau patch remplace l\'ancien, il ne s\'y ajoute pas', () => {
    let q = queueUpdate([], 'm1', 3, 10, { quarter: 2, onCourt: ['a'], onCourtThem: [] });
    const second = { quarter: 3, onCourt: ['b'], onCourtThem: [] };
    q = queueUpdate(q, 'm1', 3, 20, second);
    expect(q).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 20, patch: second }]);
  });
});

describe('settleOp', () => {
  it('retire l\'opération envoyée quand elle est toujours en tête', () => {
    const op: QueuedOp = { kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 250 };
    expect(settleOp([op, insert(9)], op)).toEqual([insert(9)]);
  });

  it(
    'ne retire rien si une correction plus récente sur la même ligne a remplacé l\'opération pendant son envoi',
    () => {
      // Reproduit la course : une 1ère correction part en réseau (`op`, capturé par `flushQueue`),
      // et avant sa réponse une 2e correction de la MÊME ligne est tapée — `queueUpdate` retire
      // `op` de la file et le remplace par une version plus récente. Quand la 1ère réponse arrive,
      // `op` n'est plus dans la file : rien à en retirer, sous peine de perdre la 2e correction,
      // elle, jamais encore partie au serveur.
      const op: QueuedOp = { kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 250 };
      const q = queueUpdate([op], 'm1', 3, 260);
      expect(settleOp(q, op)).toEqual(q);
      expect(settleOp(q, op)).toEqual([{ kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 260 }]);
    },
  );

  it('retire par référence même si l\'opération n\'est plus en tête de file', () => {
    const op: QueuedOp = { kind: 'update', matchId: 'm1', seq: 3, gameTimeSeconds: 250 };
    expect(settleOp([insert(1), op, insert(2)], op)).toEqual([insert(1), insert(2)]);
  });
});

describe('reconcileInsertedRow', () => {
  it("ne touche à rien quand personne n'a corrigé la ligne pendant l'envoi", () => {
    const sent: QueuedOp = insert(1);
    const q = [sent, insert(2)];
    expect(reconcileInsertedRow(q, sent, 'm1', 1)).toEqual(q);
  });

  it(
    "convertit en simple correction l'insertion fusionnée pendant l'envoi, plutôt que de la réinsérer en double",
    () => {
      // La correction (`queueUpdate`) a remplacé l'insertion en vol par une nouvelle, fusionnée,
      // AVANT que l'envoi de l'originale ait répondu. Cette dernière vient de réussir sous son
      // propre `seq` : la ligne existe déjà en base, la renvoyer comme insertion la dupliquerait.
      const sent: QueuedOp = insert(1);
      const merged = queueUpdate([sent], 'm1', 1, 260, { quarter: 2, onCourt: ['a'], onCourtThem: [] });
      expect(reconcileInsertedRow(merged, sent, 'm1', 1)).toEqual([
        { kind: 'update', matchId: 'm1', seq: 1, gameTimeSeconds: 260, patch: { quarter: 2, onCourt: ['a'], onCourtThem: [] } },
      ]);
    },
  );

  it('ne convertit pas l\'insertion elle-même qui vient de réussir', () => {
    const sent: QueuedOp = insert(1);
    expect(reconcileInsertedRow([sent], sent, 'm1', 1)).toEqual([sent]);
  });
});

describe('reconcileAfterInsert', () => {
  it("laisse la file inchangée quand rien ne l'a touchée pendant l'envoi", () => {
    const sent: QueuedOp = insert(1);
    const q = [sent, insert(2)];
    expect(reconcileAfterInsert(q, sent, 'm1', 1)).toEqual(q);
  });

  it('convertit en correction une insertion fusionnée pendant l\'envoi (délègue à reconcileInsertedRow)', () => {
    const sent: QueuedOp = insert(1);
    const merged = queueUpdate([sent], 'm1', 1, 260);
    // Le `patch` reflète le quart-temps/instantané déjà portés par l'événement fusionné, même sans
    // correction explicite de rotation : `reconcileInsertedRow` le lit sur l'événement, pas sur
    // une correction séparée.
    expect(reconcileAfterInsert(merged, sent, 'm1', 1)).toEqual([
      { kind: 'update', matchId: 'm1', seq: 1, gameTimeSeconds: 260, patch: { quarter: 1, onCourt: [], onCourtThem: [] } },
    ]);
  });

  it(
    "repose une suppression quand une annulation a retiré l'insertion pendant l'envoi, la croyant encore locale",
    () => {
      // `queueDelete` annule l'insertion sans rien envoyer, tant qu'elle croit l'insertion
      // purement locale — hypothèse fausse ici puisque l'envoi vient de réussir : la ligne existe
      // maintenant en base, orpheline, et rien dans la file ne la vise plus.
      const sent: QueuedOp = insert(1);
      const cancelled = queueDelete([sent], 'm1', 1);
      expect(cancelled).toEqual([]);
      expect(reconcileAfterInsert(cancelled, sent, 'm1', 1)).toEqual([{ kind: 'delete', matchId: 'm1', seq: 1 }]);
    },
  );
});

describe('queueDelete face à une correction en attente', () => {
  const ev = (seq: number): MatchEvent => ({
    matchId: 'm1', seq, quarter: 1, gameTimeSeconds: 10, side: 'us', type: 'ast',
    playerId: 'p1', onCourt: [], onCourtThem: [],
  });

  it('jette la correction avec l\'insertion qu\'elle visait', () => {
    let q: QueuedOp[] = [{ kind: 'insert', event: ev(1) }];
    q = queueUpdate(q, 'm1', 1, 250);
    expect(queueDelete(q, 'm1', 1)).toEqual([]);
  });

  it('jette une correction orpheline plutôt que de la laisser bloquer la file', () => {
    // L'action est déjà en base : la suppression part, mais l'update qui la précédait n'a plus
    // d'objet — il échouerait indéfiniment et la file s'arrête au premier échec.
    const q = queueUpdate([], 'm1', 5, 250);
    expect(queueDelete(q, 'm1', 5)).toEqual([{ kind: 'delete', matchId: 'm1', seq: 5 }]);
  });
});
