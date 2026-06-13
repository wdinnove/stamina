import { supabase } from './client';
import { playerSeasonAvg as computePlayerSeasonAvg } from '../data/helpers';
import type { MatchStat, TeamMatchStat, PlayerSeasonAvg } from '../data/types';

export interface ListMatchStatsFilters {
  playerId?: string;
  from?: string;
  to?: string;
  result?: 'win' | 'loss';
}

export interface ListTeamMatchStatsFilters {
  from?: string;
  to?: string;
  result?: 'win' | 'loss';
}

export const statsApi = {
  // ─── Stats individuelles ──────────────────────────────────────────────────

  async listMatchStats(filters: ListMatchStatsFilters = {}): Promise<MatchStat[]> {
    let query = supabase.from('match_stats').select('*');
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.from)     query = query.gte('date', filters.from);
    if (filters.to)       query = query.lte('date', filters.to);
    if (filters.result)   query = query.eq('result', filters.result);
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  async getPlayerStats(playerId: string): Promise<MatchStat[]> {
    const { data, error } = await supabase
      .from('match_stats')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatchStat);
  },

  // Calculé côté client depuis les match_stats — identique à helpers.ts
  async getPlayerSeasonAvg(playerId: string): Promise<PlayerSeasonAvg> {
    return computePlayerSeasonAvg(playerId);
  },

  async createMatchStat(input: Omit<MatchStat, 'id' | 'pts'>): Promise<MatchStat> {
    // pts est une colonne GENERATED ALWAYS AS (fg2m*2 + fg3m*3 + ftm) côté DB
    const { data, error } = await supabase
      .from('match_stats')
      .insert({
        player_id:   input.playerId,
        date:        input.date,
        opponent:    input.opponent,
        home_away:   input.homeAway,
        competition: input.competition,
        result:      input.result,
        score_us:    input.scoreUs,
        score_them:  input.scoreThem,
        starter:     input.starter,
        min:         input.min,
        fg2m:        input.fg2m,
        fg2a:        input.fg2a,
        fg3m:        input.fg3m,
        fg3a:        input.fg3a,
        ftm:         input.ftm,
        fta:         input.fta,
        ro:          input.ro,
        rd:          input.rd,
        pd:          input.pd,
        ct:          input.ct,
        intercepts:  input.intercepts,
        bp:          input.bp,
        fte:         input.fte,
        fpr:         input.fpr,
        eval:        input.eval,
        plus_minus:  input.plusMinus,
      })
      .select()
      .single();
    if (error) throw error;
    return toMatchStat(data);
  },

  // ─── Stats collectives ────────────────────────────────────────────────────

  async listTeamMatchStats(filters: ListTeamMatchStatsFilters = {}): Promise<TeamMatchStat[]> {
    let query = supabase.from('team_match_stats').select('*');
    if (filters.from)   query = query.gte('date', filters.from);
    if (filters.to)     query = query.lte('date', filters.to);
    if (filters.result) query = query.eq('result', filters.result);
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toTeamMatchStat);
  },

  async getTeamMatchStatByDate(date: string, opponent: string): Promise<TeamMatchStat | null> {
    const { data, error } = await supabase
      .from('team_match_stats')
      .select('*')
      .eq('date', date)
      .eq('opponent', opponent)
      .maybeSingle();
    if (error) throw error;
    return data ? toTeamMatchStat(data) : null;
  },
};

// ─── Mappers ─────────────────────────────────────────────────────────────────

function toMatchStat(row: Record<string, unknown>): MatchStat {
  return {
    id:          row.id          as string,
    playerId:    row.player_id   as string,
    date:        row.date        as string,
    opponent:    row.opponent    as string,
    homeAway:    row.home_away   as MatchStat['homeAway'],
    competition: row.competition as string,
    result:      row.result      as MatchStat['result'],
    scoreUs:     row.score_us    as number,
    scoreThem:   row.score_them  as number,
    starter:     row.starter     as boolean,
    min:         row.min         as number,
    pts:         row.pts         as number,
    fg2m:        row.fg2m        as number,
    fg2a:        row.fg2a        as number,
    fg3m:        row.fg3m        as number,
    fg3a:        row.fg3a        as number,
    ftm:         row.ftm         as number,
    fta:         row.fta         as number,
    ro:          row.ro          as number,
    rd:          row.rd          as number,
    pd:          row.pd          as number,
    ct:          row.ct          as number,
    intercepts:  row.intercepts  as number,
    bp:          row.bp          as number,
    fte:         row.fte         as number,
    fpr:         row.fpr         as number,
    eval:        row.eval        as number,
    plusMinus:   row.plus_minus  as number,
  };
}

function toTeamMatchStat(row: Record<string, unknown>): TeamMatchStat {
  return {
    id:            row.id              as string,
    date:          row.date            as string,
    opponent:      row.opponent        as string,
    homeAway:      row.home_away       as TeamMatchStat['homeAway'],
    result:        row.result          as TeamMatchStat['result'],
    scoreUs:       row.score_us        as number,
    scoreThem:     row.score_them      as number,
    fg2m:          row.fg2m            as number,
    fg2a:          row.fg2a            as number,
    fg3m:          row.fg3m            as number,
    fg3a:          row.fg3a            as number,
    ftm:           row.ftm             as number,
    fta:           row.fta             as number,
    ro:            row.ro              as number,
    rd:            row.rd              as number,
    rt:            row.rt              as number,
    pd:            row.pd              as number,
    ct:            row.ct              as number,
    intercepts:    row.intercepts      as number,
    bp:            row.bp              as number,
    fte:           row.fte             as number,
    possessions:   row.possessions     as number,
    offRating:     row.off_rating      as number,
    defRating:     row.def_rating      as number,
    efgPct:        row.efg_pct         as number,
    ftRate:        row.ft_rate         as number,
    toPct:         row.to_pct          as number,
    orebPct:       row.oreb_pct        as number,
    drebPct:       row.dreb_pct        as number,
    opp_fg2m:      row.opp_fg2m        as number,
    opp_fg2a:      row.opp_fg2a        as number,
    opp_fg3m:      row.opp_fg3m        as number,
    opp_fg3a:      row.opp_fg3a        as number,
    opp_ftm:       row.opp_ftm         as number,
    opp_fta:       row.opp_fta         as number,
    opp_ro:        row.opp_ro          as number,
    opp_rd:        row.opp_rd          as number,
    opp_rt:        row.opp_rt          as number,
    opp_pd:        row.opp_pd          as number,
    opp_ct:        row.opp_ct          as number,
    opp_intercepts: row.opp_intercepts as number,
    opp_bp:        row.opp_bp          as number,
    opp_possessions: row.opp_possessions as number,
    opp_efgPct:    row.opp_efg_pct     as number,
    opp_toPct:     row.opp_to_pct      as number,
    opp_orebPct:   row.opp_oreb_pct    as number,
  };
}
