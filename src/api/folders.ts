import { supabase } from './client';
import type { FolderScope, TeamFolder } from '../data/types';

/**
 * Dossiers pour ranger les exercices et systèmes tactiques (`team_folders`). Un dossier n'est
 * pas une catégorie : c'est un classement libre et indépendant, créé à la volée par n'importe
 * quel writer directement depuis la bibliothèque — pas un réglage de configuration d'équipe.
 * Un exercice/système garde sa catégorie ET peut en plus être dans un dossier, les deux
 * classements sont orthogonaux.
 */

function toFolder(row: Record<string, unknown>): TeamFolder {
  return {
    id:       row.id as string,
    teamId:   row.team_id as string,
    scope:    row.scope as FolderScope,
    name:     row.name as string,
    color:    row.color as string,
    position: row.position as number,
  };
}

export const teamFoldersApi = {
  async list(teamId: string, scope: FolderScope): Promise<TeamFolder[]> {
    const { data, error } = await supabase
      .from('team_folders')
      .select('*')
      .eq('team_id', teamId)
      .eq('scope', scope)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toFolder);
  },

  async create(teamId: string, scope: FolderScope, name: string, color: string): Promise<TeamFolder> {
    const { count } = await supabase
      .from('team_folders')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('scope', scope);
    const position = count ?? 0;
    const { data, error } = await supabase
      .from('team_folders')
      .insert({ team_id: teamId, scope, name, color, position })
      .select()
      .single();
    if (error) throw error;
    return toFolder(data as Record<string, unknown>);
  },

  async update(id: string, patch: { name?: string; color?: string; position?: number }): Promise<TeamFolder> {
    const payload: Record<string, unknown> = {};
    if (patch.name     !== undefined) payload.name     = patch.name;
    if (patch.color    !== undefined) payload.color    = patch.color;
    if (patch.position !== undefined) payload.position = patch.position;
    const { data, error } = await supabase
      .from('team_folders')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toFolder(data as Record<string, unknown>);
  },

  /** Ne supprime jamais les exercices/systèmes qu'il contenait — `ON DELETE SET NULL` les libère. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('team_folders').delete().eq('id', id);
    if (error) throw error;
  },
};

/** Nombre d'éléments par dossier — sert aux badges de compteur sur les chips de dossier. */
export function countByFolder<T extends { folderId?: string }>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.folderId) counts[item.folderId] = (counts[item.folderId] ?? 0) + 1;
  }
  return counts;
}
