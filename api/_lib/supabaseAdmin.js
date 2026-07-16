import { createClient } from '@supabase/supabase-js'

let client

/** Client Supabase avec la service role key — usage serverless uniquement, ne jamais exposer au front. */
export function getSupabaseAdmin() {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return client
}

/**
 * Vérifie le JWT Supabase envoyé par le client (header Authorization: Bearer <token>) et renvoie
 * l'utilisateur authentifié, ou null si absent/invalide. Les routes push ne doivent jamais faire
 * confiance à un userId fourni dans le body pour les opérations sur les abonnements de l'appelant.
 */
export async function getAuthedUser(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}
