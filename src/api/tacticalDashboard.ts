import { supabase } from './client';
import type { TacticalDashboardWidget, TacticalWidgetType } from '../data/types';

export interface TacticalWidgetInput {
  type: TacticalWidgetType;
  categoryId: string;
  title?: string | null;
  config: Record<string, unknown>;
}

export const tacticalDashboardApi = {
  async listWidgets(teamId: string): Promise<TacticalDashboardWidget[]> {
    const { data, error } = await supabase
      .from('tactical_dashboard_widgets')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toTacticalDashboardWidget);
  },

  async createWidget(teamId: string, input: TacticalWidgetInput, sortOrder: number): Promise<TacticalDashboardWidget> {
    const { data, error } = await supabase
      .from('tactical_dashboard_widgets')
      .insert({
        team_id:     teamId,
        type:        input.type,
        category_id: input.categoryId,
        title:       input.title ?? null,
        config:      input.config,
        sort_order:  sortOrder,
      })
      .select()
      .single();
    if (error) throw error;
    return toTacticalDashboardWidget(data);
  },

  async updateWidget(id: string, input: TacticalWidgetInput): Promise<TacticalDashboardWidget> {
    const { data, error } = await supabase
      .from('tactical_dashboard_widgets')
      .update({
        type:        input.type,
        category_id: input.categoryId,
        title:       input.title ?? null,
        config:      input.config,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toTacticalDashboardWidget(data);
  },

  async deleteWidget(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_dashboard_widgets').delete().eq('id', id);
    if (error) throw error;
  },

  async reorderWidgets(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('tactical_dashboard_widgets').update({ sort_order: i }).eq('id', id)
    ));
  },
};

function toTacticalDashboardWidget(row: Record<string, unknown>): TacticalDashboardWidget {
  return {
    id:         row.id          as string,
    teamId:     row.team_id     as string,
    type:       row.type        as TacticalWidgetType,
    categoryId: row.category_id as string,
    title:      row.title       as string | null,
    config:     (row.config as Record<string, unknown>) ?? {},
    sortOrder:  row.sort_order  as number,
  };
}
