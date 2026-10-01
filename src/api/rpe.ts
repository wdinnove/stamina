import { supabase, fetchAllRows, fetchAllByIds } from './client';
import type { RPEEntry, TrainingSession } from '../data/types';
import { sessionBlocksApi } from './sessionBlocks';

export interface ListRpeFilters {
  playerId?: string;
  seasonId?: string;
}

function toSession(row: Record<string, unknown>): TrainingSession {
  const cat = row.team_categories as { id: string; name: string; color: string } | null | undefined;
  return {
    id:              row.id               as string,
    teamId:          row.team_id          as string,
    seasonId:        row.season_id        as string,
    date:            row.date             as string,
    categoryId:      cat?.id,
    categoryName:    cat?.name,
    categoryColor:   cat?.color,
    plannedDuration: row.planned_duration as number,
    notes:           row.notes            as string | undefined,
    createdAt:       row.created_at       as string | undefined,
  };
}

function toEntry(row: Record<string, unknown>, session: TrainingSession, workDuration?: number): RPEEntry {
  return {
    id:              row.id              as string,
    sessionId:       row.session_id      as string,
    playerId:        row.player_id       as string,
    rpe:             row.rpe             as number,
    actualDuration:  row.actual_duration as number | undefined,
    notes:           row.notes           as string | undefined,
    date:            session.date,
    categoryName:    session.categoryName,
    categoryColor:   session.categoryColor,
    plannedDuration: session.plannedDuration,
    workDuration,
  };
}

type LoadRow = { rpe: number; actualDuration: number | undefined; workDuration: number | undefined; playerId: string; date: string; plannedDuration: number };

async function loadHistory(playerIds: string[], since: string): Promise<LoadRow[]> {
  const rows = await fetchAllByIds(playerIds, (ids, from, to) => supabase
    .from('rpe_entries')
    .select('id, rpe, actual_duration, player_id, session_id, training_sessions!inner(date, planned_duration)')
    .in('player_id', ids)
    .gte('training_sessions.date', since)
    .order('id')
    .range(from, to)) as Array<{ rpe: number; actual_duration: number | null; player_id: string; session_id: string; training_sessions: { date: string; planned_duration: number } }>;
  // Temps de travail effectif par séance — charge réelle plutôt que la seule durée planifiée
  // globale (cf. `effectiveDuration`, `utils/rpe.ts`).
  const workDurations = await sessionBlocksApi.workDurationsBySessions([...new Set(rows.map(r => r.session_id))]);
  return rows.map(r => ({
    rpe: r.rpe, actualDuration: r.actual_duration ?? undefined, workDuration: workDurations.get(r.session_id),
    playerId: r.player_id, date: r.training_sessions.date, plannedDuration: r.training_sessions.planned_duration,
  }));
}

export const rpeApi = {
  // Séances d'une équipe/saison (colonnes minimales), optionnellement bornées par date — pour les agrégations RPEPage
  async listTeamSessionsInRange(teamId: string, seasonId: string, from?: string, to?: string): Promise<Array<{ id: string; date: string; categoryName?: string; categoryColor?: string; plannedDuration: number }>> {
    let q = supabase
      .from('training_sessions')
      .select('id, date, planned_duration, team_categories(name, color)')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .order('date', { ascending: true });
    if (from) q = q.gte('date', from);
    if (to)   q = q.lte('date', to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(r => {
      const cat = (r as Record<string, unknown>).team_categories as { name: string; color: string } | null | undefined;
      return {
        id: r.id as string, date: r.date as string,
        categoryName: cat?.name, categoryColor: cat?.color,
        plannedDuration: r.planned_duration as number,
      };
    });
  },

  // RPE détaillées (rpe, durée réelle, joueur, séance) pour un lot de séances — agrégations client (moyennes, charge…)
  async listRpeDetailsBySessionIds(sessionIds: string[]): Promise<Array<{ rpe: number; actualDuration: number | undefined; workDuration: number | undefined; playerId: string; sessionId: string }>> {
    if (!sessionIds.length) return [];
    const [data, workDurations] = await Promise.all([
      fetchAllByIds(sessionIds, (ids, from, to) => supabase
        .from('rpe_entries')
        .select('id, rpe, actual_duration, player_id, session_id')
        .in('session_id', ids)
        .order('id')
        .range(from, to)),
      sessionBlocksApi.workDurationsBySessions(sessionIds),
    ]);
    return data.map(r => ({
      rpe: r.rpe as number, actualDuration: (r.actual_duration as number | null) ?? undefined,
      workDuration: workDurations.get(r.session_id as string),
      playerId: r.player_id as string, sessionId: r.session_id as string,
    }));
  },

  /**
   * Historique RPE (avec date/durée planifiée de la séance jointe) d'un lot de joueurs, depuis
   * `since` — ACWR/TSB. Borné (cf. `loadHistoryStart`) : sans borne, la requête grossissait à
   * chaque saison pour des séances dont le poids dans les calculs est devenu négligeable.
   */
  async listRpeWithSessionByPlayerIds(playerIds: string[], since: string): Promise<LoadRow[]> {
    if (!playerIds.length) return [];
    return loadHistory(playerIds, since);
  },

  // Toutes les entrées RPE d'une saison et/ou d'un joueur, enrichies depuis la séance jointe
  async list(filters: ListRpeFilters = {}): Promise<RPEEntry[]> {
    const rows = await fetchAllRows((from, to) => {
      let query = supabase
        .from('rpe_entries')
        .select('*, training_sessions!inner(*)');
      if (filters.seasonId) query = query.eq('training_sessions.season_id', filters.seasonId);
      if (filters.playerId) query = query.eq('player_id', filters.playerId);
      return query.order('id').range(from, to);
    }) as Record<string, unknown>[];
    const workDurations = await sessionBlocksApi.workDurationsBySessions([...new Set(rows.map(r => r.session_id as string))]);
    return rows
      .map(r => {
        const session = toSession(r.training_sessions as Record<string, unknown>);
        return toEntry(r, session, workDurations.get(r.session_id as string));
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  // Find an existing session for a given team + season + date (there may be multiple; returns first)
  async findSession(teamId: string, seasonId: string, date: string): Promise<TrainingSession | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .eq('date', date)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toSession(data as Record<string, unknown>) : null;
  },

  // Load existing RPE values for a session as { playerId → rpe }
  async loadEntriesForSession(sessionId: string): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('rpe_entries')
      .select('player_id, rpe')
      .eq('session_id', sessionId);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map(r => [r.player_id as string, r.rpe as number]));
  },

  // Create session + upsert entries in one call
  async saveSession(input: {
    teamId: string;
    seasonId: string;
    date: string;
    categoryId?: string;
    plannedDuration: number;
    actualDuration?: number;
    entries: { playerId: string; rpe: number }[];
    existingSessionId?: string;
  }): Promise<string> {
    let sessionId: string;

    if (input.existingSessionId) {
      sessionId = input.existingSessionId;
      const { error } = await supabase
        .from('training_sessions')
        .update({
          category_id:      input.categoryId ?? null,
          planned_duration: input.plannedDuration,
        })
        .eq('id', sessionId);
      if (error) throw error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      sessionId = crypto.randomUUID();
      const { error } = await supabase.from('training_sessions').insert({
        id:               sessionId,
        team_id:          input.teamId,
        season_id:        input.seasonId,
        date:             input.date,
        category_id:      input.categoryId ?? null,
        planned_duration: input.plannedDuration,
        created_by:       user?.id ?? null,
      });
      if (error) throw error;
    }

    if (input.entries.length > 0) {
      const rows = input.entries.map(e => ({
        session_id:      sessionId,
        player_id:       e.playerId,
        rpe:             e.rpe,
        actual_duration: input.actualDuration ?? null,
      }));
      const { error } = await supabase
        .from('rpe_entries')
        .upsert(rows, { onConflict: 'session_id,player_id' });
      if (error) throw error;
    }

    return sessionId;
  },

  async listBySession(sessionId: string): Promise<{ playerId: string; rpe: number; actualDuration?: number }[]> {
    const { data, error } = await supabase
      .from('rpe_entries')
      .select('player_id, rpe, actual_duration')
      .eq('session_id', sessionId);
    if (error) throw error;
    return (data ?? []).map(r => ({
      playerId:       r.player_id      as string,
      rpe:            r.rpe            as number,
      actualDuration: r.actual_duration as number | undefined,
    }));
  },

  async listBySessions(sessionIds: string[]): Promise<{ sessionId: string; playerId: string; rpe: number }[]> {
    const data = await fetchAllByIds(sessionIds, (ids, from, to) => supabase
      .from('rpe_entries')
      .select('id, session_id, player_id, rpe')
      .in('session_id', ids)
      .order('id')
      .range(from, to));
    return data.map(r => ({
      sessionId: r.session_id as string,
      playerId:  r.player_id  as string,
      rpe:       r.rpe        as number,
    }));
  },

  // RPE history for a player — all seasons
  async listPlayerHistory(playerId: string): Promise<RPEEntry[]> {
    return rpeApi.listPlayersHistory([playerId]);
  },

  /** Même historique pour plusieurs joueurs en une requête (paginée), plutôt qu'une par joueur. */
  async listPlayersHistory(playerIds: string[]): Promise<RPEEntry[]> {
    const rows = await fetchAllByIds(playerIds, (ids, from, to) => supabase
      .from('rpe_entries')
      .select('*, training_sessions!inner(id, date, planned_duration, season_id, team_id, teams(name), team_categories(id, name, color))')
      .in('player_id', ids)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)) as Record<string, unknown>[];
    // Plusieurs paquets d'ids : chacun est trié, pas leur concaténation.
    rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const workDurations = await sessionBlocksApi.workDurationsBySessions([...new Set(rows.map(r => r.session_id as string))]);
    return rows.map(row => {
      const s = row.training_sessions as Record<string, unknown>;
      const teams = s.teams as Record<string, unknown> | null;
      const cat = s.team_categories as { id: string; name: string; color: string } | null | undefined;
      const session: TrainingSession = {
        id:              s.id              as string,
        teamId:          s.team_id         as string,
        seasonId:        s.season_id       as string,
        date:            s.date            as string,
        categoryId:      cat?.id,
        categoryName:    cat?.name,
        categoryColor:   cat?.color,
        plannedDuration: s.planned_duration as number,
      };
      const entry = toEntry(row, session, workDurations.get(row.session_id as string));
      return { ...entry, teamName: teams?.name as string | undefined };
    });
  },
};
