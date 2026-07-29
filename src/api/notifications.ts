import { supabase, authHeaders } from './client';

export type AppNotification = {
  id: string;
  type: string;
  category: string | null;
  team_id: string | null;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  created_by: string | null;
};

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, category, team_id, title, body, entity_type, entity_id, read_at, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return data ?? [];
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw error;
}

type NotifyOptions = {
  body?: string;
  entityType?: string;
  entityId?: string;
  /** Requis pour les types d'audience 'assignee' — référence staff(id), pas profiles(id). */
  assigneeStaffId?: string;
};

/**
 * Crée une notification pour le staff de l'équipe (ou la seule personne assignée,
 * selon le type). Le serveur résout le public et applique les réglages d'équipe
 * puis les préférences de chaque utilisateur.
 *
 * Volontairement fire-and-forget : une notification qui échoue ne doit jamais faire
 * échouer l'action métier qui vient de réussir.
 */
export async function notify(
  teamId: string | undefined,
  type: string,
  title: string,
  options: NotifyOptions = {},
): Promise<void> {
  if (!teamId) return;
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ teamId, type, title, ...options }),
    });
    if (!res.ok) console.error('[notify]', type, await res.text());
  } catch (err) {
    console.error('[notify]', type, err);
  }
}

/** Alerte bien-être depuis le formulaire public anonyme — le serveur revalide tout. */
export async function notifyPublicWellness(playerId: string, date: string): Promise<void> {
  try {
    await fetch('/api/notify-public-wellness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, date }),
    });
  } catch (err) {
    console.error('[notifyPublicWellness]', err);
  }
}
