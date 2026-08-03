import type {
  RawPlayerStats, ProfileDefinition, DimensionDefinition, PlayerPositionInfo,
  ArchetypeResult, StyleDimensionResult, PlayerArchetypeReport, FeatureVector,
} from './types';
import { buildFeatureVectors } from './featureBuilder';
import { scoreIndicators } from './scoringEngine';
import { explainScore, MIN_MATCHES_HARD_CUTOFF } from './explainer';
import { POSITION_GROUP, MIN_GROUP_SIZE_FOR_FULL_CONFIDENCE, type PositionGroup } from './positionGroups';
import { PROFILES_V1 } from './profiles/v1';
import { DIMENSIONS_V1 } from './dimensions/v1';

const SMALL_GROUP_CAVEAT = `Comparé à un groupe de moins de ${MIN_GROUP_SIZE_FOR_FULL_CONFIDENCE} joueurs du même poste — le sens du score reste valable, mais sa valeur précise est à prendre avec prudence.`;

/** Dégrade la confiance d'un cran et ajoute un caveat si le groupe de comparaison (par poste)
 *  est petit — le percentile reste calculé au sein du groupe, jamais mélangé avec un pool plus
 *  large qui réintroduirait le biais cross-position que le découpage par poste doit justement
 *  éviter (voir positionGroups.ts). On préfère un score bruité mais honnête à un score lissé
 *  mais faux. */
function applyGroupSizeConfidence<T extends { computable: boolean; confidence: 'low' | 'medium' | 'high' }>(
  explained: T, groupSize: number, profileCaveat: string | undefined,
): T & { caveat?: string } {
  if (!explained.computable || groupSize >= MIN_GROUP_SIZE_FOR_FULL_CONFIDENCE) {
    return { ...explained, caveat: profileCaveat };
  }
  return {
    ...explained,
    confidence: explained.confidence === 'high' ? 'medium' : 'low',
    caveat: [profileCaveat, SMALL_GROUP_CAVEAT].filter(Boolean).join(' '),
  };
}

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
 * référence), sans jamais être mélangé avec l'effectif entier : un groupe encore petit se voit
 * simplement attribuer une confiance dégradée plutôt qu'un score dilué vers un pool biaisé
 * (voir `applyGroupSizeConfidence`). Un joueur sans poste connu tombe dans le groupe
 * 'exterieurs' par défaut, plutôt que d'être exclu du calcul.
 *
 * Un profil dont `eligiblePositions` ne couvre ni le poste principal ni le poste secondaire du
 * joueur n'est simplement pas proposé pour lui (absent du tableau, pas marqué "non calculable").
 * Si le poste du joueur est inconnu, seuls les profils transversaux (sans `eligiblePositions`)
 * lui sont proposés — on ne peut pas confirmer qu'un profil réservé à un poste s'applique.
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

  const byGroup = new Map<PositionGroup, RawPlayerStats[]>();
  for (const r of qualified) {
    const info = playerPositions.get(r.playerId);
    const group = info ? POSITION_GROUP[info.position] : 'exterieurs';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(r);
  }

  const vectors: FeatureVector[] = [];
  const groupSizeByPlayerId = new Map<string, number>();
  for (const groupRaws of byGroup.values()) {
    for (const vector of buildFeatureVectors(groupRaws)) {
      vectors.push(vector);
      groupSizeByPlayerId.set(vector.playerId, groupRaws.length);
    }
  }

  return vectors.map(vector => {
    const info = playerPositions.get(vector.playerId);
    const groupSize = groupSizeByPlayerId.get(vector.playerId)!;
    const eligibleProfiles = activeProfiles.filter(p => {
      if (!p.eligiblePositions) return true; // profil transversal
      if (!info) return false; // poste inconnu : impossible de confirmer l'éligibilité
      return p.eligiblePositions.includes(info.position)
        || (!!info.secondaryPosition && p.eligiblePositions.includes(info.secondaryPosition));
    });

    const archetypes: ArchetypeResult[] = eligibleProfiles.map(profile => {
      const scored = scoreIndicators(vector, profile.indicators);
      const explained = applyGroupSizeConfidence(explainScore(scored, vector.sampleSize), groupSize, profile.caveat);
      return {
        playerId: vector.playerId,
        profileKey: profile.key,
        label: profile.label,
        category: profile.category,
        sampleSize: vector.sampleSize,
        ...explained,
      };
    });

    const dimensionResults: StyleDimensionResult[] = activeDimensions.map(dimension => {
      const scored = scoreIndicators(vector, dimension.indicators);
      const explained = applyGroupSizeConfidence(explainScore(scored, vector.sampleSize), groupSize, dimension.caveat);
      return {
        playerId: vector.playerId,
        dimensionKey: dimension.key,
        label: dimension.label,
        sampleSize: vector.sampleSize,
        ...explained,
      };
    });

    return { playerId: vector.playerId, archetypes, dimensions: dimensionResults };
  });
}
