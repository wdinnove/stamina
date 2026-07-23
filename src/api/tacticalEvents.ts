import { supabase } from './client';
import type { TacticalEvent } from '../data/types';

export const tacticalEventsApi = {
  async getByMatchId(matchId: string): Promise<TacticalEvent[]> {
    const { data, error } = await supabase
      .from('tactical_events')
      .select('*, tactical_event_values(dimension_id, label)')
      .eq('match_id', matchId)
      .order('category_id', { ascending: true })
      .order('sequence_number', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toTacticalEvent);
  },

  async getForMatches(matchIds: string[]): Promise<TacticalEvent[]> {
    if (matchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('tactical_events')
      .select('*, tactical_event_values(dimension_id, label)')
      .in('match_id', matchIds);
    if (error) throw error;
    return (data ?? []).map(toTacticalEvent);
  },

  // tactical_event_values est ON DELETE CASCADE sur tactical_events : pas besoin de le supprimer séparément.
  async deleteForMatch(matchId: string): Promise<void> {
    const { error } = await supabase.from('tactical_events').delete().eq('match_id', matchId);
    if (error) throw error;
  },
};

function toTacticalEvent(row: Record<string, unknown>): TacticalEvent {
  const values = (row.tactical_event_values ?? []) as { dimension_id: string; label: string }[];
  return {
    id:             row.id              as string,
    matchId:        row.match_id        as string,
    categoryId:     row.category_id     as string,
    sequenceNumber: row.sequence_number as number,
    values: values.map(v => ({ dimensionId: v.dimension_id, label: v.label })),
  };
}
