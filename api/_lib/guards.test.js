import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sanitizeTitle, sanitizeBody, hasTeamWriteAccess, withinRateLimit } from './guards.js'

const API = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(dirname(API), 'src')

const ESC = String.fromCharCode(27)
const NL = String.fromCharCode(10)

describe('assainissement du texte de notification', () => {
  it('préserve un libellé métier normal', () => {
    const t = 'Fiche médicale — Léa D. (genou), suivi #3 !'
    expect(sanitizeTitle(t)).toBe(t)
  })

  it('retire les caractères de contrôle et les sauts de ligne', () => {
    // Sans cela, un titre pourrait maquiller son affichage sur plusieurs lignes.
    expect(sanitizeTitle(`Faux${ESC}[31mALERTE${NL}ligne2`)).toBe('Faux [31mALERTE ligne2')
  })

  it('plafonne la longueur, charge push comprise', () => {
    expect(sanitizeTitle('x'.repeat(500))).toHaveLength(120)
    expect(sanitizeBody('x'.repeat(5000))).toHaveLength(400)
  })

  it('traite un texte vide ou absent comme absent', () => {
    expect(sanitizeTitle('   ')).toBeNull()
    expect(sanitizeTitle(undefined)).toBeNull()
    expect(sanitizeBody(null)).toBeNull()
  })
})

describe('droit d\'écriture et limitation de débit', () => {
  const rpcStub = value => ({ rpc: async () => ({ data: value, error: null }) })

  it('refuse un utilisateur sans droit d\'écriture', async () => {
    expect(await hasTeamWriteAccess(rpcStub(false), 'u1', 't1')).toBe(false)
  })

  it('accepte un utilisateur avec droit d\'écriture', async () => {
    expect(await hasTeamWriteAccess(rpcStub(true), 'u1', 't1')).toBe(true)
  })

  it('bloque au-delà du plafond', async () => {
    expect(await withinRateLimit(rpcStub(false), 'u1')).toBe(false)
    expect(await withinRateLimit(rpcStub(true), 'u1')).toBe(true)
  })

  it('propage une erreur de base plutôt que d\'autoriser par défaut', async () => {
    const failing = { rpc: async () => ({ data: null, error: { message: 'boom' } }) }
    await expect(hasTeamWriteAccess(failing, 'u1', 't1')).rejects.toBeTruthy()
    await expect(withinRateLimit(failing, 'u1')).rejects.toBeTruthy()
  })
})

describe('aucun envoi d\'email générique', () => {
  it('l\'ancien relais /api/send-email n\'existe plus', () => {
    // Il acceptait destinataires et contenu libres : tout utilisateur connecté pouvait
    // écrire à n'importe quelle adresse depuis le domaine du club.
    expect(existsSync(join(API, 'send-email.js'))).toBe(false)
  })

  it('le client n\'expose aucune fonction d\'envoi libre', () => {
    const email = readFileSync(join(SRC, 'api', 'email.ts'), 'utf8')
    expect(email).not.toMatch(/export\s+(async\s+)?function\s+sendEmail\b/)
    expect(email).not.toContain('/api/send-email')
    expect(email).toContain('/api/send-wellness-links')
  })

  it('l\'endpoint des liens exige un droit d\'écriture et ne compose pas de contenu libre', () => {
    const src = readFileSync(join(API, 'send-wellness-links.js'), 'utf8')
    expect(src).toContain('hasTeamWriteAccess')
    expect(src).toContain('withinRateLimit')
    // Les adresses sont relues en base, jamais prises dans la requête.
    expect(src).toMatch(/from\('player_season'\)/)
    expect(src).not.toMatch(/req\.body[^\n]*\bto\b/)
  })

  it('le lien envoyé aux joueurs ne vient pas des en-têtes de la requête', () => {
    // Un Host falsifié enverrait un lien vers un domaine ressemblant.
    const src = readFileSync(join(API, 'send-wellness-links.js'), 'utf8')
    expect(src).not.toMatch(/x-forwarded-host|headers\.host/)
    expect(src).toMatch(/APP_ORIGIN/)
  })

  it('le second envoi (questionnaire de personnalité) suit les mêmes règles', () => {
    // Deux endroits envoient un email à un joueur : ils doivent être aussi fermés l'un que
    // l'autre, sinon la règle « aucun contact non déclenché à la main » cesse d'être structurelle.
    const src = readFileSync(join(API, 'send-mbti-links.js'), 'utf8')
    expect(src).toContain('hasTeamWriteAccess')
    expect(src).toContain('withinRateLimit')
    expect(src).toMatch(/from\('player_season'\)/)
    expect(src).not.toMatch(/req\.body[^\n]*\bto\b/)
    expect(src).not.toMatch(/x-forwarded-host|headers\.host/)
    expect(src).toMatch(/APP_ORIGIN|appOrigin/)
  })

  it('le client n\'expose que les deux envois à template fixe', () => {
    const email = readFileSync(join(SRC, 'api', 'email.ts'), 'utf8')
    expect(email).toContain('/api/send-mbti-links')
    // Aucune fonction ne prend un destinataire ou un contenu en paramètre.
    expect(email).not.toMatch(/\b(subject|html|body|to)\s*:\s*string/)
  })
})

// Le comportement de /api/notify est couvert par api/notify.test.js, qui appelle
// réellement le handler : un test de source passerait encore si l'appel de garde
// était mis en commentaire.

describe('normalisation de l\'origine publique', () => {
  it('accepte le domaine avec ou sans slash final, résultat identique', async () => {
    const { appOrigin } = await import('../send-wellness-links.js')
    const attendu = 'https://stamina-one.vercel.app'
    expect(appOrigin({ APP_ORIGIN: 'https://stamina-one.vercel.app' })).toBe(attendu)
    expect(appOrigin({ APP_ORIGIN: 'https://stamina-one.vercel.app/' })).toBe(attendu)
    expect(appOrigin({ APP_ORIGIN: 'https://stamina-one.vercel.app///' })).toBe(attendu)
    expect(appOrigin({ APP_ORIGIN: '  https://stamina-one.vercel.app/  ' })).toBe(attendu)
  })

  it('ajoute le schéma au domaine nu fourni par Vercel', async () => {
    const { appOrigin } = await import('../send-wellness-links.js')
    expect(appOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'stamina-one.vercel.app' }))
      .toBe('https://stamina-one.vercel.app')
  })

  it('préserve http pour un usage local', async () => {
    const { appOrigin } = await import('../send-wellness-links.js')
    expect(appOrigin({ APP_ORIGIN: 'http://localhost:3000/' })).toBe('http://localhost:3000')
  })

  it('donne la priorité à APP_ORIGIN sur le domaine Vercel', async () => {
    const { appOrigin } = await import('../send-wellness-links.js')
    expect(appOrigin({ APP_ORIGIN: 'https://vrai.fr', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }))
      .toBe('https://vrai.fr')
  })

  it('renvoie une origine vide si rien n\'est configuré, pour déclencher le refus', async () => {
    const { appOrigin } = await import('../send-wellness-links.js')
    expect(appOrigin({})).toBe('')
    expect(appOrigin({ APP_ORIGIN: '   ' })).toBe('')
  })
})
