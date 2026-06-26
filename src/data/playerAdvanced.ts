import type { MatchStat, TeamMatchStat } from './types';

export interface PlayerAdvancedStats {
  usagePct: number | null;    // % Usage
  offRating: number | null;   // Offensive Rating (pts × 100 / indPoss)
  efgPct: number | null;      // eFG% = (fg2m + 1.5×fg3m) / fga
  ftRate: number | null;      // FT Rate = fta / fga
  bpPerPoss: number | null;   // BP/poss = bp / indPoss (ratio décimal)
  astPct: number | null;      // %PD = pd / (teamFgm - fgm)
  tovPct: number | null;      // %BP = bp / indPoss × 100
  trebPct: number | null;     // %TREB = (ro+rd) / (team+opp rebonds)
  drebPct: number | null;     // %DREB = rd / (team_rd + opp_ro)
  orebPct: number | null;     // %OREB = ro / (team_ro + opp_rd)
  ptsProd: number | null;     // Points générés = pts + pd × (team_pts_fg / teamFgm)
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcPlayerAdvanced(s: MatchStat, team?: TeamMatchStat | null): PlayerAdvancedStats {
  const fga     = s.fg2a + s.fg3a;
  const fgm     = s.fg2m + s.fg3m;
  const indPoss = fga + 0.44 * s.fta + s.bp;

  const efgPct   = fga > 0      ? r1((fgm + 0.5 * s.fg3m) / fga * 100) : null;
  const ftRate   = fga > 0      ? r2(s.fta / fga)                        : null;
  const bpPerPoss = indPoss > 0 ? r2(s.bp / indPoss)                    : null;
  const offRating = indPoss > 0 ? r1(s.pts * 100 / indPoss)             : null;
  const tovPct    = indPoss > 0 ? r1(s.bp / indPoss * 100)              : null;

  if (!team) {
    return { usagePct: null, offRating, efgPct, ftRate, bpPerPoss, astPct: null, tovPct, trebPct: null, drebPct: null, orebPct: null, ptsProd: null };
  }

  const teamFga  = team.fg2a + team.fg3a;
  const teamFgm  = team.fg2m + team.fg3m;
  const teamPoss = teamFga + 0.44 * team.fta + team.bp;

  const usagePct = teamPoss > 0           ? r1(indPoss / teamPoss * 100)                          : null;
  const astPct   = (teamFgm - fgm) > 0   ? r1(s.pd / (teamFgm - fgm) * 100)                     : null;
  const trebPct  = (team.ro + team.rd + team.opp_ro + team.opp_rd) > 0
    ? r1((s.ro + s.rd) / (team.ro + team.rd + team.opp_ro + team.opp_rd) * 100) : null;
  const drebPct  = (team.rd + team.opp_ro) > 0 ? r1(s.rd / (team.rd + team.opp_ro) * 100) : null;
  const orebPct  = (team.ro + team.opp_rd) > 0 ? r1(s.ro / (team.ro + team.opp_rd) * 100) : null;

  // Points générés = pts + pd × (fg2m×2 + fg3m×3) / teamFgm
  const teamPtsFg = team.fg2m * 2 + team.fg3m * 3;
  const ptsProd   = teamFgm > 0 ? r1(s.pts + s.pd * teamPtsFg / teamFgm) : null;

  return { usagePct, offRating, efgPct, ftRate, bpPerPoss, astPct, tovPct, trebPct, drebPct, orebPct, ptsProd };
}
