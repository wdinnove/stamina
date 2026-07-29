import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { NOTIFICATION_TYPES } from '../../shared/notifications.js'

const here = dirname(fileURLToPath(import.meta.url))

/** Code du cron sans les commentaires : la garde porte sur ce qui s'exécute, pas sur la prose. */
const cronSource = readFileSync(join(here, 'notifications.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1')

/**
 * Règle produit explicite : aucune joueuse ne doit jamais recevoir d'email ni de push
 * automatique. Elles ne sont contactées que sur action manuelle du staff depuis
 * l'interface (bouton d'envoi des liens de WellnessPage).
 *
 * Ces tests gardent la règle au niveau de la source, parce qu'une régression ici
 * serait invisible côté code (l'envoi « marcherait ») et visible seulement par les
 * joueuses qui recevraient un email non désiré.
 */
describe('aucun contact automatique des joueuses', () => {
  it('le cron ne lit jamais l\'email d\'une joueuse', () => {
    expect(cronSource).not.toMatch(/players?\s*\([^)]*email/i)
    expect(cronSource).not.toMatch(/\bplayer\.email\b/)
    expect(cronSource).not.toMatch(/\bplayers\.email\b/)
  })

  it('le cron n\'utilise pas le template MailerSend du formulaire bien-être', () => {
    // Ce template s'adresse aux joueuses : sa seule utilisation légitime est l'envoi
    // manuel depuis WellnessPage.
    expect(cronSource).not.toContain('jpzkmgq5vqng059v')
    expect(cronSource).not.toMatch(/template_id/)
  })

  it('le cron n\'écrit pas de lien vers le formulaire public joueur', () => {
    expect(cronSource).not.toMatch(/\/player\//)
  })

  it('tout envoi du cron est adressé à staffEmails, et à rien d\'autre', () => {
    // Invariant le plus solide : peu importe comment une adresse est obtenue, le seul
    // destinataire autorisé est la liste résolue depuis les comptes staff de l'équipe.
    const recipients = [...cronSource.matchAll(/\bto:\s*([^,\n]+)/g)].map(m => m[1].trim())
    expect(recipients.length).toBeGreaterThan(0)
    for (const to of recipients) expect(to).toBe('staffEmails')
  })

  it('staffEmails ne provient que de comptes app du staff', () => {
    // resolveEmails part de profiles + auth.users : une joueuse n'y figure pas.
    expect(cronSource).toMatch(/staffEmails\s*=\s*await\s+resolveEmails\(/)
    expect(cronSource).toMatch(/resolveEmails\(admin,\s*recipients\.filter\(r => r\.email\)/)
  })

  it('aucun type de notification ne cible une audience hors staff', () => {
    // 'team' = comptes staff ayant accès à l'équipe · 'assignee' = un compte staff précis.
    // Toute autre valeur ouvrirait la porte à une diffusion vers les joueuses.
    for (const type of NOTIFICATION_TYPES) {
      expect(['team', 'assignee'], type.key).toContain(type.audience)
    }
  })
})

describe('protection de l\'endpoint cron', () => {
  const mkRes = () => {
    const res = { statusCode: null, payload: null }
    res.status = c => { res.statusCode = c; return res }
    res.json = p => { res.payload = p; return res }
    return res
  }

  it('refuse d\'exécuter quand CRON_SECRET n\'est pas configuré', async () => {
    const saved = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    const { default: handler } = await import('./notifications.js')
    const res = mkRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(503)
    if (saved !== undefined) process.env.CRON_SECRET = saved
  })

  it('refuse un secret incorrect', async () => {
    process.env.CRON_SECRET = 'attendu'
    const { default: handler } = await import('./notifications.js')
    const res = mkRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer faux' } }, res)
    expect(res.statusCode).toBe(401)
    delete process.env.CRON_SECRET
  })
})
