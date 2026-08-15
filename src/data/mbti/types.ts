/** Questionnaire de personnalité (inspiration MBTI) — types du module.
 *
 *  Outil indicatif, jamais un diagnostic : il décrit des préférences déclarées par le joueur
 *  un jour donné, pas une caractéristique stable ni une aptitude sportive. Rien ici ne doit
 *  servir à écarter un joueur d'un rôle — cf. la mention non-clinique affichée dans l'app. */

/** Les 8 pôles, groupés deux à deux en 4 axes. */
export type MbtiPole = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';

/** Un axe = une opposition de deux pôles. L'ordre (a, b) fixe l'ordre d'affichage. */
export interface MbtiAxisDef {
  key: 'EI' | 'SN' | 'TF' | 'JP';
  a: MbtiPole;
  b: MbtiPole;
  /** Ce que mesure l'axe, en une ligne — affiché sous la barre de répartition. */
  label: string;
}

export interface MbtiQuestion {
  /** Identifiant stable : c'est la clé sous laquelle la réponse est stockée en base. */
  id: number;
  text: string;
  pole: MbtiPole;
}

/** Réponses brutes, 1 (pas du tout d'accord) → 5 (tout à fait d'accord), indexées par `question.id`. */
export type MbtiAnswers = Record<number, number>;

/** Les 16 types canoniques. */
export type MbtiType =
  | 'ISTJ' | 'ISFJ' | 'INFJ' | 'INTJ'
  | 'ISTP' | 'ISFP' | 'INFP' | 'INTP'
  | 'ESTP' | 'ESFP' | 'ENFP' | 'ENTP'
  | 'ESTJ' | 'ESFJ' | 'ENFJ' | 'ENTJ';

/** Fiche descriptive d'un type — référentiel statique, 16 entrées. */
export interface MbtiProfile {
  /** Surnom du profil, ex. « Le stratège ». */
  nick: string;
  essence: string;
  forces: string[];
  vigilances: string[];
  stress: string[];
  motiv: string[];
  comm: string[];
}

/** Résultat d'un axe après dépouillement. */
export interface MbtiAxisResult {
  key: MbtiAxisDef['key'];
  label: string;
  /** Pôle de gauche et son score brut (somme des réponses aux questions de ce pôle). */
  a: MbtiPole;
  scoreA: number;
  b: MbtiPole;
  scoreB: number;
  /** Part du pôle a, en pourcentage entier (0–100). La part de b est le complément. */
  percentA: number;
  percentB: number;
  /** Pôle dominant, `null` en cas d'égalité stricte — jamais tranché arbitrairement. */
  winner: MbtiPole | null;
}

export interface MbtiResult {
  /** Somme des réponses par pôle (3 questions × 1–5 ⇒ 3 à 15). */
  scores: Record<MbtiPole, number>;
  axes: MbtiAxisResult[];
  /** Code à 4 lettres ; un axe à égalité prend un `X` (ex. « ISXP »). */
  code: string;
  /** Types compatibles avec le résultat : 1 si aucune égalité, ×2 par axe à égalité. */
  candidates: MbtiType[];
  /** Axes à égalité stricte, à signaler explicitement à l'utilisateur. */
  ties: MbtiAxisDef['key'][];
}
