import { supabase } from './client';
import type { RPEEntry, SessionType, TrainingSession } from '../data/types';

export interface ListRpeFilters {
  playerId?: string;
  seasonId?: string;
}

function toSession(row: Record<string, unknown>): TrainingSession {
  return {
    id:              row.id               as string,
    teamId:          row.team_id          as string,
    seasonId:        row.season_id        as string,
    date:            row.date             as string,
    sessionType:     row.session_type     as SessionType,
    plannedDuration: row.planned_duration as number,
    notes:           row.notes            as string | undefined,
  };
}

function toEntry(row: Record<string, unknown>, session: TrainingSession): RPEEntry {
  return {
    id:              row.id              as string,
    sessionId:       row.session_id      as string,
    playerId:        row.player_id       as string,
    rpe:             row.rpe             as number,
    actualDuration:  row.actual_duration as number | undefined,
    notes:           row.notes           as string | undefined,
    date:            session.date,
    sessionType:     session.sessionType,
    plannedDuration: session.plannedDuration,
  };
}

export const rpeApi = {
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
    sessionType: SessionType;
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
          session_type:     input.sessionType,
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
        session_type:     input.sessionType,
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

  // RPE history for a player — all seasons
  async listPlayerHistory(playerId: string): Promise<RPEEntry[]> {
    const { data, error } = await supabase
      .from('rpe_entries')
      .select('*, training_sessions!inner(id, date, session_type, planned_duration, season_id, team_id, teams(name))')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => {
      const s = row.training_sessions as Record<string, unknown>;
      const teams = s.teams as Record<string, unknown> | null;
      const session: TrainingSession = {
        id:              s.id              as string,
        teamId:          s.team_id         as string,
        seasonId:        s.season_id       as string,
        date:            s.date            as string,
        sessionType:     s.session_type    as SessionType,
        plannedDuration: s.planned_duration as number,
      };
      const entry = toEntry(row as Record<string, unknown>, session);
      return { ...entry, teamName: teams?.name as string | undefined };
    });
  },
};
