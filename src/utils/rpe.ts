/** Config visuelle (libellé, couleurs) par type de séance — partagée entre les pages/composants RPE */
export const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

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

/** ACWR (Acute:Chronic Workload Ratio) — charge aiguë (7j) / charge chronique (28j) */
export function computeAcwr(history: LoadEntry[], refDate?: string): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const ref = refDate ? new Date(refDate) : new Date(sorted[sorted.length - 1].date);
  const load = (days: number) => {
    const cutoff = new Date(ref);
    // -(days-1) car les deux bornes sont inclusives : ex. 7j = J-6 → J (7 jours pile), pas J-7 → J (8 jours)
    cutoff.setDate(cutoff.getDate() - (days - 1));
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

// ── PMC (modèle de Banister) : ATL / CTL / TSB ────────────────────────────────

export interface PmcPoint { date: string; atl: number; ctl: number; tsb: number }

/**
 * Série PMC quotidienne (ATL décroissance 1/7, CTL décroissance 1/42), du premier
 * RPE jusqu'à `endDate` (aujourd'hui par défaut). Le `tsb` d'un jour est la
 * fraîcheur AVANT la charge de ce jour.
 */
export function computePmcSeries(history: LoadEntry[], endDate?: string): PmcPoint[] {
  if (!history.length) return [];
  const dailyLoad = new Map<string, number>();
  history.forEach(e => {
    const load = e.rpe * (e.actualDuration ?? e.plannedDuration);
    dailyLoad.set(e.date, (dailyLoad.get(e.date) ?? 0) + load);
  });
  const firstDate = [...history.map(e => e.date)].sort()[0];
  const end = endDate ?? new Date().toLocaleDateString('sv');
  // Midi local : insensible aux décalages de fuseau et aux changements d'heure
  const cur = new Date(firstDate + 'T12:00:00');
  const series: PmcPoint[] = [];
  let atl = 0, ctl = 0;
  while (true) {
    const iso = cur.toLocaleDateString('sv');
    if (iso > end) break;
    const load = dailyLoad.get(iso) ?? 0;
    const tsb = Math.round((ctl - atl) * 10) / 10;
    atl = atl * (1 - 1 / 7)  + load * (1 / 7);
    ctl = ctl * (1 - 1 / 42) + load * (1 / 42);
    series.push({ date: iso, atl: Math.round(atl * 10) / 10, ctl: Math.round(ctl * 10) / 10, tsb });
    cur.setDate(cur.getDate() + 1);
  }
  return series;
}

/** Fraîcheur (TSB) à ce jour — dernier point de la série PMC */
export function computeTsb(history: LoadEntry[]): number | null {
  const series = computePmcSeries(history);
  return series.length ? series[series.length - 1].tsb : null;
}

/** Zone de fraîcheur associée à un TSB — libellés et couleurs unifiés pour toute l'app */
export function tsbZone(tsb: number): { label: string; color: string } {
  if (tsb <= -30) return { label: 'Surmenage', color: '#EF4444' };
  if (tsb <= -10) return { label: 'Chargé',    color: '#F59E0B' };
  if (tsb <=   5) return { label: 'Zone peak', color: '#00E5A0' };
  return                 { label: 'Frais',     color: '#60A5FA' };
}
