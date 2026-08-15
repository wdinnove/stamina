import { describe, it, expect } from 'vitest';
import { aggregateRawStats } from './statsAggregator';
import { getFeature } from './featureRegistry';
import { makeMatchStat, makeTeamMatchStat } from './testFixtures';

describe('aggregateRawStats', () => {
  it('agrège en sommant les composants bruts avant de calculer le ratio (pas une moyenne de ratios par match)', () => {
    // Match titulaire (35 min) : 10/15 à 2pts (eFG% = 66.7%)
    const starterMatch = makeMatchStat({ playerId: 'p1', min: 35, fg2m: 10, fg2a: 15 });
    // Match garbage-time (2 min) : 0/5 à 2pts (eFG% = 0%)
    const garbageTimeMatch = makeMatchStat({ playerId: 'p1', min: 2, fg2m: 0, fg2a: 5 });

    const [raw] = aggregateRawStats([starterMatch, garbageTimeMatch], new Map(), 'saison-test');

    // Moyenne naïve des deux ratios par match : (66.7 + 0) / 2 = 33.3
    const naiveAverage = (66.7 + 0) / 2;
    // Sommation puis ratio unique : (10 + 0) / (15 + 5) * 100 = 50
    expect(raw.advancedAgg.efgPct).toBeCloseTo(50, 0);
    expect(raw.advancedAgg.efgPct).not.toBeCloseTo(naiveAverage, 0);
  });

  it('calcule les volumes per36 à partir des totaux, pas d\'une moyenne des per36 de chaque match', () => {
    const m1 = makeMatchStat({ playerId: 'p1', min: 30, ct: 3 });
    const m2 = makeMatchStat({ playerId: 'p1', min: 10, ct: 1 });
    const [raw] = aggregateRawStats([m1, m2], new Map(), 'saison-test');
    // (3+1) contres / (30+10) min * 36 = 3.6
    expect(getFeature('ctPer36')!.get(raw)).toBeCloseTo(3.6, 5);
  });

  it('ne calcule les indicateurs dépendant de l\'équipe (usage%, %PD, %REB...) que sur les matchs ayant des stats collectives correspondantes', () => {
    const teamStatsByMatchId = new Map();
    // Un match "normal" avec ses stats collectives : usage% cohérent sur ce seul match.
    const m1 = makeMatchStat({ playerId: 'p1', matchId: 'm1', min: 20, fg2m: 4, fg2a: 8, fta: 2, bp: 1 });
    teamStatsByMatchId.set('m1', makeTeamMatchStat({ matchId: 'm1', fg2a: 40, fg3a: 15, fta: 14, bp: 12 }));
    // Un second match dont les stats individuelles ont été importées SANS les stats collectives
    // associées (pas de ligne dans teamStatsByMatchId) : gros volume de tirs qui, avant le fix,
    // gonflait indPoss (numérateur) sans son dénominateur équipe (teamPoss).
    const m2 = makeMatchStat({ playerId: 'p1', matchId: 'm2', min: 20, fg2m: 10, fg2a: 20, fta: 10, bp: 5 });

    const [withBothMatches] = aggregateRawStats([m1, m2], teamStatsByMatchId, 'saison-test');
    const [withOnlyMatchedMatch] = aggregateRawStats([m1], teamStatsByMatchId, 'saison-test');

    // usagePct doit être identique qu'on inclue ou non le match sans stats collectives —
    // puisqu'il ne doit de toute façon pas contribuer au calcul.
    expect(withBothMatches.advancedAgg.usagePct).toBeCloseTo(withOnlyMatchedMatch.advancedAgg.usagePct!, 5);
  });

  it('applique réellement la correction usage% par les minutes quand Σmin de l\'effectif est plausible (chemin corrigé exercé, pas juste le repli)', () => {
    const teamStatsByMatchId = new Map();
    // 2 matchs, chacun avec p1 + 4 coéquipiers, Σmin par match dans la fourchette plausible
    // (~150-300) — contrairement au test de scoping ci-dessus qui reste sous le seuil et
    // n'exerce donc jamais la formule corrigée elle-même.
    const teammates = (matchId: string, eachMin: number) =>
      Array.from({ length: 4 }, (_, i) => makeMatchStat({ playerId: `mate-${matchId}-${i}`, matchId, min: eachMin }));

    const p1m1 = makeMatchStat({ playerId: 'p1', matchId: 'm1', min: 25, fg2m: 4, fg2a: 8, fta: 2, bp: 1 });
    const p1m2 = makeMatchStat({ playerId: 'p1', matchId: 'm2', min: 22, fg2m: 3, fg2a: 7, fta: 1, bp: 1 });
    teamStatsByMatchId.set('m1', makeTeamMatchStat({ matchId: 'm1', fg2a: 40, fg3a: 15, fta: 14, bp: 12 }));
    teamStatsByMatchId.set('m2', makeTeamMatchStat({ matchId: 'm2', fg2a: 38, fg3a: 14, fta: 12, bp: 10 }));

    const allMatchStats = [
      p1m1, ...teammates('m1', 35), // Σmin m1 = 25 + 4×35 = 165
      p1m2, ...teammates('m2', 34), // Σmin m2 = 22 + 4×34 = 158
    ];

    const raw = aggregateRawStats(allMatchStats, teamStatsByMatchId, 'saison-test').find(r => r.playerId === 'p1')!;

    // indPoss = 15 + 0.44×3 + 2 = 18.32 ; teamPoss = 107 + 0.44×26 + 22 = 140.44
    // Σmin équipe (m1+m2) = 323, minutes p1 = 47 -> corrigé : 18.32×(323/5)/(47×140.44)×100 ≈ 17.9
    // Non corrigé (sans la part de minutes) : 18.32/140.44×100 ≈ 13.0 — nettement différent.
    expect(raw.advancedAgg.usagePct).toBeCloseTo(17.9, 1);
    expect(raw.advancedAgg.usagePct).not.toBeCloseTo(13.0, 1);
  });

  it('groupe correctement par joueur au sein d\'un effectif complet', () => {
    const p1 = makeMatchStat({ playerId: 'p1', min: 20 });
    const p2a = makeMatchStat({ playerId: 'p2', min: 15 });
    const p2b = makeMatchStat({ playerId: 'p2', min: 25 });
    const raws = aggregateRawStats([p1, p2a, p2b], new Map(), 'saison-test');

    const raw1 = raws.find(r => r.playerId === 'p1')!;
    const raw2 = raws.find(r => r.playerId === 'p2')!;
    expect(raw1.matches).toBe(1);
    expect(raw2.matches).toBe(2);
    expect(raw2.minutesTotal).toBe(40);
  });
});
