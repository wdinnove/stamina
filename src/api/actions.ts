import { supabase } from './client';
import type { Action, ActionStatus, ActionPriority, ActionCategory } from '../data/types';

export interface ListActionsFilters {
  playerId?: string;
  teamId?: string;
  /** Saison — une tâche appartient à une saison, pas à l'équipe en général. */
  seasonId?: string;
  status?: ActionStatus;
  priority?: ActionPriority;
  category?: ActionCategory;
}

export const actionsApi = {
  async list(filters: ListActionsFilters = {}): Promise<Action[]> {
    let query = supabase.from('player_actions').select('*');
    if (filters.teamId)   query = query.eq('team_id', filters.teamId);
    if (filters.seasonId) query = query.eq('season_id', filters.seasonId);
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.status)   query = query.eq('status', filters.status);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.category) query = query.eq('category', filters.category);
    const { data, error } = await query.order('due_date').limit(500);
    if (error) throw error;
    return (data ?? []).map(toAction);
  },

  async getByPlayer(playerId: string): Promise<Action[]> {
    const { data, error } = await supabase
      .from('player_actions')
      .select('*')
      .eq('player_id', playerId)
      .order('due_date');
    if (error) throw error;
    return (data ?? []).map(toAction);
  },

  /**
   * Tâches en retard. `seasonId` est requis en pratique : sans lui, cette requête ne portait
   * aucun filtre d'équipe ni de saison et remontait tout ce que la RLS laissait passer —
   * y compris les tâches d'autres équipes du club.
   */
  async getOverdue(seasonId: string, refDate = new Date().toISOString().split('T')[0]): Promise<Action[]> {
    const { data, error } = await supabase
      .from('player_actions')
      .select('*')
      .eq('season_id', seasonId)
      .neq('status', 'done')
      .lt('due_date', refDate)
      .order('due_date');
    if (error) throw error;
    return (data ?? []).map(toAction);
  },

  /** Tâches non terminées d'une saison — sert au bandeau de report en début de saison. */
  async listUnfinishedInSeason(seasonId: string): Promise<Action[]> {
    const { data, error } = await supabase
      .from('player_actions')
      .select('*')
      .eq('season_id', seasonId)
      .neq('status', 'done')
      .order('due_date');
    if (error) throw error;
    return (data ?? []).map(toAction);
  },

  /** Rattache des tâches à une autre saison — report explicite, jamais automatique. */
  async moveToSeason(ids: string[], seasonId: string): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabase
      .from('player_actions')
      .update({ season_id: seasonId })
      .in('id', ids);
    if (error) throw error;
  },

  async create(input: Omit<Action, 'id'>): Promise<Action> {
    const { data, error } = await supabase
      .from('player_actions')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return toAction(data);
  },

  async update(id: string, input: Partial<Omit<Action, 'id'>>): Promise<Action> {
    const { data, error } = await supabase
      .from('player_actions')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toAction(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('player_actions').delete().eq('id', id);
    if (error) throw error;
  },
};

function toAction(row: Record<string, unknown>): Action {
  return {
    id:          row.id          as string,
    playerId:    (row.player_id   as string | null) ?? undefined,
    teamId:      row.team_id     as string | undefined,
    seasonId:    (row.season_id   as string | null) ?? undefined,
    title:       row.title       as string,
    description: row.description as string | undefined,
    category:    (row.category   as Action['category'] | null) ?? undefined,
    priority:    row.priority    as Action['priority'],
    dueDate:     row.due_date    as string,
    notifyJ1:    row.notify_j1   as boolean,
    notifyJJ:    row.notify_jj   as boolean,
    notifyCustomDate: (row.notify_custom_date as string | null) ?? undefined,
    assignedTo:  (row.assigned_to as string | null) ?? undefined,
    status:      row.status      as Action['status'],
  };
}

function toRow(a: Partial<Omit<Action, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (a.playerId    !== undefined) row.player_id   = a.playerId;
  if (a.teamId      !== undefined) row.team_id     = a.teamId;
  if (a.seasonId    !== undefined) row.season_id   = a.seasonId;
  if (a.title       !== undefined) row.title        = a.title;
  if (a.description !== undefined) row.description  = a.description;
  if (a.category    !== undefined) row.category     = a.category;
  if (a.priority    !== undefined) row.priority     = a.priority;
  if (a.dueDate     !== undefined) row.due_date     = a.dueDate;
  if (a.notifyJ1    !== undefined) row.notify_j1    = a.notifyJ1;
  if (a.notifyJJ    !== undefined) row.notify_jj    = a.notifyJJ;
  if (a.notifyCustomDate !== undefined) row.notify_custom_date = a.notifyCustomDate || null;
  if (a.assignedTo  !== undefined) row.assigned_to  = a.assignedTo;
  if (a.status      !== undefined) row.status       = a.status;
  return row;
}
