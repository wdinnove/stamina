export type {
  RawPlayerStats, FeatureDef, FeatureVector, ArchetypeCategory,
  ProfileIndicator, ProfileDefinition, DimensionIndicator, DimensionDefinition,
  Contribution, ArchetypeResult, StyleDimensionResult, PlayerArchetypeReport,
} from './types';

export { FEATURE_REGISTRY, getFeature } from './featureRegistry';
export { aggregateRawStats } from './statsAggregator';
export { percentileRank } from './normalizer';
export { buildFeatureVectors } from './featureBuilder';
export { scoreIndicators, type ScoredProfile, type IndicatorLike } from './scoringEngine';
export { explainScore, MIN_MATCHES_HARD_CUTOFF, MIN_MINUTES_FULL_CONFIDENCE, type ExplainedScore } from './explainer';
export { computeArchetypesForSquad } from './archetypeEngine';
export { CATEGORY_LABELS } from './profiles/categories';
export { PROFILES_V1 } from './profiles/v1';
export { DIMENSIONS_V1 } from './dimensions/v1';
