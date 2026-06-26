import { supabase } from './client';
import type { MedicalRecord } from '../data/types';

export interface ListMedicalFilters {
  playerId?: string;
  playerIds?: string[];
  status?: 'active' | 'resolved';
  type?: MedicalRecord['type'];
}

export const medicalApi = {
  async list(filters: ListMedicalFilters = {}): Promise<MedicalRecord[]> {
    let query = supabase.from('medical_records').select('*');
    if (filters.playerIds?.length) query = query.in('player_id', filters.playerIds);
    if (filters.playerId) query = query.eq('player_id', filters.playerId);
    if (filters.status)   query = query.eq('status', filters.status);
    if (filters.type)     query = query.eq('type', filters.type);
    const { data, error } = await query.order('date', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []).map(toMedical);
  },

  async getByPlayer(playerId: string): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('player_id', playerId)
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMedical);
  },

  async getActiveInjuries(): Promise<MedicalRecord[]> {
    const { data, error } = await supabase
      .from('medical_records')
      .select('*')
      .eq('type', 'injury')
      .eq('status', 'active')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toMedical);
  },

  async create(input: Omit<MedicalRecord, 'id'>): Promise<MedicalRecord> {
    const { data, error } = await supabase
      .from('medical_records')
      .insert(toRow(input))
      .select()
      .single();
    if (error) throw error;
    return toMedical(data);
  },

  async update(id: string, input: Partial<Omit<MedicalRecord, 'id'>>): Promise<MedicalRecord> {
    const { data, error } = await supabase
      .from('medical_records')
      .update(toRow(input))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return toMedical(data);
  },
};

function toMedical(row: Record<string, unknown>): MedicalRecord {
  return {
    id:          row.id           as string,
    playerId:    row.player_id    as string,
    date:        row.date         as string,
    type:        row.type         as MedicalRecord['type'],
    description: row.description  as string,
    location:    row.location     as string | undefined,
    severity:    row.severity     as MedicalRecord['severity'] | undefined,
    status:       row.status        as MedicalRecord['status'],
    resolvedDate: row.resolved_date as string | undefined,
    rtpDate:     row.rtp_date  as string | undefined,
    treatment:   row.treatment as string | undefined,
    daysAbsent:  row.days_absent as number | undefined,
  };
}

function toRow(m: Partial<Omit<MedicalRecord, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (m.playerId    !== undefined) row.player_id   = m.playerId;
  if (m.date        !== undefined) row.date         = m.date;
  if (m.type        !== undefined) row.type         = m.type;
  if (m.description !== undefined) row.description  = m.description;
  if (m.location    !== undefined) row.location     = m.location;
  if (m.severity    !== undefined) row.severity     = m.severity;
  if (m.status       !== undefined) row.status        = m.status;
  if (m.resolvedDate !== undefined) row.resolved_date = m.resolvedDate;
  if (m.rtpDate    !== undefined) row.rtp_date    = m.rtpDate;
  if (m.daysAbsent !== undefined) row.days_absent = m.daysAbsent ?? null;
  if (m.treatment  !== undefined) row.treatment   = m.treatment ?? null;
  return row;
}
