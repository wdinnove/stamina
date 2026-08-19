import { supabase } from './client';
import type { TacticalSystemPhase } from '../data/types';
import type { DiagramScene } from '../utils/diagram';

function toPhase(row: Record<string, unknown>): TacticalSystemPhase {
  return {
    id:         row.id as string,
    systemId:   row.tactical_system_id as string,
    position:   row.position as number,
    title:      (row.title as string | null) ?? undefined,
    text:       (row.text as string | null) ?? undefined,
    scene:      row.scene as DiagramScene,
    thumbUrl:   (row.thumb_url as string | null) ?? undefined,
    createdAt:  row.created_at as string,
  };
}

export const tacticalSystemPhasesApi = {
  async list(systemId: string): Promise<TacticalSystemPhase[]> {
    const { data, error } = await supabase
      .from('tactical_system_phases')
      .select('*')
      .eq('tactical_system_id', systemId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toPhase);
  },

  async create(systemId: string, input: {
    position: number; scene: DiagramScene; title?: string; text?: string;
  }): Promise<TacticalSystemPhase> {
    const { data, error } = await supabase
      .from('tactical_system_phases')
      .insert({
        tactical_system_id: systemId,
        position:           input.position,
        scene:               input.scene,
        title:               input.title || null,
        text:                input.text || null,
      })
      .select()
      .single();
    if (error) throw error;
    return toPhase(data as Record<string, unknown>);
  },

  /** Insertion en lot — sert à la copie d'un système, où les phases arrivent toutes ensemble. */
  async createMany(systemId: string, inputs: {
    position: number; scene: DiagramScene; title?: string; text?: string;
  }[]): Promise<TacticalSystemPhase[]> {
    if (inputs.length === 0) return [];
    const { data, error } = await supabase
      .from('tactical_system_phases')
      .insert(inputs.map(p => ({
        tactical_system_id: systemId,
        position:            p.position,
        scene:                p.scene,
        title:                p.title || null,
        text:                 p.text || null,
      })))
      .select();
    if (error) throw error;
    return (data ?? []).map(toPhase);
  },

  async update(id: string, patch: {
    title?: string; text?: string; scene?: DiagramScene; position?: number;
  }): Promise<TacticalSystemPhase> {
    const payload: Record<string, unknown> = {};
    if (patch.title    !== undefined) payload.title    = patch.title || null;
    if (patch.text     !== undefined) payload.text     = patch.text || null;
    if (patch.scene    !== undefined) payload.scene    = patch.scene;
    if (patch.position !== undefined) payload.position = patch.position;
    const { data, error } = await supabase.from('tactical_system_phases').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return toPhase(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_system_phases').delete().eq('id', id);
    if (error) throw error;
  },
};
