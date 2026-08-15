export type {
  MbtiPole, MbtiAxisDef, MbtiQuestion, MbtiAnswers, MbtiType,
  MbtiProfile, MbtiAxisResult, MbtiResult,
} from './types';

export {
  MBTI_AXES, MBTI_QUESTIONS, MBTI_QUESTION_COUNT,
  MBTI_SCALE_MIN, MBTI_SCALE_MAX, MBTI_SCALE_LABELS,
} from './questions';

export { computeMbtiResult, safeComputeMbtiResult, isCompleteAnswers, tieLabel, MBTI_TIE_CHAR } from './scoring';

export { MBTI_PROFILES_V1, MBTI_TYPES } from './profiles/v1';

export {
  axisSpread, teamPairs, frictionPairs, affinityPairs,
  FRICTION_MIN_GAP, FRICTION_ALERT_SCORE,
  type MbtiPlayerResult, type MbtiPair, type AxisOpposition, type AxisSpread,
} from './friction';
