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

/** 4 zones : Normal (vert, jusqu'à lightMax) / Soutenu (jaune) / Élevée (orange, jusqu'à normalMax) / Surcharge (rouge) */
export function buildWeekTiers(lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier[] {
  const t1 = lightMax;
  const t2 = Math.round((lightMax + normalMax) / 2);
  return [
    { max: t1,       label: 'Normal',    color: '#00E5A0', bg: 'rgba(0,229,160,0.12)'  },
    { max: t2,       label: 'Soutenu',   color: '#EAB308', bg: 'rgba(234,179,8,0.12)'  },
    { max: normalMax,label: 'Élevée',    color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
    { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  ];
}

export function getWeekTier(ua: number, lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier {
  return buildWeekTiers(lightMax, normalMax).find(t => ua <= t.max)
    ?? { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
}
