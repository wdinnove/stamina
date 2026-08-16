import { supabase } from './client';
import type { OrgRole, TeamRole, TeamRoleAssignment } from '../data/types';

export interface AssignableProfile {
  id:        string;
  firstName: string;
  lastName:  string;
  orgRole:   OrgRole;
}

export const teamRolesApi = {
  /** Rôles assignés sur une équipe donnée (visible par tous les rôles de l'équipe, superadmin inclus). */
  async listByTeam(teamId: string): Promise<TeamRoleAssignment[]> {
    const { data, error } = await supabase
      .from('team_roles')
      .select('team_id, profile_id, role, profiles!profile_id(first_name, last_name)')
      .eq('team_id', teamId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map(toAssignment);
  },

  /** Vue transverse : tous les rôles sur toutes les équipes de l'organisation (onglet Club, superadmin uniquement). */
  async listByOrg(orgId: string): Promise<TeamRoleAssignment[]> {
    const { data, error } = await supabase
      .from('team_roles')
      .select('team_id, profile_id, role, profiles!profile_id(first_name, last_name), teams!inner(name, organization_id)')
      .eq('teams.organization_id', orgId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []).map(toAssignment);
  },

  /** Équipes sur lesquelles le profil courant peut écrire — miroir côté client de `writable_team_ids()`.
   *  Le superadmin n'a pas de ligne `team_roles` : l'appelant lui ouvre toutes les équipes accessibles. */
  async listMyWritableTeamIds(): Promise<string[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('team_roles')
      .select('team_id')
      .eq('profile_id', user.id)
      .in('role', ['admin', 'editor']);
    if (error) throw error;
    return (data ?? []).map(r => r.team_id as string);
  },

  /** Tous les profils de l'organisation (utilisateurs/staffs), assignables sur n'importe quelle équipe. */
  async listAssignableProfiles(orgId: string): Promise<AssignableProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, org_role')
      .eq('organization_id', orgId)
      .order('last_name');
    if (error) throw error;
    return (data ?? []).map(row => ({
      id:        row.id as string,
      firstName: row.first_name as string,
      lastName:  row.last_name as string,
      orgRole:   row.org_role as OrgRole,
    }));
  },

  /** Assigne (ou change) le rôle d'un profil sur une équipe. Réservé au superadmin (RLS). */
  async upsert(teamId: string, profileId: string, role: TeamRole): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('team_roles')
      .upsert({ team_id: teamId, profile_id: profileId, role, assigned_by: user?.id }, { onConflict: 'team_id,profile_id' });
    if (error) throw error;
  },

  /** Retire un profil d'une équipe. Réservé au superadmin (RLS). */
  async remove(teamId: string, profileId: string): Promise<void> {
    const { error } = await supabase
      .from('team_roles')
      .delete()
      .eq('team_id', teamId)
      .eq('profile_id', profileId);
    if (error) throw error;
  },

  /** Promeut/rétrograde un profil superadmin/member au niveau organisation. Réservé au superadmin (RPC). */
  async setOrgRole(profileId: string, orgRole: OrgRole): Promise<void> {
    const { error } = await supabase.rpc('set_user_org_role', { p_user_id: profileId, p_org_role: orgRole });
    if (error) throw error;
  },
};

function toAssignment(row: Record<string, unknown>): TeamRoleAssignment {
  const profile = row.profiles as { first_name: string; last_name: string } | null;
  const team    = row.teams    as { name: string } | null | undefined;
  return {
    teamId:    row.team_id as string,
    teamName:  team?.name,
    profileId: row.profile_id as string,
    firstName: profile?.first_name ?? '',
    lastName:  profile?.last_name  ?? '',
    role:      row.role as TeamRole,
  };
}
