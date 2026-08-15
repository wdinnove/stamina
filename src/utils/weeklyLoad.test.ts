import { describe, it, expect } from 'vitest';
import { weeklyLoadBuckets, averageWeeklyLoad, teamAvgWeeklyLoad, type WeeklyLoadRow } from './weeklyLoad';

/** Une séance d'un joueur. Les lundis choisis sont bien des lundis (semaines ISO distinctes). */
const row = (date: string, playerId: string, rpe: number, plannedDuration: number): WeeklyLoadRow =>
  ({ date, playerId, rpe, plannedDuration });

const WEEKS = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']; // 4 lundis consécutifs

/**
 * Semaine type de l'exemple de référence (docs/CALCULS.md § 1.5) : 5 séances.
 * Alice = 3100 UA/semaine, Bea = 2890 UA/semaine.
 */
function regularWeek(monday: string): WeeklyLoadRow[] {
  const d = (offset: number) => {
    const dt = new Date(monday + 'T12:00:00');
    dt.setDate(dt.getDate() + offset);
    return dt.toLocaleDateString('sv');
  };
  return [
    row(d(0), 'alice', 8, 110), row(d(0), 'bea', 7, 110),  // 880 / 770
    row(d(1), 'alice', 6, 60),  row(d(1), 'bea', 6, 60),   // 360 / 360
    row(d(2), 'alice', 8, 100), row(d(2), 'bea', 7, 100),  // 800 / 700
    row(d(4), 'alice', 7, 100), row(d(4), 'bea', 7, 100),  // 700 / 700
    row(d(6), 'alice', 9, 40),  row(d(6), 'bea', 9, 40),   // 360 / 360
  ];
}

/** Semaine 4 : Chloé revient de blessure — 2 séances allégées, pas le match. */
function returnWeek(monday: string): WeeklyLoadRow[] {
  const d = (offset: number) => {
    const dt = new Date(monday + 'T12:00:00');
    dt.setDate(dt.getDate() + offset);
    return dt.toLocaleDateString('sv');
  };
  return [
    ...regularWeek(monday),
    row(d(1), 'chloe', 4, 60),   // 240
    row(d(4), 'chloe', 5, 100),  // 500
  ];
}

const SEASON: WeeklyLoadRow[] = [
  ...regularWeek(WEEKS[0]),
  ...regularWeek(WEEKS[1]),
  ...regularWeek(WEEKS[2]),
  ...returnWeek(WEEKS[3]),
];

describe('weeklyLoadBuckets — la charge de chaque semaine est déjà conforme à la règle', () => {
  it('vaut la moyenne non pondérée des charges hebdo individuelles', () => {
    const buckets = weeklyLoadBuckets(SEASON);
    expect(buckets.map(b => Math.round(b.load))).toEqual([2995, 2995, 2995, 2243]);
    // S1..S3 : (3100 + 2890) / 2 · S4 : (3100 + 2890 + 740) / 3
    expect(buckets[0].players).toBe(2);
    expect(buckets[3].players).toBe(3);
  });
});

describe('teamAvgWeeklyLoad — une voix par joueur', () => {
  it('moyenne les joueurs, pas les semaines', () => {
    // Alice 3100 (4 semaines) · Bea 2890 (4 semaines) · Chloé 740 (1 seule semaine active)
    expect(teamAvgWeeklyLoad(SEASON)).toEqual({ value: 2243, players: 3 });
  });

  it('diverge de la moyenne par semaine, qui dilue un joueur peu présent', () => {
    // Une voix par semaine : (2995 + 2995 + 2995 + 2243) / 4 — Chloé ne pèse que sur S4
    expect(averageWeeklyLoad(SEASON)).toBe(2807);
    expect(teamAvgWeeklyLoad(SEASON).value).toBe(2243);
  });

  it('n\'assimile pas une semaine sans séance à une charge nulle', () => {
    // Chloé n'a qu'une semaine active à 740 : sa moyenne est 740, pas 740/4 = 185.
    const chloeOnly = SEASON.filter(r => r.playerId === 'chloe');
    expect(teamAvgWeeklyLoad(chloeOnly)).toEqual({ value: 740, players: 1 });
  });

  it('coïncide avec la moyenne par semaine quand tous les joueurs font toutes les semaines', () => {
    const noReturn = [...regularWeek(WEEKS[0]), ...regularWeek(WEEKS[1])];
    expect(teamAvgWeeklyLoad(noReturn).value).toBe(averageWeeklyLoad(noReturn));
  });

  it('renvoie une valeur nulle sur une liste vide', () => {
    expect(teamAvgWeeklyLoad([])).toEqual({ value: null, players: 0 });
  });
});
