import { teamAverage, type TeamAverage } from './teamAverage';
import type { TrainingAttendance } from '../data/types';

/** Seul le statut est nécessaire pour un taux de présence — la date est filtrée par l'appelant. */
type AttendanceRow = { status: TrainingAttendance['status'] };

/** Un joueur en retard a bien participé à la séance : il compte comme présent. */
const isPresent = (a: AttendanceRow) => a.status === 'present' || a.status === 'late';

/**
 * « Non attendu » sort du calcul des deux côtés de la fraction : le joueur n'était pas censé
 * venir, la séance ne lui était pas comptée. Le traiter comme une absence ferait porter à une
 * absence PRÉVUE le poids d'un manquement ; le traiter comme une présence gonflerait le taux
 * d'un joueur qui n'était pas là.
 */
const isExpected = (a: AttendanceRow) => a.status !== 'not_expected';

/**
 * Taux brut non arrondi — brique interne de `teamPresenceRate`. La règle de `teamAverage` est de ne
 * jamais cumuler deux arrondis : seul le chiffre d'équipe final est arrondi, pas les valeurs
 * individuelles qu'il agrège. La moyenne d'équipe portait jusqu'ici sur des pourcentages déjà
 * arrondis à l'entier, ce qui pouvait la faire basculer d'un côté ou de l'autre d'un seuil de
 * couleur (85 % / 70 %) pile.
 */
function rawPresenceRate(rows: AttendanceRow[]): number | null {
  const expected = rows.filter(isExpected);
  if (!expected.length) return null;
  return expected.filter(isPresent).length / expected.length * 100;
}

/** Taux de présence d'UN joueur, en %, sur les séances où il était attendu (arrondi à l'entier pour l'affichage). */
export function presenceRate(rows: AttendanceRow[]): number | null {
  const raw = rawPresenceRate(rows);
  return raw === null ? null : Math.round(raw);
}

/** Seuils de coloration d'un taux de présence, identiques joueur et équipe (≥ 85 % / ≥ 70 %). */
export function presenceColor(pct: number | null): string {
  if (pct === null) return '#475569';
  return pct >= 85 ? '#00E5A0' : pct >= 70 ? '#F59E0B' : '#EF4444';
}

/**
 * Taux de présence d'ÉQUIPE — règle de l'app (cf. `teamAverage`) : moyenne NON PONDÉRÉE des taux
 * individuels.
 *
 * Et non `Σ présences / Σ attendus`, qui pondère par le nombre de séances attendues : un joueur
 * arrivé en cours de saison, ou absent de longue durée, y pèse mécaniquement moins qu'un
 * présent depuis le premier jour. « Le joueur type est présent à 82 % » est ce que le staff
 * veut lire, pas « 82 % des présences attendues ont eu lieu ».
 *
 * `attendance` doit déjà être filtré sur la période voulue.
 */
export function teamPresenceRate(
  players: Array<{ playerId: string; attendance: AttendanceRow[] }>,
): TeamAverage {
  // `rawPresenceRate` et non `presenceRate` : la valeur individuelle entre non arrondie dans la
  // moyenne, seul le chiffre d'équipe est arrondi (cf. `teamAverageOfField`).
  return teamAverage(players, p => p.playerId, group => rawPresenceRate(group.flatMap(g => g.attendance)));
}
