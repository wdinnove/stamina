import type { WellnessEntry } from '../data/types';

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

const WELLNESS_TIER_LABELS: Record<WellnessStatus, string> = { good: 'Bon', mid: 'Moyen', bad: 'Faible' };
export interface WellnessTier { status: WellnessStatus; color: string; label: string }

/**
 * Couleur + statut + libellé (Bon/Moyen/Faible) pour une valeur, en un seul appel — fusionne
 * wellnessScoreColor/wellnessDimColor/wellnessStatus. Nouveau point d'entrée à privilégier ;
 * les 3 fonctions ci-dessus restent pour compat le temps de migrer tous les appelants.
 */
export function wellnessTier(v: number, inverted = false): WellnessTier {
  const status = wellnessStatus(v, inverted);
  return { status, color: wellnessDimColor(v, inverted), label: WELLNESS_TIER_LABELS[status] };
}

export function wellnessAvg(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10 : null;
}

export interface WellnessAxisAlert { label: string; felt: number; color: string }

/**
 * Axe le plus dégradé (valeur "ressentie" la plus basse) trouvé sur un ensemble d'entrées,
 * uniquement si sous `threshold` — sert à l'alerte bien-être (carte équipe, tableau joueur).
 */
export function worstWellnessAxis(entries: WellnessEntry[], threshold = 5): WellnessAxisAlert | null {
  let worst: WellnessAxisAlert | null = null;
  for (const entry of entries) {
    for (const dim of WELLNESS_DIMENSIONS) {
      const felt = wellnessRawValue(entry[dim.key], dim.inverted);
      if (felt < threshold && (!worst || felt < worst.felt)) {
        worst = { label: dim.shortLabel, felt, color: wellnessScoreColor(felt) };
      }
    }
  }
  return worst;
}

// Agrégat quotidien de l'équipe : moyenne de chaque dimension entre tous les joueurs ayant saisi ce jour-là.
export function aggregateTeamWellnessDaily(teamHistory: WellnessEntry[]): WellnessEntry[] {
  const byDate = new Map<string, WellnessEntry[]>();
  teamHistory.forEach(e => {
    const arr = byDate.get(e.date);
    if (arr) arr.push(e); else byDate.set(e.date, [e]);
  });
  return [...byDate.entries()].map(([date, entries]) => ({
    id: date, playerId: 'team', date,
    fatigue:    wellnessAvg(entries.map(e => e.fatigue))    ?? 0,
    mood:       wellnessAvg(entries.map(e => e.mood))       ?? 0,
    stress:     wellnessAvg(entries.map(e => e.stress))     ?? 0,
    motivation: wellnessAvg(entries.map(e => e.motivation)) ?? 0,
    sleep:      wellnessAvg(entries.map(e => e.sleep))      ?? 0,
    soreness:   wellnessAvg(entries.map(e => e.soreness))   ?? 0,
    score:      wellnessAvg(entries.map(e => e.score))      ?? 0,
  }));
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

/**
 * Convertit entre valeur brute stockée et valeur "ressentie" (plus haut = mieux) pour un
 * axe donné — formule symétrique (involution : `f(f(v)) === v`), donc utilisable dans les
 * deux sens indifféremment : ressenti → brut (saisies rapides) ou brut → ressenti (alertes,
 * séries d'affichage). Le paramètre `v` peut être l'une ou l'autre selon l'appelant.
 */
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
