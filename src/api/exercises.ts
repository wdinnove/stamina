import { supabase } from './client';
import type { Exercise } from '../data/types';

function toExercise(row: Record<string, unknown>): Exercise {
  return {
    id:          row.id as string,
    name:        row.name as string,
    description: (row.description as string | null) ?? undefined,
    imageUrl:    (row.image_url as string | null) ?? undefined,
    category:    (row.category as string | null) ?? undefined,
    createdAt:   row.created_at as string,
  };
}

export const exercisesApi = {
  async list(): Promise<Exercise[]> {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  },

  async create(input: { name: string; description?: string; imageUrl?: string; category?: string }): Promise<Exercise> {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name:        input.name,
        description: input.description || null,
        image_url:   input.imageUrl || null,
        category:    input.category || null,
      })
      .select()
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async update(id: string, patch: { name?: string; description?: string; imageUrl?: string; category?: string }): Promise<Exercise> {
    const payload: Record<string, unknown> = {};
    if (patch.name        !== undefined) payload.name        = patch.name;
    if (patch.description !== undefined) payload.description = patch.description || null;
    if (patch.imageUrl    !== undefined) payload.image_url   = patch.imageUrl || null;
    if (patch.category    !== undefined) payload.category    = patch.category || null;
    const { data, error } = await supabase
      .from('exercises')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },
};
