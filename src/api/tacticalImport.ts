import { supabase } from './client';
import { tacticalConfigApi } from './tacticalConfig';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';
import type { ParsedCategoryBlock } from '../utils/tacticalCsvParser';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';

export interface UnexpectedValue {
  category: string;
  dimension: string;
  label: string;
}

export interface TacticalImportResult {
  createdCategories: string[];
  createdDimensions: string[];
  totalEvents: number;
  /** Valeurs importées normalement mais absentes du catalogue configuré de leur dimension (si un catalogue existe). */
  unexpectedValues: UnexpectedValue[];
}

export const tacticalImportApi = {
  /**
   * Résout/complète catégories + dimensions de l'équipe (auto-création si absentes),
   * puis réimporte intégralement les événements du match (delete-then-insert, comme
   * `statsApi.bulkUpsertForMatch`). Le catalogue d'options (`tactical_dimension_options`)
   * n'est JAMAIS auto-complété par l'import — contrairement aux catégories/dimensions,
   * c'est une liste curée à la main : toute valeur hors catalogue est importée sans
   * perte, seulement remontée en avertissement.
   */
  async importForMatch(matchId: string, teamId: string, blocks: ParsedCategoryBlock[]): Promise<TacticalImportResult> {
    let categories: TacticalCategory[] = [];
    let dimensions: TacticalDimension[] = [];
    let options: TacticalDimensionOption[] = [];
    ({ categories, dimensions, options } = await tacticalConfigApi.getForTeam(teamId));

    const createdCategories: string[] = [];
    const createdDimensions: string[] = [];

    interface ResolvedBlock { categoryName: string; categoryId: string; dimensionNames: string[]; dimensionIds: string[]; rows: string[][] }
    const resolvedBlocks: ResolvedBlock[] = [];

    // Séquentiel (pas Promise.all) : chaque ensureX doit voir les créations précédentes
    // du même import pour ne pas créer deux fois la même catégorie/dimension.
    for (const block of blocks) {
      const { category, created: categoryCreated } = await tacticalConfigApi.ensureCategory(teamId, block.categoryName, categories);
      if (categoryCreated) { categories = [...categories, category]; createdCategories.push(category.name); }

      const dimensionIds: string[] = [];
      for (const dimName of block.dimensionNames) {
        const { dimension, created: dimensionCreated } = await tacticalConfigApi.ensureDimension(teamId, category.id, dimName, dimensions);
        if (dimensionCreated) { dimensions = [...dimensions, dimension]; createdDimensions.push(`${category.name} · ${dimension.name}`); }
        dimensionIds.push(dimension.id);
      }
      resolvedBlocks.push({ categoryName: category.name, categoryId: category.id, dimensionNames: block.dimensionNames, dimensionIds, rows: block.rows });
    }

    // Rapprochement au catalogue : uniquement pour les dimensions qui EN ONT un configuré
    // (catalogue optionnel par dimension) — jamais de blocage, juste un avertissement.
    const expectedByDimension = new Map<string, Set<string>>();
    for (const opt of options) {
      if (!expectedByDimension.has(opt.dimensionId)) expectedByDimension.set(opt.dimensionId, new Set());
      expectedByDimension.get(opt.dimensionId)!.add(normalizeTacticalName(opt.label));
    }
    const unexpectedValues: UnexpectedValue[] = [];
    const seenUnexpected = new Set<string>();
    for (const block of resolvedBlocks) {
      block.dimensionIds.forEach((dimensionId, di) => {
        const expected = expectedByDimension.get(dimensionId);
        if (!expected) return; // pas de catalogue configuré pour cette dimension : rien à vérifier
        for (const row of block.rows) {
          const label = row[di];
          if (!label || !label.trim()) continue;
          if (expected.has(normalizeTacticalName(label))) continue;
          const key = `${block.categoryId}::${dimensionId}::${normalizeTacticalName(label)}`;
          if (seenUnexpected.has(key)) continue;
          seenUnexpected.add(key);
          unexpectedValues.push({ category: block.categoryName, dimension: block.dimensionNames[di], label });
        }
      });
    }

    const { error: delErr } = await supabase.from('tactical_events').delete().eq('match_id', matchId);
    if (delErr) throw delErr;

    let totalEvents = 0;
    for (const block of resolvedBlocks) {
      if (block.rows.length === 0) continue;
      const { data: insertedEvents, error: insErr } = await supabase
        .from('tactical_events')
        .insert(block.rows.map((_, i) => ({
          match_id: matchId,
          category_id: block.categoryId,
          sequence_number: i + 1,
        })))
        .select('id');
      if (insErr) throw insErr;

      const valueRows = (insertedEvents ?? []).flatMap((ev: { id: string }, i: number) =>
        block.dimensionIds
          .map((dimensionId, di) => ({ event_id: ev.id, match_id: matchId, dimension_id: dimensionId, label: block.rows[i][di] ?? '' }))
          .filter(v => v.label.trim() !== '')
      );
      if (valueRows.length > 0) {
        const { error: valErr } = await supabase.from('tactical_event_values').insert(valueRows);
        if (valErr) throw valErr;
      }
      totalEvents += block.rows.length;
    }

    return { createdCategories, createdDimensions, totalEvents, unexpectedValues };
  },
};
