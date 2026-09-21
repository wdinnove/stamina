import { describe, it, expect } from 'vitest';
import { fmt1, formatMinutes } from './format';

describe('fmt1', () => {
  it('fixe une décimale', () => {
    expect(fmt1(5)).toBe('5.0');
    expect(fmt1(4.26)).toBe('4.3');
  });

  it('rend le fallback sur null/undefined', () => {
    expect(fmt1(null)).toBe('—');
    expect(fmt1(undefined)).toBe('—');
  });
});

describe('formatMinutes', () => {
  it('convertit un décimal de boxscore en mm:ss', () => {
    expect(formatMinutes(26.8)).toBe('26:48');
    expect(formatMinutes(0.1)).toBe('0:06');
    expect(formatMinutes(40)).toBe('40:00');
  });

  it('ne pave pas les minutes, mais pave les secondes', () => {
    expect(formatMinutes(3.5)).toBe('3:30');
    expect(formatMinutes(3.05)).toBe('3:03');
  });

  it('rend le fallback sur null/undefined, pas 0:00', () => {
    // Une donnée absente n'est pas la même chose qu'un joueur entré puis aussitôt sorti.
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(undefined)).toBe('—');
  });

  it('ne descend jamais sous 0:00', () => {
    expect(formatMinutes(-1)).toBe('0:00');
  });

  it('absorbe les imprécisions binaires (26.8 * 60 ne tombe pas rond)', () => {
    // 26.8 * 60 = 1607.9999999999998 en flottant : sans arrondi, on perd une seconde.
    expect(formatMinutes(26.8)).toBe('26:48');
    expect(formatMinutes(18.3)).toBe('18:18');
  });
});
