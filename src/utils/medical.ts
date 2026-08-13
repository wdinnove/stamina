import type { MedicalRecord } from '../data/types';

/**
 * Logique de dates du domaine médical. Extraite de `components/MedicalCard.tsx` : c'est du calcul
 * pur, et `daysBetween` s'y trouvait recopié à l'identique dans trois fichiers (MedicalCard,
 * MedicalPage, TeamMedicalOverview) — trois endroits à corriger pour un même changement.
 */

/** Nombre de jours entre deux dates ISO, jamais négatif. Bornes à minuit local, donc insensible aux heures. */
export function daysBetween(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T00:00:00');
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

/** Jours restants avant la date de retour prévue (négatif si elle est dépassée). */
export function rtpDaysLeft(rtpDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rtp   = new Date(rtpDate + 'T00:00:00');
  return Math.ceil((rtp.getTime() - today.getTime()) / 86400000);
}

/**
 * Blessure « sans arrêt » : aucune indisponibilité, donc reprise le jour même.
 * Les deux signaux sont acceptés — `daysAbsent = 0` saisi dans le formulaire, ou une date de retour
 * égale à la date de la blessure — pour couvrir les entrées créées avant la case « sans arrêt ».
 */
export function isNoStopInjury(r: MedicalRecord): boolean {
  return r.type === 'injury' && (r.daysAbsent === 0 || (!!r.rtpDate && r.rtpDate === r.date));
}

/**
 * Jours d'indisponibilité d'une blessure.
 *
 * La distinction que ce calcul portait en commentaire sans jamais l'appliquer :
 *  • blessure **clôturée** → jours CONSTATÉS, depuis `resolvedDate`, la date réellement saisie au
 *    moment de la clôture ;
 *  • blessure **active** → jours PRÉVUS, depuis `rtpDate` : le retour réel n'est pas encore connu.
 *
 * `resolvedDate` était écrit par les trois surfaces de clôture et affiché dans la fiche détail, mais
 * aucun compteur ne le lisait : une blessure clôturée avec deux semaines d'avance comptait quand
 * même sa durée prévue, et la bande du graphique de charge (qui lit bien `resolvedDate`) contredisait
 * le KPI.
 *
 * Renvoie `null` — et non 0 — quand aucune date de fin n'est connue : une blessure sans retour prévu
 * ni clôture n'est pas une blessure sans gravité, et la faire compter pour 0 sous-estimait
 * silencieusement le total. Utiliser `sumInjuryDays` pour agréger sans perdre cette information.
 */
export function injuryDays(r: MedicalRecord): number | null {
  if (r.type !== 'injury') return null;
  if (isNoStopInjury(r)) return 0;
  const end = r.status === 'resolved' ? (r.resolvedDate ?? r.rtpDate) : r.rtpDate;
  return end ? daysBetween(r.date, end) : null;
}

export interface InjuryDaysTotal {
  /** Somme des jours connus. */
  days: number;
  /** Blessures sans date de fin connue, donc absentes du total — à signaler plutôt qu'à noyer. */
  undated: number;
}

/** Total de jours d'indisponibilité, en gardant le compte des blessures non datées. */
export function sumInjuryDays(records: MedicalRecord[]): InjuryDaysTotal {
  let days = 0;
  let undated = 0;
  for (const r of records) {
    if (r.type !== 'injury') continue;
    const d = injuryDays(r);
    if (d === null) undated++;
    else days += d;
  }
  return { days, undated };
}
