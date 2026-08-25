import { supabase } from './client';
import type { Match, MatchKind } from '../data/types';

/**
 * Périmètre d'une lecture de matchs. `'all'` mélange officiels et amicaux — réservé aux écrans
 * qui listent ou recherchent, jamais à ceux qui agrègent.
 *
 * Le défaut est `'official'` PARTOUT, et volontairement : c'est l'oubli du filtre, pas son ajout,
 * qui doit être visible. Un futur écran qui appelle sans y penser exclut les amicaux — l'inverse
 * les laisserait entrer en silence dans un bilan.
 */
export type MatchScope = MatchKind | 'all';

export const matchesApi = {
  async listBySeason(teamId: string, seasonId: string, scope: MatchScope = 'official'): Promise<Match[]> {
    let query = supabase
      .from('matches')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId);
    if (scope !== 'all') query = query.eq('kind', scope);
    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMatch);
  },

  /** Combien de matchs d'une nature donnée sur la saison. Requête `head` : compte seul, aucune
   *  ligne transférée — sert à n'afficher l'interrupteur « amicaux » qu'aux équipes qui en ont. */
  async countByKind(teamId: string, seasonId: string, kind: MatchKind): Promise<number> {
    const { count, error } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('kind', kind);
    if (error) throw error;
    return count ?? 0;
  },

  async getById(id: string): Promise<Match | null> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toMatch(data) : null;
  },

  async create(input: Omit<Match, 'id'>): Promise<Match> {
    const { data, error } = await supabase
      .from('matches')
      .insert({
        team_id:     input.teamId,
        season_id:   input.seasonId,
        game_number: input.gameNumber ?? null,
        date:        input.date,
        opponent:    input.opponent,
        home_away:   input.homeAway,
        competition: input.competition,
        kind:        input.kind,
        result:      input.result,
        score_us:       input.scoreUs,
        score_them:     input.scoreThem,
        quarter_scores: input.quarterScores ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return toMatch(data);
  },

  async update(id: string, input: Partial<Omit<Match, 'id' | 'teamId' | 'seasonId'>>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (input.gameNumber  !== undefined) row.game_number = input.gameNumber ?? null;
    if (input.date        !== undefined) row.date        = input.date;
    if (input.opponent    !== undefined) row.opponent    = input.opponent;
    if (input.homeAway    !== undefined) row.home_away   = input.homeAway;
    if (input.competition !== undefined) row.competition = input.competition;
    if (input.kind        !== undefined) row.kind        = input.kind;
    if (input.result      !== undefined) row.result      = input.result;
    if (input.scoreUs       !== undefined) row.score_us       = input.scoreUs;
    if (input.scoreThem     !== undefined) row.score_them     = input.scoreThem;
    if (input.quarterScores !== undefined) row.quarter_scores = input.quarterScores ?? null;
    const { error } = await supabase.from('matches').update(row).eq('id', id);
    if (error) throw error;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('matches').delete().eq('id', id);
    if (error) throw error;
  },
};

function toMatch(row: Record<string, unknown>): Match {
  return {
    id:          row.id          as string,
    teamId:      row.team_id     as string,
    seasonId:    row.season_id   as string,
    gameNumber:  row.game_number as number | undefined,
    date:        row.date        as string,
    opponent:    row.opponent    as string,
    homeAway:    row.home_away   as Match['homeAway'],
    competition: row.competition as string,
    kind:        (row.kind as MatchKind | null) ?? 'official',
    result:      row.result      as Match['result'],
    scoreUs:       row.score_us       as number,
    scoreThem:     row.score_them     as number,
    quarterScores: row.quarter_scores as { us: number; them: number }[] | undefined,
  };
}
