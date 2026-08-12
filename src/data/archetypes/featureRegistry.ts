import type { FeatureDef, RawPlayerStats } from './types';

const per36Rate = (raw: RawPlayerStats, total: number): number | null =>
  raw.minutesTotal > 0 ? (total * 36) / raw.minutesTotal : null;

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/**
 * Seul point d'extension du moteur : brancher une nouvelle donnée (ex. tactical_events
 * taguées par joueur, Phase 2) = ajouter une entrée ici avec `source: 'tactical_tagged'`.
 * Aucun autre fichier du moteur (normalizer/scoringEngine/archetypeEngine) ne doit changer.
 */
export const FEATURE_REGISTRY: FeatureDef[] = [
  // ── Stats avancées existantes (src/data/playerAdvanced.ts), agrégées sur la période ──
  // Volontairement la version corrigée par les minutes : un profil doit décrire un comportement de
  // jeu, pas un volume de temps de jeu. Le libellé le dit, car il s'affiche au staff dans les
  // badges « ↑ / ↓ » de PlayerArchetypesPanel.
  { key: 'usagePct', label: '%USG/min', source: 'advanced', get: r => r.advancedAgg.usagePct },
  { key: 'astPct', label: '% Passes décisives', source: 'advanced', get: r => r.advancedAgg.astPct },
  { key: 'tovPct', label: '% Ballons perdus', source: 'advanced', get: r => r.advancedAgg.tovPct },
  { key: 'efgPct', label: 'eFG%', source: 'advanced', get: r => r.advancedAgg.efgPct },
  { key: 'ftRate', label: 'FT Rate', source: 'advanced', get: r => r.advancedAgg.ftRate },
  { key: 'orebPct', label: '% Rebonds offensifs', source: 'advanced', get: r => r.advancedAgg.orebPct },
  { key: 'drebPct', label: '% Rebonds défensifs', source: 'advanced', get: r => r.advancedAgg.drebPct },
  { key: 'trebPct', label: '% Rebonds totaux', source: 'advanced', get: r => r.advancedAgg.trebPct },
  { key: 'ptsProd', label: 'Points produits', source: 'advanced', get: r => r.advancedAgg.ptsProd },
  { key: 'offRating', label: 'Offensive Rating', source: 'advanced', get: r => r.advancedAgg.offRating },

  // ── Ratios bruts sur la période (box-score) ──
  { key: 'fg3Pct', label: '3PT%', source: 'boxscore', get: r => ratio(r.totals.fg3m, r.totals.fg3a) },
  { key: 'fg2Pct', label: '2PT%', source: 'boxscore', get: r => ratio(r.totals.fg2m, r.totals.fg2a) },
  {
    key: 'startersRate', label: 'Taux de titularisation', source: 'boxscore',
    get: r => (r.matches > 0 ? r.totals.startsCount / r.matches : null),
  },
  {
    key: 'plusMinusAvg', label: '+/- moyen', source: 'boxscore',
    get: r => (r.totals.plusMinusCount > 0 ? r.totals.plusMinus / r.totals.plusMinusCount : null),
  },

  // ── Volumes pour 36 minutes ──
  { key: 'fg3VolumePer36', label: 'Volume 3pts/36', source: 'boxscore', get: r => per36Rate(r, r.totals.fg3a) },
  { key: 'fgaPer36', label: 'Tirs tentés/36', source: 'boxscore', get: r => per36Rate(r, r.totals.fg2a + r.totals.fg3a) },
  { key: 'ftaPer36', label: 'Lancers tentés/36', source: 'boxscore', get: r => per36Rate(r, r.totals.fta) },
  { key: 'ctPer36', label: 'Contres/36', source: 'boxscore', get: r => per36Rate(r, r.totals.ct) },
  { key: 'interceptsPer36', label: 'Interceptions/36', source: 'boxscore', get: r => per36Rate(r, r.totals.intercepts) },
  { key: 'fprPer36', label: 'Fautes commises/36', source: 'boxscore', get: r => per36Rate(r, r.totals.fpr) },
  { key: 'ftePer36', label: 'Fautes provoquées/36', source: 'boxscore', get: r => per36Rate(r, r.totals.fte) },
];

export function getFeature(key: string): FeatureDef | undefined {
  return FEATURE_REGISTRY.find(f => f.key === key);
}
