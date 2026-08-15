import { describe, it, expect } from 'vitest';
import { MBTI_QUESTIONS, MBTI_QUESTION_COUNT } from './questions';
import { computeMbtiResult, isCompleteAnswers, safeComputeMbtiResult, tieLabel } from './scoring';
import { MBTI_PROFILES_V1, MBTI_TYPES } from './profiles/v1';
import type { MbtiAnswers, MbtiPole } from './types';

/** Réponses fabriquées : `high` aux questions des pôles listés, `low` aux autres. */
function answersFavoring(poles: MbtiPole[], high = 5, low = 1): MbtiAnswers {
  return Object.fromEntries(
    MBTI_QUESTIONS.map(q => [q.id, poles.includes(q.pole) ? high : low]),
  );
}

describe('référentiel', () => {
  it('compte 24 questions, 3 par pôle', () => {
    expect(MBTI_QUESTION_COUNT).toBe(24);
    const byPole = new Map<string, number>();
    for (const q of MBTI_QUESTIONS) byPole.set(q.pole, (byPole.get(q.pole) ?? 0) + 1);
    expect([...byPole.values()]).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it('utilise des identifiants uniques — ce sont les clés de stockage en base', () => {
    expect(new Set(MBTI_QUESTIONS.map(q => q.id)).size).toBe(24);
  });

  it('fournit les 16 fiches, toutes remplies', () => {
    expect(MBTI_TYPES).toHaveLength(16);
    for (const type of MBTI_TYPES) {
      const p = MBTI_PROFILES_V1[type];
      expect(p.nick.length).toBeGreaterThan(0);
      expect(p.essence.length).toBeGreaterThan(0);
      for (const list of [p.forces, p.vigilances, p.stress, p.motiv, p.comm]) {
        expect(list.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('computeMbtiResult', () => {
  it('retient sur chaque axe la lettre au score le plus élevé', () => {
    const res = computeMbtiResult(answersFavoring(['I', 'S', 'F', 'P']));
    expect(res.code).toBe('ISFP');
    expect(res.candidates).toEqual(['ISFP']);
    expect(res.ties).toEqual([]);
    expect(res.scores.I).toBe(15);   // 3 questions × 5
    expect(res.scores.E).toBe(3);    // 3 questions × 1
  });

  it('calcule des pourcentages complémentaires sur chaque axe', () => {
    const res = computeMbtiResult(answersFavoring(['E', 'N', 'T', 'J']));
    for (const ax of res.axes) {
      expect(ax.percentA + ax.percentB).toBe(100);
    }
    const ei = res.axes.find(a => a.key === 'EI')!;
    expect(ei.scoreA).toBe(15);
    expect(ei.scoreB).toBe(3);
    expect(ei.percentA).toBe(83);    // 15 / 18
    expect(ei.winner).toBe('E');
  });

  it("signale une égalité stricte au lieu de trancher", () => {
    // Toutes les réponses à 3 : chaque pôle marque 9, les 4 axes sont à égalité.
    const res = computeMbtiResult(Object.fromEntries(MBTI_QUESTIONS.map(q => [q.id, 3])));
    expect(res.code).toBe('XXXX');
    expect(res.ties).toEqual(['EI', 'SN', 'TF', 'JP']);
    expect(res.candidates).toHaveLength(16);
    expect(res.axes.every(a => a.winner === null && a.percentA === 50)).toBe(true);
  });

  it('propose les deux fiches candidates quand un seul axe est à égalité', () => {
    const answers = answersFavoring(['I', 'S', 'P']);
    for (const q of MBTI_QUESTIONS) if (q.pole === 'T' || q.pole === 'F') answers[q.id] = 4;
    const res = computeMbtiResult(answers);
    expect(res.ties).toEqual(['TF']);
    expect(res.code).toBe('ISXP');
    expect(res.candidates).toEqual(['ISTP', 'ISFP']);
    expect(res.candidates.every(t => MBTI_PROFILES_V1[t])).toBe(true);
  });

  it("refuse un questionnaire incomplet plutôt que d'inventer un profil", () => {
    const partial = answersFavoring(['E', 'S', 'T', 'J']);
    delete partial[24];
    expect(isCompleteAnswers(partial)).toBe(false);
    expect(() => computeMbtiResult(partial)).toThrow(/incomplet/i);
    expect(safeComputeMbtiResult(partial)).toBeNull();
    expect(safeComputeMbtiResult(null)).toBeNull();
  });

  it('refuse une valeur hors échelle 1–5', () => {
    const bad = answersFavoring(['E', 'S', 'T', 'J']);
    bad[7] = 9;
    expect(isCompleteAnswers(bad)).toBe(false);
  });

  it('donne un libellé lisible pour une égalité', () => {
    expect(tieLabel('TF')).toBe('T/F à égalité');
  });
});
