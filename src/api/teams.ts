import { supabase } from './client';
import type { Team } from '../data/types';

export const teamsApi = {
  async list(): Promise<Team[]> {
    const { data, error } = await supabase
      .from('teams')
      .select('*, seasons(label, is_current), organizations(name)')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(toTeam);
  },

  async getById(id: string): Promise<Team | null> {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toTeam(data) : null;
  },

  async create(input: { name: string; category: string; color: string }): Promise<Team> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile?.organization_id) throw new Error('Aucune organisation associée à votre compte. Contactez un administrateur.');

    // On génère l'ID côté client pour éviter le SELECT post-insert
    // (qui passe par accessible_team_ids() et peut échouer si la fonction a un bug search_path)
    const id = crypto.randomUUID();

    const { error } = await supabase
      .from('teams')
      .insert({
        id,
        organization_id: profile.organization_id,
        name:            input.name,
        category:        input.category,
        color:           input.color,
      });
    if (error) throw error;

    return {
      id,
      name:             input.name,
      category:         input.category,
      color:            input.color,
      organizationName: undefined,
      createdAt:        new Date().toISOString(),
      playerCount:      0,
      currentSeason:    undefined,
    };
  },

  async update(id: string, input: { name: string; category: string; color: string }): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({ name: input.name, category: input.category, color: input.color })
      .eq('id', id);
    if (error) throw error;
  },
};

function toTeam(row: Record<string, unknown>): Team {
  const seasonsArr = row.seasons as Array<{ label: string; is_current: boolean }> | undefined;
  const org        = row.organizations as { name: string } | null | undefined;
  return {
    id:               row.id          as string,
    name:             row.name        as string,
    category:         row.category    as string,
    color:            row.color       as string,
    organizationName: org?.name,
    createdAt:        row.created_at  as string | undefined,
    playerCount:      undefined,
    currentSeason:    seasonsArr?.find(s => s.is_current)?.label,
  };
}

function toRow(t: Partial<Omit<Team, 'id' | 'playerCount'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.name     !== undefined) row.name     = t.name;
  if (t.category !== undefined) row.category = t.category;
  if (t.color    !== undefined) row.color    = t.color;
  return row;
}
