import { supabase } from './client';
import type { TrainingSession, TrainingAttendance } from '../data/types';

/** La catégorie voyage avec la séance : nom et couleur s'affichent partout sans que chaque
 *  écran ait à tenir sa propre table de correspondance — le club change son vocabulaire, et
 *  toute l'app suit. */
const SELECT = '*, team_categories(id, name, color)';

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
    createdAt:       row.created_at       as string,
  };
}

function toAttendance(row: Record<string, unknown>): TrainingAttendance {
  return {
    id:        row.id         as string,
    sessionId: row.session_id as string,
    playerId:  row.player_id  as string,
    status:    row.status     as TrainingAttendance['status'],
    sparring:  (row.sparring  as boolean) ?? false,
    createdAt: row.created_at as string,
  };
}

/** Découpe une liste d'ids : un `in(...)` part dans l'URL, et une saison entière de séances y
 *  tiendrait mal. 100 UUID ≈ 3,7 ko, largement sous les limites des proxies. */
const ID_CHUNK = 100;
function chunked<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += ID_CHUNK) out.push(list.slice(i, i + ID_CHUNK));
  return out;
}

export const attendanceApi = {
  async getSession(id: string): Promise<TrainingSession | null> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? toSession(data as Record<string, unknown>) : null;
  },

  async listSessions(teamId: string, seasonId: string): Promise<TrainingSession[]> {
    const { data, error } = await supabase
      .from('training_sessions')
      .select(SELECT)
      .eq('team_id', teamId)
      .eq('season_id', seasonId)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toSession);
  },

  async createSession(input: { teamId: string; seasonId: string; date: string; duration: number; notes?: string; categoryId?: string }): Promise<TrainingSession> {
    const payload: Record<string, unknown> = {
      team_id:          input.teamId,
      season_id:        input.seasonId,
      date:             input.date,
      category_id:      input.categoryId ?? null,
      planned_duration: input.duration,
    };
    if (input.notes) payload.notes = input.notes;
    const { data, error } = await supabase
      .from('training_sessions')
      .insert(payload)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toSession(data);
  },

  async updateSession(id: string, input: { date?: string; categoryId?: string | null; plannedDuration?: number; notes?: string | null }): Promise<TrainingSession> {
    const payload: Record<string, unknown> = {};
    if (input.date !== undefined) payload.date = input.date;
    if ('categoryId' in input) payload.category_id = input.categoryId ?? null;
    if (input.plannedDuration !== undefined) payload.planned_duration = input.plannedDuration;
    if ('notes' in input) payload.notes = input.notes ?? null;
    const { data, error } = await supabase
      .from('training_sessions')
      .update(payload)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throw error;
    return toSession(data as Record<string, unknown>);
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase.from('training_sessions').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Présences des séances demandées.
   *
   * À n'appeler que sur un nombre BORNÉ de séances (la grille travaille par fenêtre de 10) : la
   * réponse est plafonnée côté serveur — 1000 lignes par défaut sur Supabase — et la troncature
   * est silencieuse. Sur une saison entière, effectif × séances dépasse vite ce seuil et des
   * séances entières revenaient sans aucune présence, alors qu'elles étaient bien enregistrées.
   */
  async listAttendance(sessionIds: string[]): Promise<TrainingAttendance[]> {
    if (!sessionIds.length) return [];
    const { data, error } = await supabase
      .from('training_attendance')
      .select('*')
      .in('session_id', sessionIds);
    if (error) throw error;
    return (data ?? []).map(toAttendance);
  },

  /**
   * Partenaires d'entraînement de la saison : les joueurs pointés `sparring` sur au moins une
   * séance, toutes séances confondues.
   *
   * Requête à part, et non déduite des présences chargées : la grille n'affiche qu'une fenêtre de
   * séances, et une partenaire venue une seule fois hors de cette fenêtre doit garder sa ligne.
   * Le filtre sur `sparring` garde la réponse à quelques dizaines de lignes.
   */
  async listGuestPlayerIds(sessionIds: string[]): Promise<string[]> {
    if (!sessionIds.length) return [];
    const batches = await Promise.all(chunked(sessionIds).map(async ids => {
      const { data, error } = await supabase
        .from('training_attendance')
        .select('player_id')
        .eq('sparring', true)
        .in('session_id', ids);
      if (error) throw error;
      return (data ?? []).map(r => r.player_id as string);
    }));
    return [...new Set(batches.flat())];
  },

  /** `sparring` est écrit à chaque fois : c'est la présence qui porte l'étiquette, et une même
   *  joueur peut être invité sur une séance et titulaire sur une autre. */
  async setAttendance(input: {
    sessionId: string; playerId: string; status: TrainingAttendance['status']; sparring?: boolean;
  }): Promise<void> {
    const { error } = await supabase
      .from('training_attendance')
      .upsert(
        { session_id: input.sessionId, player_id: input.playerId, status: input.status, sparring: input.sparring ?? false },
        { onConflict: 'session_id,player_id' },
      );
    if (error) throw error;
  },

  async bulkSetPresent(entries: Array<{ sessionId: string; playerId: string }>): Promise<void> {
    return attendanceApi.bulkSetStatus(entries, 'present');
  },

  /** Même statut (et éventuellement même statut de partenaire) pour tout un lot de
   *  (séance, joueur) — la création de séance y écrit le statut par défaut choisi pour
   *  l'effectif, et l'invitation de partenaires déjà présents sur la grille, en une seule
   *  requête plutôt qu'un pointage par joueur/séance. */
  async bulkSetStatus(entries: Array<{ sessionId: string; playerId: string }>, status: TrainingAttendance['status'], sparring = false): Promise<void> {
    if (!entries.length) return;
    const { error } = await supabase
      .from('training_attendance')
      .upsert(
        entries.map(e => ({ session_id: e.sessionId, player_id: e.playerId, status, sparring })),
        { onConflict: 'session_id,player_id' },
      );
    if (error) throw error;
  },

  /** Retire un joueur de toutes les séances données — retrait d'un partenaire de la grille. */
  async deletePlayerAttendance(playerId: string, sessionIds: string[]): Promise<void> {
    for (const ids of chunked(sessionIds)) {
      const { error } = await supabase
        .from('training_attendance')
        .delete()
        .eq('player_id', playerId)
        .in('session_id', ids);
      if (error) throw error;
    }
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
