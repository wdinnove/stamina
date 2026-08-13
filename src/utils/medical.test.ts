import { describe, it, expect } from 'vitest';
import { daysBetween, injuryDays, sumInjuryDays, isNoStopInjury } from './medical';
import type { MedicalRecord } from '../data/types';

const injury = (o: Partial<MedicalRecord> = {}): MedicalRecord => ({
  id: 'r1', playerId: 'p1', date: '2026-01-05', type: 'injury',
  description: 'Entorse', status: 'active',
  ...o,
});

describe('daysBetween', () => {
  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-01-05', '2026-01-30')).toBe(25);
  });

  it('ne renvoie jamais de négatif', () => {
    expect(daysBetween('2026-01-30', '2026-01-05')).toBe(0);
  });

  it('traverse un changement d\'heure sans dériver', () => {
    // Passage à l'heure d'été en France : nuit du 28 au 29 mars 2026.
    expect(daysBetween('2026-03-25', '2026-04-01')).toBe(7);
  });
});

describe('injuryDays — jours constatés vs jours prévus', () => {
  /**
   * Cas de l'audit. Entorse du 5 janvier, retour prévu le 30, clôturée le 12.
   * L'ancien calcul renvoyait 25 jours (le prévu) alors que la bande du graphique de charge, qui
   * lit `resolvedDate`, en affichait 7. Deux chiffres pour la même blessure.
   */
  it('une blessure clôturée compte ses jours CONSTATÉS', () => {
    const r = injury({ status: 'resolved', rtpDate: '2026-01-30', resolvedDate: '2026-01-12' });
    expect(injuryDays(r)).toBe(7);
  });

  it('une blessure active compte ses jours PRÉVUS', () => {
    expect(injuryDays(injury({ status: 'active', rtpDate: '2026-01-30' }))).toBe(25);
  });

  it('une blessure clôturée sans date de clôture retombe sur le retour prévu', () => {
    expect(injuryDays(injury({ status: 'resolved', rtpDate: '2026-01-30' }))).toBe(25);
  });

  it('renvoie null — et non 0 — quand aucune date de fin n\'est connue', () => {
    // C'était le trou : une blessure sans retour prévu ni clôture comptait 0 jour, ce qui
    // sous-estimait le cumul saison sans que rien ne le signale.
    expect(injuryDays(injury())).toBeNull();
  });

  it('une blessure « sans arrêt » compte bien 0 jour', () => {
    const sameDay = injury({ rtpDate: '2026-01-05' });
    const zeroDays = injury({ daysAbsent: 0 });
    expect(isNoStopInjury(sameDay)).toBe(true);
    expect(injuryDays(sameDay)).toBe(0);
    expect(injuryDays(zeroDays)).toBe(0);
  });

  it('ignore les enregistrements qui ne sont pas des blessures', () => {
    expect(injuryDays(injury({ type: 'checkup', rtpDate: '2026-01-30' }))).toBeNull();
  });
});

describe('sumInjuryDays — le total dit ce qu\'il ne couvre pas', () => {
  it('somme les jours connus et compte les blessures non datées à part', () => {
    const total = sumInjuryDays([
      injury({ id: 'a', status: 'resolved', rtpDate: '2026-01-30', resolvedDate: '2026-01-12' }), // 7
      injury({ id: 'b', status: 'active', rtpDate: '2026-01-15' }),                               // 10
      injury({ id: 'c' }),                                                                       // non datée
      injury({ id: 'd', daysAbsent: 0 }),                                                        // 0, sans arrêt
    ]);
    expect(total.days).toBe(17);
    expect(total.undated).toBe(1);
  });

  it('écarte les bilans et traitements du total', () => {
    const total = sumInjuryDays([
      injury({ id: 'a', status: 'active', rtpDate: '2026-01-15' }),
      injury({ id: 'b', type: 'checkup' }),
      injury({ id: 'c', type: 'treatment' }),
    ]);
    expect(total.days).toBe(10);
    expect(total.undated).toBe(0);
  });
});
