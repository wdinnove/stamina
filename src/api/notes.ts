import { supabase } from './client';
import type { NoteCategory, PlayerNote } from '../data/types';

export interface ListNotesFilters {
  /** Obligatoire : une note appartient à une saison, jamais à l'équipe « en général ». */
  seasonId: string;
  playerId?: string;
  category?: NoteCategory;
}

/** L'auteur est joint depuis `profiles`, lisible dans toute l'organisation
 *  (policy `profiles_org_visible`). Une note écrite avant le DEFAULT auth.uid()
 *  n'a pas d'auteur : la jointure renvoie alors `null`, pas une erreur. */
const SELECT = '*, profiles(first_name, last_name)';

export const notesApi = {
  async list(filters: ListNotesFilters): Promise<PlayerNote[]> {
    let query = supabase.from('player_notes').select(SELECT).eq('season_id', filters.seasonId);
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.category) query = query.eq('category', filters.category);
    const { data, error } = await query.order('date', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(toNote);
  },

  async create(input: Omit<PlayerNote, 'id' | 'createdBy' | 'authorName' | 'createdAt'>): Promise<PlayerNote> {
    // created_by n'est pas transmis : c'est le DEFAULT auth.uid() de la base qui le remplit.
    const { data, error } = await supabase
      .from('player_notes')
      .insert(toRow(input))
      .select(SELECT)
      .single();
    if (error) throw error;
    return toNote(data);
  },

  async update(id: string, input: Partial<Omit<PlayerNote, 'id' | 'createdBy' | 'authorName' | 'createdAt'>>): Promise<PlayerNote> {
    const { data, error } = await supabase
      .from('player_notes')
      .update(toRow(input))
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toNote(data);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('player_notes').delete().eq('id', id);
    if (error) throw error;
  },
};

function toNote(row: Record<string, unknown>): PlayerNote {
  const author = row.profiles as { first_name?: string; last_name?: string } | null;
  const authorName = author ? `${author.first_name ?? ''} ${author.last_name ?? ''}`.trim() : '';
  return {
    id:         row.id         as string,
    playerId:   row.player_id  as string,
    teamId:     row.team_id    as string,
    seasonId:   row.season_id  as string,
    date:       row.date       as string,
    category:   row.category   as NoteCategory,
    content:    row.content    as string,
    createdBy:  (row.created_by as string | null) ?? undefined,
    authorName: authorName || undefined,
    createdAt:  row.created_at as string | undefined,
  };
}

function toRow(n: Partial<Omit<PlayerNote, 'id' | 'createdBy' | 'authorName' | 'createdAt'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (n.playerId !== undefined) row.player_id = n.playerId;
  if (n.teamId   !== undefined) row.team_id   = n.teamId;
  if (n.seasonId !== undefined) row.season_id = n.seasonId;
  if (n.date     !== undefined) row.date      = n.date;
  if (n.category !== undefined) row.category  = n.category;
  if (n.content  !== undefined) row.content   = n.content;
  return row;
}
