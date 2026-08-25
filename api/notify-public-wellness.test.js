import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Le formulaire public est le SEUL chemin de saisie qui ne passe pas par un utilisateur
 * connecté : sa notification ne peut donc pas être vérifiée depuis les tests de /api/notify.
 * On appelle ici le vrai handler, avec un faux client, pour tenir la garantie qui manquait —
 * une saisie joueur remonte au staff, alerte ou pas.
 */
const getSupabaseAdmin = vi.fn()

vi.mock('./_lib/supabaseAdmin.js', () => ({
  getSupabaseAdmin: (...a) => getSupabaseAdmin(...a),
}))

// Le push a ses propres tests ; sans VAPID configuré il ne ferait que polluer la sortie.
vi.mock('./_lib/push.js', () => ({
  configureWebPush: () => {},
  sendPushToUsers: async () => ({ total: 0, sent: 0, removed: 0 }),
}))

const { default: handler } = await import('./notify-public-wellness.js')

const SAIN = { id: 'w-1', score: 8, fatigue: 3, stress: 2, soreness: 2 }
const CRITIQUE = { id: 'w-2', score: 3, fatigue: 9, stress: 5, soreness: 4 }

/** Faux client : le journal de diffusion refuse les doublons comme le ferait la clé primaire. */
function fakeAdmin({ entry, log = new Set() } = {}) {
  const inserted = []
  return {
    inserted,
    log,
    async rpc(fn) {
      if (fn === 'player_current_team') return { data: 't1', error: null }
      if (fn === 'notification_recipients') {
        return { data: [{ user_id: 'u-staff', in_app: true, push: true, email: false }], error: null }
      }
      return { data: null, error: { message: `rpc inattendu : ${fn}` } }
    },
    from(table) {
      switch (table) {
        case 'wellness_entries':
          return { select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: entry, error: null }) }) }) }) }
        case 'players':
          return { select: () => ({ eq: () => ({ single: async () => ({
            data: { first_name: 'Paul', last_name: 'Dupont', organization_id: 'org-1' }, error: null,
          }) }) }) }
        case 'notification_dispatch_log':
          return { insert: async row => {
            if (log.has(row.dedup_key)) return { error: { code: '23505' } }
            log.add(row.dedup_key)
            return { error: null }
          } }
        case 'notifications':
          return { insert: async rows => { inserted.push(...rows); return { error: null } } }
        default:
          throw new Error(`table inattendue : ${table}`)
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

const post = () => ({ method: 'POST', body: { playerId: 'p-1', date: '2026-08-24' } })

async function run(admin) {
  getSupabaseAdmin.mockReturnValue(admin)
  const res = mkRes()
  await handler(post(), res)
  return res
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/notify-public-wellness', () => {
  it('notifie la saisie même quand le bien-être est bon', async () => {
    const admin = fakeAdmin({ entry: SAIN })
    const res = await run(admin)
    expect(res.statusCode).toBe(200)
    expect(admin.inserted.map(n => n.type)).toEqual(['wellness_added'])
  })

  it('ajoute l\'alerte, sans remplacer la saisie, sous le seuil', async () => {
    const admin = fakeAdmin({ entry: CRITIQUE })
    await run(admin)
    // Les deux : couper le flux quotidien ne doit pas couper les alertes, et inversement.
    expect(admin.inserted.map(n => n.type)).toEqual(['wellness_added', 'wellness_alert'])
  })

  it('vise le joueur et non l\'entrée, seul identifiant que urlFor sait router', async () => {
    const admin = fakeAdmin({ entry: SAIN })
    await run(admin)
    expect(admin.inserted[0]).toMatchObject({ entity_type: 'player', entity_id: 'p-1' })
  })

  it('écrit la date en clair plutôt qu\'en ISO', async () => {
    const admin = fakeAdmin({ entry: CRITIQUE })
    await run(admin)
    for (const notif of admin.inserted) {
      expect(notif.body).not.toContain('2026-08-24')
      expect(notif.body).toContain('24 août')
    }
  })

  it('ne renotifie pas au rejeu de la même entrée', async () => {
    const log = new Set()
    await run(fakeAdmin({ entry: CRITIQUE, log }))
    const rejeu = fakeAdmin({ entry: CRITIQUE, log })
    await run(rejeu)
    expect(rejeu.inserted).toHaveLength(0)
  })

  it('ignore une entrée introuvable plutôt que de notifier à vide', async () => {
    const admin = fakeAdmin({ entry: null })
    const res = await run(admin)
    expect(res.statusCode).toBe(200)
    expect(admin.inserted).toHaveLength(0)
  })

  it('refuse une méthode autre que POST', async () => {
    const res = mkRes()
    await handler({ method: 'GET', body: {} }, res)
    expect(res.statusCode).toBe(405)
  })
})
