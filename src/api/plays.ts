import { supabase } from './client';
import type { Play, LiveSide } from '../data/types';

export const playsApi = {
  async getForTeam(teamId: string): Promise<Play[]> {
    const { data, error } = await supabase
      .from('plays')
      .select('id, team_id, side, name, active, sort_order')
      .eq('team_id', teamId)
      .order('side', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toPlay);
  },

  async create(teamId: string, side: LiveSide, name: string, sortOrder: number): Promise<Play> {
    const { data, error } = await supabase
      .from('plays')
      .insert({ team_id: teamId, side, name, sort_order: sortOrder })
      .select('id, team_id, side, name, active, sort_order')
      .single();
    if (error) throw error;
    return toPlay(data);
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('plays').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await supabase.from('plays').update({ active }).eq('id', id);
    if (error) throw error;
  },

  // play_id (match_live_actions) est volontairement SANS CASCADE : supprimer un play déjà utilisé
  // échoue avec une violation de clé étrangère, à afficher comme message clair côté UI — d'où
  // `setActive(id, false)` proposé en premier dans l'écran de configuration.
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('plays').delete().eq('id', id);
    if (error) throw error;
  },
};

function toPlay(row: Record<string, unknown>): Play {
  return {
    id:        row.id        as string,
    teamId:    row.team_id   as string,
    side:      row.side      as LiveSide,
    name:      row.name      as string,
    active:    row.active    as boolean,
    sortOrder: row.sort_order as number,
  };
}
