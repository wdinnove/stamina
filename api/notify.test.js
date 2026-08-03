import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests de comportement de l'endpoint, et non de son source : une garde qui se
 * contente de chercher un nom de fonction dans le fichier passe encore quand
 * l'appel a été mis en commentaire. Ici on appelle vraiment le handler.
 */
const getAuthedUser = vi.fn()
const getSupabaseAdmin = vi.fn()

vi.mock('./_lib/supabaseAdmin.js', () => ({
  getAuthedUser: (...a) => getAuthedUser(...a),
  getSupabaseAdmin: (...a) => getSupabaseAdmin(...a),
}))

const { default: handler } = await import('./notify.js')

const CALLER = { id: 'u-caller' }

/** Faux client : réponses RPC paramétrables, insertions capturées. */
function fakeAdmin({ writeAccess = true, underLimit = true, recipients = null } = {}) {
  const inserted = []
  return {
    inserted,
    async rpc(fn) {
      if (fn === 'team_write_access') return { data: writeAccess, error: null }
      if (fn === 'notification_rate_bump') return { data: underLimit, error: null }
      if (fn === 'notification_recipients') {
        return {
          data: recipients ?? [
            { user_id: 'u-caller', in_app: true, push: false, email: false },
            { user_id: 'u-autre', in_app: true, push: false, email: false },
          ],
          error: null,
        }
      }
      return { data: null, error: { message: `rpc inattendu : ${fn}` } }
    },
    from(table) {
      return {
        insert: async rows => { inserted.push({ table, rows }); return { error: null } },
        select: () => ({
          eq: () => ({ single: async () => ({ data: { organization_id: 'org-1' }, error: null }) }),
          in: async () => ({ data: [], error: null }),
        }),
        delete: () => ({ in: async () => ({}) }),
      }
    },
  }
}

function mkRes() {
  const res = { statusCode: null, payload: null, headers: {} }
  res.status = c => { res.statusCode = c; return res }
  res.json = p => { res.payload = p; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

const post = body => ({ method: 'POST', headers: { authorization: 'Bearer ok' }, body })
const valid = { teamId: 't1', type: 'medical_added', title: 'Fiche médicale' }

beforeEach(() => {
  vi.clearAllMocks()
  getAuthedUser.mockResolvedValue(CALLER)
})

describe('POST /api/notify — contrôle d\'accès', () => {
  it('refuse un appel non authentifié', async () => {
    getAuthedUser.mockResolvedValue(null)
    const res = mkRes()
    await handler(post(valid), res)
    expect(res.statusCode).toBe(401)
  })

  it('refuse un utilisateur sans droit d\'écriture sur l\'équipe', async () => {
    // Un rôle 'viewer' ne doit pas pouvoir pousser un message à tout le staff.
    const admin = fakeAdmin({ writeAccess: false })
    getSupabaseAdmin.mockReturnValue(admin)
    const res = mkRes()
    await handler(post(valid), res)
    expect(res.statusCode).toBe(403)
    expect(admin.inserted).toHaveLength(0)
  })

  it('accepte un utilisateur avec droit d\'écriture', async () => {
    const admin = fakeAdmin()
    getSupabaseAdmin.mockReturnValue(admin)
    const res = mkRes()
    await handler(post(valid), res)
    expect(res.statusCode).toBe(200)
    expect(admin.inserted[0].rows.map(r => r.user_id)).toEqual(['u-autre'])
  })
})

describe('POST /api/notify — limitation de débit', () => {
  it('répond 429 sans rien diffuser au-delà du plafond', async () => {
    const admin = fakeAdmin({ underLimit: false })
    getSupabaseAdmin.mockReturnValue(admin)
    const res = mkRes()
    await handler(post(valid), res)
    expect(res.statusCode).toBe(429)
    expect(admin.inserted).toHaveLength(0)
  })
})

describe('POST /api/notify — contenu fourni par le client', () => {
  it('rejette un type absent du registre', async () => {
    getSupabaseAdmin.mockReturnValue(fakeAdmin())
    const res = mkRes()
    await handler(post({ ...valid, type: 'type_forge' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('rejette un titre vide après nettoyage', async () => {
    getSupabaseAdmin.mockReturnValue(fakeAdmin())
    const res = mkRes()
    await handler(post({ ...valid, title: '   ' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('assainit et plafonne le texte réellement enregistré', async () => {
    const admin = fakeAdmin()
    getSupabaseAdmin.mockReturnValue(admin)
    const res = mkRes()
    await handler(post({
      ...valid,
      title: `Faux${String.fromCharCode(10)}ALERTE`,
      body: 'b'.repeat(900),
    }), res)
    expect(res.statusCode).toBe(200)
    const row = admin.inserted[0].rows[0]
    expect(row.title).toBe('Faux ALERTE')
    expect(row.body).toHaveLength(400)
  })

  it('impose la catégorie du registre plutôt qu\'une valeur du client', async () => {
    const admin = fakeAdmin()
    getSupabaseAdmin.mockReturnValue(admin)
    const res = mkRes()
    await handler(post({ ...valid, category: 'roster' }), res)
    expect(admin.inserted[0].rows[0].category).toBe('medical')
  })
})
