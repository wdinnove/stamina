import { supabase } from './client';
import type { Objective, ObjectiveImportance, ObjectiveComparator } from '../data/types';

export interface ListObjectivesFilters {
  playerId?: string;
  teamId?: string;
  active?: boolean;
}

export const objectivesApi = {
  async list(filters: ListObjectivesFilters = {}): Promise<Objective[]> {
    let query = supabase.from('objectives').select('*');
    if (filters.teamId)   query = query.eq('team_id', filters.teamId);
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.active !== undefined) query = query.eq('active', filters.active);
    const { data, error } = await query.order('created_at');
    if (error) throw error;
    return (data ?? []).map(toObjective);
  },

  async create(input: Omit<Objective, 'id'>): Promise<Objective> {
    const { data, error } = await supabase
      .from('objectives')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return toObjective(data);
  },

  async update(id: string, input: Partial<Omit<Objective, 'id'>>): Promise<Objective> {
    const { data, error } = await supabase
      .from('objectives')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toObjective(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('objectives').delete().eq('id', id);
    if (error) throw error;
  },
};

function toObjective(row: Record<string, unknown>): Objective {
  return {
    id:             row.id              as string,
    playerId:       (row.player_id      as string | null) ?? undefined,
    teamId:         (row.team_id        as string | null) ?? undefined,
    indicatorKey:   row.indicator_key   as string,
    importance:     row.importance      as ObjectiveImportance,
    comparator:     row.comparator      as ObjectiveComparator,
    thresholdValue: Number(row.threshold_value),
    active:         row.active          as boolean,
    createdAt:      row.created_at      as string | undefined,
  };
}

function toRow(o: Partial<Omit<Objective, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (o.playerId       !== undefined) row.player_id       = o.playerId;
  if (o.teamId          !== undefined) row.team_id         = o.teamId;
  if (o.indicatorKey    !== undefined) row.indicator_key   = o.indicatorKey;
  if (o.importance      !== undefined) row.importance      = o.importance;
  if (o.comparator      !== undefined) row.comparator      = o.comparator;
  if (o.thresholdValue  !== undefined) row.threshold_value = o.thresholdValue;
  if (o.active          !== undefined) row.active          = o.active;
  return row;
}
