import { supabase } from './client';
import type { StaffMember } from '../data/types';

/** Les équipes d'un membre du staff voyagent avec lui : l'écran club les affiche sans une
 *  requête par personne. */
const SELECT = '*, staff_team(team_id)';

export const staffApi = {
  /** Le staff rattaché à une équipe. La liaison porte le filtre, d'où le `!inner` — elle porte
   *  aussi la surcharge de rôle éventuelle pour CETTE équipe (`teamRole`). */
  async listByTeam(teamId: string): Promise<StaffMember[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*, staff_team!inner(team_id, role)')
      .eq('staff_team.team_id', teamId)
      .order('last_name');
    if (error) throw error;
    // L'embed filtré ne ramène que l'équipe demandée : on ne peut pas en déduire les autres.
    return (data ?? []).map(row => {
      const links = row.staff_team as { team_id: string; role: string | null }[] | undefined;
      return { ...toStaff(row), teamIds: undefined, teamRole: links?.[0]?.role ?? undefined };
    });
  },

  /** Surcharge (ou efface, avec `role: null`) le rôle d'une personne pour UNE équipe précise —
   *  sans toucher à son métier, ni à ses autres équipes. */
  async setTeamRole(staffId: string, teamId: string, role: string | null): Promise<void> {
    const { error } = await supabase
      .from('staff_team')
      .update({ role })
      .eq('staff_id', staffId)
      .eq('team_id', teamId);
    if (error) throw error;
  },

  /** Tout le staff de l'organisation, avec ses rattachements — l'écran club et l'ajout
   *  d'un membre déjà connu à une nouvelle équipe. */
  async listByOrganization(): Promise<StaffMember[]> {
    const { data, error } = await supabase
      .from('staff')
      .select(SELECT)
      .order('last_name');
    if (error) throw error;
    return (data ?? []).map(toStaff);
  },

  /**
   * Crée la PERSONNE, et la rattache à une équipe si on en donne une. Les deux écritures ne
   * sont pas atomiques : si le rattachement échoue, la personne existe quand même et se
   * rattache depuis l'écran — c'est réparable, là où supprimer la personne perdrait sa fiche.
   */
  async create(input: { organizationId: string; firstName: string; lastName: string; role: string; teamId?: string }): Promise<StaffMember> {
    const { data, error } = await supabase
      .from('staff')
      .insert({
        organization_id: input.organizationId,
        first_name:      input.firstName,
        last_name:       input.lastName,
        role:            input.role,
      })
      .select()
      .single();
    if (error) throw error;
    const member = toStaff(data);
    if (input.teamId) {
      await staffApi.assign(member.id, input.teamId);
      return { ...member, teamIds: [input.teamId] };
    }
    return member;
  },

  /** Rattache une personne à une équipe. Rejouable : un rattachement déjà en place ne fait rien. */
  async assign(staffId: string, teamId: string): Promise<void> {
    const { error } = await supabase
      .from('staff_team')
      .upsert({ staff_id: staffId, team_id: teamId }, { onConflict: 'staff_id,team_id' });
    if (error) throw error;
  },

  /** Retire une personne d'une équipe. Sa fiche, ses tâches et ses dossiers restent. */
  async unassign(staffId: string, teamId: string): Promise<void> {
    const { error } = await supabase
      .from('staff_team')
      .delete()
      .eq('staff_id', staffId)
      .eq('team_id', teamId);
    if (error) throw error;
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
  const links = row.staff_team as { team_id: string }[] | undefined;
  return {
    id:             row.id              as string,
    organizationId: row.organization_id as string,
    profileId:      row.profile_id      as string | undefined,
    firstName:      row.first_name      as string,
    lastName:       row.last_name       as string,
    role:           row.role            as string,
    teamIds:        links?.map(l => l.team_id),
  };
}
