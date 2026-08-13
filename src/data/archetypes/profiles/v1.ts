import type { ProfileDefinition } from '../types';

const NO_PLAY_TYPE_DATA = "Approximation à partir du box-score : aucune donnée de type de jeu/zone de tir par joueur disponible aujourd'hui (Phase 2).";

/**
 * Profils calculables dès aujourd'hui avec les seules données existantes (box-score +
 * stats avancées agrégées + minutes/titularisation). Voir profiles/catalog.ts (Phase 3)
 * pour le catalogue complet une fois les données de tagging vidéo par joueur disponibles.
 *
 * `startersRate` et `plusMinusAvg` restent dans FEATURE_REGISTRY comme contexte (affichés,
 * ex. dans l'UI), mais ne sont plus utilisés comme indicateur pondéré ici : être titulaire est
 * une décision de coach, pas un attribut de style de jeu, et le +/- individuel est trop bruité
 * sur un petit échantillon pour porter un profil à lui seul (voir audit).
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
    eligiblePositions: ['Meneur', 'Arrière'],
    caveat: `${NO_PLAY_TYPE_DATA} Un vrai profil de meneur nécessite en plus les données PnR ball-handler.`,
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
    eligiblePositions: ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort'],
    caveat: `${NO_PLAY_TYPE_DATA} Se rapproche du "Shooter Specialist" mais sans distinguer Catch&Shoot / pull-up.`,
  },
  {
    key: 'tireur_volume',
    label: 'Tireur à volume',
    description: 'Prend beaucoup de tirs, du périmètre en particulier, indépendamment de son pourcentage de réussite.',
    category: 'shooteurs',
    indicators: [
      { featureKey: 'fg3VolumePer36', weight: 2 },
      { featureKey: 'fgaPer36', weight: 2 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort'],
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
    eligiblePositions: ['Meneur', 'Arrière', 'Ailier'],
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
    ],
    status: 'partial_proxy',
    // Pas d'eligiblePositions : rôle transversal, proposé à tous les postes.
    caveat: NO_PLAY_TYPE_DATA,
  },
  {
    key: 'scoreur_interieur',
    label: 'Scoreur intérieur',
    description: 'Score principalement à 2 points et provoque des fautes, sans dépendre du tir extérieur.',
    category: 'attaque_cercle',
    indicators: [
      { featureKey: 'ftRate', weight: 2 },
      { featureKey: 'fg2Pct', weight: 2 },
      { featureKey: 'fg3VolumePer36', weight: -1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Meneur', 'Arrière', 'Ailier'],
    caveat: `${NO_PLAY_TYPE_DATA} Sans donnée de zone de tir, impossible de distinguer une finition au cercle d'un tir à mi-distance — ce profil mesure "scoreur intérieur" au sens large, pas spécifiquement le cercle.`,
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
    eligiblePositions: ['Ailier Fort', 'Pivot'],
  },
  {
    key: 'stretch_five',
    label: 'Intérieur shooteur (stretch 5)',
    description: "Intérieur qui étire la défense en menaçant depuis la ligne à 3 points, au lieu de vivre près du cercle — libère la raquette pour les autres.",
    category: 'interieurs',
    indicators: [
      { featureKey: 'fg3VolumePer36', weight: 2 },
      { featureKey: 'fg3Pct', weight: 2 },
      { featureKey: 'efgPct', weight: 1 },
      // Poids négatif volontaire : un fort taux de rebond offensif signale une intérieure qui
      // reste au cercle, donc l'inverse d'un profil qui écarte le jeu.
      { featureKey: 'orebPct', weight: -1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Ailier Fort', 'Pivot'],
    caveat: `${NO_PLAY_TYPE_DATA} Sans donnée de zone de tir, le volume à 3 points sert de proxy à l'écartement réel : une intérieure qui tire beaucoup de 3 points sans les rentrer ressort quand même partiellement.`,
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
    eligiblePositions: ['Pivot', 'Ailier Fort', 'Ailier'],
    caveat: `${NO_PLAY_TYPE_DATA} Ne distingue pas contres à la trajectoire vs sur joueur posté, ni rotation d'aide vs protection individuelle.`,
  },
  {
    key: 'interieur_passeur',
    label: 'Intérieur passeur',
    description: "Intérieur qui distribue depuis le haut de raquette ou après rebond, au-delà de son rôle de finisseur.",
    category: 'interieurs',
    indicators: [
      { featureKey: 'astPct', weight: 2 },
      { featureKey: 'tovPct', weight: -1 },
      { featureKey: 'trebPct', weight: 1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Ailier Fort', 'Pivot'],
    caveat: `${NO_PLAY_TYPE_DATA} Le %PD est comparé aux autres intérieurs, pas à l'effectif entier — sinon aucun intérieur ne ressortirait jamais devant un meneur.`,
  },
  {
    key: 'couteau_suisse',
    label: 'Couteau suisse',
    description: "Cumule une production statistique large sur plusieurs registres (score, rebonds, passes, défense) — mesure le volume de contribution, pas un équilibre entre les registres.",
    category: 'polyvalents',
    indicators: [
      { featureKey: 'ptsProd', weight: 1 },
      { featureKey: 'trebPct', weight: 1 },
      { featureKey: 'astPct', weight: 1 },
      { featureKey: 'ctPer36', weight: 1 },
      { featureKey: 'interceptsPer36', weight: 1 },
    ],
    status: 'partial_proxy',
    // Pas d'eligiblePositions : rôle transversal, proposé à tous les postes.
    caveat: "Une somme pondérée récompense un joueur fort sur beaucoup de registres à la fois (proche d'un profil de star à fort volume), pas un profil réellement équilibré/régulier — une vraie mesure de régularité nécessiterait un second mode de scoring (variance entre percentiles), hors scope aujourd'hui.",
  },
  {
    key: 'ailier_3d',
    label: 'Ailier 3&D',
    description: "Tireur extérieur fiable à faible usage, complété par une activité défensive périphérique.",
    category: 'polyvalents',
    indicators: [
      { featureKey: 'fg3Pct', weight: 2 },
      { featureKey: 'fg3VolumePer36', weight: 1 },
      { featureKey: 'interceptsPer36', weight: 1 },
      { featureKey: 'usagePct', weight: -1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Ailier', 'Ailier Fort', 'Arrière'],
    caveat: `${NO_PLAY_TYPE_DATA} Le volet défensif est un proxy faible (interceptions seules) — pas de données de matchup ni de rating défensif individuel.`,
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
    eligiblePositions: ['Meneur', 'Arrière', 'Ailier'],
    caveat: `${NO_PLAY_TYPE_DATA} Pas de donnée de déviations ni de charges provoquées.`,
  },
  {
    // Anciennement « Moteur d'énergie ». Renommé d'après ce que les indicateurs mesurent
    // réellement : un moteur d'énergie se reconnaît aux déviations, ballons libres récupérés et
    // secondes chances créées — aucune de ces données n'est saisie. Promettre « énergie » avec un
    // taux de rebond offensif et des fautes provoquées induisait en erreur.
    key: 'presence_offensive',
    label: 'Présence au rebond et au contact',
    description: "Se rend disponible près du cercle après un tir manqué et provoque des fautes — deux façons de créer des munitions sans avoir à créer son tir.",
    category: 'energie',
    indicators: [
      { featureKey: 'orebPct', weight: 2 },
      { featureKey: 'ftePer36', weight: 2 },
    ],
    status: 'partial_proxy',
    // Pas d'eligiblePositions : rôle transversal, proposé à tous les postes.
    caveat: "Le rebond offensif et les fautes provoquées ne couvrent qu'une partie de l'activité : ni les déviations, ni les ballons libres récupérés, ni les écrans ne sont saisis.",
  },
  {
    key: 'scoreur_volume',
    label: 'Scoreur à volume',
    description: 'Scoreur à fort volume et bonne efficacité, sans être le premier passeur de son équipe.',
    category: 'meneurs',
    indicators: [
      { featureKey: 'usagePct', weight: 2 },
      { featureKey: 'ptsProd', weight: 2 },
      { featureKey: 'efgPct', weight: 1 },
      { featureKey: 'astPct', weight: -1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Arrière', 'Meneur'],
    caveat: NO_PLAY_TYPE_DATA,
  },
  {
    key: 'meneur_gestionnaire',
    label: 'Meneur gestionnaire',
    description: "Gère le tempo et protège le ballon avant tout — un profil qui minimise le risque plutôt qu'il ne maximise la création.",
    category: 'meneurs',
    indicators: [
      { featureKey: 'tovPct', weight: -3 },
      { featureKey: 'astPct', weight: 1 },
    ],
    status: 'partial_proxy',
    eligiblePositions: ['Meneur', 'Arrière'],
    caveat: `${NO_PLAY_TYPE_DATA} Se distingue de "Distributeur pur" par l'accent mis sur la sécurité de balle plutôt que le volume de passes décisives.`,
  },
];
