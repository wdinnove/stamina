import { supabase } from './client';
import type { Player, PlayerStatus } from '../data/types';

export interface ListPlayersFilters {
  status?: PlayerStatus;
}

export const playersApi = {
  async list(filters: ListPlayersFilters = {}): Promise<Player[]> {
    let query = supabase.from('players').select('*');
    if (filters.status) query = query.eq('status', filters.status);
    const { data, error } = await query.order('last_name');
    if (error) throw error;
    return (data ?? []).map(toPlayer);
  },

  async getById(id: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toPlayer(data) : null;
  },

  async create(input: Omit<Player, 'id'>): Promise<Player> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile?.organization_id) throw new Error('Aucune organisation associée à votre compte.');

    const id = crypto.randomUUID();
    const { error } = await supabase.from('players').insert({
      id,
      organization_id: profile.organization_id,
      ...toRow({ ...input, organizationId: profile.organization_id }),
    });
    if (error) throw error;
    return { id, ...input, organizationId: profile.organization_id };
  },

  async update(id: string, input: Partial<Omit<Player, 'id'>>): Promise<void> {
    const { error } = await supabase.from('players').update(toRow(input)).eq('id', id);
    if (error) throw error;
  },

  async uploadPhoto(playerId: string, file: File): Promise<string> {
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${playerId}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('player-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('player-photos').getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.from('players').update({ photo_url: url }).eq('id', playerId);
    if (error) throw error;
    return url;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) throw error;
  },

  async unlinkFromSeason(playerId: string, seasonId: string): Promise<void> {
    const { error } = await supabase
      .from('player_season')
      .delete()
      .eq('player_id', playerId)
      .eq('season_id', seasonId);
    if (error) throw error;
  },

  async linkToSeason(playerIds: string[], seasonId: string): Promise<void> {
    const rows = playerIds.map(playerId => ({ player_id: playerId, season_id: seasonId }));
    const { error } = await supabase.from('player_season').insert(rows);
    if (error) throw error;
  },

  async listBySeason(seasonId: string): Promise<Player[]> {
    const { data, error } = await supabase
      .from('player_season')
      .select('players(*)')
      .eq('season_id', seasonId);
    if (error) throw error;
    return (data ?? [])
      .map(row => {
        const p = row.players as unknown as Record<string, unknown> | null;
        return p ? toPlayer(p) : null;
      })
      .filter((p): p is Player => p !== null)
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
  },
};

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id:                row.id                 as string,
    firstName:         row.first_name         as string,
    lastName:          row.last_name          as string,
    number:            row.number             as number,
    position:          row.position           as Player['position'],
    secondaryPosition: row.secondary_position as Player['position'] | undefined,
    organizationId:    row.organization_id    as string,
    status:            row.status             as Player['status'],
    nationality:       row.nationality        as string,
    birthDate:         row.birth_date         as string,
    height:            row.height_cm          as number | undefined,
    weight:            row.weight_kg          as number | undefined,
    hand:              row.hand               as Player['hand'],
    contractEnd:       row.contract_end       as string | undefined,
    email:             row.email              as string | undefined,
    photoUrl:          row.photo_url          as string | undefined,
  };
}

function toRow(p: Partial<Omit<Player, 'id'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.firstName         !== undefined) row.first_name         = p.firstName;
  if (p.lastName          !== undefined) row.last_name          = p.lastName;
  if (p.number            !== undefined) row.number             = p.number;
  if (p.position          !== undefined) row.position           = p.position;
  if (p.secondaryPosition !== undefined) row.secondary_position = p.secondaryPosition;
  if (p.organizationId    !== undefined) row.organization_id    = p.organizationId;
  if (p.status            !== undefined) row.status             = p.status;
  if (p.nationality       !== undefined) row.nationality        = p.nationality;
  if (p.birthDate         !== undefined) row.birth_date         = p.birthDate;
  if (p.height            !== undefined) row.height_cm          = p.height;
  if (p.weight            !== undefined) row.weight_kg          = p.weight;
  if (p.hand              !== undefined) row.hand               = p.hand;
  if (p.contractEnd !== undefined) row.contract_end = p.contractEnd || null;
  if (p.email       !== undefined) row.email        = p.email       || null;
  if (p.photoUrl          !== undefined) row.photo_url          = p.photoUrl;
  return row;
}
