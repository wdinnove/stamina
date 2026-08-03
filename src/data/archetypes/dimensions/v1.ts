import type { DimensionDefinition } from '../types';

const PLANNED_CAVEAT = "Nécessite la Phase 2 (tagging vidéo par joueur : transition, pick-and-roll, drives...) — non calculée aujourd'hui.";

/**
 * Les 14 dimensions de style demandées. 9 sont calculables dès aujourd'hui (`available` ou
 * `partial_proxy`), 5 sont déclarées `planned` (indicators vides) pour rester visibles en
 * roadmap sans être calculées — archetypeEngine.ts filtre sur `status !== 'planned'`.
 */
export const DIMENSIONS_V1: DimensionDefinition[] = [
  {
    key: 'volume_tir',
    label: 'Volume de tir',
    description: 'Quantité de tirs pris, tous types confondus, ramenée à 36 minutes.',
    indicators: [
      { featureKey: 'fgaPer36', weight: 1 },
    ],
    status: 'available',
  },
  {
    key: 'menace_exterieure',
    label: 'Menace extérieure',
    description: 'Capacité à punir depuis la ligne à 3 points, en volume et en efficacité.',
    indicators: [
      { featureKey: 'fg3Pct', weight: 2 },
      { featureKey: 'fg3VolumePer36', weight: 2 },
      { featureKey: 'efgPct', weight: 1 },
    ],
    status: 'available',
  },
  {
    key: 'menace_interieure',
    label: 'Menace intérieure',
    description: 'Capacité à scorer efficacement à courte/moyenne distance et à provoquer des fautes.',
    indicators: [
      { featureKey: 'fg2Pct', weight: 2 },
      { featureKey: 'ftRate', weight: 1 },
      { featureKey: 'orebPct', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: "Proxy via 2PT%/FT Rate — pas de donnée de zone de tir (at-rim) par joueur.",
  },
  {
    key: 'qualite_decision',
    label: 'Qualité de décision',
    description: 'Capacité à générer des passes décisives sans multiplier les pertes de balle.',
    indicators: [
      { featureKey: 'astPct', weight: 2 },
      { featureKey: 'tovPct', weight: -2 },
    ],
    status: 'available',
  },
  {
    key: 'vision_jeu',
    label: 'Vision du jeu',
    description: 'Propension à trouver des coéquipiers, indépendamment de son propre volume de tir.',
    indicators: [
      { featureKey: 'astPct', weight: 3 },
      { featureKey: 'usagePct', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: "Proxy via %PD — pas de donnée de passes potentielles/hockey assists.",
  },
  {
    key: 'impact_defensif',
    label: 'Impact défensif',
    description: 'Contres, interceptions et rebonds défensifs, sans faute excessive.',
    indicators: [
      { featureKey: 'interceptsPer36', weight: 2 },
      { featureKey: 'ctPer36', weight: 2 },
      { featureKey: 'drebPct', weight: 1 },
      { featureKey: 'fprPer36', weight: -1 },
    ],
    status: 'partial_proxy',
    caveat: "Pas de rating défensif individuel ni de split on/off — proxy box-score uniquement.",
  },
  {
    key: 'activite',
    label: 'Activité',
    description: 'Volume de secondes efforts et de gestes défensifs par minute jouée.',
    indicators: [
      { featureKey: 'orebPct', weight: 1 },
      { featureKey: 'ftePer36', weight: 1 },
      { featureKey: 'interceptsPer36', weight: 1 },
      { featureKey: 'ctPer36', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: "Pas de donnée de déviations ni de ballons libres récupérés — proxy à partir des gestes déjà trackés.",
  },
  {
    key: 'polyvalence',
    label: 'Polyvalence',
    description: 'Production répartie sur plusieurs registres statistiques plutôt que concentrée sur un seul.',
    indicators: [
      { featureKey: 'trebPct', weight: 1 },
      { featureKey: 'astPct', weight: 1 },
      { featureKey: 'interceptsPer36', weight: 1 },
      { featureKey: 'ctPer36', weight: 1 },
      { featureKey: 'ptsProd', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: "Mesure la largeur de la production statistique, pas un équilibre strict entre registres.",
  },
  {
    key: 'agressivite',
    label: 'Agressivité',
    description: 'Propension à chercher le contact et à jouer un rôle à fort volume.',
    indicators: [
      { featureKey: 'ftRate', weight: 2 },
      { featureKey: 'ftePer36', weight: 2 },
      { featureKey: 'usagePct', weight: 1 },
    ],
    status: 'partial_proxy',
    caveat: "Proxy via FT Rate/fautes provoquées — pas de donnée de drives.",
  },
  { key: 'vitesse_jeu', label: 'Vitesse de jeu', description: 'Vitesse individuelle de transition et de replacement.', indicators: [], status: 'planned', caveat: PLANNED_CAVEAT },
  { key: 'rythme', label: 'Rythme', description: 'Tempo imprimé au jeu quand le joueur est sur le terrain.', indicators: [], status: 'planned', caveat: PLANNED_CAVEAT },
  { key: 'mobilite', label: 'Mobilité', description: 'Capacité de déplacement latéral, utile en défense sur porteur.', indicators: [], status: 'planned', caveat: PLANNED_CAVEAT },
  { key: 'verticalite', label: 'Verticalité', description: 'Explosivité verticale (finitions, contres, rebonds contestés).', indicators: [], status: 'planned', caveat: PLANNED_CAVEAT },
  { key: 'creation_avancee', label: 'Création avancée', description: 'Création de tir pour soi-même en un-contre-un (isolation, PnR).', indicators: [], status: 'planned', caveat: PLANNED_CAVEAT },
];
