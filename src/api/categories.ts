import { supabase } from './client';
import type { CategoryScope, TeamCategory } from '../data/types';

/**
 * Les catégories que le club se donne, quelle que soit la portée : exercices, réunions,
 * séances. Une seule table (`team_categories`), une seule API, un seul écran — c'est le même
 * objet, et le vocabulaire appartient à l'équipe, pas à l'application.
 */

/** Table et colonne qui référencent la catégorie, par portée. C'est ce qui permet de compter
 *  les usages sans un cas particulier par écran — et donc de refuser une suppression qui
 *  laisserait des lignes orphelines. */
const USAGE: Record<CategoryScope, { table: string; column: string }> = {
  exercise: { table: 'exercises',         column: 'category_id' },
  meeting:  { table: 'staff_meetings',    column: 'category_id' },
  session:  { table: 'training_sessions', column: 'category_id' },
  system:   { table: 'tactical_systems',  column: 'category_id' },
};

/**
 * Ce qu'une équipe trouve à sa création. Des valeurs de départ, pas un cadre : tout se
 * renomme, se recolore, se réordonne et se supprime.
 *
 * Les séances n'en comptent que trois. « Match » n'y est pas : un match a déjà sa propre
 * table, et l'ancien type de séance homonyme doublonnait la notion.
 */
const DEFAULTS: Record<CategoryScope, { name: string; color: string }[]> = {
  exercise: [
    { name: 'Warmup',     color: '#F59E0B' },
    { name: 'Jeu réduit', color: '#3B82F6' },
    { name: 'Jeu rapide', color: '#06B6D4' },
    { name: 'Collectif',  color: '#8B5CF6' },
    { name: 'Shooting',   color: '#EC4899' },
    { name: 'Technique',  color: '#00E5A0' },
    { name: 'Physique',   color: '#EF4444' },
    { name: 'Fun',        color: '#F97316' },
  ],
  meeting: [
    { name: 'Staff',  color: '#3B82F6' },
    { name: 'Équipe', color: '#00E5A0' },
  ],
  session: [
    { name: 'Entraînement collectif',  color: '#3B82F6' },
    { name: 'Entraînement individuel', color: '#06B6D4' },
    { name: 'Préparation physique',    color: '#A855F7' },
  ],
  system: [
    { name: 'Attaque',            color: '#3B82F6' },
    { name: 'Défense',            color: '#EF4444' },
    { name: 'Transition',         color: '#06B6D4' },
    { name: 'Sorties de balle',   color: '#F59E0B' },
  ],
};

const SCOPES = Object.keys(DEFAULTS) as CategoryScope[];

// Palette suggérée pour les catégories créées par l'utilisateur (cycle si plus de catégories que de couleurs)
export const NEW_CATEGORY_PALETTE = ['#EC4899', '#14B8A6', '#A855F7', '#84CC16', '#0EA5E9', '#F43F5E', '#D946EF', '#22D3EE'];

function toCategory(row: Record<string, unknown>): TeamCategory {
  return {
    id:       row.id as string,
    teamId:   row.team_id as string,
    scope:    row.scope as CategoryScope,
    name:     row.name as string,
    color:    row.color as string,
    position: row.position as number,
  };
}

export const teamCategoriesApi = {
  async list(teamId: string, scope: CategoryScope): Promise<TeamCategory[]> {
    const { data, error } = await supabase
      .from('team_categories')
      .select('*')
      .eq('team_id', teamId)
      .eq('scope', scope)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(toCategory);
  },

  /** Toutes les portées d'un coup, pour une nouvelle équipe. */
  async seedDefaults(teamId: string, scopes: CategoryScope[] = SCOPES): Promise<void> {
    const rows = scopes.flatMap(scope =>
      DEFAULTS[scope].map((c, i) => ({ team_id: teamId, scope, name: c.name, color: c.color, position: i }))
    );
    if (rows.length === 0) return;
    const { error } = await supabase.from('team_categories').insert(rows);
    if (error) throw error;
  },

  async create(teamId: string, scope: CategoryScope, name: string, color: string): Promise<TeamCategory> {
    const { count } = await supabase
      .from('team_categories')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('scope', scope);
    const position = count ?? 0;
    const { data, error } = await supabase
      .from('team_categories')
      .insert({ team_id: teamId, scope, name, color, position })
      .select()
      .single();
    if (error) throw error;
    return toCategory(data as Record<string, unknown>);
  },

  async update(id: string, patch: { name?: string; color?: string; position?: number }): Promise<TeamCategory> {
    const payload: Record<string, unknown> = {};
    if (patch.name     !== undefined) payload.name     = patch.name;
    if (patch.color    !== undefined) payload.color    = patch.color;
    if (patch.position !== undefined) payload.position = patch.position;
    const { data, error } = await supabase
      .from('team_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toCategory(data as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('team_categories').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Combien de lignes utilisent chaque catégorie, par identifiant. Le comptage se fait côté
   * client — une colonne, quelques centaines de lignes au plus par équipe — parce que
   * PostgREST n'expose pas de GROUP BY.
   *
   * Les catégories sans usage n'apparaissent pas dans le résultat : lire `usage[id] ?? 0`.
   */
  async usage(teamId: string, scope: CategoryScope): Promise<Record<string, number>> {
    const { table, column } = USAGE[scope];
    const { data, error } = await supabase.from(table).select(column).eq('team_id', teamId);
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      const id = row[column];
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  },
};
