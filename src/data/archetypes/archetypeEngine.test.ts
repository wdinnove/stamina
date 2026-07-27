import { describe, it, expect } from 'vitest';
import { computeArchetypesForSquad } from './archetypeEngine';
import { PROFILES_V1 } from './profiles/v1';
import { makeRawPlayerStats } from './testFixtures';
import type { ProfileDefinition, RawPlayerStats } from './types';

const TEST_PROFILES: ProfileDefinition[] = [
  {
    key: 'hub', label: 'Hub offensif', description: '', category: 'createurs', status: 'available',
    indicators: [
      { featureKey: 'usagePct', weight: 2 },
      { featureKey: 'astPct', weight: 2 },
      { featureKey: 'ptsProd', weight: 2 },
      { featureKey: 'tovPct', weight: -1 },
    ],
  },
  {
    key: 'rebounder', label: 'Rebondeur', description: '', category: 'interieurs', status: 'available',
    indicators: [
      { featureKey: 'orebPct', weight: 2 },
      { featureKey: 'drebPct', weight: 2 },
      { featureKey: 'trebPct', weight: 1 },
    ],
  },
  {
    key: 'disruptor', label: 'Perturbateur', description: '', category: 'defense', status: 'available',
    indicators: [
      { featureKey: 'interceptsPer36', weight: 3 },
      { featureKey: 'fprPer36', weight: -1 },
    ],
  },
];

function player(playerId: string, over: Partial<RawPlayerStats['advancedAgg']> & { interceptsPer36?: number; fprPer36?: number }): RawPlayerStats {
  const { interceptsPer36, fprPer36, ...advanced } = over;
  return makeRawPlayerStats({
    playerId,
    matches: 12,
    minutesTotal: 300,
    totals: {
      pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      ro: 0, rd: 0, pd: 0,
      ct: 0, intercepts: Math.round(((interceptsPer36 ?? 0) * 300) / 36), bp: 0,
      fte: 0, fpr: Math.round(((fprPer36 ?? 0) * 300) / 36),
      startsCount: 0, plusMinus: 0, plusMinusCount: 0,
    },
    advancedAgg: {
      usagePct: null, offRating: null, efgPct: null, ftRate: null, bpPerPoss: null,
      astPct: null, tovPct: null, trebPct: null, drebPct: null, orebPct: null, ptsProd: null,
      ...advanced,
    },
  });
}

describe('computeArchetypesForSquad (intégration)', () => {
  const hubPlayer = player('hub-player', { usagePct: 30, astPct: 32, ptsProd: 22, tovPct: 8 });
  const rebounderPlayer = player('rebounder-player', { usagePct: 15, astPct: 5, ptsProd: 8, tovPct: 12, orebPct: 14, drebPct: 26, trebPct: 38 });
  const disruptorPlayer = player('disruptor-player', { usagePct: 18, astPct: 10, ptsProd: 10, tovPct: 15, orebPct: 4, drebPct: 14, trebPct: 18, interceptsPer36: 3.2, fprPer36: 1.0 });
  // Complète les features non renseignées pour ne pas fausser les percentiles (valeurs neutres)
  const squad = [hubPlayer, rebounderPlayer, disruptorPlayer].map(p => player(p.playerId, {
    usagePct: p.advancedAgg.usagePct ?? 15,
    astPct: p.advancedAgg.astPct ?? 10,
    ptsProd: p.advancedAgg.ptsProd ?? 10,
    tovPct: p.advancedAgg.tovPct ?? 12,
    orebPct: p.advancedAgg.orebPct ?? 6,
    drebPct: p.advancedAgg.drebPct ?? 16,
    trebPct: p.advancedAgg.trebPct ?? 20,
    interceptsPer36: p.totals.intercepts ? (p.totals.intercepts * 36) / p.minutesTotal : 1,
    fprPer36: p.totals.fpr ? (p.totals.fpr * 36) / p.minutesTotal : 3,
  }));

  it('fait ressortir le profil attendu en tête pour chaque joueur synthétique (sens des poids)', () => {
    const reports = computeArchetypesForSquad(squad, TEST_PROFILES, []);

    const scoresOf = (playerId: string) => {
      const report = reports.find(r => r.playerId === playerId)!;
      return Object.fromEntries(report.archetypes.map(a => [a.profileKey, a.score]));
    };

    const hubScores = scoresOf('hub-player');
    expect(hubScores.hub!).toBeGreaterThan(hubScores.rebounder!);
    expect(hubScores.hub!).toBeGreaterThan(hubScores.disruptor!);

    const rebounderScores = scoresOf('rebounder-player');
    expect(rebounderScores.rebounder!).toBeGreaterThan(rebounderScores.hub!);
    expect(rebounderScores.rebounder!).toBeGreaterThan(rebounderScores.disruptor!);

    const disruptorScores = scoresOf('disruptor-player');
    expect(disruptorScores.disruptor!).toBeGreaterThan(disruptorScores.hub!);
    expect(disruptorScores.disruptor!).toBeGreaterThan(disruptorScores.rebounder!);
  });

  it('est déterministe : mêmes stats en entrée -> mêmes résultats en sortie', () => {
    const reportsA = computeArchetypesForSquad(squad, TEST_PROFILES, []);
    const reportsB = computeArchetypesForSquad(squad, TEST_PROFILES, []);
    expect(reportsA).toEqual(reportsB);
  });

  it("ne plante pas avec un effectif d'un seul joueur (percentile neutre à 50 partout)", () => {
    // Toutes les features référencées par TEST_PROFILES doivent être renseignées (non-null)
    // pour que les 3 profils soient calculables même sans effectif de comparaison.
    const soloPlayer = player('solo', {
      usagePct: 20, astPct: 20, ptsProd: 20, tovPct: 20,
      orebPct: 20, drebPct: 20, trebPct: 20,
      interceptsPer36: 2, fprPer36: 2,
    });
    const reports = computeArchetypesForSquad([soloPlayer], TEST_PROFILES, []);
    expect(reports).toHaveLength(1);
    for (const archetype of reports[0]!.archetypes) {
      expect(archetype.computable).toBe(true);
      expect(archetype.score).toBe(50);
    }
  });

  it('exclut du calcul les profils/dimensions au statut "planned" (catalogue complet Phase 1)', () => {
    const reports = computeArchetypesForSquad(squad, PROFILES_V1);
    const plannedNotPresent = reports.every(r => r.dimensions.every(d => d.dimensionKey !== 'vitesse_jeu'));
    expect(plannedNotPresent).toBe(true);
  });

  it('exclut du pool de percentile les joueurs sous le seuil minimum de matchs (pas seulement leur propre score)', () => {
    const outlierWithFewMatches: RawPlayerStats = {
      ...player('one-game-wonder', {
        usagePct: 99, astPct: 99, ptsProd: 99, tovPct: 1,
        orebPct: 99, drebPct: 99, trebPct: 99, interceptsPer36: 99, fprPer36: 0,
      }),
      matches: 2, // sous MIN_MATCHES_HARD_CUTOFF (3)
    };

    const withoutOutlier = computeArchetypesForSquad(squad, TEST_PROFILES, []);
    const withOutlier = computeArchetypesForSquad([...squad, outlierWithFewMatches], TEST_PROFILES, []);

    // Le joueur à échantillon insuffisant n'apparaît pas du tout dans le rapport...
    expect(withOutlier.find(r => r.playerId === 'one-game-wonder')).toBeUndefined();

    // ...et ses valeurs extrêmes ne polluent pas le percentile des autres — le score du hub sur
    // son propre profil doit être identique, qu'il soit inclus ou non dans l'effectif comparé.
    const hubScoreWithout = withoutOutlier.find(r => r.playerId === 'hub-player')!.archetypes.find(a => a.profileKey === 'hub')!.score;
    const hubScoreWith = withOutlier.find(r => r.playerId === 'hub-player')!.archetypes.find(a => a.profileKey === 'hub')!.score;
    expect(hubScoreWith).toBe(hubScoreWithout);
  });
});
