import { supabase } from './client';
import { exerciseCategoriesApi } from './exerciseCategories';
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
      .select('*, seasons(label, is_current), organizations(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toTeam(data) : null;
  },

  async updateThresholds(id: string, lightMax: number, normalMax: number): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({ load_light_max: lightMax, load_normal_max: normalMax })
      .eq('id', id);
    if (error) throw error;
  },

  async updateStatThresholds(
    id: string,
    t: { evalTOrange: number; evalTBlue: number; evalTGreen: number; ortgTAmber: number; ortgTGreen: number; drtgTAmber: number; drtgTRed: number }
  ): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({
        eval_t_orange: t.evalTOrange,
        eval_t_blue:   t.evalTBlue,
        eval_t_green:  t.evalTGreen,
        ortg_t_amber:  t.ortgTAmber,
        ortg_t_green:  t.ortgTGreen,
        drtg_t_amber:  t.drtgTAmber,
        drtg_t_red:    t.drtgTRed,
      })
      .eq('id', id);
    if (error) throw error;
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

    await exerciseCategoriesApi.seedDefaults(id);

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

  async update(id: string, input: { name: string; category: string; color: string; description?: string }): Promise<void> {
    const { error } = await supabase
      .from('teams')
      .update({ name: input.name, category: input.category, color: input.color, description: input.description ?? null })
      .eq('id', id);
    if (error) throw error;
  },
};

function toTeam(row: Record<string, unknown>): Team {
  const seasonsArr = row.seasons as Array<{ label: string; is_current: boolean }> | undefined;
  const org        = row.organizations as { name: string } | null | undefined;
  return {
    id:               row.id              as string,
    name:             row.name            as string,
    category:         row.category        as string,
    color:            row.color           as string,
    organizationId:   row.organization_id as string | undefined,
    organizationName: org?.name,
    createdAt:        row.created_at      as string | undefined,
    playerCount:      undefined,
    currentSeason:    seasonsArr?.find(s => s.is_current)?.label,
    loadLightMax:     (row.load_light_max  as number | undefined) ?? 2750,
    loadNormalMax:    (row.load_normal_max as number | undefined) ?? 4250,
    evalTOrange:      (row.eval_t_orange   as number | undefined) ?? 0,
    evalTBlue:        (row.eval_t_blue     as number | undefined) ?? 5,
    evalTGreen:       (row.eval_t_green    as number | undefined) ?? 10,
    ortgTAmber:       (row.ortg_t_amber    as number | undefined) ?? 60,
    ortgTGreen:       (row.ortg_t_green    as number | undefined) ?? 90,
    drtgTAmber:       (row.drtg_t_amber    as number | undefined) ?? 100,
    drtgTRed:         (row.drtg_t_red      as number | undefined) ?? 115,
  };
}

function toRow(t: Partial<Omit<Team, 'id' | 'playerCount'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.name     !== undefined) row.name     = t.name;
  if (t.category !== undefined) row.category = t.category;
  if (t.color    !== undefined) row.color    = t.color;
  return row;
}
