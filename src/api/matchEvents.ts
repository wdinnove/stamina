import { supabase } from './client';
import type { MatchEvent } from '../data/types';

/**
 * Flux d'événements de la prise de statistiques en direct (`match_events`).
 *
 * Écriture au fil de l'eau, une ligne par action : cette table n'est lue que par l'écran de
 * saisie, l'y écrire en continu ne pollue donc aucun calcul et protège d'un téléphone qui meurt en
 * plein match. Ce sont `match_stats` / `opponent_match_stats` / `team_match_stats` qui, elles, ne
 * s'écrivent que sur publication explicite — voir docs/STATS_LIVE.md.
 */
/** Violation de contrainte d'unicité côté Postgres. */
const DUPLICATE_KEY = '23505';

const EVENT_COLUMNS =
  'match_id, seq, quarter, game_time_seconds, side, player_id, opponent_player_id, type, made, x, y, value, on_court, on_court_them';

/** Colonnes lues, jamais `*` : toute colonne ajoutée plus tard traverserait le réseau à chaque
 *  chargement de match sans être lue. */
export const matchEventsApi = {
  async getByMatchId(matchId: string): Promise<MatchEvent[]> {
    const { data, error } = await supabase
      .from('match_events')
      .select(EVENT_COLUMNS)
      .eq('match_id', matchId)
      .order('seq', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toMatchEvent);
  },

  /**
   * Insère une action et rend le rang RÉELLEMENT écrit.
   *
   * `seq` est calculé côté client : deux personnes qui saisissent le même match visent le même
   * rang et la seconde se prend une violation de clé primaire. Plutôt que de perdre l'action, on
   * reprend un rang libre et on le renvoie — à l'appelant de se resynchroniser s'il diffère.
   */
  async insert(event: MatchEvent): Promise<number> {
    const { error } = await supabase.from('match_events').insert(toRow(event));
    if (!error) return event.seq;
    if (error.code !== DUPLICATE_KEY) throw error;

    const { data, error: maxError } = await supabase
      .from('match_events')
      .select('seq')
      .eq('match_id', event.matchId)
      .order('seq', { ascending: false })
      .limit(1);
    if (maxError) throw maxError;

    const seq = ((data?.[0]?.seq as number | undefined) ?? 0) + 1;
    const { error: retryError } = await supabase.from('match_events').insert(toRow({ ...event, seq }));
    if (retryError) throw retryError;
    return seq;
  },

  /** Suppression à n'importe quel rang. Sans effet de cascade : contrairement à un changement de
   *  banc, une action ne détermine jamais l'état d'une autre ligne. */
  async delete(matchId: string, seq: number): Promise<void> {
    const { error } = await supabase
      .from('match_events')
      .delete()
      .eq('match_id', matchId).eq('seq', seq);
    if (error) throw error;
  },

  /** Nombre d'actions, sans rapatrier les lignes (`head`) — sert aux confirmations de suppression,
   *  qui doivent annoncer ce qu'elles effacent. */
  async countForMatch(matchId: string): Promise<number> {
    const { count, error } = await supabase
      .from('match_events')
      .select('seq', { count: 'exact', head: true })
      .eq('match_id', matchId);
    if (error) throw error;
    return count ?? 0;
  },

  async deleteForMatch(matchId: string): Promise<void> {
    const { error } = await supabase.from('match_events').delete().eq('match_id', matchId);
    if (error) throw error;
  },
};

function toRow(e: MatchEvent) {
  return {
    match_id: e.matchId,
    seq: e.seq,
    quarter: e.quarter,
    game_time_seconds: e.gameTimeSeconds,
    side: e.side,
    player_id: e.playerId ?? null,
    opponent_player_id: e.opponentPlayerId ?? null,
    type: e.type,
    made: e.made ?? null,
    x: e.x ?? null,
    y: e.y ?? null,
    value: e.value ?? null,
    on_court: e.onCourt,
    on_court_them: e.onCourtThem,
  };
}

interface EventRow {
  match_id: string;
  seq: number;
  quarter: number;
  game_time_seconds: number;
  side: string;
  player_id: string | null;
  opponent_player_id: string | null;
  type: string;
  made: boolean | null;
  x: number | string | null;
  y: number | string | null;
  value: number | null;
  on_court: string[] | null;
  on_court_them: string[] | null;
}

/** `x`/`y` sont en NUMERIC : PostgREST les rend en chaîne, d'où la conversion — sans elle, un tir
 *  relu depuis la base ne retomberait dans aucune zone. */
function toMatchEvent(row: EventRow): MatchEvent {
  return {
    matchId: row.match_id,
    seq: row.seq,
    quarter: row.quarter,
    gameTimeSeconds: row.game_time_seconds,
    side: row.side as MatchEvent['side'],
    playerId: row.player_id ?? undefined,
    opponentPlayerId: row.opponent_player_id ?? undefined,
    type: row.type as MatchEvent['type'],
    made: row.made ?? undefined,
    x: row.x !== null ? Number(row.x) : undefined,
    y: row.y !== null ? Number(row.y) : undefined,
    value: (row.value as 2 | 3 | null) ?? undefined,
    onCourt: row.on_court ?? [],
    onCourtThem: row.on_court_them ?? [],
  };
}
