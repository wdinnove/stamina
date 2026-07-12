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

  /** Crée un compte utilisateur pour un membre du staff existant (invitation), lui attribue
   *  un rôle organisation, et lie son profil au membre du staff. */
  async inviteAndLink(input: { staffId: string; email: string; password: string; firstName: string; lastName: string; role: string }): Promise<string> {
    const { data: { user: me } } = await supabase.auth.getUser();
    if (!me) throw new Error('Non authentifié.');
    const { data: myProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', me.id)
      .single();
    if (profileErr) throw profileErr;

    const { data, error } = await supabase.auth.signUp({
      email:    input.email,
      password: input.password,
      options:  {
        data: {
          first_name:      input.firstName,
          last_name:       input.lastName,
          role:            input.role,
          organization_id: myProfile.organization_id,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Aucun utilisateur retourné.');
    if (!data.user.identities || data.user.identities.length === 0) {
      throw new Error('Cet email est déjà associé à un compte existant.');
    }

    const { error: rpcErr } = await supabase.rpc('upsert_staff_profile', {
      p_id:              data.user.id,
      p_organization_id: myProfile.organization_id,
      p_first_name:      input.firstName,
      p_last_name:       input.lastName,
      p_role:            input.role,
    });
    if (rpcErr) throw rpcErr;

    await this.linkProfile(input.staffId, data.user.id);
    return data.user.id;
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
