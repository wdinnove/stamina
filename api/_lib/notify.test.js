import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dispatch, claimDispatch } from './notify.js'

/** Faux client Supabase : capture les insertions au lieu d'écrire en base. */
function fakeAdmin(recipients, { subs = [] } = {}) {
  const inserted = []
  return {
    inserted,
    rpcCalls: 0,
    async rpc() { this.rpcCalls += 1; return { data: recipients, error: null } },
    from(table) {
      return {
        insert: async rows => { inserted.push({ table, rows }); return { error: null } },
        select: () => ({ in: async () => ({ data: subs, error: null }) }),
        delete: () => ({ in: async () => ({}) }),
      }
    },
  }
}

const recipient = (id, inApp, push, email = true) => ({ user_id: id, in_app: inApp, push, email })
const base = { teamId: 't1', orgId: 'o1', title: 'Titre' }

/** Les lignes in-app créées lors du dernier dispatch. */
const inAppUsers = admin => (admin.inserted[0]?.rows ?? []).map(r => r.user_id)

beforeEach(() => {
  // Sans clés VAPID, l'envoi push échoue : on vérifie ainsi qu'il n'entrave pas l'in-app.
  delete process.env.VAPID_PUBLIC_KEY
  delete process.env.VAPID_PRIVATE_KEY
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('dispatch — diffusion in-app', () => {
  it('notifie tous les membres ayant accès à l\'équipe', async () => {
    const admin = fakeAdmin([recipient('u1', true, true), recipient('u2', true, false)])
    await dispatch(admin, { ...base, type: 'medical_added' })
    expect(inAppUsers(admin)).toEqual(['u1', 'u2'])
  })

  it('renseigne la catégorie et l\'équipe sur chaque ligne', async () => {
    const admin = fakeAdmin([recipient('u1', true, false)])
    await dispatch(admin, { ...base, type: 'medical_added', entityId: 'r9', entityType: 'player' })
    expect(admin.inserted[0].rows[0]).toMatchObject({
      category: 'medical', team_id: 't1', organization_id: 'o1', entity_id: 'r9',
    })
  })

  it('n\'insère rien quand l\'équipe a coupé l\'in-app sur la catégorie', async () => {
    const admin = fakeAdmin([recipient('u1', false, true), recipient('u2', false, true)])
    await dispatch(admin, { ...base, type: 'medical_added' })
    expect(admin.inserted).toHaveLength(0)
  })

  it('n\'insère rien pour un type sans canal in-app', async () => {
    const admin = fakeAdmin([recipient('u1', true, true)])
    await dispatch(admin, { ...base, type: 'wellness_digest' })
    expect(admin.inserted).toHaveLength(0)
  })

  it('exclut l\'auteur de sa propre action', async () => {
    const admin = fakeAdmin([recipient('u1', true, true), recipient('u2', true, true)])
    await dispatch(admin, { ...base, type: 'medical_added', actorId: 'u1' })
    expect(inAppUsers(admin)).toEqual(['u2'])
  })
})

describe('dispatch — audience assignee', () => {
  it('ne notifie que la personne assignée, pas toute l\'équipe', async () => {
    const admin = fakeAdmin([recipient('u1', true, true), recipient('u2', true, true), recipient('u3', true, true)])
    await dispatch(admin, { ...base, type: 'action_added', actorId: 'u1', assigneeUserIds: ['u2'] })
    expect(inAppUsers(admin)).toEqual(['u2'])
  })

  it('ne notifie personne si l\'assigné n\'a pas accès à l\'équipe', async () => {
    const admin = fakeAdmin([recipient('u1', true, true)])
    const res = await dispatch(admin, { ...base, type: 'action_added', assigneeUserIds: ['hors-equipe'] })
    expect(res).toEqual({ inApp: 0, push: 0 })
  })

  it('ne notifie personne quand aucun assigné n\'est fourni', async () => {
    const admin = fakeAdmin([recipient('u1', true, true)])
    const res = await dispatch(admin, { ...base, type: 'action_added' })
    expect(res.inApp).toBe(0)
  })
})

describe('dispatch — robustesse', () => {
  it('rejette un type absent du registre', async () => {
    const admin = fakeAdmin([recipient('u1', true, true)])
    await expect(dispatch(admin, { ...base, type: 'type_inexistant' })).rejects.toThrow('type_inexistant')
  })

  it('conserve la notification in-app même si le push est impossible', async () => {
    const admin = fakeAdmin([recipient('u1', true, true)])
    const res = await dispatch(admin, { ...base, type: 'medical_added' })
    expect(inAppUsers(admin)).toEqual(['u1'])
    expect(res.push).toBe(0)
  })

  it('réutilise les destinataires fournis sans relire la base', async () => {
    const admin = fakeAdmin([])
    await dispatch(admin, { ...base, type: 'medical_added', recipients: [recipient('u9', true, false)] })
    expect(admin.rpcCalls).toBe(0)
    expect(inAppUsers(admin)).toEqual(['u9'])
  })
})

describe('claimDispatch — idempotence des rappels calculés', () => {
  /** Faux journal : rejette une seconde insertion de la même clé, comme la clé primaire. */
  function fakeLog() {
    const seen = new Set()
    return {
      seen,
      from() {
        return {
          insert: async row => {
            const k = `${row.dedup_key}|${row.dedup_day}`
            if (seen.has(k)) return { error: { code: '23505', message: 'duplicate key' } }
            seen.add(k)
            return { error: null }
          },
        }
      },
    }
  }

  it('autorise la première diffusion et refuse la seconde', async () => {
    const admin = fakeLog()
    expect(await claimDispatch(admin, 'rtp_upcoming:abc', '2026-08-04')).toBe(true)
    expect(await claimDispatch(admin, 'rtp_upcoming:abc', '2026-08-04')).toBe(false)
  })

  it('autorise à nouveau le lendemain', async () => {
    const admin = fakeLog()
    await claimDispatch(admin, 'rpe_missing:s1', '2026-08-04')
    expect(await claimDispatch(admin, 'rpe_missing:s1', '2026-08-05')).toBe(true)
  })

  it('isole les entités entre elles', async () => {
    const admin = fakeLog()
    await claimDispatch(admin, 'task_due_soon:t1', '2026-08-04')
    expect(await claimDispatch(admin, 'task_due_soon:t2', '2026-08-04')).toBe(true)
  })

  it('propage une vraie erreur de base au lieu de la masquer', async () => {
    const admin = { from: () => ({ insert: async () => ({ error: { code: '42P01', message: 'relation absente' } }) }) }
    await expect(claimDispatch(admin, 'x', '2026-08-04')).rejects.toMatchObject({ code: '42P01' })
  })
})
