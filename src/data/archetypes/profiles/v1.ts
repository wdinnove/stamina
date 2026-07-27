import type { ProfileDefinition } from '../types';

const NO_PLAY_TYPE_DATA = "Approximation à partir du box-score : aucune donnée de type de jeu/zone de tir par joueur disponible aujourd'hui (Phase 2).";

/**
 * Profils calculables dès aujourd'hui avec les seules données existantes (box-score +
 * stats avancées agrégées + minutes/titularisation). Voir profiles/catalog.ts (Phase 3)
 * pour le catalogue complet une fois les données de tagging vidéo par joueur disponibles.
 */
export const PROFILES_V1: ProfileDefinition[] = [
  {
    key: 'distributeur_pur',
    label: 'Distributeur pur',
    description: "Fait vivre le collectif avant tout : beaucoup de passes décisives, peu de pertes de balle, sans avoir besoin d'un fort volume de tir.",
    category: 'meneurs',
    indicators: [
      { featureKey: 'astPct', weight: 3 },
      { featureKey: 'tovPct', weight: -2 },
      { featureKey: 'usagePct', weight: 1 },
      { featureKey: 'fg3VolumePer36', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Un vrai profil de meneur nécessite en plus les données PnR ball-handler.`,
  },
  {
    key: 'meneur_combo_scoreur',
    label: 'Meneur combo scoreur',
    description: 'Combine un fort volume de jeu et une production de points élevée tout en gardant un rôle de distribution.',
    category: 'meneurs',
    indicators: [
      { featureKey: 'usagePct', weight: 2 },
      { featureKey: 'ptsProd', weight: 2 },
      { featureKey: 'astPct', weight: 1 },
      { featureKey: 'tovPct', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: NO_PLAY_TYPE_DATA,
  },
  {
    key: 'sniper_exterieur',
    label: 'Sniper extérieur',
    description: 'Menace extérieure fiable à haut volume, avec une bonne efficacité globale au tir.',
    category: 'shooteurs',
    indicators: [
      { featureKey: 'fg3Pct', weight: 3 },
      { featureKey: 'fg3VolumePer36', weight: 2 },
      { featureKey: 'efgPct', weight: 1 },
      { featureKey: 'usagePct', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Se rapproche du "Shooter Specialist" mais sans distinguer Catch&Shoot / pull-up.`,
  },
  {
    key: 'tireur_volume',
    label: 'Tireur à volume',
    description: 'Prend beaucoup de tirs extérieurs et de lancers francs, indépendamment de son pourcentage de réussite.',
    category: 'shooteurs',
    indicators: [
      { featureKey: 'fg3VolumePer36', weight: 3 },
      { featureKey: 'ftaPer36', weight: 1 },
      { featureKey: 'efgPct', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: NO_PLAY_TYPE_DATA,
  },
  {
    key: 'createur_volume',
    label: 'Créateur à volume (hub)',
    description: "Hub offensif : concentre le jeu, produit et fait produire à fort volume.",
    category: 'createurs',
    indicators: [
      { featureKey: 'usagePct', weight: 2 },
      { featureKey: 'astPct', weight: 2 },
      { featureKey: 'ptsProd', weight: 2 },
      { featureKey: 'tovPct', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Sans distinction isolation / pick-and-roll / post-up.`,
  },
  {
    key: 'connecteur',
    label: 'Connecteur',
    description: "Fait circuler le ballon efficacement sans faire exploser son volume de jeu — le liant du collectif.",
    category: 'createurs',
    indicators: [
      { featureKey: 'astPct', weight: 2 },
      { featureKey: 'tovPct', weight: -2 },
      { featureKey: 'usagePct', weight: -1 },
      { featureKey: 'startersRate', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: NO_PLAY_TYPE_DATA,
  },
  {
    key: 'finisseur_contact',
    label: 'Finisseur au contact',
    description: 'Attaque le cercle et provoque des fautes, avec une bonne efficacité à 2 points.',
    category: 'attaque_cercle',
    indicators: [
      { featureKey: 'ftRate', weight: 2 },
      { featureKey: 'fg2Pct', weight: 2 },
      { featureKey: 'fg3VolumePer36', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Sans donnée de zone de tir (at-rim), le 2PT% et le FT Rate servent de proxy.`,
  },
  {
    key: 'rebondeur_two_way',
    label: 'Rebondeur two-way',
    description: 'Impact fort sur les deux tableaux de rebonds, offensif comme défensif.',
    category: 'interieurs',
    indicators: [
      { featureKey: 'orebPct', weight: 2 },
      { featureKey: 'drebPct', weight: 2 },
      { featureKey: 'trebPct', weight: 1 },
    ],
    status: 'available',
  },
  {
    key: 'protecteur_cercle',
    label: 'Protecteur de cercle',
    description: 'Contreur intimidant qui verrouille la raquette, avec peu de fautes inutiles.',
    category: 'interieurs',
    indicators: [
      { featureKey: 'ctPer36', weight: 3 },
      { featureKey: 'drebPct', weight: 1 },
      { featureKey: 'fprPer36', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Ne distingue pas contres à la trajectoire vs sur joueur posté.`,
  },
  {
    key: 'couteau_suisse',
    label: 'Couteau suisse',
    description: "Contribue sur tous les tableaux statistiques sans dépendre d'un registre unique.",
    category: 'polyvalents',
    indicators: [
      { featureKey: 'ptsProd', weight: 1 },
      { featureKey: 'trebPct', weight: 1 },
      { featureKey: 'astPct', weight: 1 },
      { featureKey: 'ctPer36', weight: 1 },
      { featureKey: 'interceptsPer36', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: 'Mesure une production statistique large, pas un équilibre strict entre les registres.',
  },
  {
    key: 'intercepteur_perturbateur',
    label: 'Intercepteur / perturbateur',
    description: 'Génère des ballons perdus adverses par anticipation, sans faute excessive.',
    category: 'defense',
    indicators: [
      { featureKey: 'interceptsPer36', weight: 3 },
      { featureKey: 'drebPct', weight: 1 },
      { featureKey: 'fprPer36', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: `${NO_PLAY_TYPE_DATA} Pas de donnée de déviations ni de charges provoquées.`,
  },
  {
    key: 'moteur_energie',
    label: "Moteur d'énergie",
    description: 'Impact par les secondes efforts et les fautes provoquées, souvent depuis le banc.',
    category: 'energie',
    indicators: [
      { featureKey: 'orebPct', weight: 2 },
      { featureKey: 'ftePer36', weight: 2 },
      { featureKey: 'startersRate', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: "Proxy sans donnée de déviations ni de ballons libres récupérés.",
  },
  {
    key: 'sixieme_homme_impact',
    label: "Sixième homme d'impact",
    description: "Change la physionomie du match dès son entrée en jeu, en sortie de banc.",
    category: 'energie',
    indicators: [
      { featureKey: 'plusMinusAvg', weight: 2 },
      { featureKey: 'startersRate', weight: -2 },
    ],
    status: 'partial_proxy',
    caveat: 'Le +/- individuel est saisi manuellement par match et sensible au contexte (adversaire, coéquipiers sur le terrain).',
  },
];
