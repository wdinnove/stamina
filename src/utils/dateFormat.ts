// Formateurs de date partagés — évite les multiples copies (mêmes tableaux de mois/jours,
// mêmes formules) qui traînaient dans RPEPage, PlayerHubPage, TeamSessionHistoryTable,
// TrainingSessionDetailPage, MeetingDetailPage, MedicalCard.

const MONTHS_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
export const MONTHS_FULL  = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_SHORT = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
export const DAYS_FULL  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/** Abréviations 3 lettres (Jan/Fév.../Dim/Lun...) — convention distincte de MONTHS_SHORT/DAYS_SHORT ci-dessus,
 *  utilisée par les badges de calendrier (Meetings/Attendance/Sessions/Matches) */
export const MONTHS_ABBR3 = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
export const DAYS_ABBR3   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Ordre des jours de la semaine, lundi en premier (index dans DAYS_FULL/DAYS_ABBR3, dimanche=0) */
export const DAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** "12 juil" */
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "12/07" */
export function fmtDateShort(iso: string): string {
  const [, mm, dd] = iso.split('-');
  return `${dd}/${mm}`;
}

/** "Di 12/07" */
export function fmtDateWithDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const [, mm, dd] = iso.split('-');
  return `${DAYS_SHORT[d.getDay()]} ${Number(dd)}/${Number(mm)}`;
}

/** "Dimanche 12 Juillet 2026" */
export function fmtDateFull(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}
