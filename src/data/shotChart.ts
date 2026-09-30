/**
 * Zones de tir — fonctions pures, aucun rendu.
 *
 * Les tirs sont stockés en coordonnées BRUTES (mètres, repère du demi-terrain de
 * `utils/diagram.ts`) et jamais sous forme de zone : le découpage vit ici et nulle part ailleurs,
 * donc le redécouper plus tard ne perd pas un seul tir déjà pointé. Même raison pour la valeur
 * 2/3, déduite de la géométrie plutôt que saisie — un tir cliqué derrière l'arc ne peut pas être
 * enregistré à 2 points.
 */
import { HALF } from '../utils/diagram';
import type { MatchEvent, LineupSide } from './types';

const { basket, threeR, threeInset, threeStopV, laneHW, laneV, w } = HALF;

/** Rayon de la zone « sous le cercle ». Volontairement plus large que la zone de non-charge
 *  (`restrictedR`, 1,25 m) : les finitions près du panier débordent de ce demi-cercle. */
export const CLOSE_R = 1.75;

/** Frontière des tiers d'angle (gauche / axe / droite), mesurée depuis le panier. */
const THIRD_ANGLE = Math.PI / 6; // 30°

export type ShotZone =
  | 'cercle' | 'raquette'
  | 'mid_gauche' | 'mid_axe' | 'mid_droite'
  | 'corner_gauche' | 'corner_droite'
  | 'aile_gauche' | 'arc_axe' | 'aile_droite';

export const ZONE_LABELS: Record<ShotZone, string> = {
  cercle:        'Sous le cercle',
  raquette:      'Raquette',
  mid_gauche:    'Mi-distance gauche',
  mid_axe:       'Mi-distance axe',
  mid_droite:    'Mi-distance droite',
  corner_gauche: 'Corner 3 gauche',
  corner_droite: 'Corner 3 droite',
  aile_gauche:   'Aile 3 gauche',
  arc_axe:       '3 pts axe',
  aile_droite:   'Aile 3 droite',
};

/** Ordre d'affichage : du plus près au plus loin, gauche → droite. */
export const ZONE_ORDER: ShotZone[] = [
  'cercle', 'raquette',
  'mid_gauche', 'mid_axe', 'mid_droite',
  'corner_gauche', 'aile_gauche', 'arc_axe', 'aile_droite', 'corner_droite',
];

/** Sous ce nombre de tentatives, un pourcentage ne veut rien dire et doit être affiché en grisé
 *  (règle « le n doit être affiché » de docs/CALCULS.md). */
export const MIN_ATTEMPTS_FOR_PCT = 10;

function distanceToBasket(x: number, y: number): number {
  return Math.hypot(x - basket.u, y - basket.v);
}

/**
 * Angle depuis le panier : 0 dans l'axe (vers le milieu de terrain), négatif à gauche, positif à
 * droite, tel que le terrain est DESSINÉ (panier en haut, `DiagramCourt` en variante 'half').
 */
function angleFromBasket(x: number, y: number): number {
  return Math.atan2(x - basket.u, y - basket.v);
}

/** Un tir en corner est à 3 points même à 6,60 m du panier : la portion droite de la ligne prime
 *  donc sur le rayon de l'arc, jamais l'inverse. */
function isCorner(x: number): boolean {
  return x <= threeInset || x >= w - threeInset;
}

export function shotValue(x: number, y: number): 2 | 3 {
  if (isCorner(x)) return 3;
  return distanceToBasket(x, y) >= threeR ? 3 : 2;
}

export function shotZone(x: number, y: number): ShotZone {
  const angle = angleFromBasket(x, y);
  const left  = angle < -THIRD_ANGLE;
  const right = angle > THIRD_ANGLE;

  if (shotValue(x, y) === 3) {
    // Le corner s'arrête avec la portion droite de la ligne : plus bas, c'est l'aile.
    if (isCorner(x) && y <= threeStopV) return x <= threeInset ? 'corner_gauche' : 'corner_droite';
    return left ? 'aile_gauche' : right ? 'aile_droite' : 'arc_axe';
  }

  if (distanceToBasket(x, y) <= CLOSE_R) return 'cercle';
  if (Math.abs(x - basket.u) <= laneHW && y <= laneV) return 'raquette';
  return left ? 'mid_gauche' : right ? 'mid_droite' : 'mid_axe';
}

/**
 * Valeur d'un tir du champ : la position fait autorité quand elle existe, sinon la valeur figée
 * saisie en mode rapide. `null` pour tout ce qui n'est pas un tir du champ (lancers francs
 * compris — ils valent 1 point et n'ont pas de position).
 */
export function shotEventValue(event: MatchEvent): 2 | 3 | null {
  if (event.type !== 'shot') return null;
  if (event.x !== undefined && event.y !== undefined) return shotValue(event.x, event.y);
  return event.value ?? null;
}

export interface ZoneStatRow {
  zone: ShotZone;
  label: string;
  attempts: number;
  made: number;
  /** null tant qu'aucun tir n'a été tenté dans la zone — pas 0, qui se lirait « tout raté ». */
  fgPct: number | null;
  /** eFG% : un 3 points réussi vaut 1,5 tir réussi (même formule que `team_match_stats`). */
  efgPct: number | null;
  /** Vrai tant que l'échantillon ne permet pas de lire le pourcentage. */
  thin: boolean;
}

/** Une ligne par zone, TOUJOURS les 10 — une zone jamais tentée est une information (personne ne
 *  tire du corner gauche), pas une ligne à masquer. */
export function zoneStats(events: MatchEvent[], side: LineupSide): ZoneStatRow[] {
  const rows = new Map<ShotZone, { attempts: number; made: number; made3: number }>();
  for (const zone of ZONE_ORDER) rows.set(zone, { attempts: 0, made: 0, made3: 0 });

  for (const e of events) {
    if (e.side !== side || e.type !== 'shot') continue;
    if (e.x === undefined || e.y === undefined) continue; // tir sans position : hors shot chart
    const row = rows.get(shotZone(e.x, e.y))!;
    row.attempts += 1;
    if (e.made) {
      row.made += 1;
      if (shotValue(e.x, e.y) === 3) row.made3 += 1;
    }
  }

  return ZONE_ORDER.map(zone => {
    const { attempts, made, made3 } = rows.get(zone)!;
    return {
      zone,
      label: ZONE_LABELS[zone],
      attempts,
      made,
      fgPct:  attempts > 0 ? (made / attempts) * 100 : null,
      efgPct: attempts > 0 ? ((made + 0.5 * made3) / attempts) * 100 : null,
      thin:   attempts < MIN_ATTEMPTS_FOR_PCT,
    };
  });
}

/* ── Carte des zones ──────────────────────────────────────────────────────── */

/** Centre visuel de chaque zone, où la carte centre son étiquette (pastille + compteur) — choisi
 *  à la main : un barycentre tombe collé au bord pour les corners. Le test vérifie que chaque point est bien
 *  dans sa zone, pour qu'un redécoupage ne laisse pas une étiquette chez la voisine. */
export const ZONE_LABEL_POINTS: Record<ShotZone, { x: number; y: number }> = {
  cercle:        { x: 7.5,   y: 1.575 }, // sur le panier
  raquette:      { x: 7.5,   y: 4.55 },
  mid_gauche:    { x: 3.0,   y: 3.0 },
  mid_axe:       { x: 7.5,   y: 7.05 },
  mid_droite:    { x: 12.0,  y: 3.0 },
  corner_gauche: { x: 0.45,  y: 1.5 },
  corner_droite: { x: 14.55, y: 1.5 },
  aile_gauche:   { x: 1.9,   y: 8.0 },
  arc_axe:       { x: 7.5,   y: 11.2 },
  aile_droite:   { x: 13.1,  y: 8.0 },
};

export type ZoneTier = 'good' | 'mid' | 'bad';

/** Seuils de réussite (FG%) par type de zone : au moins `good` = vert, sous `bad` = rouge, orange
 *  entre les deux. Le cercle suit les seuils de la raquette. */
const TIER_THRESHOLDS = {
  raquette: { good: 65, bad: 40 },
  mid:      { good: 50, bad: 35 },
  three:    { good: 35, bad: 25 },
} as const;

export function zoneTier(zone: ShotZone, fgPct: number): ZoneTier {
  const t = zone === 'cercle' || zone === 'raquette' ? TIER_THRESHOLDS.raquette
    : zone.startsWith('mid_') ? TIER_THRESHOLDS.mid
    : TIER_THRESHOLDS.three;
  return fgPct >= t.good ? 'good' : fgPct < t.bad ? 'bad' : 'mid';
}

/* ── Carte de densité (lissée) ────────────────────────────────────────────── */

export interface DensityGrid { cols: number; rows: number; step: number; values: Float32Array }

/**
 * Densité de tirs lissée (noyau gaussien de largeur `bandwidth`, en mètres) sur une grille qui
 * pave le demi-terrain au pas `step`. Valeurs ramenées à 0–1 (1 = le foyer le plus dense), rangées
 * ligne par ligne.
 */
export function densityGrid(points: { x: number; y: number }[], step: number, bandwidth: number): DensityGrid {
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(HALF.h / step);
  const values = new Float32Array(cols * rows);
  const k = -1 / (2 * bandwidth * bandwidth);
  const reach = Math.ceil((3 * bandwidth) / step); // au-delà de 3 σ, la contribution est négligeable
  let max = 0;
  for (const p of points) {
    const pc = Math.floor(p.x / step), pr = Math.floor(p.y / step);
    for (let r = Math.max(0, pr - reach); r <= Math.min(rows - 1, pr + reach); r++) {
      for (let c = Math.max(0, pc - reach); c <= Math.min(cols - 1, pc + reach); c++) {
        const dx = (c + 0.5) * step - p.x, dy = (r + 0.5) * step - p.y;
        const v = (values[r * cols + c] += Math.exp((dx * dx + dy * dy) * k));
        if (v > max) max = v;
      }
    }
  }
  if (max > 0) for (let i = 0; i < values.length; i++) values[i] /= max;
  return { cols, rows, step, values };
}
