import type {
  RawPlayerStats, ProfileDefinition, DimensionDefinition,
  ArchetypeResult, StyleDimensionResult, PlayerArchetypeReport,
} from './types';
import { buildFeatureVectors } from './featureBuilder';
import { scoreIndicators } from './scoringEngine';
import { explainScore } from './explainer';
import { PROFILES_V1 } from './profiles/v1';
import { DIMENSIONS_V1 } from './dimensions/v1';

/**
 * Orchestrateur : construit les vecteurs de features de l'effectif fourni, puis calcule le
 * score de chaque profil/dimension pour chaque joueur. Ne connaît aucun nom de profil ou de
 * feature en dur — tout vient des registres passés en paramètre (par défaut les catalogues
 * Phase 1). Les entrées `status: 'planned'` sont exclues du calcul.
 */
export function computeArchetypesForSquad(
  raws: RawPlayerStats[],
  profiles: ProfileDefinition[] = PROFILES_V1,
  dimensions: DimensionDefinition[] = DIMENSIONS_V1,
): PlayerArchetypeReport[] {
  const vectors = buildFeatureVectors(raws);
  const activeProfiles = profiles.filter(p => p.status !== 'planned');
  const activeDimensions = dimensions.filter(d => d.status !== 'planned');

  return vectors.map(vector => {
    const archetypes: ArchetypeResult[] = activeProfiles.map(profile => {
      const scored = scoreIndicators(vector, profile.indicators);
      const explained = explainScore(scored, vector.sampleSize);
      return {
        playerId: vector.playerId,
        profileKey: profile.key,
        label: profile.label,
        category: profile.category,
        sampleSize: vector.sampleSize,
        caveat: profile.caveat,
        ...explained,
      };
    });

    const dimensionResults: StyleDimensionResult[] = activeDimensions.map(dimension => {
      const scored = scoreIndicators(vector, dimension.indicators);
      const explained = explainScore(scored, vector.sampleSize);
      return {
        playerId: vector.playerId,
        dimensionKey: dimension.key,
        label: dimension.label,
        sampleSize: vector.sampleSize,
        caveat: dimension.caveat,
        ...explained,
      };
    });

    return { playerId: vector.playerId, archetypes, dimensions: dimensionResults };
  });
}
