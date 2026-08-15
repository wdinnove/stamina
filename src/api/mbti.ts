import { supabase } from './client';
import type { MbtiResponse } from '../data/types';

export interface MbtiPublicInfo {
  firstName: string;
  lastName: string;
  /** Vrai si la joueuse a déjà rempli le questionnaire — le lien n'est alors plus utilisable. */
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
};

function toResponse(row: Record<string, unknown>): MbtiResponse {
  return {
    id:          row.id           as string,
    playerId:    row.player_id    as string,
    answers:     row.answers      as Record<number, number>,
    submittedAt: row.submitted_at as string,
  };
}
