export interface WellnessDimension {
  key: 'fatigue' | 'mood' | 'stress' | 'motivation' | 'sleep' | 'soreness';
  label: string;
  shortLabel: string;
  emoji: string;
  desc: string;
  inverted: boolean;
  color: string;
}

// Source unique pour les 6 dimensions bien-être : libellés, emojis, sens (inverted) et couleur d'identité.
// Utilisé par WellnessPage, PerformancePage, crossAnalysis, PlayersPage et PlayerWellnessPublicPage.
export const WELLNESS_DIMENSIONS: WellnessDimension[] = [
  { key: 'fatigue',    label: 'Fatigue',              shortLabel: 'Fatigue',    emoji: '😴', desc: 'Très reposé ← → Épuisé',            inverted: true,  color: '#EF4444' },
  { key: 'mood',       label: 'Humeur',               shortLabel: 'Humeur',     emoji: '😊', desc: 'Très mauvaise ← → Très bonne',      inverted: false, color: '#00E5A0' },
  { key: 'stress',     label: 'Stress / Tension',     shortLabel: 'Stress',     emoji: '😰', desc: 'Calme ← → Très stressé',            inverted: true,  color: '#F59E0B' },
  { key: 'motivation', label: 'Motivation',           shortLabel: 'Motivation', emoji: '💪', desc: 'Aucune motivation ← → Très motivé', inverted: false, color: '#3B82F6' },
  { key: 'sleep',      label: 'Qualité du sommeil',   shortLabel: 'Sommeil',    emoji: '🌙', desc: 'Mauvaise ← → Excellente',           inverted: false, color: '#8B5CF6' },
  { key: 'soreness',   label: 'Douleurs musculaires', shortLabel: 'Douleurs',   emoji: '🦵', desc: 'Aucune ← → Très intenses',          inverted: true,  color: '#EC4899' },
];

// Seuils de coloration bien-être, identiques partout dans l'app : ≥7 vert, ≥5 orange, sinon rouge.
export const wellnessScoreColor = (v: number): string => v >= 7 ? '#00E5A0' : v >= 5 ? '#F59E0B' : '#EF4444';
export const wellnessDimColor   = (v: number, inverted: boolean): string => wellnessScoreColor(inverted ? 11 - v : v);

export type WellnessStatus = 'good' | 'mid' | 'bad';
export function wellnessStatus(v: number, inverted: boolean): WellnessStatus {
  const n = inverted ? 11 - v : v;
  return n >= 7 ? 'good' : n >= 5 ? 'mid' : 'bad';
}

export function wellnessAvg(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10 : null;
}

// Même formule que la colonne générée `wellness_entries.score` en base (schema.sql) : à garder synchronisée.
export function wellnessGlobalScore(values: { fatigue: number; mood: number; stress: number; motivation: number; sleep: number; soreness: number }): number {
  return Math.round((
    (11 - values.fatigue) + values.mood + (11 - values.stress) +
    values.motivation + values.sleep + (11 - values.soreness)
  ) / 6 * 10) / 10;
}

// ── Saisies rapides (emoji / note unique) ──────────────────────────────────────
// Les 6 colonnes de wellness_entries stockent chacune une valeur "brute" 1-10 dont le sens
// dépend de `inverted` (ex. fatigue : 10 = épuisé = mauvais). Les modes rapides ne demandent
// qu'un ressenti global "plus haut = mieux" ; il faut le reconvertir par axe avant stockage,
// sans quoi les axes inversés et non-inversés s'annulent et le score calculé tombe à 5.5 pile.

/** 1-10 "ressenti" (plus haut = mieux) → valeur brute stockée pour un axe donné. */
export function wellnessRawValue(v: number, inverted: boolean): number {
  return inverted ? 11 - v : v;
}

/** Reconstruit les 6 valeurs brutes à partir d'un seul ressenti global (mode "Note unique"). */
export function wellnessBroadcastValues(v: number): Record<WellnessDimension['key'], number> {
  return Object.fromEntries(
    WELLNESS_DIMENSIONS.map(dim => [dim.key, wellnessRawValue(v, dim.inverted)]),
  ) as Record<WellnessDimension['key'], number>;
}

export interface WellnessQuickOption {
  v: number;
  /** Clé d'icône (Frown/Meh/Smile de lucide-react) — pas d'emoji, rendu en icône colorée côté UI */
  icon: 'frown' | 'meh' | 'smile';
  color: string;
  label: string;
}

// Échelle 3 points utilisée par le mode "Emoji/couleur" (par axe) et le mode "Note unique" (global).
export const WELLNESS_QUICK_SCALE: WellnessQuickOption[] = [
  { v: 2, icon: 'frown', color: '#EF4444', label: 'Pas bien' },
  { v: 5, icon: 'meh',   color: '#F59E0B', label: 'Moyen' },
  { v: 9, icon: 'smile', color: '#00E5A0', label: 'Bien' },
];
