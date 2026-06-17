import { supabase } from './client';
import type { Organization } from '../data/types';

export interface OrgUpdateInput {
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export const configApi = {
  async getMyOrg(): Promise<Organization | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles').select('organization_id').eq('id', user.id).single();
    if (!profile?.organization_id) return null;
    const { data, error } = await supabase
      .from('organizations').select('*').eq('id', profile.organization_id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toOrg(data as Record<string, unknown>);
  },

  async updateOrg(orgId: string, input: OrgUpdateInput): Promise<void> {
    const { error } = await supabase.from('organizations').update({
      name:     input.name,
      address:  input.address  ?? null,
      city:     input.city     ?? null,
      phone:    input.phone    ?? null,
      email:    input.email    ?? null,
      website:  input.website  ?? null,
      logo_url: input.logoUrl  ?? null,
    }).eq('id', orgId);
    if (error) throw error;
  },
};

function toOrg(row: Record<string, unknown>): Organization {
  return {
    id:      row.id      as string,
    name:    row.name    as string,
    address: row.address as string | undefined,
    city:    row.city    as string | undefined,
    phone:   row.phone   as string | undefined,
    email:   row.email   as string | undefined,
    website: row.website as string | undefined,
    logoUrl: row.logo_url as string | undefined,
  };
}
