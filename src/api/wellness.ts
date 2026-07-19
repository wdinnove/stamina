import { supabase } from './client';
import type { WellnessEntry, WellnessEntryMethod } from '../data/types';

export interface ListWellnessFilters {
  playerId?: string;
  playerIds?: string[];
  from?: string;
  to?: string;
}

export interface PublicPlayerInfo {
  firstName: string;
  lastName: string;
  publicWellnessMethod: WellnessEntryMethod | null;
}

export interface SubmitWellnessPublicInput {
  playerId: string;
  date: string;
  fatigue: number;
  mood: number;
  stress: number;
  motivation: number;
  sleep: number;
  soreness: number;
  notes: string | null;
}

export const wellnessApi = {
  /** Infos joueur publiques (nom + méthode de saisie) pour le formulaire bien-être partagé par lien */
  async getPublicPlayerInfo(playerId: string): Promise<PublicPlayerInfo | null> {
    const { data, error } = await supabase.rpc('get_player_public_info', { p_player_id: playerId }).maybeSingle();
    if (error || !data) return null;
    const info = data as { first_name: string; last_name: string; public_wellness_method: WellnessEntryMethod | null };
    return { firstName: info.first_name, lastName: info.last_name, publicWellnessMethod: info.public_wellness_method };
  },

  /** Soumission bien-être via le formulaire public (lien partagé, sans session) */
  async submitPublic(input: SubmitWellnessPublicInput): Promise<{ error: { message: string } | null }> {
    const { error } = await supabase.rpc('submit_wellness_public', {
      p_player_id:  input.playerId,
      p_date:       input.date,
      p_fatigue:    input.fatigue,
      p_mood:       input.mood,
      p_stress:     input.stress,
      p_motivation: input.motivation,
      p_sleep:      input.sleep,
      p_soreness:   input.soreness,
      p_notes:      input.notes,
    });
    return { error };
  },
  async list(filters: ListWellnessFilters = {}): Promise<WellnessEntry[]> {
    let query = supabase.from('wellness_entries').select('*');
    if (filters.playerId)          query = query.eq('player_id', filters.playerId);
    if (filters.playerIds?.length) query = query.in('player_id', filters.playerIds);
    if (filters.from)     query = query.gte('date', filters.from);
    if (filters.to)       query = query.lte('date', filters.to);
    const { data, error } = await query.order('date', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(toWellness);
  },

  async getByPlayer(playerId: string): Promise<WellnessEntry[]> {
    const { data, error } = await supabase
      .from('wellness_entries')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toWellness);
  },

  async getLatestByPlayer(playerId: string): Promise<WellnessEntry | null> {
    const { data, error } = await supabase
      .from('wellness_entries')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toWellness(data) : null;
  },

  async getByPlayerDate(playerId: string, date: string): Promise<WellnessEntry | null> {
    const { data, error } = await supabase
      .from('wellness_entries')
      .select('*')
      .eq('player_id', playerId)
      .eq('date', date)
      .maybeSingle();
    if (error) throw error;
    return data ? toWellness(data) : null;
  },

  // Upsert sur (player_id, date) — score est GENERATED ALWAYS AS côté DB
  async create(input: Omit<WellnessEntry, 'id' | 'score'>): Promise<WellnessEntry> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('wellness_entries')
      .upsert({
        player_id:  input.playerId,
        date:       input.date,
        fatigue:    input.fatigue,
        mood:       input.mood,
        stress:     input.stress,
        motivation: input.motivation,
        sleep:      input.sleep,
        soreness:   input.soreness,
        notes:      input.notes ?? null,
        created_by: user?.id ?? null,
      }, { onConflict: 'player_id,date' })
      .select()
      .single();
    if (error) throw error;
    return toWellness(data);
  },
};

function toWellness(row: Record<string, unknown>): WellnessEntry {
  return {
    id:         row.id         as string,
    playerId:   row.player_id  as string,
    date:       row.date       as string,
    fatigue:    row.fatigue    as number,
    mood:       row.mood       as number,
    stress:     row.stress     as number,
    motivation: row.motivation as number,
    sleep:      row.sleep      as number,
    soreness:   row.soreness   as number,
    score:      row.score      as number,
    notes:      row.notes      as string | undefined,
  };
}
