# La stack Stamina — fiche de référence

Ce document décrit **ce qui est utilisé et pourquoi**. Pour la procédure d'installation
pas à pas, voir [SETUP.md](SETUP.md).

---

## 1. Vue d'ensemble

```
   ┌──────────────────────────────────────────────────────────────┐
   │  TON MAC                                                     │
   │                                                              │
   │   VS Code  +  extension Claude Code                          │
   │      │                                                       │
   │      │  npm run dev  →  Vite (http://localhost:5173)          │
   └──────┼───────────────────────────────────────────────────────┘
          │ git push
          ▼
   ┌──────────────┐        déploiement auto        ┌──────────────┐
   │   GitHub     │ ────────────────────────────▶  │   Vercel     │
   │ (le code)    │                                │ (l'hébergeur)│
   └──────────────┘                                └──────┬───────┘
                                                          │
                          ┌───────────────────────────────┼──────────────┐
                          │                               │              │
                    front statique               fonctions /api      Vercel Cron
                    (React buildé)               (Node serverless)   (tâches planifiées)
                          │                               │
                          └───────────────┬───────────────┘
                                          ▼
                              ┌───────────────────────┐
                              │      SUPABASE         │
                              │  Postgres + RLS       │
                              │  Auth (email, Google) │
                              │  Storage (fichiers)   │
                              └───────────────────────┘
                                          ▲
                                          │
                              MailerSend (emails sortants)
                              Web Push / VAPID (notifs mobiles)
```

Le principe à retenir : **il n'y a pas de serveur backend à gérer.**
Le front parle directement à Postgres via Supabase (la sécurité est faite en base
avec la RLS), et les rares choses qu'un navigateur ne doit pas faire (envoyer un
email, envoyer une notification push, tourner tous les jours à 18h) passent par de
petites fonctions serverless dans `api/`.

---

## 2. Les outils (couche par couche)

### Poste de travail

| Outil | Rôle | Version ici |
|---|---|---|
| **VS Code** | l'éditeur | dernière |
| **Extension Claude Code** (`anthropic.claude-code`) | Claude directement dans l'éditeur : il lit et modifie les fichiers du projet | 2.1.x |
| **Node.js** | fait tourner les outils JS | v24 (v20+ suffit) |
| **npm** | installe les dépendances | v11 |
| **Git** | historique du code | — |

> Le projet contient un `pnpm-workspace.yaml` mais c'est **npm** qui est réellement
> utilisé (il y a un `package-lock.json`). Ne pas mélanger les deux.

### Front-end

| Paquet | Rôle |
|---|---|
| **Vite 6** | serveur de dev instantané + build de production |
| **React 18** + TypeScript | l'interface |
| **react-router 7** | les URLs / pages |
| **Tailwind CSS 4** (via `@tailwindcss/vite`) | le style |
| **shadcn/ui** = Radix UI + `class-variance-authority` + `clsx` + `tailwind-merge` | composants accessibles (dialog, select, tabs…) copiés dans le projet, pas une lib externe |
| **lucide-react** | icônes |
| **recharts** | graphiques |
| **sonner** | toasts / notifications dans l'app |
| **date-fns** | dates |
| **react-hook-form** | formulaires |
| **vite-plugin-pwa** | app installable sur mobile + service worker |
| **dompurify** | nettoie le HTML avant affichage (contenu de l'éditeur Tiptap) |

### Données / backend

| Brique | Rôle |
|---|---|
| **Supabase Postgres** | toute la donnée. Le schéma complet est versionné dans [`schema.sql`](../schema.sql) |
| **Row Level Security (RLS)** | la sécurité. ~148 policies : un utilisateur ne voit que les données de son club / ses équipes |
| **Supabase Auth** | connexion email+mot de passe et Google OAuth |
| **Supabase Storage** | 2 buckets : `player-photos`, `session-documents` |
| **Fonctions serverless Vercel** (`api/*.js`) | ce qui exige un secret : emails, push, cron |
| **MailerSend** | envoi des emails |
| **Web Push (VAPID)** | notifications push sur mobile |

### Hébergement

| Brique | Rôle |
|---|---|
| **Vercel** | build + hébergement du front, exécution des fonctions `api/`, crons |
| **GitHub** | source de vérité ; chaque push sur `main` déclenche un déploiement |

---

## 3. Carte du dépôt

```
stamina/
├── index.html                → point d'entrée HTML
├── vite.config.ts            → plugins (React, Tailwind, PWA), alias @ → src/
├── vercel.json               → réécritures SPA, cache, cron quotidien
├── vitest.config.ts          → config des tests
├── tsconfig*.json            → TypeScript (mode souple : strict = false)
├── schema.sql                → LE schéma Postgres complet (tables, RLS, fonctions, buckets)
├── .env                      → secrets locaux (jamais commité)
│
├── src/
│   ├── main.tsx              → montage React + enregistrement du service worker
│   ├── App.tsx / router.tsx  → arbre de l'app et routes
│   ├── api/                  → UNE couche d'accès données par domaine
│   │   ├── client.ts         → création du client Supabase + authHeaders()
│   │   ├── auth.ts           → connexion / Google / reset mot de passe
│   │   └── players.ts, rpe.ts, medical.ts, stats.ts, …
│   ├── pages/                → 27 pages (une par écran)
│   ├── components/           → composants réutilisables
│   ├── contexts/             → état global (équipe/saison courante, notifications)
│   ├── hooks/ utils/         → logique transverse et calculs
│   └── styles/               → globals.css, theme.css, fonts.css
│
├── api/                      → fonctions serverless (Node, ESM, pas de TypeScript)
│   ├── _lib/
│   │   ├── supabaseAdmin.js  → client service-role + getAuthedUser(req)
│   │   ├── mailer.js         → MailerSend
│   │   ├── push.js           → Web Push
│   │   └── notify.js         → règles de destinataires
│   ├── send-wellness-links.js → lien du formulaire bien-être (template fixe)
│   ├── send-mbti-links.js     → lien du questionnaire de personnalité (template fixe)
│   ├── push/{subscribe,unsubscribe,send}.js
│   └── cron/notifications.js → appelé par Vercel Cron à 18h UTC
│
├── shared/                   → code partagé front ⇄ serverless (en .js)
└── docs/                     → CALCULS.md (formules métier), STACK.md, SETUP.md
```

**Règle structurante** : `src/` ne parle jamais à la base « en direct » depuis un
composant. Tout passe par `src/api/<domaine>.ts`. C'est ce qui rend le projet
lisible pour Claude comme pour un humain.

---

## 4. Les trois clés Supabase — à ne pas confondre

| Clé | Où | Peut-elle fuiter ? |
|---|---|---|
| `VITE_SUPABASE_URL` | front + serverless | Oui, publique |
| `VITE_SUPABASE_ANON_KEY` | front | **Oui, publique par conception** — elle est dans le JS téléchargé par le navigateur. C'est la RLS qui protège les données, pas cette clé |
| `SUPABASE_SERVICE_ROLE_KEY` | **serverless uniquement** | **NON. Jamais.** Elle ignore toute la RLS. Aucun préfixe `VITE_`, sinon Vite l'embarque dans le bundle public |

Tout ce qui commence par `VITE_` finit dans le navigateur. C'est la règle mémo.

---

## 5. Sécurité — les invariants du projet

1. **RLS activée sur toutes les tables.** Une table sans policy = table inaccessible
   (ou pire, exposée si la RLS est oubliée).
2. **Les fonctions `SECURITY DEFINER`** (`my_organization_id()`, `my_team_ids()`…)
   servent à éviter les récursions infinies dans les policies. Elles ont toutes
   `SET search_path = public`.
3. **Chaque fonction `api/` vérifie l'appelant** via `getAuthedUser(req)`. Sans ça,
   `/api/send-email` serait un relais d'envoi ouvert sur le compte MailerSend.
4. **Le cron refuse de tourner sans `CRON_SECRET`.** Défaut fermé, pas défaut ouvert.
5. **Aucun email/push automatique vers une joueuse** (données de santé, RGPD) — voir
   le commentaire en tête de `api/cron/notifications.js`. Deux endpoints seulement
   peuvent écrire à une joueuse (`send-wellness-links`, `send-mbti-links`) : contenu
   figé par un template, destinataires relus en base, droit d'écriture sur l'équipe
   exigé, déclenchement manuel. Un test de `api/_lib/guards.test.js` le vérifie.
6. **Les pages publiques** (`/joueur/:id/bien-etre`, `/joueur/:id/mbti`) n'ont aucun
   accès direct aux tables : elles passent par des fonctions `SECURITY DEFINER`
   accordées à `anon`, qui revalident tout côté serveur.

---

## 6. Commandes

```bash
npm install        # installer les dépendances
npm run dev        # dev sur http://localhost:5173
npm run typecheck  # vérification TypeScript
npm run test       # tests (vitest)
npm run build      # build de prod dans dist/
npx vercel dev     # dev AVEC les fonctions /api (obligatoire pour tester emails/push)
```

`npm run dev` **ne fait pas tourner les fonctions `api/`**. Pour ça il faut
`npx vercel dev`. C'est la source de confusion n°1 sur cette stack.

---

## 7. Ce que cette stack coûte

| Service | Palier gratuit | Quand ça devient payant |
|---|---|---|
| GitHub | illimité (privé inclus) | jamais pour ce type de projet |
| Vercel Hobby | suffisant pour un projet perso | usage commercial, ou 1 cron/jour max en Hobby |
| Supabase Free | 500 Mo de base, 1 Go de fichiers | projet mis en pause après 1 semaine d'inactivité |
| MailerSend | ~3 000 emails/mois | au-delà |

Un projet comme celui-ci tient à **0 €/mois** en usage réel modéré.
