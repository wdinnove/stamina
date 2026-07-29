import type { PlayerAdvancedStats } from '../playerAdvanced';
import type { BasketballPosition } from '../types';

/** Stats agrégées d'un joueur sur une période (saison, N derniers matchs...).
 *  Les ratios de `advancedAgg` sont recalculés à partir des `totals` sommés sur la période
 *  (pas une moyenne des ratios calculés match par match — voir statsAggregator.ts). */
export interface RawPlayerStats {
  playerId: string;
  periodLabel: string;
  matches: number;
  minutesTotal: number;
  totals: {
    pts: number; fg2m: number; fg2a: number; fg3m: number; fg3a: number;
    ftm: number; fta: number; ro: number; rd: number; pd: number; ct: number;
    intercepts: number; bp: number; fte: number; fpr: number; startsCount: number;
    plusMinus: number; plusMinusCount: number;
  };
  advancedAgg: PlayerAdvancedStats;
  /** Phase 2+ : renseigné seulement une fois `tactical_events.player_id` exploitable. */
  tacticalAgg?: Record<string, number> | null;
}

export interface FeatureDef {
  key: string;
  label: string;
  source: 'boxscore' | 'advanced' | 'tactical_tagged';
  /** Retourne null si la feature est indisponible pour ce joueur/période (pas de fallback à 0). */
  get: (raw: RawPlayerStats) => number | null;
}

export interface FeatureVector {
  playerId: string;
  values: Record<string, { raw: number | null; percentile: number | null }>;
  sampleSize: { matches: number; minutes: number };
}

export type ArchetypeCategory =
  | 'meneurs' | 'shooteurs' | 'createurs' | 'attaque_cercle'
  | 'interieurs' | 'polyvalents' | 'defense' | 'energie';

export interface ProfileIndicator {
  featureKey: string;
  /** Signé : positif = typique du profil si la feature est haute, négatif = doit être basse. */
  weight: number;
  /** Si vrai et la feature est indisponible pour le joueur, le profil devient non calculable. */
  required?: boolean;
}

export interface ProfileDefinition {
  key: string;
  label: string;
  description: string;
  category: ArchetypeCategory;
  indicators: ProfileIndicator[];
  /** 'available' = box-score suffit ; 'partial_proxy' = approximation faute de données de type
   *  de jeu ; 'planned' = nécessite la Phase 2 (tagging vidéo par joueur), exclu du calcul. */
  status: 'available' | 'partial_proxy' | 'planned';
  /** Postes pour lesquels ce profil a un sens basket (voir positionGroups.ts). Si omis, le
   *  profil est considéré transversal (proposé à tous les postes) — cas des profils de rôle
   *  pur (Glue Guy, Energy Player...) qui ne dépendent pas d'une fonction de jeu précise. */
  eligiblePositions?: BasketballPosition[];
  caveat?: string;
}

export interface DimensionIndicator { featureKey: string; weight: number }

export interface DimensionDefinition {
  key: string;
  label: string;
  description: string;
  indicators: DimensionIndicator[];
  status: 'available' | 'partial_proxy' | 'planned';
  caveat?: string;
}

export interface Contribution {
  featureKey: string;
  label: string;
  rawValue: number | null;
  percentile: number | null;
  /** Contribution signée au score, en points (avant clamp final). */
  points: number;
}

export interface ArchetypeResult {
  playerId: string;
  profileKey: string;
  label: string;
  category: ArchetypeCategory;
  computable: boolean;
  /** Score final 0-100, après shrinkage petit échantillon. Absent si non calculable. */
  score: number | null;
  /** Score avant shrinkage — utile pour debug/tests. */
  rawScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  sampleSize: { matches: number; minutes: number };
  topPositive: Contribution[];
  topNegative: Contribution[];
  caveat?: string;
}

export interface StyleDimensionResult {
  playerId: string;
  dimensionKey: string;
  label: string;
  computable: boolean;
  score: number | null;
  rawScore: number | null;
  confidence: 'low' | 'medium' | 'high';
  sampleSize: { matches: number; minutes: number };
  topPositive: Contribution[];
  topNegative: Contribution[];
  caveat?: string;
}

export interface PlayerArchetypeReport {
  playerId: string;
  archetypes: ArchetypeResult[];
  dimensions: StyleDimensionResult[];
}

/** Poste(s) d'un joueur pour le moteur d'archétypes — le poste principal sert au regroupement
 *  du pool de percentile (voir positionGroups.ts), le poste secondaire élargit seulement
 *  l'éligibilité aux profils (un profil est proposé si l'un des deux postes le couvre). */
export interface PlayerPositionInfo {
  position: BasketballPosition;
  secondaryPosition?: BasketballPosition;
}
