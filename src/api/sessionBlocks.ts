import { supabase } from './client';
import type { SessionBlock } from '../data/types';

/** Une utilisation d'un exercice dans une séance, vue depuis l'exercice. */
export interface DrillUsage {
  blockId: string;
  blockLabel: string;
  sessionId: string;
  date: string;
}

function toBlock(row: Record<string, unknown>): SessionBlock {
  return {
    id:        row.id as string,
    sessionId: row.session_id as string,
    position:  row.position as number,
    kind:      (row.kind as SessionBlock['kind']) ?? 'exercice',
    duration:  row.duration as number,
    category:  row.category as string,
    intensity: row.intensity as SessionBlock['intensity'],
    label:       row.label as string,
    description: row.description as string | undefined,
    consignes:   row.consignes as string | undefined,
    loadUa:      row.load_ua as number,
    drillId:     row.drill_id as string | null,
    staffId:     (row.staff_id as string | null) ?? null,
    teamBlockId: (row.team_block_id as string | null) ?? null,
    createdAt:   row.created_at as string,
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
    kind?: SessionBlock['kind'];
    duration: number;
    category: string;
    intensity: SessionBlock['intensity'];
    label: string;
    description?: string;
    consignes?: string;
    drillId?: string | null;
    staffId?: string | null;
    teamBlockId?: string | null;
  }): Promise<SessionBlock> {
    const { data, error } = await supabase
      .from('session_blocks')
      .insert({
        session_id:    sessionId,
        position:      block.position,
        kind:          block.kind ?? 'exercice',
        duration:      block.duration,
        category:      block.category,
        intensity:     block.intensity,
        label:         block.label,
        description:   block.description || null,
        consignes:     block.consignes || null,
        drill_id:      block.drillId ?? null,
        staff_id:      block.staffId ?? null,
        team_block_id: block.teamBlockId ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toBlock(data as Record<string, unknown>);
  },

  async update(id: string, patch: Partial<Pick<SessionBlock, 'duration' | 'category' | 'intensity' | 'label' | 'description' | 'consignes' | 'position' | 'drillId' | 'staffId' | 'teamBlockId'>>): Promise<SessionBlock> {
    const payload: Record<string, unknown> = {};
    if (patch.duration    !== undefined) payload.duration    = patch.duration;
    if (patch.category    !== undefined) payload.category    = patch.category;
    if (patch.intensity   !== undefined) payload.intensity    = patch.intensity;
    if (patch.label       !== undefined) payload.label        = patch.label;
    if (patch.description !== undefined) payload.description  = patch.description || null;
    if (patch.consignes   !== undefined) payload.consignes    = patch.consignes || null;
    if (patch.position    !== undefined) payload.position     = patch.position;
    if (patch.drillId     !== undefined) payload.drill_id     = patch.drillId;
    if (patch.staffId     !== undefined) payload.staff_id      = patch.staffId;
    if (patch.teamBlockId !== undefined) payload.team_block_id = patch.teamBlockId;
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

  /**
   * Séances qui utilisent un exercice de la bibliothèque — le « Utilisé dans » de la fiche
   * exercice. Le lien existait déjà par `drill_id` mais ne se lisait que dans un sens.
   */
  async listUsage(drillId: string): Promise<DrillUsage[]> {
    const { data, error } = await supabase
      .from('session_blocks')
      .select('id, label, session_id, training_sessions(date)')
      .eq('drill_id', drillId);
    if (error) throw error;
    return (data ?? [])
      .map(row => {
        const r = row as Record<string, unknown>;
        const session = r.training_sessions as { date: string } | null;
        return {
          blockId:    r.id as string,
          blockLabel: r.label as string,
          sessionId:  r.session_id as string,
          date:       session?.date ?? '',
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  },
};
