# Stamina

Application de gestion d'équipe de basketball : RPE, bien-être, suivi médical,
séances et statistiques.

Design d'origine : [Figma](https://www.figma.com/design/ilZAHoHLgnczpxjUnEMfe5/Player-following-app).

## Démarrer

```bash
npm install            # installer les dépendances
cp .env.example .env   # puis remplir les valeurs
npm run dev            # http://localhost:5173
npx vercel dev         # dev AVEC les fonctions serverless api/
```

## Documentation

| Fichier | Contenu |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | monter une app comme celle-ci de zéro — guide pas à pas pour débutant |
| [docs/STACK.md](docs/STACK.md) | la stack : quoi, pourquoi, où — fiche de référence |
| [docs/CALCULS.md](docs/CALCULS.md) | les formules métier |
| [schema.sql](schema.sql) | le schéma Postgres complet (tables, RLS, fonctions, buckets) |
