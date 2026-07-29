import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  getNotificationType,
  getNotificationCategory,
  typesInCategory,
  categorySupportsEmail,
  urlFor,
  isWellnessAlerting,
  WELLNESS_ALERT,
} from './notifications.js';

describe('registre des notifications', () => {
  it('donne une catégorie connue à chaque type', () => {
    const known = new Set(NOTIFICATION_CATEGORIES.map(c => c.key));
    for (const type of NOTIFICATION_TYPES) {
      expect(known, `${type.key} → ${type.category}`).toContain(type.category);
    }
  });

  it("n'a pas de clé de type en doublon", () => {
    const keys = NOTIFICATION_TYPES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('active au moins un canal par type, sinon la notification est inerte', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(type.inApp || type.push || type.email, type.key).toBe(true);
    }
  });

  it('donne une destination à chaque type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(urlFor(type.key, 'abc-123'), type.key).not.toBe('/');
    }
  });

  it("n'utilise que les audiences gérées par le dispatch", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(['team', 'assignee'], type.key).toContain(type.audience);
    }
  });

  it('retourne null sur un type ou une catégorie inconnus', () => {
    expect(getNotificationType('type_inexistant')).toBeNull();
    expect(getNotificationCategory('categorie_inexistante')).toBeNull();
  });

  it('insère l\'identifiant d\'entité dans l\'URL quand la cible le permet', () => {
    expect(urlFor('medical_added', 'p1')).toBe('/medical/record/p1');
    expect(urlFor('medical_added', undefined)).toBe('/medical');
  });

  it("n'annonce l'email que sur les catégories qui en envoient", () => {
    for (const cat of NOTIFICATION_CATEGORIES) {
      const expected = typesInCategory(cat.key).some(t => t.email);
      expect(categorySupportsEmail(cat.key), cat.key).toBe(expected);
    }
    expect(categorySupportsEmail('wellness')).toBe(true);
    expect(categorySupportsEmail('roster')).toBe(false);
  });
});

describe('seuil d\'alerte bien-être', () => {
  const ok = { score: 8, fatigue: 3, stress: 2, soreness: 2 };

  it('laisse passer une entrée saine', () => {
    expect(isWellnessAlerting(ok)).toBe(false);
  });

  it('alerte sur un score global trop bas', () => {
    expect(isWellnessAlerting({ ...ok, score: WELLNESS_ALERT.scoreMax })).toBe(true);
    expect(isWellnessAlerting({ ...ok, score: WELLNESS_ALERT.scoreMax + 0.1 })).toBe(false);
  });

  it('alerte sur une dimension inversée critique même si le score global est bon', () => {
    for (const dim of WELLNESS_ALERT.invertedDimensions) {
      expect(isWellnessAlerting({ ...ok, [dim]: WELLNESS_ALERT.invertedDimensionMin }), dim).toBe(true);
      expect(isWellnessAlerting({ ...ok, [dim]: WELLNESS_ALERT.invertedDimensionMin - 1 }), dim).toBe(false);
    }
  });

  it('ignore une entrée absente plutôt que de lever une erreur', () => {
    expect(isWellnessAlerting(null)).toBe(false);
    expect(isWellnessAlerting(undefined)).toBe(false);
  });

  it('ne se déclenche pas sur des dimensions non inversées élevées (mood/motivation/sleep hauts = bon)', () => {
    expect(isWellnessAlerting({ ...ok, mood: 10, motivation: 10, sleep: 10 })).toBe(false);
  });
});
