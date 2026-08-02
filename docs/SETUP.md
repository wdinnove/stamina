# Monter une app comme Stamina — guide complet pour débutant

Ce guide part de **zéro** (un Mac neuf, aucune connaissance) et va jusqu'à une
application en ligne, avec base de données, comptes utilisateurs, emails,
notifications push et déploiement automatique.

Tu n'as pas besoin de savoir coder. Tu as besoin de savoir **installer les bons
outils, créer les bons comptes, et parler à Claude**. Le code, c'est lui qui l'écrit.

**Temps réaliste** : 2 à 3 heures pour la première fois.

Pour comprendre *quoi* on installe et *pourquoi*, lis [STACK.md](STACK.md) en
parallèle. Ce fichier-ci est la procédure.

---

## Table des matières

- [Étape 0 — Créer les comptes](#étape-0--créer-les-comptes)
- [Étape 1 — Préparer le Mac](#étape-1--préparer-le-mac)
- [Étape 2 — VS Code + Claude Code](#étape-2--vs-code--claude-code)
- [Étape 3 — Créer le projet](#étape-3--créer-le-projet)
- [Étape 4 — Le fichier CLAUDE.md](#étape-4--le-fichier-claudemd-le-plus-important)
- [Étape 5 — Supabase (la base de données)](#étape-5--supabase-la-base-de-données)
- [Étape 6 — Brancher le front sur Supabase](#étape-6--brancher-le-front-sur-supabase)
- [Étape 7 — GitHub](#étape-7--github)
- [Étape 8 — Vercel (mise en ligne)](#étape-8--vercel-mise-en-ligne)
- [Étape 9 — Les fonctions serverless](#étape-9--les-fonctions-serverless-apiemails-push-cron)
- [Étape 10 — PWA et notifications push](#étape-10--pwa-et-notifications-push)
- [Étape 11 — Tests et garde-fous](#étape-11--tests-et-garde-fous)
- [Étape 12 — La routine de travail](#étape-12--la-routine-de-travail-au-quotidien)
- [Les 12 pièges classiques](#les-12-pièges-classiques)
- [Checklist finale](#checklist-finale)

---

## Étape 0 — Créer les comptes

Fais-le **avant** de toucher au code, avec le même email partout.

| Service | URL | Obligatoire ? | Ce que tu récupères |
|---|---|---|---|
| GitHub | github.com | ✅ oui | héberge le code |
| Supabase | supabase.com | ✅ oui | base de données + comptes utilisateurs |
| Vercel | vercel.com | ✅ oui | met le site en ligne — **connecte-toi avec GitHub** |
| Claude | claude.ai | ✅ oui | l'abonnement qui fait marcher Claude Code |
| MailerSend | mailersend.com | seulement si emails | clé d'API d'envoi |
| Google Cloud Console | console.cloud.google.com | seulement si « Connexion avec Google » | Client ID OAuth |

> **Conseil** : sur Vercel et Supabase, choisis « Continuer avec GitHub ». Ça évite
> trois mots de passe et branche les outils entre eux automatiquement.

---

## Étape 1 — Préparer le Mac

Ouvre l'application **Terminal** (Cmd+Espace → « Terminal »). Tu vas coller des
commandes. Une ligne à la fois, puis Entrée.

### 1.1 Les outils de développement Apple

```bash
xcode-select --install
```

Une fenêtre s'ouvre → Installer. (Si ça dit « already installed », parfait.)

### 1.2 Homebrew (le gestionnaire d'installations du Mac)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

À la fin, il affiche 2 ou 3 commandes à copier-coller (« Next steps »). **Fais-le**,
sinon `brew` sera introuvable.

### 1.3 Node.js

Node fait tourner tous les outils JavaScript. On l'installe via `nvm`, qui permet
d'avoir plusieurs versions — utile plus tard.

```bash
brew install nvm
mkdir -p ~/.nvm
```

Ajoute nvm à ton shell :

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
```

Puis installe Node :

```bash
nvm install 22
nvm alias default 22
```

Vérifie :

```bash
node -v   # doit afficher v22.x (ou plus)
npm -v    # doit afficher un numéro
```

> Version minimale réelle : Node 20. Stamina tourne sur Node 24. Vercel utilise
> Node 22 par défaut — c'est le choix le plus sûr.

### 1.4 Git

```bash
brew install git
git config --global user.name "Ton Prénom Nom"
git config --global user.email "ton@email.com"
git config --global init.defaultBranch main
```

L'email doit être **celui de ton compte GitHub**.

---

## Étape 2 — VS Code + Claude Code

### 2.1 Installer VS Code

```bash
brew install --cask visual-studio-code
```

Puis rends la commande `code` disponible dans le terminal : ouvre VS Code,
`Cmd+Shift+P`, tape `shell command`, choisis **« Shell Command: Install 'code'
command in PATH »**.

### 2.2 Installer l'extension Claude Code

Deux façons, la seconde est plus simple :

**Depuis VS Code** : icône Extensions dans la barre de gauche (ou `Cmd+Shift+X`),
cherche **« Claude Code »**, éditeur **Anthropic**, → Install.

**Depuis le terminal** :

```bash
code --install-extension anthropic.claude-code
```

### 2.3 Se connecter

Ouvre le panneau Claude Code (icône Claude dans la barre latérale, ou
`Cmd+Shift+P` → « Claude Code: Focus on Claude Code View »). Il te demande de te
connecter → ça ouvre le navigateur → tu autorises avec ton compte Claude. C'est fait
une fois pour toutes.

### 2.4 Le CLI en bonus (recommandé)

Le même Claude, en ligne de commande — pratique quand tu veux lancer une tâche
longue sans garder VS Code ouvert :

```bash
npm install -g @anthropic-ai/claude-code
claude          # dans un dossier de projet
```

### 2.5 Les extensions VS Code utiles à côté

```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss
```

- **Tailwind CSS IntelliSense** : autocomplète les classes de style. Indispensable.
- **ESLint / Prettier** : signalent et corrigent le formatage.

---

## Étape 3 — Créer le projet

### 3.1 Le squelette

```bash
mkdir -p ~/Documents/lab
cd ~/Documents/lab
npm create vite@latest mon-app -- --template react-ts
cd mon-app
npm install
npm run dev
```

Ouvre http://localhost:5173 : tu as une page React. Arrête le serveur avec
`Ctrl+C` dans le terminal.

Ouvre le dossier dans l'éditeur :

```bash
code .
```

### 3.2 Les dépendances de base

```bash
# Style
npm install -D tailwindcss @tailwindcss/vite
npm install clsx tailwind-merge class-variance-authority tw-animate-css

# Navigation, données, icônes, graphiques, dates, formulaires, toasts
npm install react-router @supabase/supabase-js lucide-react recharts date-fns react-hook-form sonner

# Outils de dev
npm install -D vitest vercel
```

### 3.3 Configurer Vite

Remplace le contenu de `vite.config.ts` par :

```ts
import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

L'alias `@` permet d'écrire `import { supabase } from '@/api/client'` au lieu de
`../../../api/client`. Déclare-le aussi pour TypeScript, dans `tsconfig.app.json` :

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

> Si tu ajoutes des tests plus tard, **répète l'alias dans `vitest.config.ts`** :
> Vitest ne lit pas `vite.config.ts` automatiquement dans ce montage.

### 3.4 Activer Tailwind

Dans `src/index.css`, mets en toute première ligne :

```css
@import 'tailwindcss';
@import 'tw-animate-css';
```

### 3.5 Les scripts

Dans `package.json`, section `"scripts"` :

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### 3.6 Les composants d'interface (shadcn/ui)

C'est ce qui donne les boutons, dialogues, menus déroulants propres et accessibles.
Ce ne sont **pas** des dépendances : les fichiers sont copiés dans ton projet, donc
Claude peut les modifier librement.

```bash
npx shadcn@latest init
npx shadcn@latest add button card dialog input select tabs table badge tooltip
```

Si l'assistant pose des questions, les réponses par défaut conviennent.

### 3.7 La structure de dossiers

Crée cette arborescence — **c'est elle qui rend le projet compréhensible pour Claude** :

```bash
mkdir -p src/{api,pages,components,contexts,hooks,utils,styles} api/_lib shared docs
```

| Dossier | Contenu |
|---|---|
| `src/api/` | **tous** les accès à la base, un fichier par domaine métier |
| `src/pages/` | un fichier par écran |
| `src/components/` | composants réutilisés par plusieurs pages |
| `src/contexts/` | état global (utilisateur courant, filtres globaux…) |
| `src/hooks/`, `src/utils/` | logique transverse, calculs |
| `api/` | fonctions serverless (secrets, emails, cron) |
| `shared/` | code utilisé par le front **et** le serverless |
| `docs/` | tes règles métier, tes formules |

---

## Étape 4 — Le fichier CLAUDE.md (le plus important)

`CLAUDE.md`, à la racine, est lu automatiquement par Claude à chaque conversation.
C'est là que tu écris les règles que tu ne veux pas répéter dix fois par jour.

**Une heure passée sur ce fichier t'en fait gagner vingt.**

Crée-le avec ce contenu, puis adapte :

```markdown
# Mon App

Application de <décris en une phrase>.

## Stack
React 18 + TypeScript + Vite 6, Tailwind 4, shadcn/ui, react-router 7.
Données : Supabase (Postgres + RLS + Auth + Storage).
Hébergement : Vercel. Fonctions serverless dans `api/` (Node, JS, pas de TS).

## Commandes
- `npm run dev` — dev (⚠️ ne fait PAS tourner les fonctions api/)
- `npx vercel dev` — dev avec les fonctions api/
- `npm run typecheck` — à lancer avant chaque commit
- `npm run test` — tests

## Règles de code
- Aucun appel Supabase dans un composant. Tout passe par `src/api/<domaine>.ts`.
- Imports internes avec l'alias `@/`, jamais de `../../../`.
- Toute nouvelle table : RLS activée + policies, dans `schema.sql`.
- Jamais de secret dans une variable `VITE_*` (elles finissent dans le navigateur).
- Les commentaires expliquent le *pourquoi*, jamais le *quoi*.
- Réponds-moi en français.

## Ce que tu ne fais pas sans me demander
- Installer une nouvelle dépendance.
- Modifier `schema.sql` (donne-moi le SQL, je l'exécute moi-même).
- Commiter ou pusher.
- Supprimer un fichier.
```

Ce dernier bloc est ton frein à main. Garde-le.

> Autre option : dans une conversation Claude Code, tape `/init` — il analyse le
> projet et rédige un premier `CLAUDE.md` que tu n'as plus qu'à corriger.

---

## Étape 5 — Supabase (la base de données)

### 5.1 Créer le projet

1. supabase.com → **New project**
2. Nom, **mot de passe de base de données** (garde-le dans un gestionnaire de mots
   de passe, il ne s'affiche qu'une fois), région **Europe (Frankfurt ou Paris)**
   si tes utilisateurs sont en France — c'est aussi la bonne réponse RGPD.
3. Attends ~2 minutes.

### 5.2 Récupérer les clés

**Project Settings → API** :

| Champ affiché | Va dans |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| `anon` `public` | `VITE_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` — **serverless uniquement** |

### 5.3 Écrire le schéma

C'est **la** étape à faire sérieusement : la forme de la base détermine la qualité de
tout le reste.

Décris ton métier à Claude en langage naturel :

> « Je veux une base pour <ton domaine>. Il y a des <A>, chaque <A> a plusieurs <B>.
> Un utilisateur appartient à une organisation et ne doit voir que les données de son
> organisation. Écris-moi `schema.sql` avec les tables, les index, la RLS activée sur
> toutes les tables, les policies correspondantes, et des fonctions SECURITY DEFINER
> pour éviter la récursion dans les policies. Commente chaque section. »

Le fichier [`schema.sql`](../schema.sql) de Stamina est un bon modèle : sommaire en
tête, sections numérotées, enums, triggers `updated_at`, une section RLS complète,
une section Storage, une section fonctions, et une section MIGRATION en bas pour les
bases déjà en production.

**Important** : `schema.sql` est un fichier de ton dépôt, versionné par Git. C'est ta
mémoire. Sans lui, personne (toi comme Claude) ne sait à quoi ressemble la base.

### 5.4 Exécuter le schéma

Dans Supabase → **SQL Editor** → New query → colle le contenu de `schema.sql` → **Run**.

S'il y a une erreur, copie-la à Claude, il corrige.

### 5.5 Comprendre la RLS (Row Level Security)

C'est le point que tout débutant sur Supabase rate. Lis ces cinq lignes deux fois.

Le navigateur parle **directement** à la base. La clé `anon` est publique — elle est
dans le JavaScript que n'importe qui peut lire. Donc :

> **Sans RLS, ta base est entièrement lisible et modifiable par n'importe qui.**

La RLS répond, ligne par ligne, à la question « cet utilisateur a-t-il le droit de
voir *cette* ligne ? ». Le motif utilisé dans Stamina :

```sql
-- 1. On bloque tout
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 2. Fonction utilitaire : l'organisation de l'utilisateur connecté.
--    SECURITY DEFINER évite que la policy sur `profiles` se rappelle elle-même.
CREATE OR REPLACE FUNCTION my_organization_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$;

-- 3. On rouvre précisément ce qui doit l'être
CREATE POLICY "players_org" ON players
  FOR ALL TO authenticated
  USING (organization_id = my_organization_id())
  WITH CHECK (organization_id = my_organization_id());
```

**Vérifie-le pour de vrai** : Supabase → Table Editor. Si une table affiche
« RLS not enabled » ou « Unrestricted », arrête tout et corrige.

### 5.6 Auth

**Authentication → Providers** :

- **Email** : activé par défaut. En dev, désactive « Confirm email » pour ne pas
  attendre un mail à chaque test — **réactive-le avant la mise en ligne**.
- **Google** : nécessite un Client ID + Secret depuis Google Cloud Console
  (APIs & Services → Credentials → OAuth client ID → Web application). Ajoute
  l'URL de callback que Supabase t'affiche dans les « Authorized redirect URIs »
  côté Google.

**Authentication → URL Configuration** : ajoute tes URLs de redirection, sinon les
connexions échoueront silencieusement en production.

```
http://localhost:5173/**
https://mon-app.vercel.app/**
```

Le motif de connexion utilisé dans Stamina (`src/api/auth.ts`) :

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/dashboard` },
})
```

`window.location.origin` fait que le même code marche en local et en prod.

### 5.7 Storage (si tu stockes des fichiers)

**Storage → New bucket**. Un bucket public sert aux images affichées partout
(photos, illustrations) ; un bucket privé aux documents sensibles.

Les buckets et leurs policies se déclarent aussi dans `schema.sql`, comme dans
Stamina, pour être reproductibles :

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('mes-images', 'mes-images', true)
ON CONFLICT (id) DO NOTHING;
```

### 5.8 Les secrets en local

Crée un fichier `.env` à la racine (copie [`.env.example`](../.env.example)) :

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Et **vérifie immédiatement** que `.env` est ignoré par Git :

```bash
printf 'node_modules\ndist\n.env*\n.vercel\n*.tsbuildinfo\n' >> .gitignore
git check-ignore -v .env   # doit répondre .gitignore:...:.env
```

Si cette commande ne répond rien, `.env` **n'est pas** protégé. Corrige avant tout
`git add`.

---

## Étape 6 — Brancher le front sur Supabase

Un seul client Supabase pour toute l'app — `src/api/client.ts` :

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseKey)

/** En-têtes pour appeler les fonctions /api, qui vérifient le JWT Supabase. */
export async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
```

Puis **un fichier par domaine métier**, jamais d'appel Supabase dans un composant.
Exemple `src/api/players.ts` :

```ts
import { supabase } from './client'

export const playersApi = {
  async list(teamId: string) {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .order('last_name')
    if (error) throw error
    return data
  },

  async create(player: NewPlayer) {
    const { data, error } = await supabase
      .from('players')
      .insert(player)
      .select()
      .single()
    if (error) throw error
    return data
  },
}
```

Toujours le même squelette : appel → `if (error) throw error` → retour des données.
Cette régularité est ce qui permet à Claude d'ajouter un 30ᵉ fichier cohérent avec
les 29 premiers.

---

## Étape 7 — GitHub

```bash
cd ~/Documents/lab/mon-app
git init
git add .
git commit -m "Initial commit"
```

Crée le dépôt distant. Le plus simple, avec le CLI GitHub :

```bash
brew install gh
gh auth login          # choisis GitHub.com → HTTPS → login via navigateur
gh repo create mon-app --private --source=. --push
```

Sans `gh` : crée le dépôt sur github.com (vide, sans README), puis :

```bash
git remote add origin https://github.com/TON-PSEUDO/mon-app.git
git branch -M main
git push -u origin main
```

**Avant ce premier push**, une dernière vérification :

```bash
git ls-files | grep -E '^\.env' && echo "⚠️ STOP : un .env est suivi par Git" || echo "OK"
```

---

## Étape 8 — Vercel (mise en ligne)

### 8.1 Importer le projet

vercel.com → **Add New… → Project** → choisis ton dépôt GitHub → Vercel détecte Vite
tout seul (Framework: Vite, build `npm run build`, output `dist`).

### 8.2 Les variables d'environnement

**Avant** de déployer : **Settings → Environment Variables**. Ajoute une par une, en
cochant les trois environnements (Production, Preview, Development) :

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

> Chaque fois que tu ajoutes une variable, **il faut redéployer** pour qu'elle soit
> prise en compte. Deployments → dernier déploiement → ⋯ → Redeploy.

### 8.3 vercel.json — le fichier qui évite les 404

Sans lui, aller directement sur `mon-app.vercel.app/players` renvoie une **404** :
Vercel cherche un fichier `players` qui n'existe pas. Dans une application React à
page unique, **toutes** les URLs doivent servir `index.html` et laisser
react-router décider.

Crée `vercel.json` à la racine :

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/index.html",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

Les deux règles de cache comptent : les fichiers de `assets/` ont un nom unique par
build (on peut les garder un an), `index.html` ne doit **jamais** être mis en cache,
sinon tes utilisateurs restent bloqués sur l'ancienne version.

### 8.4 Déployer

```bash
git add . && git commit -m "config vercel" && git push
```

Chaque `git push` sur `main` déclenche un déploiement en production. Chaque push sur
une autre branche crée une **URL de preview** — une version complète de l'app, à part,
pour tester avant de mettre en prod.

### 8.5 Retourner dire les URLs à Supabase

Retourne dans Supabase → **Authentication → URL Configuration** et ajoute ton URL
Vercel (`https://mon-app.vercel.app/**`). Oublier ça = « la connexion marche en local
mais pas en ligne », le classique.

---

## Étape 9 — Les fonctions serverless (`api/`) : emails, push, cron

### Pourquoi elles existent

Un navigateur ne peut pas garder un secret. Donc tout ce qui a besoin d'une clé
privée (envoyer un email depuis *ton* compte, envoyer un push, contourner la RLS pour
une tâche d'administration) doit tourner ailleurs. Vercel exécute pour ça n'importe
quel fichier placé dans `api/`.

Règles : un fichier = une URL (`api/send-email.js` → `/api/send-email`), du **JS
Node** (pas de TypeScript ici, pas de build), export d'un `handler(req, res)`.

### 9.1 Le client administrateur + la vérification d'identité

`api/_lib/supabaseAdmin.js` — le fichier le plus sensible du projet :

```js
import { createClient } from '@supabase/supabase-js'

let client

/** Client avec la service role key — serverless uniquement, jamais exposé au front. */
export function getSupabaseAdmin() {
  if (!client) {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes')
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return client
}

/** Vérifie le JWT envoyé par le client et renvoie l'utilisateur, ou null. */
export async function getAuthedUser(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const { data, error } = await getSupabaseAdmin().auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}
```

### 9.2 Le motif obligatoire de toute fonction

```js
import { getAuthedUser } from './_lib/supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Sans cette vérification, l'endpoint est un relais ouvert sur ton compte.
  const caller = await getAuthedUser(req)
  if (!caller) return res.status(401).json({ error: 'Non authentifié' })

  // … le travail
  return res.status(200).json({ success: true })
}
```

**Ne saute jamais le contrôle d'identité.** Une URL `/api/*` est publique sur
Internet dès la première seconde. Et ne fais jamais confiance à un `userId` envoyé
dans le corps de la requête : utilise `caller.id`.

Côté front, on appelle avec les en-têtes de `client.ts` :

```ts
import { authHeaders } from './client'

await fetch('/api/send-email', {
  method: 'POST',
  headers: await authHeaders(),
  body: JSON.stringify({ to, subject, html }),
})
```

### 9.3 Les emails (MailerSend)

MailerSend → vérifie un domaine (ou utilise le domaine de test) → crée une clé d'API.
Ajoute dans `.env` **et** dans Vercel :

```bash
MAILERSEND_API_KEY=...
MAILERSEND_FROM_EMAIL=noreply@ton-domaine.fr
MAILERSEND_FROM_NAME=Mon App
```

### 9.4 Les tâches planifiées (Vercel Cron)

Dans `vercel.json` :

```json
{
  "crons": [
    { "path": "/api/cron/notifications", "schedule": "0 18 * * *" }
  ]
}
```

`0 18 * * *` = tous les jours à 18h00 **UTC** (donc 19h ou 20h en France selon la
saison — les crons Vercel n'ont pas de fuseau horaire).

Un cron est une URL publique : **protège-la**, et refuse par défaut.

```js
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  // Défaut fermé : sans secret configuré, n'importe qui pourrait déclencher
  // une vague de notifications réelles.
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET non configuré' })
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Non autorisé' })
  }
  // …
}
```

Génère le secret et mets-le dans Vercel (Vercel l'envoie automatiquement dans
l'en-tête `Authorization` des crons) :

```bash
openssl rand -hex 32
```

> Le plan Vercel Hobby est limité à **un cron par jour**. Si tu as plusieurs
> rappels, regroupe-les dans une seule fonction — c'est exactement ce que fait
> `api/cron/notifications.js` dans Stamina.

### 9.5 Tester les fonctions en local

```bash
npx vercel login
npx vercel link      # relie le dossier au projet Vercel
npx vercel dev       # dev AVEC les fonctions /api
```

**`npm run dev` ne fait pas tourner `api/`.** Les appels `fetch('/api/...')`
échoueront en 404. C'est normal. Utilise `npx vercel dev` pour ces tests.

---

## Étape 10 — PWA et notifications push

Optionnel, mais c'est ce qui fait qu'une app web s'installe sur un téléphone et
ressemble à une vraie application.

### 10.1 Rendre l'app installable

```bash
npm install -D vite-plugin-pwa
```

Ajoute le plugin dans `vite.config.ts` (`VitePWA({ registerType: 'autoUpdate', manifest: { … } })`).
Deux réglages non évidents, tirés de l'expérience de Stamina :

```ts
workbox: {
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  // Ne JAMAIS faire passer les appels API par le fallback de la page unique,
  // sinon /api/* renvoie du HTML au lieu du JSON.
  navigateFallbackDenylist: [/^\/api\//],
}
```

Et il faut mettre `Cache-Control: max-age=0, must-revalidate` sur `sw.js` et
`manifest.webmanifest` dans `vercel.json` — sinon les utilisateurs restent sur une
version périmée pendant des jours.

Il te faudra aussi les icônes dans `public/` : `pwa-192x192.png`, `pwa-512x512.png`,
et leurs versions `maskable-*` (l'icône avec une marge, pour Android).

### 10.2 Les notifications push

Génère une paire de clés VAPID (l'identité de ton serveur d'envoi) :

```bash
npm install web-push
npx web-push generate-vapid-keys
```

Dans `.env` et dans Vercel :

```bash
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...          # secret
VAPID_SUBJECT=mailto:toi@ton-domaine.fr
VITE_VAPID_PUBLIC_KEY=...      # la même publique, côté navigateur
```

La clé publique existe donc deux fois : une fois pour le serverless, une fois avec le
préfixe `VITE_` pour le navigateur. La privée, **jamais** en `VITE_`.

Sur iOS, une contrainte à connaître : les notifications push ne fonctionnent que si
l'utilisateur a **ajouté l'app à son écran d'accueil**. Pas dans Safari.

---

## Étape 11 — Tests et garde-fous

Tu n'écriras pas des tests partout. Écris-en sur **les calculs métier** — là où une
erreur silencieuse fait le plus de dégâts (moyennes, agrégats, scores, règles
d'attribution).

`vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'api/**/*.test.js'],
  },
})
```

Les deux commandes à lancer avant chaque commit :

```bash
npm run typecheck
npm run test
```

Et une bonne habitude : documente tes formules métier dans `docs/CALCULS.md`
(Stamina le fait). Quand Claude touche à un calcul six mois plus tard, ce fichier est
ce qui l'empêche d'inventer.

---

## Étape 12 — La routine de travail au quotidien

### Le cycle

```bash
git checkout -b feat/ma-fonctionnalite   # 1. une branche par sujet
# 2. tu décris à Claude ce que tu veux ; il code
npm run dev                              # 3. tu regardes dans le navigateur
npm run typecheck && npm run test        # 4. les garde-fous
git add . && git commit -m "feat: ..."   # 5. tu commites
git push -u origin feat/ma-fonctionnalite # 6. URL de preview Vercel automatique
# 7. si la preview est bonne : merge dans main → prod
```

### Comment parler à Claude — ce qui change tout

| Peu efficace | Efficace |
|---|---|
| « ajoute une page joueurs » | « ajoute une page `src/pages/PlayersPage.tsx` qui liste les joueurs de l'équipe courante, en suivant exactement le motif de `MedicalPage.tsx`. L'accès données va dans `src/api/players.ts`. » |
| « ça marche pas » | « quand je clique sur Enregistrer, la console affiche `<le message exact>` » |
| « corrige la base » | « voici l'erreur du SQL Editor : `<colle-la>` » |

Trois réflexes :

1. **Donne les erreurs en entier**, copiées-collées. Jamais résumées.
2. **Cite un fichier existant comme modèle** (« comme dans `X.tsx` »). C'est le
   levier le plus puissant sur la cohérence du code.
3. **Une tâche à la fois.** « Refais tout le design » donne un résultat médiocre ;
   « aligne l'espacement des cartes du dashboard sur celui de la page stats » donne
   un bon résultat.

### Les commandes utiles dans Claude Code

| Commande | Effet |
|---|---|
| `/init` | génère un premier `CLAUDE.md` |
| `/clear` | vide la conversation (à faire en changeant de sujet — ça évite les confusions) |
| `/context` | montre ce que Claude a en mémoire |
| `/help` | la liste complète |
| `Échap` | interrompt Claude en cours de route |

Deux réglages de confort :

- **Les permissions.** Par défaut Claude demande avant chaque commande. Tu peux
  pré-autoriser les inoffensives dans `.claude/settings.json` :

  ```json
  {
    "permissions": {
      "allow": ["Bash(npm run *)", "Bash(git status)", "Bash(git diff *)"]
    }
  }
  ```

  ⚠️ **Ne mets jamais de clé d'API dans ce fichier** — il est commité dans Git. (Le
  `.claude/settings.json` de Stamina contient des commandes `curl` avec des clés
  `anon` collées dedans : c'est de l'accumulation historique, la clé `anon` est
  publique donc ce n'est pas une fuite, mais ce n'est pas un modèle à copier.)

- **`.claude/settings.local.json`** : tes réglages personnels, non commités.

---

## Les 12 pièges classiques

| # | Symptôme | Cause | Solution |
|---|---|---|---|
| 1 | N'importe qui lit toute la base | RLS pas activée | `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + policies. Vérifie chaque table dans le Table Editor |
| 2 | Une clé secrète est visible dans le navigateur | préfixe `VITE_` sur un secret | Tout `VITE_*` est public. Renomme, et **révoque** la clé exposée |
| 3 | `.env` poussé sur GitHub | `.gitignore` incomplet | `git rm --cached .env`, corrige `.gitignore`, **et régénère toutes les clés** — l'historique Git garde tout |
| 4 | 404 sur `/ma-page` en prod, OK en local | pas de rewrite SPA | le bloc `rewrites` de `vercel.json` |
| 5 | `fetch('/api/…')` en 404 en local | `npm run dev` n'exécute pas `api/` | `npx vercel dev` |
| 6 | Connexion Google OK en local, KO en prod | URL de redirection absente | Supabase → Authentication → URL Configuration |
| 7 | Variable d'env ignorée en prod | ajoutée après le déploiement | Redeploy |
| 8 | Les utilisateurs voient une vieille version | `index.html` ou `sw.js` en cache | les en-têtes `Cache-Control` de `vercel.json` |
| 9 | `/api/*` renvoie du HTML dans l'app installée | le service worker intercepte | `navigateFallbackDenylist: [/^\/api\//]` |
| 10 | Policy RLS en récursion infinie | une policy interroge une table qui a une policy sur la même table | fonctions `SECURITY DEFINER` (`my_organization_id()`…) |
| 11 | Cron déclenché par un inconnu | endpoint non protégé | `CRON_SECRET`, avec refus si le secret n'est pas configuré |
| 12 | Projet Supabase « paused » | plan gratuit, 1 semaine sans activité | le relancer depuis le dashboard |

**Le pire de la liste, c'est le n°2 et le n°3.** Si une clé `service_role` fuite,
quelqu'un a un accès total à ta base, RLS comprise. Révoque immédiatement dans
Supabase → Settings → API.

---

## Checklist finale

Avant de dire « c'est en ligne » :

**Sécurité**
- [ ] RLS activée sur **toutes** les tables, aucune marquée « Unrestricted »
- [ ] Aucun secret en `VITE_*` — `grep -r "VITE_" .env` ne contient que URL + anon + clés publiques
- [ ] `git check-ignore -v .env` répond bien
- [ ] Chaque fonction `api/` appelle `getAuthedUser(req)`
- [ ] Cron protégé par `CRON_SECRET`, avec refus par défaut
- [ ] « Confirm email » réactivé dans Supabase Auth

**Fonctionnement**
- [ ] `npm run build` passe
- [ ] `npm run typecheck` passe
- [ ] `npm run test` passe
- [ ] Rechargement direct sur une URL profonde (`/players`) → pas de 404
- [ ] Connexion email **et** Google fonctionnelles sur l'URL de prod
- [ ] Envoi d'email testé via `npx vercel dev`

**Maintenabilité**
- [ ] `schema.sql` à jour et commité — il reflète la vraie base
- [ ] `CLAUDE.md` écrit et à jour
- [ ] `.env.example` commité (les noms des variables, pas les valeurs)
- [ ] Les formules métier documentées dans `docs/`

---

## Pour aller plus loin

- Supabase : [supabase.com/docs](https://supabase.com/docs) — la section
  [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) mérite une lecture complète
- Vercel : [vercel.com/docs/functions](https://vercel.com/docs/functions) et
  [vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs)
- Vite : [vite.dev/guide](https://vite.dev/guide/)
- shadcn/ui : [ui.shadcn.com](https://ui.shadcn.com)
- Claude Code : [docs.claude.com/en/docs/claude-code](https://docs.claude.com/en/docs/claude-code)
