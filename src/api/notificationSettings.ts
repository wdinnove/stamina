import { supabase } from './client';
import { NOTIFICATION_CATEGORIES } from '../../shared/notifications.js';

export type ChannelSettings = {
  inApp: boolean;
  push: boolean;
  email: boolean;
};

export type TeamNotificationSettings = Record<string, ChannelSettings>;
export type UserNotificationPreferences = Record<string, { push: boolean; email: boolean }>;

const ALL_ON: ChannelSettings = { inApp: true, push: true, email: true };

/**
 * Réglages d'une équipe, complétés par les défauts pour les catégories sans ligne
 * enregistrée (convention du schéma : ligne absente = activé).
 */
export async function fetchTeamSettings(teamId: string): Promise<TeamNotificationSettings> {
  const { data, error } = await supabase
    .from('team_notification_settings')
    .select('category, in_app_enabled, push_enabled, email_enabled')
    .eq('team_id', teamId);
  if (error) throw error;

  const settings: TeamNotificationSettings = {};
  for (const cat of NOTIFICATION_CATEGORIES) settings[cat.key] = { ...ALL_ON };
  for (const row of data ?? []) {
    settings[row.category] = {
      inApp: row.in_app_enabled,
      push: row.push_enabled,
      email: row.email_enabled,
    };
  }
  return settings;
}

export async function saveTeamSetting(
  teamId: string,
  category: string,
  channels: ChannelSettings,
): Promise<void> {
  const { error } = await supabase
    .from('team_notification_settings')
    .upsert({
      team_id: teamId,
      category,
      in_app_enabled: channels.inApp,
      push_enabled: channels.push,
      email_enabled: channels.email,
    }, { onConflict: 'team_id,category' });
  if (error) throw error;
}

export async function fetchUserPreferences(): Promise<UserNotificationPreferences> {
  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('category, push_enabled, email_enabled');
  if (error) throw error;

  const prefs: UserNotificationPreferences = {};
  for (const cat of NOTIFICATION_CATEGORIES) prefs[cat.key] = { push: true, email: true };
  for (const row of data ?? []) {
    prefs[row.category] = { push: row.push_enabled, email: row.email_enabled };
  }
  return prefs;
}

export async function saveUserPreference(
  category: string,
  prefs: { push: boolean; email: boolean },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert({
      user_id: user.id,
      category,
      push_enabled: prefs.push,
      email_enabled: prefs.email,
    }, { onConflict: 'user_id,category' });
  if (error) throw error;
}
