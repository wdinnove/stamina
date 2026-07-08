import { supabase } from './client';
import type { ExerciseCategory } from '../data/types';

export const DEFAULT_EXERCISE_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Warmup',     color: '#F59E0B' },
  { name: 'Jeu réduit', color: '#3B82F6' },
  { name: 'Jeu rapide', color: '#06B6D4' },
  { name: 'Collectif',  color: '#8B5CF6' },
  { name: 'Shooting',   color: '#EC4899' },
  { name: 'Technique',  color: '#00E5A0' },
  { name: 'Physique',   color: '#EF4444' },
  { name: 'Fun',        color: '#F97316' },
];

// Palette suggérée pour les catégories créées par l'utilisateur (cycle si plus de catégories que de couleurs)
export const NEW_CATEGORY_PALETTE = ['#EC4899', '#14B8A6', '#A855F7', '#84CC16', '#0EA5E9', '#F43F5E', '#D946EF', '#22D3EE'];

function toCategory(row: Record<string, unknown>): ExerciseCategory {
  return {
    id:       row.id as string,
    teamId:   row.team_id as string,
    name:     row.name as string,
    color:    row.color as string,
    position: row.position as number,
  };
}

export const exerciseCategoriesApi = {
  async list(teamId: string): Promise<ExerciseCategory[]> {
    const { data, error } = await supabase
      .from('exercise_categories')
      .select('*')
      .eq('team_id', teamId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toCategory);
  },

  async seedDefaults(teamId: string): Promise<void> {
    const { error } = await supabase
      .from('exercise_categories')
      .insert(DEFAULT_EXERCISE_CATEGORIES.map((c, i) => ({
        team_id: teamId, name: c.name, color: c.color, position: i,
      })));
    if (error) throw error;
  },

  async create(teamId: string, name: string, color: string): Promise<ExerciseCategory> {
    const { count } = await supabase
      .from('exercise_categories')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId);
    const position = count ?? 0;
    const { data, error } = await supabase
      .from('exercise_categories')
      .insert({ team_id: teamId, name, color, position })
      .select()
      .single();
    if (error) throw error;
    return toCategory(data as Record<string, unknown>);
  },

  async update(id: string, patch: { name?: string; color?: string; position?: number }): Promise<ExerciseCategory> {
    const payload: Record<string, unknown> = {};
    if (patch.name     !== undefined) payload.name     = patch.name;
    if (patch.color    !== undefined) payload.color    = patch.color;
    if (patch.position !== undefined) payload.position = patch.position;
    const { data, error } = await supabase
      .from('exercise_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toCategory(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercise_categories').delete().eq('id', id);
    if (error) throw error;
  },
};
