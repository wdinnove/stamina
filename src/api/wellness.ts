import { supabase } from './client';
import type { WellnessEntry } from '../data/types';

export interface ListWellnessFilters {
  playerId?: string;
  from?: string;
  to?: string;
}

export const wellnessApi = {
  async list(filters: ListWellnessFilters = {}): Promise<WellnessEntry[]> {
    let query = supabase.from('wellness_entries').select('*');
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.from)     query = query.gte('date', filters.from);
    if (filters.to)       query = query.lte('date', filters.to);
    const { data, error } = await query.order('date', { ascending: false });
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
