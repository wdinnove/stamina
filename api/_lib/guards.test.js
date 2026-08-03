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

  it('le lien envoyé aux joueuses ne vient pas des en-têtes de la requête', () => {
    // Un Host falsifié enverrait un lien vers un domaine ressemblant.
    const src = readFileSync(join(API, 'send-wellness-links.js'), 'utf8')
    expect(src).not.toMatch(/x-forwarded-host|headers\.host/)
    expect(src).toMatch(/APP_ORIGIN/)
  })
})

// Le comportement de /api/notify est couvert par api/notify.test.js, qui appelle
// réellement le handler : un test de source passerait encore si l'appel de garde
// était mis en commentaire.
