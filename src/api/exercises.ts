import { supabase } from './client';
import type { Exercise } from '../data/types';

function toExercise(row: Record<string, unknown>): Exercise {
  return {
    id:          row.id as string,
    name:        row.name as string,
    teamId:      (row.team_id as string | null) ?? undefined,
    description: (row.description as string | null) ?? undefined,
    imageUrl:    (row.image_url as string | null) ?? undefined,
    category:    (row.category as string | null) ?? undefined,
    createdAt:   row.created_at as string,
  };
}

export interface ListExercisesFilters {
  teamId?: string;
}

export const exercisesApi = {
  async getById(id: string): Promise<Exercise | null> {
    const { data, error } = await supabase.from('exercises').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toExercise(data as Record<string, unknown>) : null;
  },

  async list(filters: ListExercisesFilters = {}): Promise<Exercise[]> {
    let query = supabase.from('exercises').select('*');
    if (filters.teamId) query = query.eq('team_id', filters.teamId);
    const { data, error } = await query.order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  },

  async create(input: { name: string; description?: string; imageUrl?: string; category?: string; teamId?: string }): Promise<Exercise> {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name:        input.name,
        description: input.description || null,
        image_url:   input.imageUrl || null,
        category:    input.category || null,
        team_id:     input.teamId || null,
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

  async uploadImage(exerciseId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${exerciseId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('exercises').upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('exercises').getPublicUrl(path);
    return data.publicUrl;
  },

  async deleteImageByUrl(url: string): Promise<void> {
    const marker = '/object/public/exercises/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(url.slice(idx + marker.length));
    await supabase.storage.from('exercises').remove([path]);
  },
};
