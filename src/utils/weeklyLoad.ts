export interface WeekTier {
  max: number;
  label: 'Normal' | 'Soutenu' | 'Élevée' | 'Surcharge';
  color: string;
  bg: string;
}

export const DEFAULT_THRESHOLDS = { lightMax: 2750, normalMax: 4250, sessionsPerWeek: 3 };

/** Lundi de la semaine du jour donné (YYYY-MM-DD, heure locale) */
export function mondayIso(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toLocaleDateString('sv');
}

/** 4 zones en tiers égaux : Normal (vert) / Soutenu (jaune) / Élevée (orange) / Surcharge (rouge) */
export function buildWeekTiers(_lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier[] {
  const t1 = Math.round(normalMax / 3);
  const t2 = Math.round(normalMax * 2 / 3);
  return [
    { max: t1,       label: 'Normal',    color: '#00E5A0', bg: 'rgba(0,229,160,0.12)'  },
    { max: t2,       label: 'Soutenu',   color: '#EAB308', bg: 'rgba(234,179,8,0.12)'  },
    { max: normalMax,label: 'Élevée',    color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
    { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  ];
}

export const WEEK_TIERS: WeekTier[] = buildWeekTiers();

export function getWeekTier(ua: number, lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier {
  return buildWeekTiers(lightMax, normalMax).find(t => ua <= t.max)
    ?? { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
}

/** J-6 en heure locale (YYYY-MM-DD) — début de la fenêtre 7 jours glissants */
function rolling7Start(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toLocaleDateString('sv');
}

/** Aujourd'hui en heure locale (YYYY-MM-DD) */
function localToday(): string {
  return new Date().toLocaleDateString('sv');
}

/** Somme RPE × durée sur les 7 derniers jours glissants (J-6 → aujourd'hui) */
export function computeWeeklyUa(
  entries: Array<{ date: string; rpe: number; actualDuration?: number; plannedDuration: number }>
): number {
  const start = rolling7Start();
  const today = localToday();
  return entries
    .filter(e => e.date >= start && e.date <= today)
    .reduce((sum, e) => sum + e.rpe * (e.actualDuration ?? e.plannedDuration), 0);
}
