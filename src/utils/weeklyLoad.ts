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

import { mean, roundedAvg } from './avg';
import { teamAverage, type TeamAverage } from './teamAverage';

export interface WeeklyLoadRow { date: string; playerId: string; rpe: number; actualDuration?: number; plannedDuration: number }
export interface WeeklyLoadBucket {
  week: string;
  load: number;
  players: number;
  /**
   * ⚠️ Moyenne À PLAT des RPE de la semaine, toutes joueuses et toutes séances confondues —
   * contrairement à `load`, qui est bien ramené à l'effectif distinct.
   *
   * Valable uniquement sur un périmètre MONO-JOUEUSE (les deux appelants actuels le sont :
   * `PlayerLoadPanel` et `PerformanceIndividuellePage`). Sur un périmètre d'équipe couvrant
   * plusieurs séances, ce chiffre pondérerait le RPE par l'assiduité : utiliser `teamAvgRpe`
   * (utils/rpe), comme le fait la vue « Semaine » d'équipe dans `useTeamRpeHistory`.
   */
  avgRpe: number | null;
}

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
 * Charge hebdomadaire moyenne d'UNE joueuse — moyenne uniquement sur ses semaines actives
 * (≥1 séance) : les semaines creuses (blessure, trêve) sont exclues du dénominateur, sinon elles
 * font chuter la moyenne artificiellement.
 *
 * Réservé aux périmètres mono-joueuse. Pour l'équipe, utiliser `teamAvgWeeklyLoad` : appliquée à
 * plusieurs joueuses, cette fonction donnerait une voix par SEMAINE et non une voix par joueuse.
 */
export function averageWeeklyLoad(rows: WeeklyLoadRow[]): number | null {
  const buckets = weeklyLoadBuckets(rows);
  return buckets.length ? Math.round(buckets.reduce((a, b) => a + b.load, 0) / buckets.length) : null;
}

/** Charge hebdo d'une joueuse, semaine par semaine (clé = lundi ISO) — brique de `teamAvgWeeklyLoad`. */
function weeklyLoadsOfPlayer(rows: WeeklyLoadRow[]): number[] {
  const byWeek = new Map<string, number>();
  for (const r of rows) {
    const wk = mondayIso(r.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + r.rpe * (r.actualDuration ?? r.plannedDuration));
  }
  return [...byWeek.values()];
}

/**
 * Charge hebdomadaire moyenne d'ÉQUIPE — règle de l'app (cf. `teamAverage` et docs/CALCULS.md § 0) :
 * charge hebdo moyenne de chaque joueuse sur SES semaines actives, puis moyenne non pondérée des
 * joueuses. Une voix par joueuse, pas une voix par semaine : sinon une joueuse active une seule
 * semaine sur quatre ne pèse qu'un quart, et l'assiduité pondère la charge affichée.
 *
 * Les semaines sans séance d'une joueuse ne comptent PAS comme des zéros : ce serait mélanger la
 * charge absorbée et la disponibilité, laquelle est suivie séparément (thème Présences).
 *
 * Note : la valeur de CHAQUE semaine (`weeklyLoadBuckets`) est déjà conforme à la règle —
 * `charge totale / joueuses distinctes` est exactement la moyenne non pondérée des charges hebdo
 * individuelles. Seule l'agrégation de plusieurs semaines nécessitait cette fonction.
 */
export function teamAvgWeeklyLoad(rows: WeeklyLoadRow[]): TeamAverage {
  const res = teamAverage(rows, r => r.playerId, playerRows => mean(weeklyLoadsOfPlayer(playerRows)));
  // Une charge s'exprime en UA entières, pas à la décimale près comme un score /10.
  return { value: res.value === null ? null : Math.round(res.value), players: res.players };
}
