import { getSupabaseAdmin } from './supabaseAdmin.js'

/** organization_id d'un utilisateur (profiles.organization_id), ou null si introuvable. */
export async function getOrganizationId(userId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('profiles').select('organization_id').eq('id', userId).single()
  if (error) return null
  return data?.organization_id ?? null
}
