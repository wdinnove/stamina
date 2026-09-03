import { supabase } from './client';
import type { TacticalAction } from '../data/types';

/** Colonnes lues, jamais `*` : la table n'en a pas d'autres aujourd'hui, mais toute colonne
 *  ajoutée plus tard traverserait le réseau à chaque chargement de saison sans être lue. */
const ACTION_COLUMNS = 'match_id, category_id, seq, valeur, options, player_ids';

/**
 * Garde-fou de troncature. PostgREST applique le plafond `max-rows` du projet (souvent 1000 chez
 * Supabase) SANS erreur : une saison dépasse largement ce seuil, et les statistiques seraient
 * alors calculées sur une fraction des actions, en silence. On compare donc systématiquement le
 * nombre de lignes rendues au compte exact.
 */
function assertNotTruncated(rows: unknown[], count: number | null): void {
  if (count !== null && rows.length < count) {
    throw new Error(
      `Données tactiques tronquées : ${rows.length} actions reçues sur ${count}. `
      + 'Augmentez « Max rows » dans les réglages API du projet Supabase.',
    );
  }
}

export const tacticalActionsApi = {
  async getByMatchId(matchId: string): Promise<TacticalAction[]> {
    const { data, error, count } = await supabase
      .from('tactical_actions')
      .select(ACTION_COLUMNS, { count: 'exact' })
      .eq('match_id', matchId)
      .order('category_id', { ascending: true })
      .order('seq', { ascending: true });
    if (error) throw error;
    assertNotTruncated(data ?? [], count);
    return (data ?? []).map(toTacticalAction);
  },

  async getForMatches(matchIds: string[]): Promise<TacticalAction[]> {
    if (matchIds.length === 0) return [];
    const { data, error, count } = await supabase
      .from('tactical_actions')
      .select(ACTION_COLUMNS, { count: 'exact' })
      .in('match_id', matchIds);
    if (error) throw error;
    assertNotTruncated(data ?? [], count);
    return (data ?? []).map(toTacticalAction);
  },

  async deleteForMatch(matchId: string): Promise<void> {
    const { error } = await supabase.from('tactical_actions').delete().eq('match_id', matchId);
    if (error) throw error;
  },

  /**
   * Nombre d'actions déjà stockées pour une catégorie, pour l'écran de configuration : supprimer
   * une dimension ou une option d'une catégorie qui a des données rend illisibles les valeurs
   * correspondantes (le tableau `options` ne porte que des codes, et aucune clé étrangère ne
   * protège plus ce lien). L'écran s'en sert pour prévenir avant la suppression.
   *
   * `head: true` : on ne veut que le compte, pas les lignes. Les rapatrier pour les compter côté
   * client rejouerait exactement le problème de troncature ci-dessus, sur une requête dont le
   * résultat tient en un entier.
   */
  async countForCategory(categoryId: string): Promise<number> {
    const { count, error } = await supabase
      .from('tactical_actions')
      .select('seq', { count: 'exact', head: true })
      .eq('category_id', categoryId);
    if (error) throw error;
    return count ?? 0;
  },
};

function toTacticalAction(row: Record<string, unknown>): TacticalAction {
  return {
    matchId:    row.match_id    as string,
    categoryId: row.category_id as string,
    seq:        row.seq         as number,
    valeur:     (row.valeur as number | null) ?? null,
    options:    (row.options as (number | null)[] | null) ?? [],
    playerIds:  (row.player_ids as string[] | null) ?? [],
  };
}
