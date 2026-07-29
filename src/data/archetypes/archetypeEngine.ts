import type {
  RawPlayerStats, ProfileDefinition, DimensionDefinition, PlayerPositionInfo,
  ArchetypeResult, StyleDimensionResult, PlayerArchetypeReport,
} from './types';
import { buildFeatureVectors, blendWithSquadVectors } from './featureBuilder';
import { scoreIndicators } from './scoringEngine';
import { explainScore, MIN_MATCHES_HARD_CUTOFF } from './explainer';
import { POSITION_GROUP, type PositionGroup } from './positionGroups';
import { PROFILES_V1 } from './profiles/v1';
import { DIMENSIONS_V1 } from './dimensions/v1';

/**
 * Orchestrateur : construit les vecteurs de features de l'effectif fourni, puis calcule le
 * score de chaque profil/dimension pour chaque joueur. Ne connaît aucun nom de profil ou de
 * feature en dur — tout vient des registres passés en paramètre (par défaut les catalogues
 * Phase 1). Les entrées `status: 'planned'` sont exclues du calcul.
 *
 * Les joueurs sous `MIN_MATCHES_HARD_CUTOFF` matchs sont exclus du pool de comparaison avant
 * même de calculer les percentiles — pas seulement de l'affichage de leur propre score — pour
 * qu'un joueur à l'échantillon trop faible (ex. 1 match exceptionnel) ne fausse pas le
 * classement des autres joueurs de l'effectif.
 *
 * Le percentile de chaque joueur se calcule au sein de son groupe de postes (voir
 * positionGroups.ts, basé sur le poste PRINCIPAL uniquement — pas d'ambiguïté sur le pool de
 * référence), puis mélangé avec le percentile de l'effectif entier pondéré par la taille du
 * groupe (`blendWithSquadVectors`) : sur un petit groupe, le percentile interne est presque
 * binaire (n=2 ⇒ seulement 25/75 possibles) et n'importe quel écart, même bruité, ressortirait
 * comme un score extrême sans cette atténuation. Un joueur sans poste connu tombe dans le
 * groupe 'ailier' (le plus transversal), plutôt que d'être exclu du calcul.
 *
 * Un profil dont `eligiblePositions` ne couvre ni le poste principal ni le poste secondaire du
 * joueur n'est simplement pas proposé pour lui (absent du tableau, pas marqué "non calculable").
 */
export function computeArchetypesForSquad(
  raws: RawPlayerStats[],
  playerPositions: Map<string, PlayerPositionInfo>,
  profiles: ProfileDefinition[] = PROFILES_V1,
  dimensions: DimensionDefinition[] = DIMENSIONS_V1,
): PlayerArchetypeReport[] {
  const qualified = raws.filter(r => r.matches >= MIN_MATCHES_HARD_CUTOFF);
  const activeProfiles = profiles.filter(p => p.status !== 'planned');
  const activeDimensions = dimensions.filter(d => d.status !== 'planned');

  const squadVectorsById = new Map(buildFeatureVectors(qualified).map(v => [v.playerId, v]));

  const byGroup = new Map<PositionGroup, RawPlayerStats[]>();
  for (const r of qualified) {
    const info = playerPositions.get(r.playerId);
    const group = info ? POSITION_GROUP[info.position] : 'ailier';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(r);
  }
  const vectors = [...byGroup.values()].flatMap(groupRaws => {
    const groupVectors = buildFeatureVectors(groupRaws);
    return blendWithSquadVectors(groupVectors, squadVectorsById, groupRaws.length);
  });

  return vectors.map(vector => {
    const info = playerPositions.get(vector.playerId);
    const eligibleProfiles = activeProfiles.filter(p => {
      if (!p.eligiblePositions || !info) return true;
      return p.eligiblePositions.includes(info.position)
        || (!!info.secondaryPosition && p.eligiblePositions.includes(info.secondaryPosition));
    });

    const archetypes: ArchetypeResult[] = eligibleProfiles.map(profile => {
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
