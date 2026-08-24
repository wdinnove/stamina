import { supabase } from './client';
import type { MbtiResponse } from '../data/types';

export interface MbtiPublicInfo {
  firstName: string;
  lastName: string;
  /** Vrai si le joueur a déjà rempli le questionnaire — le lien n'est alors plus utilisable. */
  alreadyAnswered: boolean;
}

export const mbtiApi = {
  /** État du lien public (nom + déjà répondu ou non), sans session — RPC accordée à `anon`. */
  async getPublicInfo(playerId: string): Promise<MbtiPublicInfo | null> {
    const { data, error } = await supabase.rpc('get_mbti_public_info', { p_player_id: playerId }).maybeSingle();
    if (error || !data) return null;
    const info = data as { first_name: string; last_name: string; already_answered: boolean };
    return { firstName: info.first_name, lastName: info.last_name, alreadyAnswered: info.already_answered };
  },

  /** Soumission depuis le formulaire public. Le serveur revalide tout et refuse une 2e passation. */
  async submitPublic(playerId: string, answers: Record<number, number>): Promise<{ error: { message: string } | null }> {
    const { error } = await supabase.rpc('submit_mbti_public', {
      p_player_id: playerId,
      p_answers:   answers,
    });
    return { error };
  },

  async getByPlayer(playerId: string): Promise<MbtiResponse | null> {
    const { data, error } = await supabase
      .from('mbti_responses')
      .select('*')
      .eq('player_id', playerId)
      .maybeSingle();
    if (error) throw error;
    return data ? toResponse(data) : null;
  },

  async listByPlayers(playerIds: string[]): Promise<MbtiResponse[]> {
    if (!playerIds.length) return [];
    const { data, error } = await supabase
      .from('mbti_responses')
      .select('*')
      .in('player_id', playerIds);
    if (error) throw error;
    return (data ?? []).map(toResponse);
  },

  /** Réinitialisation par le staff : supprime la réponse, ce qui rouvre le lien public.
   *  Définitif — l'ancienne passation n'est pas conservée. */
  async reset(playerId: string): Promise<void> {
    const { error } = await supabase.from('mbti_responses').delete().eq('player_id', playerId);
    if (error) throw error;
  },

  // ── Même questionnaire, pour un membre du staff plutôt qu'un joueur — `mbti_responses` porte
  // soit `player_id`, soit `staff_id` (jamais les deux), cf. migration schema.sql. ──

  async getStaffPublicInfo(staffId: string): Promise<MbtiPublicInfo | null> {
    const { data, error } = await supabase.rpc('get_staff_mbti_public_info', { p_staff_id: staffId }).maybeSingle();
    if (error || !data) return null;
    const info = data as { first_name: string; last_name: string; already_answered: boolean };
    return { firstName: info.first_name, lastName: info.last_name, alreadyAnswered: info.already_answered };
  },

  async submitStaffPublic(staffId: string, answers: Record<number, number>): Promise<{ error: { message: string } | null }> {
    const { error } = await supabase.rpc('submit_staff_mbti_public', {
      p_staff_id: staffId,
      p_answers:  answers,
    });
    return { error };
  },

  async getByStaff(staffId: string): Promise<StaffMbtiResponse | null> {
    const { data, error } = await supabase
      .from('mbti_responses')
      .select('*')
      .eq('staff_id', staffId)
      .maybeSingle();
    if (error) throw error;
    return data ? toStaffResponse(data) : null;
  },

  async listByStaffIds(staffIds: string[]): Promise<StaffMbtiResponse[]> {
    if (!staffIds.length) return [];
    const { data, error } = await supabase
      .from('mbti_responses')
      .select('*')
      .in('staff_id', staffIds);
    if (error) throw error;
    return (data ?? []).map(toStaffResponse);
  },

  async resetStaff(staffId: string): Promise<void> {
    const { error } = await supabase.from('mbti_responses').delete().eq('staff_id', staffId);
    if (error) throw error;
  },
};

export interface StaffMbtiResponse {
  id: string;
  staffId: string;
  answers: Record<number, number>;
  submittedAt: string;
}

function toResponse(row: Record<string, unknown>): MbtiResponse {
  return {
    id:          row.id           as string,
    playerId:    row.player_id    as string,
    answers:     row.answers      as Record<number, number>,
    submittedAt: row.submitted_at as string,
  };
}

function toStaffResponse(row: Record<string, unknown>): StaffMbtiResponse {
  return {
    id:          row.id           as string,
    staffId:     row.staff_id     as string,
    answers:     row.answers      as Record<number, number>,
    submittedAt: row.submitted_at as string,
  };
}
