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
