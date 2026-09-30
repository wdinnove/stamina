import { describe, it, expect } from 'vitest';
import {
  effectiveDuration, sessionLoad, sessionWorkDuration, computeAcwr, computePmcSeries, computeTsb,
  tsbZone, acwrZone, type LoadEntry,
} from './rpe';

describe('effectiveDuration', () => {
  it('préfère la durée réellement déclarée à tout le reste', () => {
    expect(effectiveDuration({ actualDuration: 55, workDuration: 70, plannedDuration: 90 })).toBe(55);
  });

  it('retombe sur le temps de travail effectif si rien n\'a été déclaré', () => {
    expect(effectiveDuration({ workDuration: 70, plannedDuration: 90 })).toBe(70);
  });

  it('ne retombe sur la durée planifiée globale que si aucun bloc n\'a été détaillé', () => {
    expect(effectiveDuration({ plannedDuration: 90 })).toBe(90);
  });
});

describe('sessionLoad', () => {
  it('applique la formule RPE × durée effective', () => {
    expect(sessionLoad({ rpe: 6, workDuration: 70, plannedDuration: 90 })).toBe(420);
  });
});

describe('sessionWorkDuration', () => {
  it('exclut les blocs "repos" du total', () => {
    expect(sessionWorkDuration([
      { kind: 'exercice', duration: 20 },
      { kind: 'repos', duration: 10 },
      { kind: 'exercice', duration: 40 },
    ])).toBe(60);
  });

  it('vaut 0 sans bloc — à distinguer d\'une durée inconnue par l\'appelant', () => {
    expect(sessionWorkDuration([])).toBe(0);
  });
});

const entry = (date: string, rpe: number, over: Partial<LoadEntry> = {}): LoadEntry => ({
  date, rpe, plannedDuration: 60, ...over,
});

describe('computeAcwr', () => {
  it('rend null sans historique', () => {
    expect(computeAcwr([])).toBeNull();
  });

  it('vaut 1 quand la charge récente égale la charge chronique (entraînement stable)', () => {
    const history = Array.from({ length: 28 }, (_, i) => {
      const d = new Date('2026-01-28T12:00:00');
      d.setDate(d.getDate() - i);
      return entry(d.toLocaleDateString('sv'), 5); // 5 × 60 = 300 UA/jour, tous les jours
    });
    expect(computeAcwr(history, '2026-01-28')).toBe(1);
  });

  it('utilise la durée la plus réelle disponible (workDuration), pas seulement plannedDuration', () => {
    // Même RPE (5) tous les jours des 28 derniers jours, mais les 7 derniers ont un temps de
    // travail effectif de 30 min (beaucoup de repos dans la séance) au lieu des 60 min planifiées.
    // Si le calcul ignorait `workDuration`, la charge serait uniforme et l'ACWR vaudrait 1 — le
    // fait qu'il tombe sous 1 prouve que la charge récente, réellement plus faible, est bien prise
    // en compte.
    const history = Array.from({ length: 28 }, (_, i) => {
      const d = new Date('2026-01-28T12:00:00');
      d.setDate(d.getDate() - i);
      return entry(d.toLocaleDateString('sv'), 5, i < 7 ? { workDuration: 30 } : {});
    });
    // Chronique : (21×300 + 7×150) / 28 = 262,5 ; aiguë : 150 ; ratio arrondi = 0,57.
    expect(computeAcwr(history, '2026-01-28')).toBe(0.57);
  });

  it('monte au-dessus de 1 après un pic de charge récent', () => {
    const history: LoadEntry[] = [];
    for (let i = 27; i >= 8; i--) {
      const d = new Date('2026-01-28T12:00:00'); d.setDate(d.getDate() - i);
      history.push(entry(d.toLocaleDateString('sv'), 4)); // charge de fond, semaines 2-4
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date('2026-01-28T12:00:00'); d.setDate(d.getDate() - i);
      history.push(entry(d.toLocaleDateString('sv'), 8)); // pic sur les 7 derniers jours
    }
    const acwr = computeAcwr(history, '2026-01-28')!;
    expect(acwr).toBeGreaterThan(1.3);
  });

  it('borne la fenêtre de 7 jours de façon inclusive, sans dérive de fuseau horaire', () => {
    // Régression : `new Date(refDate)` sans heure vaut minuit UTC, et `setDate` raisonne en heure
    // locale — sur un fuseau à l'ouest de Greenwich, ça décalait les fenêtres 7j/28j d'un jour
    // entier. Une séance exactement 6 jours avant la référence (J-6 → J = 7 jours pile) doit
    // compter dans la charge aiguë ; une à J-7 doit en être exclue (charge aiguë nulle, ratio 0).
    expect(computeAcwr([entry('2026-01-22', 5)], '2026-01-28')).toBe(4);   // J-6 : dans la fenêtre
    expect(computeAcwr([entry('2026-01-21', 5)], '2026-01-28')).toBe(0);  // J-7 : hors fenêtre
  });
});

describe('computePmcSeries', () => {
  it('rend une série vide sans historique', () => {
    expect(computePmcSeries([])).toEqual([]);
  });

  it('le premier jour est neutre (TSB = fraîcheur AVANT toute charge)', () => {
    const series = computePmcSeries([entry('2026-01-01', 6)], '2026-01-01');
    expect(series).toHaveLength(1);
    expect(series[0].tsb).toBe(0);
  });

  it('couvre aussi les jours de repos (sans entrée), pour une décroissance réelle', () => {
    // Une seule séance, puis 10 jours sans rien : ATL doit décroître vers 0, pas rester figé.
    const series = computePmcSeries([entry('2026-01-01', 8, { plannedDuration: 90 })], '2026-01-11');
    expect(series).toHaveLength(11);
    expect(series[10].atl).toBeLessThan(series[1].atl);
  });

  it('ATL réagit plus vite que CTL au même à-coup de charge (fenêtres 7j vs 42j)', () => {
    const series = computePmcSeries([entry('2026-01-01', 8, { plannedDuration: 90 })], '2026-01-05');
    const last = series[series.length - 1];
    expect(last.atl).toBeGreaterThan(last.ctl);
  });
});

describe('computeTsb', () => {
  it('rend null sans historique', () => {
    expect(computeTsb([])).toBeNull();
  });

  it('rend le dernier point de la série PMC', () => {
    const history = [entry('2026-01-01', 5), entry('2026-01-05', 5)];
    expect(computeTsb(history)).toBe(computePmcSeries(history).at(-1)!.tsb);
  });
});

describe('tsbZone', () => {
  it('classe les 4 zones aux bornes documentées', () => {
    expect(tsbZone(-31).label).toBe('Surmenage');
    expect(tsbZone(-30).label).toBe('Surmenage');
    expect(tsbZone(-29).label).toBe('Chargé');
    expect(tsbZone(-10).label).toBe('Chargé');
    expect(tsbZone(-9).label).toBe('Zone optimale');
    expect(tsbZone(5).label).toBe('Zone optimale');
    expect(tsbZone(6).label).toBe('Frais');
  });
});

describe('acwrZone', () => {
  it('rend null sans valeur', () => {
    expect(acwrZone(null)).toBeNull();
  });

  it('classe les 4 zones aux bornes documentées (Gabbett 2016)', () => {
    expect(acwrZone(0.79)?.label).toBe('Sous-charge');
    expect(acwrZone(0.8)?.label).toBe('Zone optimale');
    expect(acwrZone(1.3)?.label).toBe('Zone optimale');
    expect(acwrZone(1.31)?.label).toBe('Risque modéré');
    expect(acwrZone(1.5)?.label).toBe('Risque modéré');
    expect(acwrZone(1.51)?.label).toBe('Risque élevé');
  });
});
