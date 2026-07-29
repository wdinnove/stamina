import { describe, it, expect } from 'vitest';
import {
  calcPlayerAdvanced, calcPlayerAdvancedForMatch, isTeamMinutesPlausible,
  MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION,
  type PlayerAdvancedInput, type TeamAdvancedInput,
} from './playerAdvanced';

const player = (overrides: Partial<PlayerAdvancedInput> = {}): PlayerAdvancedInput => ({
  fg2m: 4, fg2a: 8, fg3m: 0, fg3a: 0, fta: 2, bp: 1, pts: 10, pd: 0, ro: 0, rd: 0, min: 20,
  ...overrides,
});

const team = (overrides: Partial<TeamAdvancedInput> = {}): TeamAdvancedInput => ({
  fg2m: 20, fg2a: 40, fg3m: 5, fg3a: 15, fta: 14, bp: 12, ro: 0, rd: 0, opp_ro: 0, opp_rd: 0,
  ...overrides,
});

describe('isTeamMinutesPlausible', () => {
  it('accepte la fourchette [150, 300] par match couvert', () => {
    expect(isTeamMinutesPlausible(150, 1)).toBe(true);
    expect(isTeamMinutesPlausible(300, 1)).toBe(true);
    expect(isTeamMinutesPlausible(200, 1)).toBe(true);
    expect(isTeamMinutesPlausible(149, 1)).toBe(false);
    expect(isTeamMinutesPlausible(301, 1)).toBe(false);
  });

  it('met la fourchette à l\'échelle du nombre de matchs couverts', () => {
    expect(isTeamMinutesPlausible(300, 2)).toBe(true);  // 150×2
    expect(isTeamMinutesPlausible(600, 2)).toBe(true);  // 300×2
    expect(isTeamMinutesPlausible(299, 2)).toBe(false);
  });

  it('refuse un nombre de matchs nul ou négatif', () => {
    expect(isTeamMinutesPlausible(200, 0)).toBe(false);
    expect(isTeamMinutesPlausible(200, -1)).toBe(false);
  });
});

describe('calcPlayerAdvanced — correction usage% par les minutes jouées', () => {
  it('applique la formule corrigée quand teamMinutes est fourni et s.min suffisant', () => {
    // indPoss = 8 + 0.44×2 + 1 = 9.88 ; teamPoss = 55 + 0.44×14 + 12 = 73.16
    const s = player({ min: 20 });
    const t = team();
    const corrected = calcPlayerAdvanced(s, t, 200); // 5 × 40 min, plausible pour 1 match
    // 9.88 × (200/5) / (20 × 73.16) × 100 ≈ 27.0
    expect(corrected.usagePct).toBeCloseTo(27.0, 1);
  });

  it('retombe sur l\'ancien calcul non corrigé si teamMinutes est omis', () => {
    const s = player({ min: 20 });
    const t = team();
    const uncorrected = calcPlayerAdvanced(s, t);
    // 9.88 / 73.16 × 100 ≈ 13.5
    expect(uncorrected.usagePct).toBeCloseTo(13.5, 1);
  });

  it('un remplaçant à minutes réduites voit son usage% augmenter avec la correction (c\'est le but du fix)', () => {
    const s = player({ min: 20 });
    const t = team();
    const uncorrected = calcPlayerAdvanced(s, t).usagePct!;
    const corrected = calcPlayerAdvanced(s, t, 200).usagePct!;
    expect(corrected).toBeGreaterThan(uncorrected);
  });

  it(`ne corrige pas si s.min est en dessous de MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION (${MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION} min) — évite un usage% > 100% sur une poignée de possessions en garbage time`, () => {
    const s = player({ min: MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION - 1, fg2m: 2, fg2a: 2, fta: 0, bp: 1 });
    const t = team();
    const result = calcPlayerAdvanced(s, t, 200);
    const uncorrected = calcPlayerAdvanced(s, t).usagePct;
    expect(result.usagePct).toBe(uncorrected);
    expect(result.usagePct).toBeLessThan(100);
  });

  it('applique bien la correction au seuil exact MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION', () => {
    const s = player({ min: MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION });
    const t = team();
    const corrected = calcPlayerAdvanced(s, t, 200).usagePct;
    const uncorrected = calcPlayerAdvanced(s, t).usagePct;
    expect(corrected).not.toBe(uncorrected);
  });

  it('ne retombe jamais au-delà de 100% de façon absurde pour un cas plausible même à faible minutage (garde-fou actif)', () => {
    // 1 minute jouée, 3 possessions individuelles (2 tirs + 1 perte) — le cas exact qui, sans
    // garde-fou, pousserait usagePct largement au-dessus de 100%.
    const s = player({ min: 1, fg2m: 0, fg2a: 2, fg3m: 0, fg3a: 0, fta: 0, bp: 1 });
    const t = team();
    const result = calcPlayerAdvanced(s, t, 200);
    expect(result.usagePct).toBeLessThan(100);
  });
});

describe('calcPlayerAdvancedForMatch', () => {
  it('applique la correction si team.teamMinutes est plausible pour un seul match', () => {
    const s = player({ min: 20 });
    const t = { ...team(), teamMinutes: 200 };
    const viaHelper = calcPlayerAdvancedForMatch(s, t).usagePct;
    const viaDirect = calcPlayerAdvanced(s, t, 200).usagePct;
    expect(viaHelper).toBe(viaDirect);
    expect(viaHelper).not.toBe(calcPlayerAdvanced(s, t).usagePct);
  });

  it('ignore team.teamMinutes si implausible pour un seul match (ex. saisie "collectif" sans lignes individuelles)', () => {
    const s = player({ min: 20 });
    const t = { ...team(), teamMinutes: 20 }; // très en dessous de 150
    const result = calcPlayerAdvancedForMatch(s, t).usagePct;
    const uncorrected = calcPlayerAdvanced(s, t).usagePct;
    expect(result).toBe(uncorrected);
  });

  it('fonctionne sans teamMinutes (undefined) comme calcPlayerAdvanced sans le 3e argument', () => {
    const s = player({ min: 20 });
    const t = team();
    expect(calcPlayerAdvancedForMatch(s, t).usagePct).toBe(calcPlayerAdvanced(s, t).usagePct);
  });
});
