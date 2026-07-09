/** Sous-ensemble de champs requis pour les calculs de charge (ACWR, TSB…) — RPEEntry le satisfait déjà */
export interface LoadEntry {
  date: string;
  rpe: number;
  actualDuration?: number;
  plannedDuration: number;
}

/** Couleur associée à une valeur RPE (0–10) — 4 zones : vert / jaune / orange / rouge */
export function rpeColor(v: number): string {
  if (v >= 8) return '#EF4444';  // 8–10 Extrême   rouge
  if (v >= 7) return '#F97316';  // 7    Difficile  orange
  if (v >= 5) return '#EAB308';  // 5–6  Soutenu    jaune
  return '#00E5A0';               // 0–4  Normal     vert
}

/** Libellé textuel d'une valeur RPE */
export function rpeLabel(v: number): string {
  const labels: Record<number, string> = {
    1: 'Repos actif', 2: 'Très léger', 3: 'Léger', 4: 'Facile',
    5: 'Soutenu', 6: 'Intense',
    7: 'Difficile', 8: 'Très difficile',
    9: 'Extrême', 10: 'Maximal',
  };
  return labels[v] ?? '';
}

/** Zones RPE pour légendes et seuils */
export const RPE_ZONES = [
  { label: '0–4 Facile',    color: '#00E5A0', max: 4  },
  { label: '5–6 Soutenu',   color: '#EAB308', max: 6  },
  { label: '7 Difficile',   color: '#F97316', max: 7  },
  { label: '8–10 Extrême',  color: '#EF4444', max: 10 },
] as const;

/** ACWR (Acute:Chronic Workload Ratio) — charge aiguë (7j) / charge chronique (28j) */
export function computeAcwr(history: LoadEntry[], refDate?: string): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const ref = refDate ? new Date(refDate) : new Date(sorted[sorted.length - 1].date);
  const load = (days: number) => {
    const cutoff = new Date(ref);
    cutoff.setDate(cutoff.getDate() - days);
    const entries = sorted.filter(e => new Date(e.date) >= cutoff && new Date(e.date) <= ref);
    if (!entries.length) return 0;
    return entries.reduce((s, e) => s + e.rpe * (e.actualDuration ?? e.plannedDuration), 0) / days;
  };
  const chronic = load(28);
  if (!chronic) return null;
  return Math.round((load(7) / chronic) * 100) / 100;
}

/** Zone de risque de blessure associée à un ACWR (Gabbett 2016) */
export function acwrZone(acwr: number | null): { label: string; color: string } | null {
  if (acwr === null) return null;
  if (acwr < 0.8)  return { label: 'Sous-charge',   color: '#3B82F6' };
  if (acwr <= 1.3) return { label: 'Zone optimale',  color: '#00E5A0' };
  if (acwr <= 1.5) return { label: 'Risque modéré',  color: '#F59E0B' };
  return { label: 'Risque élevé', color: '#EF4444' };
}
