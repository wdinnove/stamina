import { supabase } from './client';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';
import { NEW_CATEGORY_PALETTE } from './exerciseCategories';

export interface TacticalTeamConfig {
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
}

export const tacticalConfigApi = {
  async getForTeam(teamId: string): Promise<TacticalTeamConfig> {
    const [{ data: catRows, error: catErr }, { data: dimRows, error: dimErr }, { data: optRows, error: optErr }] = await Promise.all([
      supabase.from('tactical_categories').select('*').eq('team_id', teamId).order('sort_order', { ascending: true }),
      supabase.from('tactical_dimensions').select('*').eq('team_id', teamId).order('sort_order', { ascending: true }),
      supabase.from('tactical_dimension_options').select('*').eq('team_id', teamId).order('sort_order', { ascending: true }),
    ]);
    if (catErr) throw catErr;
    if (dimErr) throw dimErr;
    if (optErr) throw optErr;
    return {
      categories: (catRows ?? []).map(toTacticalCategory),
      dimensions: (dimRows ?? []).map(toTacticalDimension),
      options: (optRows ?? []).map(toTacticalDimensionOption),
    };
  },

  /** Création manuelle depuis l'écran de configuration (dernière position). */
  async createCategory(teamId: string, name: string, sortOrder: number): Promise<TacticalCategory> {
    const color = NEW_CATEGORY_PALETTE[sortOrder % NEW_CATEGORY_PALETTE.length];
    const { data, error } = await supabase
      .from('tactical_categories')
      .insert({ team_id: teamId, name, normalized_name: normalizeTacticalName(name), sort_order: sortOrder, color })
      .select()
      .single();
    if (error) throw error;
    return toTacticalCategory(data);
  },

  async updateCategoryColor(id: string, color: string): Promise<void> {
    const { error } = await supabase.from('tactical_categories').update({ color }).eq('id', id);
    if (error) throw error;
  },

  // category_id (tactical_events) est volontairement SANS CASCADE (protège l'historique importé) :
  // supprimer une catégorie déjà utilisée dans un import échoue avec une violation de clé étrangère,
  // à afficher comme message clair côté UI plutôt que de bloquer la suppression en amont.
  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_categories').delete().eq('id', id);
    if (error) throw error;
  },

  /** Retrouve une catégorie par nom normalisé, ou la crée (dernière position). */
  async ensureCategory(teamId: string, rawName: string, existing: TacticalCategory[]): Promise<{ category: TacticalCategory; created: boolean }> {
    const normalized = normalizeTacticalName(rawName);
    const found = existing.find(c => normalizeTacticalName(c.name) === normalized);
    if (found) return { category: found, created: false };
    const nextOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
    const color = NEW_CATEGORY_PALETTE[nextOrder % NEW_CATEGORY_PALETTE.length];
    const { data, error } = await supabase
      .from('tactical_categories')
      .insert({ team_id: teamId, name: rawName, normalized_name: normalized, sort_order: nextOrder, color })
      .select()
      .single();
    if (error) throw error;
    return { category: toTacticalCategory(data), created: true };
  },

  /** Création manuelle depuis l'écran de configuration (dernière position au sein de la catégorie). */
  async createDimension(teamId: string, categoryId: string, name: string, sortOrder: number): Promise<TacticalDimension> {
    const { data, error } = await supabase
      .from('tactical_dimensions')
      .insert({ team_id: teamId, category_id: categoryId, name, normalized_name: normalizeTacticalName(name), sort_order: sortOrder })
      .select()
      .single();
    if (error) throw error;
    return toTacticalDimension(data);
  },

  // dimension_id (tactical_event_values) est volontairement SANS CASCADE (protège l'historique
  // importé) : supprimer une dimension déjà utilisée dans un import échoue avec une violation de
  // clé étrangère, à afficher comme message clair côté UI plutôt que de bloquer la suppression en amont.
  async deleteDimension(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_dimensions').delete().eq('id', id);
    if (error) throw error;
  },

  /** Retrouve une dimension (au sein d'une catégorie) par nom normalisé, ou la crée (dernière position). */
  async ensureDimension(teamId: string, categoryId: string, rawName: string, existing: TacticalDimension[]): Promise<{ dimension: TacticalDimension; created: boolean }> {
    const normalized = normalizeTacticalName(rawName);
    const found = existing.find(d => d.categoryId === categoryId && normalizeTacticalName(d.name) === normalized);
    if (found) return { dimension: found, created: false };
    const siblings = existing.filter(d => d.categoryId === categoryId);
    const nextOrder = siblings.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;
    const { data, error } = await supabase
      .from('tactical_dimensions')
      .insert({ team_id: teamId, category_id: categoryId, name: rawName, normalized_name: normalized, sort_order: nextOrder })
      .select()
      .single();
    if (error) throw error;
    return { dimension: toTacticalDimension(data), created: true };
  },

  async renameCategory(id: string, name: string): Promise<void> {
    // Ne touche jamais normalized_name : les futurs imports doivent continuer à matcher
    // sur le libellé brut d'origine, indépendamment du renommage d'affichage.
    const { error } = await supabase.from('tactical_categories').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async reorderCategories(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('tactical_categories').update({ sort_order: i }).eq('id', id)
    ));
  },

  async updateCategoryThresholds(id: string, thresholds: { vert: number; bleu: number; ambre: number }): Promise<void> {
    const { error } = await supabase
      .from('tactical_categories')
      .update({ rentabilite_seuil_vert: thresholds.vert, rentabilite_seuil_bleu: thresholds.bleu, rentabilite_seuil_ambre: thresholds.ambre })
      .eq('id', id);
    if (error) throw error;
  },

  async renameDimension(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('tactical_dimensions').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async reorderDimensions(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('tactical_dimensions').update({ sort_order: i }).eq('id', id)
    ));
  },

  // ─── Catalogue d'options attendues (curé à la main, jamais auto-créé par l'import) ────

  async createOption(teamId: string, dimensionId: string, label: string, sortOrder: number): Promise<TacticalDimensionOption> {
    const { data, error } = await supabase
      .from('tactical_dimension_options')
      .insert({ team_id: teamId, dimension_id: dimensionId, label, normalized_label: normalizeTacticalName(label), sort_order: sortOrder })
      .select()
      .single();
    if (error) throw error;
    return toTacticalDimensionOption(data);
  },

  async renameOption(id: string, label: string): Promise<void> {
    const { error } = await supabase
      .from('tactical_dimension_options')
      .update({ label, normalized_label: normalizeTacticalName(label) })
      .eq('id', id);
    if (error) throw error;
  },

  async reorderOptions(orderedIds: string[]): Promise<void> {
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from('tactical_dimension_options').update({ sort_order: i }).eq('id', id)
    ));
  },

  async deleteOption(id: string): Promise<void> {
    // Sans risque contrairement aux catégories/dimensions : tactical_event_values.label est du
    // texte libre, jamais lié par clé étrangère au catalogue — l'historique importé est intact.
    const { error } = await supabase.from('tactical_dimension_options').delete().eq('id', id);
    if (error) throw error;
  },
};

function toTacticalCategory(row: Record<string, unknown>): TacticalCategory {
  return {
    id:                    row.id                     as string,
    teamId:                row.team_id                as string,
    name:                  row.name                   as string,
    sortOrder:             row.sort_order              as number,
    color:                 (row.color as string | undefined) ?? '#3B82F6',
    rentabiliteSeuilVert:  Number(row.rentabilite_seuil_vert  ?? 1),
    rentabiliteSeuilBleu:  Number(row.rentabilite_seuil_bleu  ?? 0.6),
    rentabiliteSeuilAmbre: Number(row.rentabilite_seuil_ambre ?? 0.3),
  };
}

function toTacticalDimension(row: Record<string, unknown>): TacticalDimension {
  return {
    id:         row.id          as string,
    teamId:     row.team_id     as string,
    categoryId: row.category_id as string,
    name:       row.name        as string,
    sortOrder:  row.sort_order  as number,
  };
}

function toTacticalDimensionOption(row: Record<string, unknown>): TacticalDimensionOption {
  return {
    id:          row.id           as string,
    teamId:      row.team_id      as string,
    dimensionId: row.dimension_id as string,
    label:       row.label        as string,
    sortOrder:   row.sort_order   as number,
  };
}
