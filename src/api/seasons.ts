import { supabase } from './client';
import type { Season } from '../data/types';

export const seasonsApi = {
  async listAll(): Promise<Season[]> {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSeason);
  },

  async listByTeam(teamId: string): Promise<Season[]> {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('team_id', teamId)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toSeason);
  },

  async create(input: Omit<Season, 'id'>): Promise<Season> {
    const { data, error } = await supabase
      .from('seasons')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return toSeason(data);
  },

  async setCurrent(id: string, teamId: string): Promise<void> {
    const { error: e1 } = await supabase
      .from('seasons')
      .update({ is_current: false })
      .eq('team_id', teamId);
    if (e1) throw e1;
    const { error: e2 } = await supabase
      .from('seasons')
      .update({ is_current: true })
      .eq('id', id);
    if (e2) throw e2;
  },
};

function toSeason(row: Record<string, unknown>): Season {
  return {
    id:          row.id           as string,
    teamId:      row.team_id      as string,
    label:       row.label        as string,
    startDate:   row.start_date   as string,
    endDate:     row.end_date     as string,
    totalGames:  row.total_games  as number | undefined,
    isCurrent:   row.is_current   as boolean,
  };
}

function toRow(s: Omit<Season, 'id'>): Record<string, unknown> {
  return {
    team_id:     s.teamId,
    label:       s.label,
    start_date:  s.startDate,
    end_date:    s.endDate,
    total_games: s.totalGames ?? null,
    is_current:  s.isCurrent,
  };
}
