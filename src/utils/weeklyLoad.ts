export interface WeekTier {
  max: number;
  label: 'Normale' | 'Soutenue' | 'Élevée' | 'Surcharge';
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

/** 4 zones : Normale (vert, jusqu'à lightMax) / Soutenue (jaune) / Élevée (orange, jusqu'à normalMax) / Surcharge (rouge) */
export function buildWeekTiers(lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier[] {
  const t1 = lightMax;
  const t2 = Math.round((lightMax + normalMax) / 2);
  return [
    { max: t1,       label: 'Normale',   color: '#00E5A0', bg: 'rgba(0,229,160,0.12)'  },
    { max: t2,       label: 'Soutenue',  color: '#EAB308', bg: 'rgba(234,179,8,0.12)'  },
    { max: normalMax,label: 'Élevée',    color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
    { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  ];
}

export function getWeekTier(ua: number, lightMax = DEFAULT_THRESHOLDS.lightMax, normalMax = DEFAULT_THRESHOLDS.normalMax): WeekTier {
  return buildWeekTiers(lightMax, normalMax).find(t => ua <= t.max)
    ?? { max: Infinity, label: 'Surcharge', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
}

import { roundedAvg } from './avg';

export interface WeeklyLoadRow { date: string; playerId: string; rpe: number; actualDuration?: number; plannedDuration: number }
export interface WeeklyLoadBucket { week: string; load: number; players: number; avgRpe: number | null }

/**
 * Regroupe des lignes de charge par semaine calendaire réelle (lundi = clé), charge totale
 * ÷ joueurs distincts ayant loggué cette semaine-là — brique commune aux graphiques hebdo
 * (PlayerLoadPanel, RPEPage) et à `averageWeeklyLoad`. Pour un seul joueur, `players` vaut
 * toujours 1 (÷1 sans effet) : marche indifféremment pour un joueur seul ou toute l'équipe.
 * Filtrer `rows` sur la période voulue avant l'appel ; résultat trié par semaine croissante.
 */
export function weeklyLoadBuckets(rows: WeeklyLoadRow[]): WeeklyLoadBucket[] {
  const weekMap = new Map<string, { load: number; players: Set<string>; rpes: number[] }>();
  for (const r of rows) {
    const wk = mondayIso(r.date);
    if (!weekMap.has(wk)) weekMap.set(wk, { load: 0, players: new Set(), rpes: [] });
    const w = weekMap.get(wk)!;
    w.load += r.rpe * (r.actualDuration ?? r.plannedDuration);
    w.players.add(r.playerId);
    w.rpes.push(r.rpe);
  }
  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({ week, load: w.load / Math.max(w.players.size, 1), players: w.players.size, avgRpe: roundedAvg(w.rpes) }));
}

/**
 * Charge hebdomadaire moyenne — moyenne uniquement sur les semaines actives (≥1 séance) :
 * les semaines creuses (blessure, trêve) sont exclues du dénominateur, sinon elles font
 * chuter la moyenne artificiellement.
 */
export function averageWeeklyLoad(rows: WeeklyLoadRow[]): number | null {
  const buckets = weeklyLoadBuckets(rows);
  return buckets.length ? Math.round(buckets.reduce((a, b) => a + b.load, 0) / buckets.length) : null;
}
