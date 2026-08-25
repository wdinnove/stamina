import { describe, it, expect } from 'vitest';
import { evaluateObjectiveWindows } from './objectiveStatus';
import type { CrossScope, TeamCrossData } from '../data/crossAnalysis';
import type { Objective, TeamMatchStat } from '../data/types';

// Saison close (antérieure à aujourd'hui) pour que la borne haute des fenêtres soit déterministe.
const SEASON_START = '2026-01-01';
const SEASON_END   = '2026-06-30';

const teamMatch = (date: string, o: Partial<TeamMatchStat> = {}): TeamMatchStat => ({
  id: `t-${date}`, matchId: `m-${date}`, date, opponent: 'X', homeAway: 'home', kind: 'official', result: 'win',
  scoreUs: 0, scoreThem: 0,
  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  ro: 0, rd: 0, rt: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
  possessions: 0,
  offRating: null, defRating: null, efgPct: null, ftRate: null, toPct: null, orebPct: null, drebPct: null,
  opp_fg2m: 0, opp_fg2a: 0, opp_fg3m: 0, opp_fg3a: 0, opp_ftm: 0, opp_fta: 0,
  opp_ro: 0, opp_rd: 0, opp_rt: 0, opp_pd: 0, opp_ct: 0, opp_intercepts: 0, opp_bp: 0, opp_fte: 0, opp_fpr: 0,
  opp_possessions: null, opp_efgPct: null, opp_toPct: null, opp_orebPct: null,
  ...o,
});

const teamScope = (teamMatchStats: TeamMatchStat[]): CrossScope => ({
  team: { players: [], teamMatchStats } as TeamCrossData,
});

const objective = (indicatorKey: string, thresholdValue: number): Objective => ({
  id: 'o1', teamId: 't1', indicatorKey, importance: 'normal',
  comparator: 'gte', thresholdValue, active: true,
});

const windows = (o: Objective, scope: CrossScope) =>
  evaluateObjectiveWindows(o, scope, SEASON_START, SEASON_END).windows;

describe('objectif d\'ÉQUIPE sur un ratio — ratio de sommes, pas moyenne des pourcentages', () => {
  /**
   * Cas de l'audit. Trois matchs à 3 points : 1/1 (100 %), 2/10 (20 %), 3/12 (25 %).
   * Moyenne des pourcentages : 48,3 % → l'objectif « ≥ 32 % » ressortait ATTEINT.
   * Ratio des sommes         : 6/23 = 26,1 % → il ne l'est pas. Le verdict s'inverse.
   */
  const scope = teamScope([
    teamMatch('2026-01-10', { fg3m: 1, fg3a: 1 }),
    teamMatch('2026-01-17', { fg3m: 2, fg3a: 10 }),
    teamMatch('2026-01-24', { fg3m: 3, fg3a: 12 }),
  ]);

  it('la fenêtre saison somme numérateur et dénominateur', () => {
    const [, , saison] = windows(objective('team_fg3Pct', 32), scope);
    expect(saison.value).toBeCloseTo(26.1, 1);
    expect(saison.met).toBe(false);
  });

  it('la fenêtre « 3 derniers matchs » couvre bien 3 matchs, pas 3 journées', () => {
    const [, trois] = windows(objective('team_fg3Pct', 32), scope);
    expect(trois.value).toBeCloseTo(26.1, 1);
    expect(trois.met).toBe(false);
  });

  it('la fenêtre « dernier match » ne retient que le dernier', () => {
    const [dernier] = windows(objective('team_fg3Pct', 32), scope);
    expect(dernier.value).toBeCloseTo(25, 1);
    expect(dernier.met).toBe(false);
  });

  it('un seuil réellement franchi reste atteint', () => {
    const [, , saison] = windows(objective('team_fg3Pct', 25), scope);
    expect(saison.met).toBe(true);
  });
});

describe('objectif d\'ÉQUIPE sur un volume — moyenne sur les MATCHS', () => {
  it('compte deux matchs joués le même jour comme deux observations', () => {
    // Plateau le 10 janvier. Par date : ((50 + 70) / 2 + 90) / 2 = 75. Par match : 70.
    const scope = teamScope([
      teamMatch('2026-01-10', { scoreUs: 50 }),
      teamMatch('2026-01-10', { scoreUs: 70 }),
      teamMatch('2026-01-17', { scoreUs: 90 }),
    ]);
    const [, , saison] = windows(objective('team_ptsFor', 80), scope);
    expect(saison.value).toBe(70);
    expect(saison.met).toBe(false);
  });

  it('« 3 derniers matchs » se compte en matchs même avec un plateau', () => {
    // 4 matchs dont deux le même jour : les 3 derniers sont 70, 90, 110 → 90.
    const scope = teamScope([
      teamMatch('2026-01-10', { scoreUs: 50 }),
      teamMatch('2026-01-10', { scoreUs: 70 }),
      teamMatch('2026-01-17', { scoreUs: 90 }),
      teamMatch('2026-01-24', { scoreUs: 110 }),
    ]);
    const [, trois] = windows(objective('team_ptsFor', 80), scope);
    expect(trois.value).toBe(90);
    expect(trois.met).toBe(true);
  });
});

describe('absence de données — pas de verdict plutôt qu\'un faux « non atteint »', () => {
  it('renvoie met = null quand aucun match ne renseigne le dénominateur', () => {
    const scope = teamScope([teamMatch('2026-01-10', { fg3m: 0, fg3a: 0 })]);
    for (const w of windows(objective('team_fg3Pct', 32), scope)) {
      expect(w.value).toBeNull();
      expect(w.met).toBeNull();
    }
  });

  it('renvoie met = null quand la saison n\'a aucun match', () => {
    for (const w of windows(objective('team_fg3Pct', 32), teamScope([]))) {
      expect(w.met).toBeNull();
    }
  });
});
