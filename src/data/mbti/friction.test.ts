import { describe, it, expect } from 'vitest';
import { MBTI_QUESTIONS } from './questions';
import { computeMbtiResult } from './scoring';
import { affinityPairs, axisSpread, frictionPairs, teamPairs, FRICTION_MIN_GAP } from './friction';
import type { MbtiAnswers, MbtiPole } from './types';

function player(playerId: string, poles: MbtiPole[], high = 5, low = 1) {
  const answers: MbtiAnswers = Object.fromEntries(
    MBTI_QUESTIONS.map(q => [q.id, poles.includes(q.pole) ? high : low]),
  );
  return { playerId, result: computeMbtiResult(answers) };
}

/** Profil volontairement centré : lettres marquées mais positions proches du milieu. */
function tepidPlayer(playerId: string, poles: MbtiPole[]) {
  return player(playerId, poles, 4, 3);
}

describe('axisSpread', () => {
  it("répartit l'effectif axe par axe et compte les égalités à part", () => {
    const squad = [
      player('a', ['E', 'S', 'T', 'J']),
      player('b', ['E', 'N', 'F', 'P']),
      { playerId: 'c', result: computeMbtiResult(Object.fromEntries(MBTI_QUESTIONS.map(q => [q.id, 3]))) },
    ];
    const ei = axisSpread(squad).find(a => a.key === 'EI')!;
    expect(ei.countA).toBe(2);   // deux E
    expect(ei.countB).toBe(0);
    expect(ei.tied).toBe(1);     // la joueuse au centre n'est reversée d'aucun côté
    expect(ei.percentA).toBe(100);
  });

  it('ne renvoie pas de pourcentage quand personne n\'est tranché', () => {
    const centered = { playerId: 'x', result: computeMbtiResult(Object.fromEntries(MBTI_QUESTIONS.map(q => [q.id, 3]))) };
    expect(axisSpread([centered]).every(a => a.percentA === null)).toBe(true);
  });
});

describe('teamPairs', () => {
  it('relève les axes opposés et les pôles partagés', () => {
    const pairs = teamPairs([player('a', ['E', 'S', 'T', 'J']), player('b', ['E', 'S', 'F', 'P'])]);
    expect(pairs).toHaveLength(1);
    const [pair] = pairs;
    expect(pair.oppositions.map(o => o.key)).toEqual(['TF', 'JP']);
    expect(pair.sharedPoles).toEqual(['E', 'S']);
    expect(pair.frictionScore).toBeGreaterThan(0);
    expect(pair.oppositions[0].advice).toMatch(/logique/);
  });

  it("n'oppose pas deux profils qui portent des lettres différentes mais restent au centre", () => {
    const [pair] = teamPairs([tepidPlayer('a', ['E', 'S', 'T', 'J']), tepidPlayer('b', ['I', 'N', 'F', 'P'])]);
    expect(pair.oppositions).toEqual([]);
    expect(pair.frictionScore).toBe(0);
  });

  it('ignore un axe où l\'une des deux est à égalité — elle est au milieu, elle ne s\'oppose à personne', () => {
    const centered = { playerId: 'c', result: computeMbtiResult(Object.fromEntries(MBTI_QUESTIONS.map(q => [q.id, 3]))) };
    const [pair] = teamPairs([player('a', ['E', 'S', 'T', 'J']), centered]);
    expect(pair.oppositions).toEqual([]);
    expect(pair.sharedPoles).toEqual([]);
  });

  it('trie par friction décroissante', () => {
    const squad = [
      player('a', ['E', 'S', 'T', 'J']),
      player('b', ['I', 'N', 'F', 'P']),   // opposée sur les 4 axes à « a »
      player('c', ['E', 'S', 'T', 'P']),   // opposée sur un seul axe à « a »
    ];
    const pairs = teamPairs(squad);
    expect(pairs).toHaveLength(3);
    expect(pairs[0].oppositions).toHaveLength(4);
    expect(pairs[0].frictionScore).toBeGreaterThanOrEqual(pairs[1].frictionScore);
  });

  it('mesure les écarts en points de pourcentage, au-delà du seuil', () => {
    const [pair] = teamPairs([player('a', ['E', 'S', 'T', 'J']), player('b', ['I', 'N', 'F', 'P'])]);
    for (const opp of pair.oppositions) {
      expect(opp.gap).toBeGreaterThanOrEqual(FRICTION_MIN_GAP);
      expect(opp.gap).toBeLessThanOrEqual(100);
    }
  });
});

describe('frictionPairs / affinityPairs', () => {
  const squad = [
    player('a', ['E', 'S', 'T', 'J']),
    player('b', ['I', 'N', 'F', 'P']),
    player('c', ['E', 'S', 'T', 'J']),
  ];

  it('ne remonte que les paires réellement opposées, limitées en nombre', () => {
    const fr = frictionPairs(squad, 1);
    expect(fr).toHaveLength(1);
    expect(fr[0].oppositions.length).toBeGreaterThan(0);
  });

  it('remonte les paires alignées, sans aucune opposition', () => {
    const aff = affinityPairs(squad);
    expect(aff).toHaveLength(1);
    expect(aff[0].sharedPoles).toEqual(['E', 'S', 'T', 'J']);
    expect(new Set([aff[0].playerIdA, aff[0].playerIdB])).toEqual(new Set(['a', 'c']));
  });
});
