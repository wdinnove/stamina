import { describe, it, expect } from 'vitest';
import { estimatedSessionRpe } from './rpe';

/** Une séquence de séance. `loadUa` est calculé en base (durée × intensité), 0 pour un repos. */
const drill = (duration: number, loadUa: number) => ({ kind: 'exercice' as const, duration, loadUa });
const rest  = (duration: number)                 => ({ kind: 'repos'    as const, duration, loadUa: 0 });

describe('estimatedSessionRpe', () => {
  it('rapporte la charge planifiée au temps de travail', () => {
    // 20×5 + 40×7 = 380 UA sur 60 min
    expect(estimatedSessionRpe([drill(20, 100), drill(40, 280)])).toBeCloseTo(380 / 60);
  });

  it("n'est pas affecté par l'ajout d'un repos", () => {
    // Décision produit : un repos est du temps, pas de la charge. L'ajouter ne doit pas faire
    // baisser l'intensité estimée, sinon deux séances identiques ne se comparent plus selon
    // que le coach a saisi ses pauses ou non.
    const sansRepos = estimatedSessionRpe([drill(20, 100), drill(40, 280)]);
    const avecRepos = estimatedSessionRpe([drill(20, 100), rest(15), drill(40, 280)]);
    expect(avecRepos).toBe(sansRepos);
  });

  it('vaut null quand il n’y a aucun temps de travail', () => {
    expect(estimatedSessionRpe([])).toBeNull();
    expect(estimatedSessionRpe([rest(10)])).toBeNull();
  });
});
