import { describe, it, expect } from 'vitest';
import { unattributedLine, sumStatLines } from './boxscoreTotals';
import type { TeamMatchStat } from './types';

const player = (over: Partial<Record<string, number>> = {}) => ({
  pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0, ...over,
});

const team = (over: Partial<TeamMatchStat> = {}) => ({
  id: 't', date: '2026-01-01', opponent: 'X', homeAway: 'home', kind: 'championship',
  result: 'win', scoreUs: 0, scoreThem: 0,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, rt: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  possessions: 0, offRating: null, defRating: null, efgPct: null, ftRate: null,
  toPct: null, orebPct: null, drebPct: null,
  opp_fg2m: 0, opp_fg2a: 0, opp_fg3m: 0, opp_fg3a: 0, opp_ftm: 0, opp_fta: 0,
  opp_ro: 0, opp_rd: 0, opp_rt: 0, opp_pd: 0, opp_ct: 0, opp_intercepts: 0,
  opp_bp: 0, opp_fte: 0, opp_fpr: 0, opp_possessions: null,
  opp_efgPct: null, opp_toPct: null, opp_orebPct: null,
  ...over,
} as TeamMatchStat);

describe('unattributedLine', () => {
  it('ne montre rien quand tout a un auteur', () => {
    const rows = [player({ rd: 4, bp: 2 }), player({ rd: 3 })];
    expect(unattributedLine(team({ rd: 7, bp: 2 }), rows, 'us')).toBeNull();
  });

  it('isole ce que le total d\'équipe compte en plus', () => {
    // Deux rebonds d'équipe et un ballon perdu sur les 24 secondes : sans cette ligne, le
    // boxscore annonce 7 rebonds défensifs là où les four factors en comptent 9.
    const rows = [player({ rd: 4, bp: 2 }), player({ rd: 3 })];
    const line = unattributedLine(team({ rd: 9, bp: 3 }), rows, 'us');
    expect(line).not.toBeNull();
    expect(line!.rd).toBe(2);
    expect(line!.bp).toBe(1);
    expect(line!.ro).toBe(0);
  });

  it('déduit les points de l\'adversaire pointé en anonyme', () => {
    const line = unattributedLine(team({ opp_fg2m: 3, opp_fg2a: 5, opp_fg3m: 1, opp_ftm: 2 }), [], 'them');
    expect(line!.pts).toBe(2 * 3 + 3 + 2);
    expect(line!.fg2a).toBe(5);
  });

  it('borne à zéro un total d\'équipe incohérent plutôt que d\'afficher du négatif', () => {
    // Deux imports mélangés, une feuille corrigée à la main : c'est un problème de données, pas
    // une action de jeu — l'afficher en négatif le ferait passer pour du jeu.
    expect(unattributedLine(team({ rd: 2 }), [player({ rd: 5 })], 'us')).toBeNull();
  });
});

describe('sumStatLines', () => {
  it('additionne colonne par colonne', () => {
    expect(sumStatLines([player({ pts: 4, ro: 1 }), player({ pts: 2, rd: 3 })]))
      .toMatchObject({ pts: 6, ro: 1, rd: 3 });
  });
});
