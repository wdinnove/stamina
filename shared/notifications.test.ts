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
      expect(urlFor(type.key, 'abc-123'), type.key).not.toBe('/tableau-de-bord');
    }
  });

  /**
   * Garde-fou du renommage des routes en français : `urlFor` est partagée avec le service worker
   * et n'a pas de compilateur pour l'avertir qu'un chemin n'existe plus. Sans ce test, elle a
   * continué à renvoyer /roster, /medical/record/:id, /actions… qui ne marchaient que par
   * redirection — donc en perdant l'onglet ciblé.
   *
   * Les motifs ci-dessous sont recopiés de `src/router.tsx`. Y ajouter une entrée en même temps
   * qu'une route.
   */
  const ROUTES = [
    '/tableau-de-bord', '/equipes', '/equipes/:id', '/joueurs', '/effectif', '/taches',
    '/rpe', '/rpe/:tab', '/rpe/:tab/:id',
    '/bien-etre', '/bien-etre/:tab', '/bien-etre/:tab/:id',
    '/medical', '/medical/:tab', '/medical/:tab/:id',
    '/reunions', '/reunions/:id', '/presences', '/seances/:id', '/seances',
    '/exercices', '/exercices/:id', '/matchs', '/matchs/:id', '/matchs/:id/:tab',
    '/performance-collective', '/performance-collective/:tab',
    '/performance-individuelle', '/performance-individuelle/:id', '/performance-individuelle/:id/:tab',
    '/profil', '/profil/notifications', '/configuration',
  ];

  /** Vrai si l'URL correspond à un motif de route déclaré (`:param` matche un segment). */
  const matchesRoute = (url: string) => ROUTES.some(pattern => {
    const p = pattern.split('/');
    const u = url.split('/');
    return p.length === u.length && p.every((seg, i) => seg.startsWith(':') || seg === u[i]);
  });

  it('ne pointe que vers des routes déclarées, avec et sans identifiant', () => {
    for (const type of NOTIFICATION_TYPES) {
      for (const entityId of ['abc-123', undefined]) {
        const url = urlFor(type.key, entityId);
        expect(matchesRoute(url), `${type.key} (entityId=${entityId}) → ${url}`).toBe(true);
      }
    }
  });

  it('cible un onglet précis et pas seulement la page, quand un identifiant est fourni', () => {
    // Un clic qui ramène sur la page générique déjà affichée donne l'impression de ne rien faire.
    expect(urlFor('medical_added', 'p1')).toBe('/medical/joueur/p1');
    expect(urlFor('wellness_added', 'p1')).toBe('/bien-etre/joueur/p1');
    expect(urlFor('rpe_added', 's1')).toBe('/seances/s1');
    expect(urlFor('attendance_missing', 's1')).toBe('/seances/s1');
    expect(urlFor('match_stats_added', 'm1')).toBe('/matchs/m1');
    expect(urlFor('tactical_import_done', 'm1')).toBe('/matchs/m1/tactique');
    expect(urlFor('rtp_upcoming')).toBe('/medical/infirmerie');
    expect(urlFor('wellness_alert')).toBe('/bien-etre/equipe');
  });

  it('n\'utilise aucun ancien chemin anglais', () => {
    const legacy = ['/roster', '/medical/record', '/wellness', '/sessions', '/attendance',
                    '/meetings', '/actions', '/matches', '/teams', '/players', '/dashboard'];
    for (const type of NOTIFICATION_TYPES) {
      const url = urlFor(type.key, 'abc-123');
      for (const old of legacy) {
        expect(url.startsWith(old + '/') || url === old, `${type.key} → ${url}`).toBe(false);
      }
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

  it('retombe sur la page générique sans identifiant', () => {
    expect(urlFor('medical_added', undefined)).toBe('/medical');
    expect(urlFor('match_added', undefined)).toBe('/matchs');
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
