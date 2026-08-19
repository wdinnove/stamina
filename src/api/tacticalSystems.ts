import { supabase } from './client';
import { teamCategoriesApi, NEW_CATEGORY_PALETTE } from './categories';
import { tacticalSystemPhasesApi } from './tacticalSystemPhases';
import type { TacticalSystem } from '../data/types';
import type { DiagramScene } from '../utils/diagram';

/**
 * Les scènes des phases sont embarquées dans la liste comme dans la fiche : une scène ne
 * pèse que quelques centaines d'octets, et ça évite une requête par vignette.
 *
 * Seule la première phase sert de couverture, mais l'embed n'est pas filtré sur
 * `position = 0` : dans PostgREST, filtrer une ressource liée transforme la jointure en
 * INNER JOIN, et les systèmes encore sans phase disparaîtraient de la liste. On ramène donc
 * les positions et on choisit côté client.
 */
const SELECT = '*, team_categories(id, name, color), tactical_system_phases(position, scene)';

interface PhaseCover { position: number; scene: DiagramScene }

function toSystem(row: Record<string, unknown>): TacticalSystem {
  const cat    = row.team_categories as { id: string; name: string; color: string } | null | undefined;
  const phases = (row.tactical_system_phases as PhaseCover[] | undefined) ?? [];
  const cover  = phases.reduce<PhaseCover | null>((best, p) => (!best || p.position < best.position ? p : best), null);
  return {
    id:            row.id as string,
    name:          row.name as string,
    teamId:        row.team_id as string,
    description:   (row.description as string | null) ?? undefined,
    categoryId:    cat?.id,
    categoryName:  cat?.name,
    categoryColor: cat?.color,
    phaseCount:    phases.length,
    coverScene:    cover?.scene,
    createdAt:     row.created_at as string,
  };
}

export const tacticalSystemsApi = {
  async getById(id: string): Promise<TacticalSystem | null> {
    const { data, error } = await supabase.from('tactical_systems').select(SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? toSystem(data as Record<string, unknown>) : null;
  },

  /** Un système appartient toujours à une équipe : la bibliothèque se lit équipe par équipe. */
  async list(teamId: string): Promise<TacticalSystem[]> {
    const { data, error } = await supabase.from('tactical_systems').select(SELECT).eq('team_id', teamId).order('name');
    if (error) throw error;
    return (data ?? []).map(toSystem);
  },

  async create(input: {
    name: string; teamId: string; description?: string; categoryId?: string;
  }): Promise<TacticalSystem> {
    const { data, error } = await supabase
      .from('tactical_systems')
      .insert({
        name:        input.name,
        team_id:     input.teamId,
        description: input.description || null,
        category_id: input.categoryId || null,
      })
      .select(SELECT)
      .single();
    if (error) throw error;
    return toSystem(data as Record<string, unknown>);
  },

  async update(id: string, patch: {
    name?: string; description?: string; categoryId?: string;
  }): Promise<TacticalSystem> {
    const payload: Record<string, unknown> = {};
    if (patch.name        !== undefined) payload.name        = patch.name;
    if (patch.description !== undefined) payload.description = patch.description || null;
    if (patch.categoryId  !== undefined) payload.category_id = patch.categoryId || null;
    const { data, error } = await supabase.from('tactical_systems').update(payload).eq('id', id).select(SELECT).single();
    if (error) throw error;
    return toSystem(data as Record<string, unknown>);
  },

  /**
   * Recopie un système (en-tête + phases) dans une autre équipe, où l'utilisateur doit avoir
   * le droit d'écrire — la RLS refuse l'insertion sinon.
   *
   * La copie est indépendante de l'original : plus aucun lien après coup, chaque équipe fait
   * ensuite vivre son système comme elle l'entend.
   *
   * Les catégories étant propres à chaque équipe, celle de l'original est retrouvée par son nom
   * dans l'équipe cible, et créée avec la même couleur si elle n'y existe pas encore.
   */
  async copyToTeam(id: string, targetTeamId: string): Promise<TacticalSystem> {
    const source = await tacticalSystemsApi.getById(id);
    if (!source) throw new Error("Ce système n'existe plus.");
    const phases = await tacticalSystemPhasesApi.list(id);

    let categoryId: string | undefined;
    if (source.categoryName) {
      const existing = await teamCategoriesApi.list(targetTeamId, 'system');
      const match = existing.find(c => c.name.toLowerCase() === source.categoryName!.toLowerCase());
      categoryId = match
        ? match.id
        : (await teamCategoriesApi.create(targetTeamId, 'system', source.categoryName, source.categoryColor ?? NEW_CATEGORY_PALETTE[existing.length % NEW_CATEGORY_PALETTE.length])).id;
    }

    const copy = await tacticalSystemsApi.create({
      name:        source.name,
      teamId:      targetTeamId,
      description: source.description,
      categoryId,
    });

    // Les phases suivent l'en-tête : si leur insertion échoue, on ne laisse pas une coquille
    // vide derrière nous dans l'équipe cible.
    try {
      await tacticalSystemPhasesApi.createMany(copy.id, phases.map(p => ({
        position: p.position, scene: p.scene, title: p.title, text: p.text,
      })));
    } catch (err) {
      await tacticalSystemsApi.remove(copy.id).catch(() => {});
      throw err;
    }

    return { ...copy, phaseCount: phases.length, coverScene: phases[0]?.scene };
  },

  /** Les phases partent avec le système (ON DELETE CASCADE), et rien d'autre à nettoyer. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_systems').delete().eq('id', id);
    if (error) throw error;
  },
};
