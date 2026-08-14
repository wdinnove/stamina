import { supabase } from './client';
import type { Exercise } from '../data/types';
import type { DiagramScene } from '../utils/diagram';

/**
 * Les scènes des phases sont embarquées dans la liste comme dans la fiche : une scène ne
 * pèse que quelques centaines d'octets, et ça évite une requête par vignette.
 *
 * Seule la première phase sert de couverture, mais l'embed n'est pas filtré sur
 * `position = 0` : dans PostgREST, filtrer une ressource liée transforme la jointure en
 * INNER JOIN, et les exercices encore sans phase disparaîtraient de la liste. On ramène donc
 * les positions et on choisit côté client.
 */
const SELECT = '*, exercise_categories(id, name, color), exercise_phases(position, scene)';

interface PhaseCover { position: number; scene: DiagramScene }

function toExercise(row: Record<string, unknown>): Exercise {
  const cat    = row.exercise_categories as { id: string; name: string; color: string } | null | undefined;
  const phases = (row.exercise_phases as PhaseCover[] | undefined) ?? [];
  const cover  = phases.reduce<PhaseCover | null>((best, p) => (!best || p.position < best.position ? p : best), null);
  return {
    id:            row.id as string,
    name:          row.name as string,
    teamId:        row.team_id as string,
    objectifs:     (row.objectifs as string | null) ?? undefined,
    categoryId:    cat?.id,
    categoryName:  cat?.name,
    categoryColor: cat?.color,
    videoUrl:      (row.video_url as string | null) ?? undefined,
    phaseCount:    phases.length,
    coverScene:    cover?.scene,
    createdAt:     row.created_at as string,
  };
}

export const exercisesApi = {
  async getById(id: string): Promise<Exercise | null> {
    const { data, error } = await supabase.from('exercises').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toExercise(data as Record<string, unknown>) : null;
  },

  /** Un exercice appartient toujours à une équipe : la bibliothèque se lit équipe par équipe. */
  async list(teamId: string): Promise<Exercise[]> {
    const { data, error } = await supabase.from('exercises').select(SELECT).eq('team_id', teamId).order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  },

  async create(input: {
    name: string; teamId: string; objectifs?: string; categoryId?: string; videoUrl?: string;
  }): Promise<Exercise> {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name:        input.name,
        team_id:     input.teamId,
        objectifs:   input.objectifs || null,
        category_id: input.categoryId || null,
        video_url:   input.videoUrl || null,
      })
      .select(SELECT)
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async update(id: string, patch: {
    name?: string; objectifs?: string; categoryId?: string; videoUrl?: string;
  }): Promise<Exercise> {
    const payload: Record<string, unknown> = {};
    if (patch.name       !== undefined) payload.name        = patch.name;
    if (patch.objectifs  !== undefined) payload.objectifs   = patch.objectifs || null;
    if (patch.categoryId !== undefined) payload.category_id = patch.categoryId || null;
    if (patch.videoUrl   !== undefined) payload.video_url   = patch.videoUrl || null;
    const { data, error } = await supabase.from('exercises').update(payload).eq('id', id).select(SELECT).single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  /** Les phases partent avec l'exercice (ON DELETE CASCADE), et rien d'autre à nettoyer. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },
};
