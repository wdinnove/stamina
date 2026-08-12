import { teamAverage, type TeamAverage } from './teamAverage';
import type { TrainingAttendance } from '../data/types';

/** Seul le statut est nécessaire pour un taux de présence — la date est filtrée par l'appelant. */
type AttendanceRow = { status: TrainingAttendance['status'] };

/** Une joueuse en retard a bien participé à la séance : elle compte comme présente. */
const isPresent = (a: AttendanceRow) => a.status === 'present' || a.status === 'late';

/** Taux de présence d'UNE joueuse, en %, sur les séances où elle était attendue. */
export function presenceRate(rows: AttendanceRow[]): number | null {
  if (!rows.length) return null;
  return Math.round(rows.filter(isPresent).length / rows.length * 100);
}

/** Seuils de coloration d'un taux de présence, identiques joueuse et équipe (≥ 85 % / ≥ 70 %). */
export function presenceColor(pct: number | null): string {
  if (pct === null) return '#475569';
  return pct >= 85 ? '#00E5A0' : pct >= 70 ? '#F59E0B' : '#EF4444';
}

/**
 * Taux de présence d'ÉQUIPE — règle de l'app (cf. `teamAverage`) : moyenne NON PONDÉRÉE des taux
 * individuels.
 *
 * Et non `Σ présences / Σ attendus`, qui pondère par le nombre de séances attendues : une joueuse
 * arrivée en cours de saison, ou absente de longue durée, y pèse mécaniquement moins qu'une
 * présente depuis le premier jour. « La joueuse type est présente à 82 % » est ce que le staff
 * veut lire, pas « 82 % des présences attendues ont eu lieu ».
 *
 * `attendance` doit déjà être filtré sur la période voulue.
 */
export function teamPresenceRate(
  players: Array<{ playerId: string; attendance: AttendanceRow[] }>,
): TeamAverage {
  return teamAverage(players, p => p.playerId, group => presenceRate(group.flatMap(g => g.attendance)));
}
