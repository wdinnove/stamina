import { supabase } from './client';
import type { ExercisePhase } from '../data/types';
import type { DiagramScene } from '../utils/diagram';

function toPhase(row: Record<string, unknown>): ExercisePhase {
  return {
    id:         row.id as string,
    exerciseId: row.exercise_id as string,
    position:   row.position as number,
    title:      (row.title as string | null) ?? undefined,
    text:       (row.text as string | null) ?? undefined,
    scene:      row.scene as DiagramScene,
    thumbUrl:   (row.thumb_url as string | null) ?? undefined,
    createdAt:  row.created_at as string,
  };
}

export const exercisePhasesApi = {
  async list(exerciseId: string): Promise<ExercisePhase[]> {
    const { data, error } = await supabase
      .from('exercise_phases')
      .select('*')
      .eq('exercise_id', exerciseId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toPhase);
  },

  async create(exerciseId: string, input: {
    position: number; scene: DiagramScene; title?: string; text?: string;
  }): Promise<ExercisePhase> {
    const { data, error } = await supabase
      .from('exercise_phases')
      .insert({
        exercise_id: exerciseId,
        position:    input.position,
        scene:       input.scene,
        title:       input.title || null,
        text:        input.text || null,
      })
      .select()
      .single();
    if (error) throw error;
    return toPhase(data as Record<string, unknown>);
  },

  async update(id: string, patch: {
    title?: string; text?: string; scene?: DiagramScene; position?: number;
  }): Promise<ExercisePhase> {
    const payload: Record<string, unknown> = {};
    if (patch.title    !== undefined) payload.title    = patch.title || null;
    if (patch.text     !== undefined) payload.text     = patch.text || null;
    if (patch.scene    !== undefined) payload.scene    = patch.scene;
    if (patch.position !== undefined) payload.position = patch.position;
    const { data, error } = await supabase.from('exercise_phases').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return toPhase(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercise_phases').delete().eq('id', id);
    if (error) throw error;
  },
};
