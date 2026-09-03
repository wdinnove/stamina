import { supabase } from './client';
import { tacticalConfigApi } from './tacticalConfig';
import { normalizeTacticalName, isBlankTacticalCell } from '../utils/tacticalCsvParser';
import type { ParsedCategoryBlock } from '../utils/tacticalCsvParser';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';

/** Une valeur du CSV absente du catalogue, qui y a été ajoutée pour recevoir un code. */
export interface AddedOption {
  category: string;
  dimension: string;
  label: string;
}

export interface TacticalImportResult {
  createdCategories: string[];
  createdDimensions: string[];
  totalActions: number;
  /** Valeurs ajoutées d'office au catalogue — à relire dans la configuration (fautes de frappe). */
  addedOptions: AddedOption[];
}

/**
 * Ce que l'import efface avant de réinsérer :
 * - `match` : tout le tactique du match (fichier unique contenant toutes les catégories) ;
 * - `imported-categories` : uniquement les catégories présentes dans les fichiers importés,
 *   les autres déjà saisies pour ce match sont conservées (import thème par thème, en
 *   plusieurs fois).
 */
export type TacticalReplaceScope = 'match' | 'imported-categories';

/** Rapprochement d'un jeton « #0 Cynthia » du CSV vers une joueuse de l'effectif. */
export type PlayerIdByToken = Record<string, string>;

/** Découpe une cellule « #0 Cynthia, #14 Eva Ha » en jetons, dans l'ordre du CSV. */
export function splitPlayerTokens(cell: string): string[] {
  return cell.split(',').map(t => t.trim()).filter(t => t !== '' && !isBlankTacticalCell(t));
}

/** Une ligne de la charge utile envoyée à `import_tactical_actions`. */
export interface ActionPayload {
  category_id: string;
  seq: number;
  valeur: number | null;
  options: (number | null)[];
  player_ids: string[];
}

/** Un bloc du CSV dont les colonnes ont été rattachées à leur dimension. */
export interface ResolvedBlock {
  categoryId: string;
  /** Dimension de chaque colonne — null pour la colonne des joueuses, qui n'en est pas une. */
  columnDimensions: (TacticalDimension | null)[];
  rows: string[][];
}

/**
 * Traduit les blocs du CSV en lignes prêtes à insérer. Fonction pure : c'est ici que se joue
 * l'essentiel de la correction de l'import (adressage par `slot`, valeur sortie des options,
 * découpe des joueuses), donc c'est ici qu'on peut la tester sans base.
 *
 * `codeByLabel` est indexé `dimensionId::libellé normalisé`.
 */
export function buildActionPayloads(
  blocks: ResolvedBlock[],
  codeByLabel: Map<string, number>,
  playerIdByToken: PlayerIdByToken,
): ActionPayload[] {
  // Numérotation par catégorie, reprise d'un bloc à l'autre : deux fichiers peuvent viser la
  // même catégorie, et `seq` est unique par (match, catégorie).
  const nextSeq = new Map<string, number>();
  const payload: ActionPayload[] = [];

  for (const block of blocks) {
    const slotCount = block.columnDimensions.reduce((max, d) => Math.max(max, (d?.slot ?? -1) + 1), 0);
    for (const row of block.rows) {
      const seq = nextSeq.get(block.categoryId) ?? 1;
      nextSeq.set(block.categoryId, seq + 1);

      const options: (number | null)[] = new Array(slotCount).fill(null);
      let valeur: number | null = null;
      const playerIds: string[] = [];

      block.columnDimensions.forEach((dimension, ci) => {
        const cell = row[ci] ?? '';
        if (!dimension) {
          for (const token of splitPlayerTokens(cell)) {
            const playerId = playerIdByToken[token];
            if (playerId && !playerIds.includes(playerId)) playerIds.push(playerId);
          }
          return;
        }
        if (isBlankTacticalCell(cell)) return;
        if (isValueDimension(dimension)) {
          const parsed = Number.parseInt(cell.trim(), 10);
          if (!Number.isNaN(parsed)) valeur = parsed;
          return;   // jamais dans `options` : la valeur a sa colonne dédiée
        }
        options[dimension.slot] = codeByLabel.get(`${dimension.id}::${normalizeTacticalName(cell)}`) ?? null;
      });

      payload.push({ category_id: block.categoryId, seq, valeur, options, player_ids: playerIds });
    }
  }
  return payload;
}

export const tacticalImportApi = {
  /**
   * Résout catégories et dimensions (auto-créées si absentes), traduit chaque valeur en code
   * d'option — en complétant le catalogue de ce qu'il ne connaît pas — puis écrit les actions
   * en UNE transaction Postgres (`import_tactical_actions`).
   *
   * Deux défauts de l'ancien import disparaissent ici : la suppression et les insertions sont
   * atomiques, donc une coupure réseau ne peut plus laisser un match vide ou à moitié importé ;
   * et plus rien ne dépend de l'ordre de retour d'un INSERT pour rattacher une valeur à son
   * action.
   *
   * La dimension « Valeur » n'occupe pas de case dans `options` : les points ont leur colonne
   * dédiée, ce qui permet aussi d'importer une action sans score (`valeur` à NULL) au lieu de
   * la jeter.
   */
  async importForMatch(
    matchId: string,
    teamId: string,
    blocks: ParsedCategoryBlock[],
    replaceScope: TacticalReplaceScope = 'match',
    playersColumnName: string | null = null,
    playerIdByToken: PlayerIdByToken = {},
  ): Promise<TacticalImportResult> {
    let categories: TacticalCategory[] = [];
    let dimensions: TacticalDimension[] = [];
    let options: TacticalDimensionOption[] = [];
    ({ categories, dimensions, options } = await tacticalConfigApi.getForTeam(teamId));

    const createdCategories: string[] = [];
    const createdDimensions: string[] = [];

    const resolved: (ResolvedBlock & { categoryName: string })[] = [];
    const normalizedPlayersColumn = playersColumnName ? normalizeTacticalName(playersColumnName) : null;

    // Séquentiel (pas Promise.all) : chaque ensureX doit voir les créations précédentes
    // du même import pour ne pas créer deux fois la même catégorie/dimension.
    for (const block of blocks) {
      const { category, created: categoryCreated } = await tacticalConfigApi.ensureCategory(teamId, block.categoryName, categories);
      if (categoryCreated) { categories = [...categories, category]; createdCategories.push(category.name); }

      const columnDimensions: (TacticalDimension | null)[] = [];
      for (const dimName of block.dimensionNames) {
        if (normalizedPlayersColumn && normalizeTacticalName(dimName) === normalizedPlayersColumn) {
          columnDimensions.push(null);   // colonne des joueuses : donnée structurée, pas une dimension
          continue;
        }
        const { dimension, created } = await tacticalConfigApi.ensureDimension(teamId, category.id, dimName, dimensions);
        if (created) { dimensions = [...dimensions, dimension]; createdDimensions.push(`${category.name} · ${dimension.name}`); }
        columnDimensions.push(dimension);
      }
      resolved.push({ categoryName: category.name, categoryId: category.id, columnDimensions, rows: block.rows });
    }

    // ─── Codes d'options ────────────────────────────────────────────────────────
    // Le stockage ne garde qu'un code : une valeur hors catalogue doit donc y entrer, sinon elle
    // serait perdue. C'est le renversement assumé de l'ancienne règle « catalogue jamais
    // auto-complété » — en contrepartie chaque ajout est remonté à l'écran d'import.
    const addedOptions: AddedOption[] = [];
    const missing: { dimensionId: string; label: string }[] = [];
    const seenMissing = new Set<string>();
    for (const block of resolved) {
      block.columnDimensions.forEach((dimension, ci) => {
        if (!dimension || isValueDimension(dimension)) return;
        const known = new Set(
          options.filter(o => o.dimensionId === dimension.id).map(o => normalizeTacticalName(o.label)),
        );
        for (const row of block.rows) {
          const label = row[ci] ?? '';
          if (isBlankTacticalCell(label)) continue;
          const normalized = normalizeTacticalName(label);
          if (known.has(normalized)) continue;
          const key = `${dimension.id}::${normalized}`;
          if (seenMissing.has(key)) continue;
          seenMissing.add(key);
          missing.push({ dimensionId: dimension.id, label });
          addedOptions.push({ category: block.categoryName, dimension: dimension.name, label });
        }
      });
    }
    if (missing.length > 0) {
      options = [...options, ...(await tacticalConfigApi.createOptions(teamId, missing, options))];
    }

    const codeByLabel = new Map<string, number>();
    for (const option of options) {
      codeByLabel.set(`${option.dimensionId}::${normalizeTacticalName(option.label)}`, option.code);
    }

    const payload = buildActionPayloads(resolved, codeByLabel, playerIdByToken);

    const { data, error } = await supabase.rpc('import_tactical_actions', {
      p_match_id: matchId,
      p_replace_all: replaceScope === 'match',
      p_category_ids: [...new Set(resolved.map(b => b.categoryId))],
      p_actions: payload,
    });
    if (error) throw error;

    return {
      createdCategories, createdDimensions, addedOptions,
      totalActions: typeof data === 'number' ? data : payload.length,
    };
  },
};

function isValueDimension(dimension: TacticalDimension): boolean {
  return normalizeTacticalName(dimension.name) === 'valeur';
}
