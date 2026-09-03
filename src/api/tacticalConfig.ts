import { supabase } from './client';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';
import type { ParsedConfigCategory } from '../utils/tacticalCsvParser';
import { NEW_CATEGORY_PALETTE } from './categories';

export interface TacticalTeamConfig {
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
}

/** Ce qu'un import de configuration a réellement fait. Rien n'est jamais écrasé ni supprimé :
 *  tout ce qui existait déjà (retrouvé par nom normalisé) est laissé intact et compté à part. */
export interface TacticalConfigImportResult {
  createdCategories: number;
  createdDimensions: number;
  createdOptions: number;
  existingCategories: number;
  existingDimensions: number;
  existingOptions: number;
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

  // category_id (tactical_actions) est volontairement SANS CASCADE (protège l'historique importé) :
  // supprimer une catégorie déjà utilisée dans un import échoue avec une violation de clé étrangère,
  // à afficher comme message clair côté UI plutôt que de bloquer la suppression en amont.
  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_categories').delete().eq('id', id);
    if (error) throw error;
  },

  /** Retrouve une catégorie par nom normalisé, ou la crée (dernière position). Matche sur
   *  `normalizedName` (figé à la création), jamais sur le nom d'affichage courant — sinon un
   *  renommage dans la config casse le rapprochement avec les futurs imports du même libellé
   *  brut vidéo. */
  async ensureCategory(teamId: string, rawName: string, existing: TacticalCategory[]): Promise<{ category: TacticalCategory; created: boolean }> {
    const normalized = normalizeTacticalName(rawName);
    const found = existing.find(c => c.normalizedName === normalized);
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
  async createDimension(teamId: string, categoryId: string, name: string, sortOrder: number, siblings: TacticalDimension[]): Promise<TacticalDimension> {
    const { data, error } = await supabase
      .from('tactical_dimensions')
      .insert({
        team_id: teamId, category_id: categoryId, name,
        normalized_name: normalizeTacticalName(name), sort_order: sortOrder,
        slot: nextSlot(siblings, categoryId),
      })
      .select()
      .single();
    if (error) throw error;
    return toTacticalDimension(data);
  },

  // ATTENTION — contrairement aux catégories, plus aucune clé étrangère ne protège ici : les
  // actions n'adressent les dimensions que par `slot`, un entier. Supprimer une dimension utilisée
  // RÉUSSIT donc, et rend simplement ses valeurs illisibles (la réhydratation les ignore). C'est
  // l'écran de configuration qui prévient, à partir du nombre d'actions de la catégorie.
  async deleteDimension(id: string): Promise<void> {
    const { error } = await supabase.from('tactical_dimensions').delete().eq('id', id);
    if (error) throw error;
  },

  /** Retrouve une dimension (au sein d'une catégorie) par nom normalisé, ou la crée (dernière
   *  position). Matche sur `normalizedName` figé — voir `ensureCategory`. */
  async ensureDimension(teamId: string, categoryId: string, rawName: string, existing: TacticalDimension[]): Promise<{ dimension: TacticalDimension; created: boolean }> {
    const normalized = normalizeTacticalName(rawName);
    const found = existing.find(d => d.categoryId === categoryId && d.normalizedName === normalized);
    if (found) return { dimension: found, created: false };
    const siblings = existing.filter(d => d.categoryId === categoryId);
    const nextOrder = siblings.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;
    const { data, error } = await supabase
      .from('tactical_dimensions')
      .insert({
        team_id: teamId, category_id: categoryId, name: rawName, normalized_name: normalized,
        sort_order: nextOrder, slot: nextSlot(existing, categoryId),
      })
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

  async updateCategoryRentabiliteInversee(id: string, inversee: boolean): Promise<void> {
    const { error } = await supabase.from('tactical_categories').update({ rentabilite_inversee: inversee }).eq('id', id);
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

  /**
   * Pré-crée la taxonomie d'une équipe depuis un CSV de configuration : catégories,
   * dimensions, et le catalogue d'options de chaque dimension.
   *
   * Purement additif, donc rejouable : une catégorie/dimension/option déjà présente (retrouvée
   * par nom normalisé, comme à l'import d'un match) est réutilisée telle quelle — jamais
   * renommée, jamais supprimée, et les options en base absentes du fichier restent en place.
   * C'est aussi ce qui protège la contrainte d'unicité du catalogue.
   */
  async importConfig(teamId: string, parsed: ParsedConfigCategory[]): Promise<TacticalConfigImportResult> {
    let { categories, dimensions, options } = await tacticalConfigApi.getForTeam(teamId);
    const result: TacticalConfigImportResult = {
      createdCategories: 0, createdDimensions: 0, createdOptions: 0,
      existingCategories: 0, existingDimensions: 0, existingOptions: 0,
    };
    const missingOptions: { dimensionId: string; label: string }[] = [];

    // Séquentiel (pas Promise.all) : chaque création doit voir les précédentes, pour le
    // dédoublonnage comme pour le calcul du prochain sort_order.
    for (const parsedCategory of parsed) {
      const { category, created } = await tacticalConfigApi.ensureCategory(teamId, parsedCategory.name, categories);
      if (created) { categories = [...categories, category]; result.createdCategories++; }
      else result.existingCategories++;

      for (const parsedDimension of parsedCategory.dimensions) {
        const { dimension, created: dimensionCreated } =
          await tacticalConfigApi.ensureDimension(teamId, category.id, parsedDimension.name, dimensions);
        if (dimensionCreated) { dimensions = [...dimensions, dimension]; result.createdDimensions++; }
        else result.existingDimensions++;

        const known = new Set(
          options.filter(o => o.dimensionId === dimension.id).map(o => normalizeTacticalName(o.label)),
        );
        for (const label of parsedDimension.options) {
          if (known.has(normalizeTacticalName(label))) result.existingOptions++;
          else missingOptions.push({ dimensionId: dimension.id, label });
        }
      }
    }

    // Toutes les options manquantes en une requête, à la fin : un fichier de configuration
    // complet en crée facilement deux cents, une par requête serait deux cents allers-retours.
    const createdOptions = await tacticalConfigApi.createOptions(teamId, missingOptions, options);
    result.createdOptions = createdOptions.length;

    return result;
  },

  // ─── Catalogue d'options attendues (curé à la main, jamais auto-créé par l'import) ────

  async createOption(teamId: string, dimensionId: string, label: string, sortOrder: number, siblings: TacticalDimensionOption[]): Promise<TacticalDimensionOption> {
    const { data, error } = await supabase
      .from('tactical_dimension_options')
      .insert({
        team_id: teamId, dimension_id: dimensionId, label,
        normalized_label: normalizeTacticalName(label), sort_order: sortOrder,
        code: nextCode(siblings, dimensionId),
      })
      .select()
      .single();
    if (error) throw error;
    return toTacticalDimensionOption(data);
  },

  /**
   * Crée d'un coup les options manquantes de plusieurs dimensions (import de configuration,
   * valeurs inconnues rencontrées à l'import d'un match) — une seule requête au lieu d'une par
   * option. Les libellés déjà présents, comparés en normalisé, sont ignorés.
   */
  async createOptions(
    teamId: string,
    wanted: { dimensionId: string; label: string }[],
    existing: TacticalDimensionOption[],
  ): Promise<TacticalDimensionOption[]> {
    const pool = [...existing];
    const rows: Record<string, unknown>[] = [];
    for (const { dimensionId, label } of wanted) {
      const siblings = pool.filter(o => o.dimensionId === dimensionId);
      if (siblings.some(o => normalizeTacticalName(o.label) === normalizeTacticalName(label))) continue;
      const code = nextCode(pool, dimensionId);
      const sortOrder = siblings.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1;
      // Ajoutée au pool local avant l'insert : deux fois le même libellé dans `wanted` ne doit
      // produire qu'une ligne, et les rangs suivants doivent voir celui-ci.
      pool.push({ id: `pending-${dimensionId}-${code}`, teamId, dimensionId, label, sortOrder, code });
      rows.push({
        team_id: teamId, dimension_id: dimensionId, label,
        normalized_label: normalizeTacticalName(label), sort_order: sortOrder, code,
      });
    }
    if (rows.length === 0) return [];
    const { data, error } = await supabase.from('tactical_dimension_options').insert(rows).select();
    if (error) throw error;
    return (data ?? []).map(toTacticalDimensionOption);
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
    // Même remarque que pour les dimensions : les actions ne stockent que le `code` de l'option,
    // sans clé étrangère. Supprimer une option utilisée réussit et rend ses valeurs illisibles ;
    // son code n'est pour autant JAMAIS réattribué, sans quoi l'historique basculerait d'un
    // libellé à un autre.
    const { error } = await supabase.from('tactical_dimension_options').delete().eq('id', id);
    if (error) throw error;
  },
};

/** Prochain `slot` libre d'une catégorie. Basé sur le max, jamais sur le nombre de dimensions :
 *  un slot libéré par une suppression ne doit pas être réattribué (cf. schema.sql). */
function nextSlot(dimensions: TacticalDimension[], categoryId: string): number {
  return dimensions
    .filter(d => d.categoryId === categoryId)
    .reduce((max, d) => Math.max(max, d.slot), -1) + 1;
}

/** Prochain `code` libre d'une dimension — codes numérotés à partir de 1, jamais réattribués. */
function nextCode(options: TacticalDimensionOption[], dimensionId: string): number {
  return options
    .filter(o => o.dimensionId === dimensionId)
    .reduce((max, o) => Math.max(max, o.code), 0) + 1;
}

function toTacticalCategory(row: Record<string, unknown>): TacticalCategory {
  return {
    id:                    row.id                     as string,
    teamId:                row.team_id                as string,
    name:                  row.name                   as string,
    normalizedName:        row.normalized_name         as string,
    sortOrder:             row.sort_order              as number,
    color:                 (row.color as string | undefined) ?? '#3B82F6',
    rentabiliteSeuilVert:  Number(row.rentabilite_seuil_vert  ?? 1),
    rentabiliteSeuilBleu:  Number(row.rentabilite_seuil_bleu  ?? 0.6),
    rentabiliteSeuilAmbre: Number(row.rentabilite_seuil_ambre ?? 0.3),
    rentabiliteInversee:   (row.rentabilite_inversee as boolean | undefined) ?? false,
  };
}

function toTacticalDimension(row: Record<string, unknown>): TacticalDimension {
  return {
    id:             row.id            as string,
    teamId:         row.team_id       as string,
    categoryId:     row.category_id   as string,
    name:           row.name          as string,
    normalizedName: row.normalized_name as string,
    sortOrder:      row.sort_order    as number,
    slot:           row.slot          as number,
  };
}

function toTacticalDimensionOption(row: Record<string, unknown>): TacticalDimensionOption {
  return {
    id:          row.id           as string,
    teamId:      row.team_id      as string,
    dimensionId: row.dimension_id as string,
    label:       row.label        as string,
    sortOrder:   row.sort_order   as number,
    code:        row.code         as number,
  };
}
