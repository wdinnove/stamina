import { supabase } from './client';
import type { StaffMember } from '../data/types';

export const staffApi = {
  async listByTeam(teamId: string): Promise<StaffMember[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('team_id', teamId)
      .order('last_name');
    if (error) throw error;
    return (data ?? []).map(toStaff);
  },

  async create(input: { teamId: string; firstName: string; lastName: string; role: string }): Promise<StaffMember> {
    const { data, error } = await supabase
      .from('staff')
      .insert({
        team_id:    input.teamId,
        first_name: input.firstName,
        last_name:  input.lastName,
        role:       input.role,
      })
      .select()
      .single();
    if (error) throw error;
    return toStaff(data);
  },

  async linkProfile(staffId: string, profileId: string): Promise<void> {
    const { error } = await supabase
      .from('staff')
      .update({ profile_id: profileId })
      .eq('id', staffId);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) throw error;
  },
};

function toStaff(row: Record<string, unknown>): StaffMember {
  return {
    id:        row.id         as string,
    teamId:    row.team_id    as string,
    profileId: row.profile_id as string | undefined,
    firstName: row.first_name as string,
    lastName:  row.last_name  as string,
    role:      row.role       as string,
  };
}
