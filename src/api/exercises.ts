import { supabase } from './client';
import { teamCategoriesApi, NEW_CATEGORY_PALETTE } from './categories';
import { exercisePhasesApi } from './exercisePhases';
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
const SELECT = '*, team_categories(id, name, color), exercise_phases(position, scene)';

interface PhaseCover { position: number; scene: DiagramScene }

function toExercise(row: Record<string, unknown>): Exercise {
  const cat    = row.team_categories as { id: string; name: string; color: string } | null | undefined;
  const phases = (row.exercise_phases as PhaseCover[] | undefined) ?? [];
  const cover  = phases.reduce<PhaseCover | null>((best, p) => (!best || p.position < best.position ? p : best), null);
  return {
    id:            row.id as string,
    name:          row.name as string,
    teamId:        row.team_id as string,
    deroulement:   (row.deroulement as string | null) ?? undefined,
    objectifs:     (row.objectifs as string | null) ?? undefined,
    categoryId:    cat?.id,
    categoryName:  cat?.name,
    categoryColor: cat?.color,
    folderId:      (row.folder_id as string | null) ?? undefined,
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
    name: string; teamId: string; deroulement?: string; objectifs?: string; categoryId?: string; folderId?: string; videoUrl?: string;
  }): Promise<Exercise> {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        name:        input.name,
        team_id:     input.teamId,
        deroulement: input.deroulement || null,
        objectifs:   input.objectifs || null,
        category_id: input.categoryId || null,
        folder_id:   input.folderId || null,
        video_url:   input.videoUrl || null,
      })
      .select(SELECT)
      .single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  async update(id: string, patch: {
    name?: string; deroulement?: string; objectifs?: string; categoryId?: string; folderId?: string | null; videoUrl?: string;
  }): Promise<Exercise> {
    const payload: Record<string, unknown> = {};
    if (patch.name       !== undefined) payload.name        = patch.name;
    if (patch.deroulement !== undefined) payload.deroulement = patch.deroulement || null;
    if (patch.objectifs  !== undefined) payload.objectifs   = patch.objectifs || null;
    if (patch.categoryId !== undefined) payload.category_id = patch.categoryId || null;
    if (patch.folderId   !== undefined) payload.folder_id   = patch.folderId || null;
    if (patch.videoUrl   !== undefined) payload.video_url   = patch.videoUrl || null;
    const { data, error } = await supabase.from('exercises').update(payload).eq('id', id).select(SELECT).single();
    if (error) throw error;
    return toExercise(data as Record<string, unknown>);
  },

  /**
   * Recopie un exercice (en-tête + phases) dans une autre équipe, où l'utilisateur doit avoir
   * le droit d'écrire — la RLS refuse l'insertion sinon.
   *
   * La copie est indépendante de l'original : plus aucun lien après coup, chaque équipe fait
   * ensuite vivre son exercice comme elle l'entend.
   *
   * Les catégories étant propres à chaque équipe, celle de l'original est retrouvée par son nom
   * dans l'équipe cible, et créée avec la même couleur si elle n'y existe pas encore.
   */
  async copyToTeam(id: string, targetTeamId: string): Promise<Exercise> {
    const source = await exercisesApi.getById(id);
    if (!source) throw new Error("Cet exercice n'existe plus.");
    const phases = await exercisePhasesApi.list(id);

    let categoryId: string | undefined;
    if (source.categoryName) {
      const existing = await teamCategoriesApi.list(targetTeamId, 'exercise');
      const match = existing.find(c => c.name.toLowerCase() === source.categoryName!.toLowerCase());
      categoryId = match
        ? match.id
        : (await teamCategoriesApi.create(targetTeamId, 'exercise', source.categoryName, source.categoryColor ?? NEW_CATEGORY_PALETTE[existing.length % NEW_CATEGORY_PALETTE.length])).id;
    }

    const copy = await exercisesApi.create({
      name:        source.name,
      teamId:      targetTeamId,
      deroulement: source.deroulement,
      objectifs:   source.objectifs,
      categoryId,
      videoUrl:    source.videoUrl,
    });

    // Les phases suivent l'en-tête : si leur insertion échoue, on ne laisse pas une coquille
    // vide derrière nous dans l'équipe cible.
    try {
      await exercisePhasesApi.createMany(copy.id, phases.map(p => ({
        position: p.position, scene: p.scene, title: p.title, text: p.text,
      })));
    } catch (err) {
      await exercisesApi.remove(copy.id).catch(() => {});
      throw err;
    }

    return { ...copy, phaseCount: phases.length, coverScene: phases[0]?.scene };
  },

  /** Les phases partent avec l'exercice (ON DELETE CASCADE), et rien d'autre à nettoyer. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('exercises').delete().eq('id', id);
    if (error) throw error;
  },
};
