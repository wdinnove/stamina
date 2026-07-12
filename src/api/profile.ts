import { supabase } from './client';

export interface CurrentProfile {
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

export const profileApi = {
  async getCurrent(): Promise<CurrentProfile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('profiles')
      .select('first_name, last_name, organizations(name)')
      .eq('id', user.id)
      .single();
    const org = data?.organizations as unknown as { name: string } | null;
    return {
      email:     user.email ?? '',
      firstName: data?.first_name ?? '',
      lastName:  data?.last_name ?? '',
      orgName:   org?.name ?? '',
    };
  },

  async updateNames(firstName: string, lastName: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Non authentifié.');
    const { error } = await supabase.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', user.id);
    if (error) throw error;
  },

  async changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInErr) throw new Error('Mot de passe actuel incorrect.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
};
