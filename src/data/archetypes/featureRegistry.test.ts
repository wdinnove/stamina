import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY } from './featureRegistry';
import { PROFILES_V1 } from './profiles/v1';
import { DIMENSIONS_V1 } from './dimensions/v1';
import { makeRawPlayerStats } from './testFixtures';

describe('FEATURE_REGISTRY', () => {
  it("n'a pas de clé dupliquée", () => {
    const keys = FEATURE_REGISTRY.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('chaque featureKey référencé par un profil existe dans le registre (garde-fou anti-typo)', () => {
    const registryKeys = new Set(FEATURE_REGISTRY.map(f => f.key));
    for (const profile of PROFILES_V1) {
      for (const indicator of profile.indicators) {
        expect(registryKeys.has(indicator.featureKey), `${profile.key} référence une feature inconnue: ${indicator.featureKey}`).toBe(true);
      }
    }
  });

  it('chaque featureKey référencé par une dimension existe dans le registre', () => {
    const registryKeys = new Set(FEATURE_REGISTRY.map(f => f.key));
    for (const dimension of DIMENSIONS_V1) {
      for (const indicator of dimension.indicators) {
        expect(registryKeys.has(indicator.featureKey), `${dimension.key} référence une feature inconnue: ${indicator.featureKey}`).toBe(true);
      }
    }
  });

  it("get() ne lève jamais, même avec des tentatives/minutes à zéro", () => {
    const raw = makeRawPlayerStats({ playerId: 'p1', minutesTotal: 0, matches: 0 });
    for (const feature of FEATURE_REGISTRY) {
      expect(() => feature.get(raw)).not.toThrow();
    }
  });
});

describe('profils — cohérence des indicateurs déclarés', () => {
  it('ne référence que des features existantes', () => {
    const known = new Set(FEATURE_REGISTRY.map(f => f.key));
    for (const profile of PROFILES_V1) {
      for (const ind of profile.indicators) {
        expect(known, `${profile.key} → ${ind.featureKey}`).toContain(ind.featureKey);
      }
    }
  });

  it('propose un intérieur shooteur (stretch 5), qui manquait', () => {
    const stretch = PROFILES_V1.find(p => p.key === 'stretch_five');
    expect(stretch).toBeDefined();
    expect(stretch!.eligiblePositions).toContain('Pivot');
    // Volume ET adresse à 3 points : sans l'adresse, on décrirait juste une intérieure qui shoote mal.
    const keys = stretch!.indicators.map(i => i.featureKey);
    expect(keys).toContain('fg3VolumePer36');
    expect(keys).toContain('fg3Pct');
    // Poids négatif sur le rebond offensif : un stretch 5 s'éloigne du cercle.
    expect(stretch!.indicators.find(i => i.featureKey === 'orebPct')!.weight).toBeLessThan(0);
  });

  it('ne promet plus « énergie » là où seuls rebond offensif et fautes provoquées sont mesurés', () => {
    expect(PROFILES_V1.find(p => p.key === 'moteur_energie')).toBeUndefined();
    const p = PROFILES_V1.find(p => p.key === 'presence_offensive')!;
    expect(p.label.toLowerCase()).not.toContain('énergie');
  });
});
