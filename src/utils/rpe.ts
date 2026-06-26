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
