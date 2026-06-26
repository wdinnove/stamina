import { supabase } from './client';
import type { Match } from '../data/types';

export const matchesApi = {
  async listBySeason(teamId: string, seasonId: string): Promise<Match[]> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatch);
  },

  async getById(id: string): Promise<Match | null> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toMatch(data) : null;
  },

  async create(input: Omit<Match, 'id'>): Promise<Match> {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        team_id:     input.teamId,
        season_id:   input.seasonId,
        game_number: input.gameNumber ?? null,
        date:        input.date,
        opponent:    input.opponent,
        home_away:   input.homeAway,
        competition: input.competition,
        result:      input.result,
        score_us:    input.scoreUs,
        score_them:  input.scoreThem,
      })
      .select()
      .single();
    if (error) throw error;
    return toMatch(data);
  },

  async update(id: string, input: Partial<Omit<Match, 'id' | 'teamId' | 'seasonId'>>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (input.gameNumber  !== undefined) row.game_number = input.gameNumber ?? null;
    if (input.date        !== undefined) row.date        = input.date;
    if (input.opponent    !== undefined) row.opponent    = input.opponent;
    if (input.homeAway    !== undefined) row.home_away   = input.homeAway;
    if (input.competition !== undefined) row.competition = input.competition;
    if (input.result      !== undefined) row.result      = input.result;
    if (input.scoreUs     !== undefined) row.score_us    = input.scoreUs;
    if (input.scoreThem   !== undefined) row.score_them  = input.scoreThem;
    const { error } = await supabase.from('matches').update(row).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) throw error;
  },
};

function toMatch(row: Record<string, unknown>): Match {
  return {
    id:          row.id          as string,
    teamId:      row.team_id     as string,
    seasonId:    row.season_id   as string,
    gameNumber:  row.game_number as number | undefined,
    date:        row.date        as string,
    opponent:    row.opponent    as string,
    homeAway:    row.home_away   as Match['homeAway'],
    competition: row.competition as string,
    result:      row.result      as Match['result'],
    scoreUs:     row.score_us    as number,
    scoreThem:   row.score_them  as number,
  };
}
