import { describe, it, expect } from 'vitest';
import {
  calcPlayerAdvanced, calcPlayerAdvancedForMatch, isTeamMinutesPlausible,
  MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION,
  calcPlayerAdvancedForPeriod, perMatchPtsProd,
  type PlayerAdvancedInput, type TeamAdvancedInput, type PlayerAdvancedPeriodInput,
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

describe('calcPlayerAdvanced — usagePctRaw (%USG classique) vs usagePct (%USG/min)', () => {
  it('usagePctRaw reste le calcul classique, quel que soit teamMinutes', () => {
    const s = player({ min: 20 });
    const t = team();
    // 9.88 / 73.16 × 100 ≈ 13.5 — identique avec et sans correction
    expect(calcPlayerAdvanced(s, t).usagePctRaw).toBeCloseTo(13.5, 1);
    expect(calcPlayerAdvanced(s, t, 200).usagePctRaw).toBeCloseTo(13.5, 1);
    expect(calcPlayerAdvancedForMatch(s, { ...t, teamMinutes: 200 }).usagePctRaw).toBeCloseTo(13.5, 1);
  });

  it('les deux colonnes diffèrent dès que la correction s\'applique', () => {
    const corrected = calcPlayerAdvanced(player({ min: 20 }), team(), 200);
    expect(corrected.usagePct).not.toBe(corrected.usagePctRaw);
    expect(corrected.usagePct!).toBeGreaterThan(corrected.usagePctRaw!);
  });

  it('usagePct retombe exactement sur usagePctRaw quand la correction ne s\'applique pas', () => {
    const noMinutes = calcPlayerAdvanced(player({ min: 20 }), team());
    expect(noMinutes.usagePct).toBe(noMinutes.usagePctRaw);
    const tooFewMinutes = calcPlayerAdvanced(player({ min: MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION - 1 }), team(), 200);
    expect(tooFewMinutes.usagePct).toBe(tooFewMinutes.usagePctRaw);
  });

  it('les deux sont nulles sans stat collective', () => {
    const adv = calcPlayerAdvanced(player(), null);
    expect(adv.usagePctRaw).toBeNull();
    expect(adv.usagePct).toBeNull();
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

describe('calcPlayerAdvancedForPeriod', () => {
  /** 3 matchs normaux + une entrée de 2 min où le joueur rentre son unique tir, un 3 points. */
  const m = (matchId: string, o: Partial<PlayerAdvancedInput>): PlayerAdvancedPeriodInput => ({
    fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, fta: 0, bp: 0, pts: 0, pd: 0, ro: 0, rd: 0, min: 30,
    matchId, ...o,
  });
  const SEASON = [
    m('m1', { fg2m: 5, fg2a: 12, fg3m: 2, fg3a: 6 }),   // eFG 44,4 %
    m('m2', { fg2m: 4, fg2a: 10, fg3m: 1, fg3a: 4 }),   // eFG 39,3 %
    m('m3', { fg2m: 6, fg2a: 11, fg3m: 3, fg3a: 7 }),   // eFG 58,3 %
    m('m4', { fg2m: 0, fg2a: 0, fg3m: 1, fg3a: 1, min: 2 }), // eFG 150 % sur un seul tir
  ];

  it('somme les tirs avant de diviser, au lieu de moyenner les eFG% par match', () => {
    // Moyenne des ratios par match : (44,4 + 39,3 + 58,3 + 150) / 4 = 73,0 % — faux.
    const perMatchMean = SEASON
      .map(s => calcPlayerAdvanced(s, null).efgPct!)
      .reduce((a, b) => a + b, 0) / SEASON.length;
    expect(Math.round(perMatchMean * 10) / 10).toBe(73);

    // Ratio des sommes : (22 + 0,5 × 7) / 51 = 50,0 %
    expect(calcPlayerAdvancedForPeriod(SEASON).stats.efgPct).toBe(50);
  });

  it('n\'agrège les indicateurs dépendant de l\'équipe que sur les matchs ayant une ligne collective', () => {
    const teamMap = new Map([['m1', team()], ['m2', team()]]);
    const res = calcPlayerAdvancedForPeriod(SEASON, teamMap);
    // 4 matchs pour les indicateurs joueur seuls, 2 seulement pour ceux qui ont besoin de l'équipe
    expect(res.matches).toBe(4);
    expect(res.matchesWithTeam).toBe(2);
    expect(res.stats.efgPct).toBe(50);        // calculé sur les 4 matchs
    expect(res.stats.usagePctRaw).not.toBeNull(); // calculé sur les 2 matchs couverts
  });

  it('laisse à null les indicateurs d\'équipe quand aucun match n\'a de ligne collective', () => {
    const res = calcPlayerAdvancedForPeriod(SEASON, new Map());
    expect(res.matchesWithTeam).toBe(0);
    expect(res.stats.usagePctRaw).toBeNull();
    expect(res.stats.astPct).toBeNull();
    expect(res.stats.ptsProd).toBeNull();
    expect(res.stats.efgPct).toBe(50);  // celui-ci ne dépend pas de l'équipe
  });

  it('ramène les points générés à une moyenne par match', () => {
    const teamMap = new Map([['m1', team()], ['m2', team()]]);
    const res = calcPlayerAdvancedForPeriod(SEASON, teamMap);
    expect(perMatchPtsProd(res)).toBeCloseTo(res.stats.ptsProd! / 2, 1);
  });
});

describe('cohérence entre la valeur par match et la valeur de période', () => {
  const one = (o: Partial<PlayerAdvancedInput> = {}): PlayerAdvancedPeriodInput => ({
    fg2m: 5, fg2a: 12, fg3m: 2, fg3a: 6, fta: 4, bp: 3, pts: 20, pd: 5, ro: 2, rd: 4, min: 28,
    matchId: 'm1', ...o,
  });

  it('sur UN seul match, la période donne exactement la valeur du match', () => {
    const teamRow = { ...team(), teamMinutes: 200 };
    const perMatch = calcPlayerAdvancedForMatch(one(), teamRow);
    const period   = calcPlayerAdvancedForPeriod([one()], new Map([['m1', teamRow]]));

    // Tous les ratios doivent coïncider — sinon la ligne "Dernier match" d'un objectif
    // contredirait la ligne du match affichée juste au-dessus.
    for (const key of Object.keys(perMatch) as (keyof typeof perMatch)[]) {
      if (key === 'ptsProd') continue; // volume : comparé séparément ci-dessous
      expect(period.stats[key], key).toBe(perMatch[key]);
    }
    expect(perMatchPtsProd(period)).toBe(perMatch.ptsProd);
  });

  it('applique la correction minutes au même seuil que le calcul par match', () => {
    const shortStint = one({ min: 3 });  // sous MIN_PLAYER_MINUTES_FOR_USAGE_CORRECTION
    const teamRow = { ...team(), teamMinutes: 200 };
    const perMatch = calcPlayerAdvancedForMatch(shortStint, teamRow);
    const period   = calcPlayerAdvancedForPeriod([shortStint], new Map([['m1', teamRow]]));
    // Les deux doivent retomber sur %USG brut, pas l'un sans l'autre
    expect(period.stats.usagePct).toBe(perMatch.usagePct);
    expect(period.stats.usagePct).toBe(period.stats.usagePctRaw);
  });
});
