import { supabase } from './client';
import type { Exercise, ExerciseImage } from '../data/types';
import type { DiagramScene } from '../utils/diagram';

const BUCKET = 'exercises';

function toExercise(row: Record<string, unknown>): Exercise {
  const cat = row.exercise_categories as { id: string; name: string; color: string } | null | undefined;
  const imagesRel = row.exercise_images as { count: number }[] | undefined;
  return {
    id:            row.id as string,
    name:          row.name as string,
    teamId:        (row.team_id as string | null) ?? undefined,
    description:   (row.description as string | null) ?? undefined,
    consignes:     (row.consignes as string | null) ?? undefined,
    categoryId:    cat?.id,
    categoryName:  cat?.name,
    categoryColor: cat?.color,
    documentUrl:   (row.document_url as string | null) ?? undefined,
    documentName:  (row.document_name as string | null) ?? undefined,
    videoUrl:      (row.video_url as string | null) ?? undefined,
    imageCount:    imagesRel?.[0]?.count ?? 0,
    createdAt:     row.created_at as string,
  };
}

function toExerciseImage(row: Record<string, unknown>): ExerciseImage {
  return {
    id:         row.id as string,
    exerciseId: row.exercise_id as string,
    url:        row.url as string,
    position:   row.position as number,
    diagram:    (row.diagram as DiagramScene | null) ?? undefined,
    createdAt:  row.created_at as string,
  };
}

export interface ListExercisesFilters {
  teamId?: string;
}

export const exercisesApi = {
  async getById(id: string): Promise<Exercise | null> {
    const { data, error } = await supabase.from('exercises').select('*, exercise_categories(id, name, color), exercise_images(count)').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toExercise(data as Record<string, unknown>) : null;
  },

  async list(filters: ListExercisesFilters = {}): Promise<Exercise[]> {
    let query = supabase.from('exercises').select('*, exercise_categories(id, name, color), exercise_images(count)');
    if (filters.teamId) query = query.eq('team_id', filters.teamId);
    const { data, error } = await query.order('name');
    if (error) throw error;
    return (data ?? []).map(toExercise);
  },

  async create(input: {
    name: string; description?: string; consignes?: string; categoryId?: string; teamId?: string;
    documentUrl?: string; documentName?: string; videoUrl?: string;
  }): Promise<Exercise> {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name:          input.name,
        description:   input.description || null,
        consignes:     input.consignes || null,
        category_id:   input.categoryId || null,
        team_id:       input.teamId || null,
        document_url:  input.documentUrl || null,
        document_name: input.documentName || null,
        video_url:     input.videoUrl || null,
      })
      .select('*, exercise_categories(id, name, color), exercise_images(count)')
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async update(id: string, patch: {
    name?: string; description?: string; consignes?: string; categoryId?: string;
    documentUrl?: string; documentName?: string; videoUrl?: string;
  }): Promise<Exercise> {
    const payload: Record<string, unknown> = {};
    if (patch.name         !== undefined) payload.name          = patch.name;
    if (patch.description  !== undefined) payload.description   = patch.description || null;
    if (patch.consignes    !== undefined) payload.consignes     = patch.consignes || null;
    if (patch.categoryId   !== undefined) payload.category_id   = patch.categoryId || null;
    if (patch.documentUrl  !== undefined) payload.document_url  = patch.documentUrl || null;
    if (patch.documentName !== undefined) payload.document_name = patch.documentName || null;
    if (patch.videoUrl     !== undefined) payload.video_url     = patch.videoUrl || null;
    const { data, error } = await supabase
      .from('exercises')
      .update(payload)
      .eq('id', id)
      .select('*, exercise_categories(id, name, color), exercise_images(count)')
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Images (galerie) ────────────────────────────────────────────
  async listImages(exerciseId: string): Promise<ExerciseImage[]> {
    const { data, error } = await supabase
      .from('exercise_images')
      .select('*')
      .eq('exercise_id', exerciseId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toExerciseImage);
  },

  async uploadImage(exerciseId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${exerciseId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  /** `diagram` n'est renseigné que pour un schéma dessiné dans l'éditeur, jamais pour un upload. */
  async addImage(exerciseId: string, url: string, position: number, diagram?: DiagramScene): Promise<ExerciseImage> {
    const { data, error } = await supabase
      .from('exercise_images')
      .insert({ exercise_id: exerciseId, url, position, diagram: diagram ?? null })
      .select()
      .single();
    if (error) throw error;
    return toExerciseImage(data as Record<string, unknown>);
  },

  /**
   * Réenregistre un schéma modifié : nouveau PNG, scène mise à jour, ancien fichier supprimé.
   * L'ancien PNG n'est effacé qu'après la mise à jour de la ligne — en cas d'échec en base,
   * l'image affichée reste valide plutôt que de laisser une vignette cassée.
   */
  async updateDiagram(image: ExerciseImage, url: string, diagram: DiagramScene): Promise<ExerciseImage> {
    const { data, error } = await supabase
      .from('exercise_images')
      .update({ url, diagram })
      .eq('id', image.id)
      .select()
      .single();
    if (error) throw error;
    if (image.url !== url) exercisesApi.deleteImageByUrl(image.url).catch(() => {});
    return toExerciseImage(data as Record<string, unknown>);
  },

  /**
   * Enregistre un schéma dessiné dans l'éditeur : le PNG part dans le bucket, puis la ligne
   * de galerie est créée ou mise à jour selon qu'on dessine ou qu'on retouche.
   */
  async saveDiagram(
    exerciseId: string, scene: DiagramScene, png: File,
    existing: ExerciseImage | null, position: number,
  ): Promise<ExerciseImage> {
    const url = await exercisesApi.uploadImage(exerciseId, png);
    return existing
      ? exercisesApi.updateDiagram(existing, url, scene)
      : exercisesApi.addImage(exerciseId, url, position, scene);
  },

  async removeImage(image: ExerciseImage): Promise<void> {
    await exercisesApi.deleteImageByUrl(image.url);
    const { error } = await supabase.from('exercise_images').delete().eq('id', image.id);
    if (error) throw error;
  },

  async deleteImageByUrl(url: string): Promise<void> {
    const marker = `/object/public/${BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(url.slice(idx + marker.length));
    await supabase.storage.from(BUCKET).remove([path]);
  },

  // ── Document PDF ────────────────────────────────────────────────
  async uploadDocument(exerciseId: string, file: File): Promise<{ url: string; name: string }> {
    const path = `${exerciseId}/doc-${Date.now()}.pdf`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, name: file.name };
  },

  async deleteDocumentByUrl(url: string): Promise<void> {
    await exercisesApi.deleteImageByUrl(url);
  },
};
