import { supabase } from './client';
import type { StaffMeeting } from '../data/types';

/** La catégorie voyage avec la réunion : les écrans l'affichent en pastille, sans requête
 *  supplémentaire ni table de correspondance à tenir côté client. */
const SELECT = '*, team_categories(id, name, color)';

export const meetingsApi = {
  async getById(id: string): Promise<StaffMeeting | null> {
    const { data, error } = await supabase.from('staff_meetings').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toMeeting(data) : null;
  },

  async listByTeam(teamId: string): Promise<StaffMeeting[]> {
    const { data, error } = await supabase
      .from('staff_meetings')
      .select(SELECT)
      .eq('team_id', teamId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMeeting);
  },

  async create(input: { teamId: string; title: string; date: string; time: string; notes?: string; categoryId?: string }): Promise<StaffMeeting> {
    const { data, error } = await supabase
      .from('staff_meetings')
      .insert({
        team_id:     input.teamId,
        category_id: input.categoryId ?? null,
        title:       input.title,
        date:        input.date,
        time:        input.time,
        notes:       input.notes ?? null,
      })
      .select(SELECT)
      .single();
    if (error) throw error;
    return toMeeting(data);
  },

  async update(id: string, input: { title?: string; date?: string; time?: string; notes?: string | null; categoryId?: string | null }): Promise<StaffMeeting> {
    const payload: Record<string, unknown> = {};
    if (input.title !== undefined) payload.title = input.title;
    if (input.date  !== undefined) payload.date  = input.date;
    if (input.time  !== undefined) payload.time  = input.time;
    if ('notes' in input) payload.notes = input.notes ?? null;
    if ('categoryId' in input) payload.category_id = input.categoryId ?? null;
    const { data, error } = await supabase
      .from('staff_meetings')
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toMeeting(data as Record<string, unknown>);
  },

  async updateNotes(id: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('staff_meetings')
      .update({ notes: notes || null })
      .eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('staff_meetings').delete().eq('id', id);
    if (error) throw error;
  },
};

function toMeeting(row: Record<string, unknown>): StaffMeeting {
  const cat = row.team_categories as { id: string; name: string; color: string } | null | undefined;
  return {
    id:            row.id      as string,
    teamId:        row.team_id as string,
    categoryId:    cat?.id,
    categoryName:  cat?.name,
    categoryColor: cat?.color,
    title:     row.title      as string,
    date:      row.date       as string,
    time:      row.time       as string,
    notes:     row.notes      as string | undefined,
    createdAt: row.created_at as string,
  };
}
