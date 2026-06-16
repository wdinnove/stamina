import { supabase } from './client';

export type AppNotification = {
  id: string;
  type: string;
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
    .select('id, type, title, body, entity_type, entity_id, read_at, created_at, created_by')
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

/** Crée une notification pour tous les membres de l'organisation courante. */
export async function notifyOrg(
  type: string,
  title: string,
  body?: string,
  entityType?: string,
  entityId?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!profile?.organization_id) return;

  const { error } = await supabase.rpc('notify_organization', {
    p_organization_id: profile.organization_id,
    p_created_by: user.id,
    p_type: type,
    p_title: title,
    p_body: body ?? null,
    p_entity_type: entityType ?? null,
    p_entity_id: entityId ?? null,
  });
  if (error) console.error('[notifyOrg]', error);
}
