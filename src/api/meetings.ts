import { supabase } from './client';
import type { StaffMeeting } from '../data/types';

export const meetingsApi = {
  async listByTeam(teamId: string): Promise<StaffMeeting[]> {
    const { data, error } = await supabase
      .from('staff_meetings')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: false })
      .order('time', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMeeting);
  },

  async create(input: { teamId: string; title: string; date: string; time: string; notes?: string }): Promise<StaffMeeting> {
    const { data, error } = await supabase
      .from('staff_meetings')
      .insert({
        team_id: input.teamId,
        title:   input.title,
        date:    input.date,
        time:    input.time,
        notes:   input.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toMeeting(data);
  },

  async update(id: string, input: { title?: string; date?: string; time?: string; notes?: string | null }): Promise<StaffMeeting> {
    const payload: Record<string, unknown> = {};
    if (input.title !== undefined) payload.title = input.title;
    if (input.date  !== undefined) payload.date  = input.date;
    if (input.time  !== undefined) payload.time  = input.time;
    if ('notes' in input) payload.notes = input.notes ?? null;
    const { data, error } = await supabase
      .from('staff_meetings')
      .update(payload)
      .eq('id', id)
      .select()
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
  return {
    id:        row.id         as string,
    teamId:    row.team_id    as string,
    title:     row.title      as string,
    date:      row.date       as string,
    time:      row.time       as string,
    notes:     row.notes      as string | undefined,
    createdAt: row.created_at as string,
  };
}
