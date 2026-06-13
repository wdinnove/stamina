import type { MatchStat, TeamMatchStat } from '../types';

export const matchStats: MatchStat[] = [
  // M14 vs Antibes (défaite 43-68)
  { id: 'ms-m14-p1', playerId: 'p1', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: true,  min: 27,   pts: 9,  fg2m: 1, fg2a: 5, fg3m: 2, fg3a: 6, ftm: 1, fta: 3, ro: 0, rd: 2, pd: 5, ct: 1, intercepts:4, bp: 4, fte: 4, fpr: 1, eval: 15, plusMinus: -18 },
  { id: 'ms-m14-p2', playerId: 'p2', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: true,  min: 25,   pts: 5,  fg2m: 0, fg2a: 1, fg3m: 1, fg3a: 3, ftm: 2, fta: 4, ro: 0, rd: 2, pd: 4, ct: 2, intercepts:4, bp: 8, fte: 2, fpr: 3, eval: 9,  plusMinus: -14 },
  { id: 'ms-m14-p4', playerId: 'p4', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: true,  min: 20,   pts: 2,  fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 2, fta: 2, ro: 0, rd: 3, pd: 0, ct: 3, intercepts:1, bp: 7, fte: 2, fpr: 0, eval: 1,  plusMinus: -18 },
  { id: 'ms-m14-p5', playerId: 'p5', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: false, min: 16,   pts: 0,  fg2m: 0, fg2a: 1, fg3m: 0, fg3a: 0, ftm: 0, fta: 2, ro: 0, rd: 0, pd: 1, ct: 1, intercepts:1, bp: 1, fte: 1, fpr: 0, eval: 2,  plusMinus: -5  },
  { id: 'ms-m14-p6', playerId: 'p6', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: false, min: 17,   pts: 8,  fg2m: 2, fg2a: 3, fg3m: 1, fg3a: 3, ftm: 1, fta: 2, ro: 0, rd: 0, pd: 0, ct: 3, intercepts:1, bp: 8, fte: 3, fpr: 1, eval: 5,  plusMinus: -1  },
  { id: 'ms-m14-p7', playerId: 'p7', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: false, min: 17,   pts: 6,  fg2m: 1, fg2a: 4, fg3m: 1, fg3a: 2, ftm: 0, fta: 1, ro: 0, rd: 1, pd: 2, ct: 4, intercepts:2, bp: 3, fte: 2, fpr: 1, eval: 7,  plusMinus: -14 },
  { id: 'ms-m14-p8', playerId: 'p8', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: true,  min: 19.5, pts: 7,  fg2m: 3, fg2a: 3, fg3m: 0, fg3a: 0, ftm: 1, fta: 2, ro: 1, rd: 0, pd: 3, ct: 1, intercepts:3, bp: 9, fte: 3, fpr: 1, eval: 6,  plusMinus: -19 },
  { id: 'ms-m14-p9', playerId: 'p9', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', competition: 'NF2', result: 'loss', scoreUs: 43, scoreThem: 68, starter: true,  min: 26.5, pts: 0,  fg2m: 0, fg2a: 3, fg3m: 0, fg3a: 3, ftm: 0, fta: 1, ro: 2, rd: 6, pd: 2, ct: 3, intercepts:0, bp: 4, fte: 2, fpr: 0, eval: 11, plusMinus: -24 },
  // M13 vs Rouen (victoire 72-58)
  { id: 'ms-m13-p1', playerId: 'p1', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: true,  min: 30,   pts: 16, fg2m: 4, fg2a: 7, fg3m: 2, fg3a: 4, ftm: 2, fta: 2, ro: 1, rd: 3, pd: 6, ct: 2, intercepts:3, bp: 2, fte: 3, fpr: 3, eval: 22, plusMinus: 14  },
  { id: 'ms-m13-p2', playerId: 'p2', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: true,  min: 28,   pts: 11, fg2m: 2, fg2a: 4, fg3m: 2, fg3a: 5, ftm: 1, fta: 2, ro: 0, rd: 2, pd: 8, ct: 1, intercepts:2, bp: 3, fte: 2, fpr: 2, eval: 18, plusMinus: 11  },
  { id: 'ms-m13-p4', playerId: 'p4', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: true,  min: 25,   pts: 8,  fg2m: 3, fg2a: 5, fg3m: 0, fg3a: 0, ftm: 2, fta: 4, ro: 3, rd: 5, pd: 1, ct: 4, intercepts:2, bp: 3, fte: 3, fpr: 2, eval: 14, plusMinus: 10  },
  { id: 'ms-m13-p5', playerId: 'p5', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: false, min: 18,   pts: 6,  fg2m: 1, fg2a: 2, fg3m: 1, fg3a: 3, ftm: 1, fta: 2, ro: 0, rd: 1, pd: 2, ct: 0, intercepts:2, bp: 1, fte: 1, fpr: 1, eval: 9,  plusMinus: 8   },
  { id: 'ms-m13-p6', playerId: 'p6', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: false, min: 15,   pts: 9,  fg2m: 2, fg2a: 3, fg3m: 1, fg3a: 2, ftm: 2, fta: 2, ro: 1, rd: 2, pd: 1, ct: 2, intercepts:1, bp: 2, fte: 2, fpr: 2, eval: 12, plusMinus: 5   },
  { id: 'ms-m13-p7', playerId: 'p7', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: true,  min: 26,   pts: 12, fg2m: 2, fg2a: 4, fg3m: 2, fg3a: 4, ftm: 2, fta: 2, ro: 0, rd: 2, pd: 5, ct: 3, intercepts:2, bp: 2, fte: 2, fpr: 2, eval: 17, plusMinus: 16  },
  { id: 'ms-m13-p8', playerId: 'p8', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: true,  min: 22,   pts: 7,  fg2m: 2, fg2a: 3, fg3m: 0, fg3a: 2, ftm: 3, fta: 4, ro: 0, rd: 1, pd: 3, ct: 0, intercepts:2, bp: 2, fte: 3, fpr: 3, eval: 9,  plusMinus: 9   },
  { id: 'ms-m13-p9', playerId: 'p9', date: '2026-01-04', opponent: 'Rouen',   homeAway: 'away', competition: 'NF2', result: 'win',  scoreUs: 72, scoreThem: 58, starter: false, min: 16,   pts: 3,  fg2m: 1, fg2a: 2, fg3m: 0, fg3a: 1, ftm: 1, fta: 2, ro: 2, rd: 4, pd: 1, ct: 2, intercepts:0, bp: 1, fte: 2, fpr: 1, eval: 7,  plusMinus: 6   },
  // M12 vs Grenoble (victoire 65-50)
  { id: 'ms-m12-p1', playerId: 'p1', date: '2025-12-21', opponent: 'Grenoble',homeAway: 'home', competition: 'NF2', result: 'win',  scoreUs: 65, scoreThem: 50, starter: true,  min: 28,   pts: 14, fg2m: 3, fg2a: 6, fg3m: 2, fg3a: 5, ftm: 2, fta: 3, ro: 0, rd: 4, pd: 7, ct: 1, intercepts:2, bp: 3, fte: 2, fpr: 2, eval: 20, plusMinus: 12  },
  { id: 'ms-m12-p2', playerId: 'p2', date: '2025-12-21', opponent: 'Grenoble',homeAway: 'home', competition: 'NF2', result: 'win',  scoreUs: 65, scoreThem: 50, starter: true,  min: 30,   pts: 13, fg2m: 2, fg2a: 5, fg3m: 2, fg3a: 4, ftm: 3, fta: 4, ro: 0, rd: 3, pd: 9, ct: 0, intercepts:3, bp: 2, fte: 1, fpr: 3, eval: 20, plusMinus: 15  },
  { id: 'ms-m12-p7', playerId: 'p7', date: '2025-12-21', opponent: 'Grenoble',homeAway: 'home', competition: 'NF2', result: 'win',  scoreUs: 65, scoreThem: 50, starter: true,  min: 24,   pts: 10, fg2m: 1, fg2a: 3, fg3m: 2, fg3a: 4, ftm: 2, fta: 2, ro: 0, rd: 2, pd: 4, ct: 2, intercepts:3, bp: 1, fte: 1, fpr: 2, eval: 15, plusMinus: 10  },
  { id: 'ms-m12-p8', playerId: 'p8', date: '2025-12-21', opponent: 'Grenoble',homeAway: 'home', competition: 'NF2', result: 'win',  scoreUs: 65, scoreThem: 50, starter: true,  min: 20,   pts: 8,  fg2m: 3, fg2a: 4, fg3m: 0, fg3a: 1, ftm: 2, fta: 3, ro: 1, rd: 2, pd: 2, ct: 0, intercepts:1, bp: 2, fte: 2, fpr: 2, eval: 10, plusMinus: 8   },
  { id: 'ms-m12-p9', playerId: 'p9', date: '2025-12-21', opponent: 'Grenoble',homeAway: 'home', competition: 'NF2', result: 'win',  scoreUs: 65, scoreThem: 50, starter: true,  min: 22,   pts: 6,  fg2m: 2, fg2a: 4, fg3m: 0, fg3a: 1, ftm: 2, fta: 2, ro: 3, rd: 7, pd: 2, ct: 3, intercepts:0, bp: 2, fte: 3, fpr: 1, eval: 12, plusMinus: 11  },
];

export const teamMatchStats: TeamMatchStat[] = [
  {
    id: 'tm-m14', date: '2026-01-11', opponent: 'Antibes', homeAway: 'home', result: 'loss', scoreUs: 43, scoreThem: 68,
    fg2m: 10, fg2a: 30, fg3m: 5, fg3a: 21, ftm: 8,  fta: 15,
    ro: 15, rd: 9,  rt: 24, pd: 13, ct: 11, intercepts:16, bp: 43, fte: 17,
    possessions: 43, offRating: 100.0, defRating: 158.1, efgPct: 34.3, ftRate: 0.35, toPct: 25.0, orebPct: 25.0, drebPct: 37.5,
    opp_fg2m: 19, opp_fg2a: 34, opp_fg3m: 6,  opp_fg3a: 20, opp_ftm: 12, opp_fta: 20,
    opp_ro: 27, opp_rd: 13, opp_rt: 40, opp_pd: 16, opp_ct: 8,  opp_intercepts: 10, opp_bp: 28,
    opp_possessions: 68, opp_efgPct: 51.5, opp_toPct: 11.8, opp_orebPct: 46.4,
  },
  {
    id: 'tm-m13', date: '2026-01-04', opponent: 'Rouen', homeAway: 'away', result: 'win', scoreUs: 72, scoreThem: 58,
    fg2m: 20, fg2a: 38, fg3m: 9,  fg3a: 22, ftm: 14, fta: 20,
    ro: 12, rd: 22, rt: 34, pd: 28, ct: 12, intercepts:16, bp: 20, fte: 16,
    possessions: 62, offRating: 116.1, defRating: 93.5, efgPct: 52.7, ftRate: 0.53, toPct: 14.5, orebPct: 35.3, drebPct: 68.8,
    opp_fg2m: 16, opp_fg2a: 32, opp_fg3m: 5,  opp_fg3a: 18, opp_ftm: 11, opp_fta: 15,
    opp_ro: 10, opp_rd: 19, opp_rt: 29, opp_pd: 13, opp_ct: 9,  opp_intercepts: 8,  opp_bp: 18,
    opp_possessions: 62, opp_efgPct: 44.1, opp_toPct: 18.6, opp_orebPct: 34.5,
  },
  {
    id: 'tm-m12', date: '2025-12-21', opponent: 'Grenoble', homeAway: 'home', result: 'win', scoreUs: 65, scoreThem: 50,
    fg2m: 17, fg2a: 34, fg3m: 7,  fg3a: 19, ftm: 13, fta: 18,
    ro: 10, rd: 18, rt: 28, pd: 22, ct: 8,  intercepts:12, bp: 17, fte: 14,
    possessions: 57, offRating: 114.0, defRating: 87.7, efgPct: 50.0, ftRate: 0.53, toPct: 17.5, orebPct: 28.6, drebPct: 66.7,
    opp_fg2m: 14, opp_fg2a: 31, opp_fg3m: 4,  opp_fg3a: 17, opp_ftm: 10, opp_fta: 14,
    opp_ro: 9,  opp_rd: 16, opp_rt: 25, opp_pd: 10, opp_ct: 11, opp_intercepts: 7,  opp_bp: 15,
    opp_possessions: 57, opp_efgPct: 41.9, opp_toPct: 21.1, opp_orebPct: 36.0,
  },
];
