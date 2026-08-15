import { MBTI_AXES, MBTI_QUESTIONS, MBTI_QUESTION_COUNT, MBTI_SCALE_MAX, MBTI_SCALE_MIN } from './questions';
import type { MbtiAnswers, MbtiAxisResult, MbtiPole, MbtiResult, MbtiType } from './types';

/** Caractère marquant un axe à égalité stricte dans le code à 4 lettres. */
export const MBTI_TIE_CHAR = 'X';

const POLES: MbtiPole[] = ['E', 'I', 'S', 'N', 'T', 'F', 'J', 'P'];

/** Vrai si les 24 réponses sont présentes et dans l'échelle 1–5.
 *  Même règle que le verrou serveur (`submit_mbti_public`) : on ne calcule pas un profil partiel. */
export function isCompleteAnswers(answers: MbtiAnswers | null | undefined): boolean {
  if (!answers) return false;
  return MBTI_QUESTIONS.every(q => {
    const v = answers[q.id];
    return Number.isInteger(v) && v >= MBTI_SCALE_MIN && v <= MBTI_SCALE_MAX;
  });
}

/**
 * Dépouille un questionnaire complet.
 *
 * Score d'un pôle = somme des réponses à ses 3 questions (donc 3 à 15). Sur chaque axe, la lettre
 * retenue est celle du pôle au score le plus élevé ; en cas d'égalité stricte on ne tranche pas —
 * `winner` reste `null`, le code porte un `X` et les deux fiches candidates sont proposées
 * (cf. cahier des charges §3.2).
 *
 * Lève si le questionnaire est incomplet : un profil calculé sur des trous serait faux sans le dire.
 */
export function computeMbtiResult(answers: MbtiAnswers): MbtiResult {
  if (!isCompleteAnswers(answers)) {
    throw new Error(`Questionnaire incomplet : les ${MBTI_QUESTION_COUNT} réponses sont requises`);
  }

  const scores = Object.fromEntries(POLES.map(p => [p, 0])) as Record<MbtiPole, number>;
  for (const q of MBTI_QUESTIONS) scores[q.pole] += answers[q.id];

  const axes: MbtiAxisResult[] = MBTI_AXES.map(axis => {
    const scoreA = scores[axis.a];
    const scoreB = scores[axis.b];
    const total = scoreA + scoreB;
    // total ne peut pas être nul (échelle minimale 1), pas de garde nécessaire ici.
    const percentA = Math.round((scoreA / total) * 100);
    return {
      key: axis.key,
      label: axis.label,
      a: axis.a, scoreA,
      b: axis.b, scoreB,
      percentA,
      percentB: 100 - percentA,
      winner: scoreA === scoreB ? null : (scoreA > scoreB ? axis.a : axis.b),
    };
  });

  const code = axes.map(ax => ax.winner ?? MBTI_TIE_CHAR).join('');

  // Produit cartésien des lettres possibles : un axe tranché en donne une, un axe à égalité deux.
  const candidates = axes.reduce<string[]>(
    (acc, ax) => acc.flatMap(prefix => (ax.winner ? [prefix + ax.winner] : [prefix + ax.a, prefix + ax.b])),
    [''],
  ) as MbtiType[];

  return {
    scores,
    axes,
    code,
    candidates,
    ties: axes.filter(ax => ax.winner === null).map(ax => ax.key),
  };
}

/** Version tolérante : `null` au lieu d'une exception quand les réponses manquent ou sont partielles. */
export function safeComputeMbtiResult(answers: MbtiAnswers | null | undefined): MbtiResult | null {
  if (!isCompleteAnswers(answers)) return null;
  return computeMbtiResult(answers as MbtiAnswers);
}

/** Libellé d'un axe à égalité, ex. « T/F à égalité » — affiché tel quel plutôt qu'un arbitrage muet. */
export function tieLabel(key: MbtiResult['ties'][number]): string {
  const axis = MBTI_AXES.find(a => a.key === key);
  return axis ? `${axis.a}/${axis.b} à égalité` : '';
}
