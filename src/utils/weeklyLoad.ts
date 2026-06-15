export const WEEK_TIERS = [
  { max: 2750,     label: 'Légère',    color: '#00E5A0', bg: 'rgba(0,229,160,0.12)',  ref: '~2 000 UA' },
  { max: 4250,     label: 'Normale',   color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', ref: '~3 500 UA' },
  { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  ref: '~5 000+ UA' },
] as const;

export type WeekTier = (typeof WEEK_TIERS)[number];

export function getWeekTier(ua: number): WeekTier {
  return WEEK_TIERS.find(t => ua <= t.max) ?? WEEK_TIERS[WEEK_TIERS.length - 1];
}

/** Lundi de la semaine courante (YYYY-MM-DD) */
export function weekMonday(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}

/** Somme RPE × durée pour les sessions de la semaine courante */
export function computeWeeklyUa(
  entries: Array<{ date: string; rpe: number; actualDuration?: number; plannedDuration: number }>
): number {
  const start = weekMonday();
  return entries
    .filter(e => e.date >= start)
    .reduce((sum, e) => sum + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
}
