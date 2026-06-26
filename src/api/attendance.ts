import { supabase } from './client';
import type { TrainingSession, TrainingAttendance } from '../data/types';

function toSession(row: Record<string, unknown>): TrainingSession {
  return {
    id:              row.id               as string,
    teamId:          row.team_id          as string,
    seasonId:        row.season_id        as string,
    date:            row.date             as string,
    sessionType:     row.session_type     as string,
    plannedDuration: row.planned_duration as number,
    notes:           row.notes            as string | undefined,
    partnerCount:    (row.partner_count   as number) ?? 0,
    partnerNames:    (row.partner_names   as string) ?? '',
    createdAt:       row.created_at       as string,
  };
}

function toAttendance(row: Record<string, unknown>): TrainingAttendance {
  return {
    id:        row.id         as string,
    sessionId: row.session_id as string,
    playerId:  row.player_id  as string,
    status:    row.status     as TrainingAttendance['status'],
    createdAt: row.created_at as string,
  };
}

export const attendanceApi = {
  async getSession(id: string): Promise<TrainingSession | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toSession(data as Record<string, unknown>) : null;
  },

  async listSessions(teamId: string, seasonId: string): Promise<TrainingSession[]> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toSession);
  },

  async createSession(input: { teamId: string; seasonId: string; date: string; duration: number; notes?: string }): Promise<TrainingSession> {
    const payload: Record<string, unknown> = {
      team_id:          input.teamId,
      season_id:        input.seasonId,
      date:             input.date,
      session_type:     'training',
      planned_duration: input.duration,
    };
    if (input.notes) payload.notes = input.notes;
    const { data, error } = await supabase
      .from('training_sessions')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return toSession(data);
  },

  async updateSession(id: string, input: { date?: string; sessionType?: string; plannedDuration?: number; notes?: string | null }): Promise<TrainingSession> {
    const payload: Record<string, unknown> = {};
    if (input.date !== undefined) payload.date = input.date;
    if (input.sessionType !== undefined) payload.session_type = input.sessionType;
    if (input.plannedDuration !== undefined) payload.planned_duration = input.plannedDuration;
    if ('notes' in input) payload.notes = input.notes ?? null;
    const { data, error } = await supabase
      .from('training_sessions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toSession(data as Record<string, unknown>);
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase.from('training_sessions').delete().eq('id', id);
    if (error) throw error;
  },

  async listAttendance(sessionIds: string[]): Promise<TrainingAttendance[]> {
    if (!sessionIds.length) return [];
    const { data, error } = await supabase
      .from('training_attendance')
      .select('*')
      .in('session_id', sessionIds);
    if (error) throw error;
    return (data ?? []).map(toAttendance);
  },

  async setAttendance(input: { sessionId: string; playerId: string; status: TrainingAttendance['status'] }): Promise<void> {
    const { error } = await supabase
      .from('training_attendance')
      .upsert(
        { session_id: input.sessionId, player_id: input.playerId, status: input.status },
        { onConflict: 'session_id,player_id' },
      );
    if (error) throw error;
  },

  async updatePartnerCount(sessionId: string, count: number): Promise<void> {
    const { error } = await supabase
      .from('training_sessions')
      .update({ partner_count: count })
      .eq('id', sessionId);
    if (error) throw error;
  },

  async updatePartnerNames(sessionId: string, names: string): Promise<void> {
    const { error } = await supabase
      .from('training_sessions')
      .update({ partner_names: names || null })
      .eq('id', sessionId);
    if (error) throw error;
  },

  async bulkSetPresent(entries: Array<{ sessionId: string; playerId: string }>): Promise<void> {
    if (!entries.length) return;
    const { error } = await supabase
      .from('training_attendance')
      .upsert(
        entries.map(e => ({ session_id: e.sessionId, player_id: e.playerId, status: 'present' })),
        { onConflict: 'session_id,player_id' },
      );
    if (error) throw error;
  },

  async deleteAttendance(sessionId: string, playerId: string): Promise<void> {
    const { error } = await supabase
      .from('training_attendance')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', playerId);
    if (error) throw error;
  },
};
