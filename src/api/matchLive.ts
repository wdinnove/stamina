import { supabase } from './client';
import type { MatchOpponentPlayer, MatchLineupEvent, MatchLiveAction, LineupSide, LiveSide } from '../data/types';

const LINEUP_COLUMNS = 'match_id, seq, side, quarter, game_time_seconds, players_in, players_out, on_court';
const ACTION_COLUMNS = 'match_id, seq, quarter, game_time_seconds, side, play_id, points, on_court, on_court_them';

export const matchLiveApi = {
  async getOpponentPlayers(matchId: string): Promise<MatchOpponentPlayer[]> {
    const { data, error } = await supabase
      .from('match_opponent_players')
      .select('id, match_id, number, name')
      .eq('match_id', matchId)
      .order('number', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(toOpponentPlayer);
  },

  async addOpponentPlayer(matchId: string, name: string, number?: number): Promise<MatchOpponentPlayer> {
    const { data, error } = await supabase
      .from('match_opponent_players')
      .insert({ match_id: matchId, name, number: number ?? null })
      .select('id, match_id, number, name')
      .single();
    if (error) throw error;
    return toOpponentPlayer(data);
  },

  async getLineupEvents(matchId: string): Promise<MatchLineupEvent[]> {
    const { data, error } = await supabase
      .from('match_lineup_events')
      .select(LINEUP_COLUMNS)
      .eq('match_id', matchId)
      .order('side', { ascending: true })
      .order('seq', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toLineupEvent);
  },

  async insertLineupEvent(event: MatchLineupEvent): Promise<void> {
    const { error } = await supabase.from('match_lineup_events').insert({
      match_id: event.matchId,
      seq: event.seq,
      side: event.side,
      quarter: event.quarter,
      game_time_seconds: event.gameTimeSeconds,
      players_in: event.playersIn,
      players_out: event.playersOut,
      on_court: event.onCourt,
    });
    if (error) throw error;
  },

  /** Supprime un changement de banc, à N'IMPORTE QUEL rang — l'appelant doit ensuite rejouer
   *  `recomputeOnCourtSnapshots` sur ce qui reste et persister les instantanés corrigés via
   *  `updateLineupEventOnCourt`/`updateActionOnCourt` : les rangs suivants (même banc) et les
   *  actions concernées gardaient sinon un `on_court` qui référence un changement qui n'a plus
   *  eu lieu. */
  async deleteLineupEvent(matchId: string, side: LineupSide, seq: number): Promise<void> {
    const { error } = await supabase
      .from('match_lineup_events')
      .delete()
      .eq('match_id', matchId).eq('side', side).eq('seq', seq);
    if (error) throw error;
  },

  /** Corrige l'instantané d'un changement de banc après suppression d'un autre — jamais appelé
   *  pour une écriture "normale" (l'instantané est fixé une fois pour toutes à la création). */
  async updateLineupEventOnCourt(matchId: string, side: LineupSide, seq: number, onCourt: string[]): Promise<void> {
    const { error } = await supabase
      .from('match_lineup_events')
      .update({ on_court: onCourt })
      .eq('match_id', matchId).eq('side', side).eq('seq', seq);
    if (error) throw error;
  },

  async getActions(matchId: string): Promise<MatchLiveAction[]> {
    const { data, error } = await supabase
      .from('match_live_actions')
      .select(ACTION_COLUMNS)
      .eq('match_id', matchId)
      .order('seq', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toLiveAction);
  },

  async insertAction(action: MatchLiveAction): Promise<void> {
    const { error } = await supabase.from('match_live_actions').insert({
      match_id: action.matchId,
      seq: action.seq,
      quarter: action.quarter,
      game_time_seconds: action.gameTimeSeconds,
      side: action.side,
      play_id: action.playId ?? null,
      points: action.points,
      on_court: action.onCourt,
      on_court_them: action.onCourtThem,
    });
    if (error) throw error;
  },

  /** Supprime une possession pointée, à n'importe quel rang — toujours sûr : une action ne
   *  détermine jamais l'état d'une autre ligne, contrairement à un changement de banc. */
  async deleteAction(matchId: string, seq: number): Promise<void> {
    const { error } = await supabase
      .from('match_live_actions')
      .delete()
      .eq('match_id', matchId).eq('seq', seq);
    if (error) throw error;
  },

  /** Corrige les cinq mémorisés sur une action après suppression d'un changement de banc. */
  async updateActionOnCourt(matchId: string, seq: number, onCourt: string[], onCourtThem: string[]): Promise<void> {
    const { error } = await supabase
      .from('match_live_actions')
      .update({ on_court: onCourt, on_court_them: onCourtThem })
      .eq('match_id', matchId).eq('seq', seq);
    if (error) throw error;
  },

  /**
   * Efface tout le suivi live d'un match : possessions, rotations, et effectif adverse saisi à la
   * volée. Le catalogue de plays est CONSERVÉ — il appartient à l'équipe, pas au match, et le
   * refaire à chaque remise à zéro n'aurait aucun sens.
   *
   * L'ordre compte : les possessions référencent (par tableau d'UUID, sans clé étrangère) les
   * joueuses adverses ; les supprimer en dernier évite de laisser des identifiants pendants si la
   * séquence s'interrompt en cours de route.
   */
  async deleteAllForMatch(matchId: string): Promise<void> {
    const { error: actionsError } = await supabase.from('match_live_actions').delete().eq('match_id', matchId);
    if (actionsError) throw actionsError;

    const { error: lineupError } = await supabase.from('match_lineup_events').delete().eq('match_id', matchId);
    if (lineupError) throw lineupError;

    const { error: oppError } = await supabase.from('match_opponent_players').delete().eq('match_id', matchId);
    if (oppError) throw oppError;
  },
};

function toOpponentPlayer(row: Record<string, unknown>): MatchOpponentPlayer {
  return {
    id:      row.id       as string,
    matchId: row.match_id as string,
    number:  (row.number as number | null) ?? undefined,
    name:    row.name     as string,
  };
}

function toLineupEvent(row: Record<string, unknown>): MatchLineupEvent {
  return {
    matchId:         row.match_id          as string,
    seq:             row.seq               as number,
    side:            row.side              as LineupSide,
    quarter:         row.quarter           as number,
    gameTimeSeconds: row.game_time_seconds as number,
    playersIn:       (row.players_in  as string[] | null) ?? [],
    playersOut:      (row.players_out as string[] | null) ?? [],
    onCourt:         (row.on_court    as string[] | null) ?? [],
  };
}

function toLiveAction(row: Record<string, unknown>): MatchLiveAction {
  return {
    matchId:         row.match_id          as string,
    seq:             row.seq               as number,
    quarter:         row.quarter           as number,
    gameTimeSeconds: row.game_time_seconds as number,
    side:            row.side              as LiveSide,
    playId:          (row.play_id as string | null) ?? undefined,
    points:          row.points            as number,
    onCourt:         (row.on_court      as string[] | null) ?? [],
    onCourtThem:     (row.on_court_them as string[] | null) ?? [],
  };
}
