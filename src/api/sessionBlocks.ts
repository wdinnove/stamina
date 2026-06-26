import { supabase } from './client';
import type { SessionBlock } from '../data/types';

function toBlock(row: Record<string, unknown>): SessionBlock {
  return {
    id:        row.id as string,
    sessionId: row.session_id as string,
    position:  row.position as number,
    duration:  row.duration as number,
    category:  row.category as string,
    intensity: row.intensity as SessionBlock['intensity'],
    label:     row.label as string,
    loadUa:    row.load_ua as number,
    drillId:   row.drill_id as string | null,
    createdAt: row.created_at as string,
  };
}

export const sessionBlocksApi = {
  async list(sessionId: string): Promise<SessionBlock[]> {
    const { data, error } = await supabase
      .from('session_blocks')
      .select('*')
      .eq('session_id', sessionId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toBlock);
  },

  async listBySessions(sessionIds: string[]): Promise<SessionBlock[]> {
    if (!sessionIds.length) return [];
    const { data, error } = await supabase
      .from('session_blocks')
      .select('*')
      .in('session_id', sessionIds);
    if (error) throw error;
    return (data ?? []).map(toBlock);
  },

  async create(sessionId: string, block: {
    position: number;
    duration: number;
    category: string;
    intensity: SessionBlock['intensity'];
    label: string;
    drillId?: string | null;
  }): Promise<SessionBlock> {
    const { data, error } = await supabase
      .from('session_blocks')
      .insert({
        session_id: sessionId,
        position:   block.position,
        duration:   block.duration,
        category:   block.category,
        intensity:  block.intensity,
        label:      block.label,
        drill_id:   block.drillId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toBlock(data as Record<string, unknown>);
  },

  async update(id: string, patch: Partial<Pick<SessionBlock, 'duration' | 'category' | 'intensity' | 'label' | 'position' | 'drillId'>>): Promise<SessionBlock> {
    const payload: Record<string, unknown> = {};
    if (patch.duration  !== undefined) payload.duration  = patch.duration;
    if (patch.category  !== undefined) payload.category  = patch.category;
    if (patch.intensity !== undefined) payload.intensity = patch.intensity;
    if (patch.label     !== undefined) payload.label     = patch.label;
    if (patch.position  !== undefined) payload.position  = patch.position;
    if (patch.drillId   !== undefined) payload.drill_id  = patch.drillId;
    const { data, error } = await supabase
      .from('session_blocks')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toBlock(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('session_blocks').delete().eq('id', id);
    if (error) throw error;
  },
};
