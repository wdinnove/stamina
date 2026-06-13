# Cahier des Charges — Design Figma Make
## Application de Gestion Sportive (Sport Performance Tracker)

> **Destination :** Prompt à utiliser directement dans Figma Make  
> **Type de projet :** Application web responsive — tableau de bord sport / suivi de performance  
> **Audience :** Staff technique, entraîneurs, préparateurs physiques, médecins du sport  
> **Ton visuel :** Sérieux, dense en données, lisible en situation de terrain (lumière forte, regard rapide)

---

## 🎨 Design System Global

```
Design language : "Performance Dashboard"
Palette principale :
  - Background deep   : #0D0F14
  - Surface card      : #161920
  - Surface elevated  : #1E2229
  - Accent primary    : #00E5A0  (vert performance — énergie, validation, vivant)
  - Accent warning    : #F59E0B  (attention médicale, charge élevée)
  - Accent danger     : #EF4444  (blessure, alerte critique)
  - Accent info       : #3B82F6  (information, navigation)
  - Text primary      : #F1F5F9
  - Text secondary    : #94A3B8
  - Text muted        : #475569
  - Border subtle     : #2A2F3A

Typography :
  - Display / Titres  : "Inter" Bold / ExtraBold — chiffres et KPIs
  - Body               : "Inter" Regular / Medium
  - Données / Mono    : "JetBrains Mono" ou "Roboto Mono" — stats, temps, valeurs RPE

Radius : 8px (cards), 4px (badges/tags), 12px (modales)
Espacement base : 8px grid
Ombres : drop-shadow subtil sur fond sombre (#00000040 12px blur)

Composants globaux à créer :
  - TopBar avec navigation
  - Sidebar collapsible (desktop) / Bottom nav (mobile)
  - Card container
  - Badge statut (actif / blessé / indisponible / suspendu)
  - Avatar joueur (photo + initiales fallback)
  - KPI Block (valeur + label + variation ↑↓)
  - Chart placeholder (Line / Bar / Radar / Heatmap)
  - Empty state illustration
  - Toast notification (succès / erreur / warning)
  - Modal de confirmation
  - Formulaire standard (input / select / textarea / date / toggle)
  - Tableau de données avec tri et pagination
```

---

## 📐 Architecture des Pages

```
01. Authentification
02. Dashboard Home
03. Gestion Équipes (liste + détail + formulaire)
04. Gestion Joueurs (liste + profil + formulaire)
05. Perception de l'Effort (RPE) — saisie + historique
06. Perception Émotionnelle — saisie + historique
07. Suivi Médical — saisie + dossier
08. Actions à Réaliser — todo list avancée
09. Statistiques Individuelles — saisie + visualisation
10. Bilan Joueur
11. Bilan Équipe
```

---

---

# PAGE 01 — AUTHENTIFICATION

## Contexte métier
L'application est utilisée par des profils différents : entraîneur principal, préparateur physique, médecin du sport, analyste vidéo. L'accès doit être sécurisé et différencier les rôles (lecture seule vs écriture vs admin). La page d'auth doit inspirer confiance et professionnalisme.

## Layout

```
┌──────────────────────────────────────────────────────┐
│  [Logo app + nom]                  [Langue EN/FR]    │
│                                                      │
│         ┌──────────────────────────────┐             │
│         │   Bienvenue sur [AppName]    │             │
│         │   Gérez vos équipes et       │             │
│         │   suivez chaque performance  │             │
│         │                              │             │
│         │  [Illustration sport subtile]│             │
│         │                              │             │
│         │  📧 Email                    │             │
│         │  ┌──────────────────────┐   │             │
│         │  │ votre@email.com      │   │             │
│         │  └──────────────────────┘   │             │
│         │                              │             │
│         │  🔒 Mot de passe             │             │
│         │  ┌──────────────────────┐   │             │
│         │  │ ••••••••••••         │👁 │             │
│         │  └──────────────────────┘   │             │
│         │                              │             │
│         │  [ ] Se souvenir de moi      │             │
│         │              [Mot de passe oublié ?]       │
│         │                              │             │
│         │  [    SE CONNECTER    ]      │             │
│         │                              │             │
│         │  ──────── ou ────────        │             │
│         │                              │             │
│         │  [  Continuer avec Google ]  │             │
│         └──────────────────────────────┘             │
│                                                      │
│  Version 1.0 · © 2025 [Club/Org]                    │
└──────────────────────────────────────────────────────┘
```

## Écrans à designer
- **Login** : formulaire email + mot de passe, remember me, lien forgot password
- **Mot de passe oublié** : saisie email → confirmation envoi
- **Réinitialisation mot de passe** : nouveau mdp + confirmation
- **États du formulaire** : idle / loading (spinner dans bouton) / erreur inline / succès

## Détails UX
- Erreurs affichées sous chaque champ (jamais au top uniquement)
- Bouton "Se connecter" devient loading spinner pendant l'appel API
- Redirection automatique si déjà connecté
- Toast succès après reset de mot de passe

---

---

# PAGE 02 — DASHBOARD HOME

## Contexte métier
Vue d'ensemble quotidienne. L'entraîneur arrive le matin et veut voir en 10 secondes : qui est disponible, la charge d'hier, les alertes médicales actives, les actions en retard. C'est une page de **synthèse d'action**, pas un reporting statique.

## Layout

```
┌─ Sidebar ──┬─────────────────────────────────────────────┐
│ Logo       │  Bonjour Thomas 👋  Lundi 9 juin 2025       │
│            │  ─────────────────────────────────────────  │
│ Dashboard  │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ Équipes    │  │ Joueurs  │ │ Alertes  │ │ Actions  │   │
│ Joueurs    │  │  actifs  │ │ médicales│ │ en retard│   │
│ Médical    │  │   24 / 28│ │    🔴 3  │ │    ⚠️ 7  │   │
│ Actions    │  └──────────┘ └──────────┘ └──────────┘   │
│ Stats      │                                             │
│            │  Charge de l'équipe — 7 derniers jours     │
│ ─────────  │  ┌─────────────────────────────────────┐  │
│ Profil     │  │  [Graphique barre RPE collectif]    │  │
│ Déconnexion│  │  Ligne tendance + seuil charge max  │  │
│            │  └─────────────────────────────────────┘  │
│            │                                             │
│            │  Joueurs à surveiller aujourd'hui          │
│            │  ┌────────────────────────────────────┐   │
│            │  │ 🔴 Dubois M.  — Douleur genou      │   │
│            │  │ 🟡 Martin R.  — RPE > 8 hier       │   │
│            │  │ 🟡 Garcia L.  — Stress élevé       │   │
│            │  └────────────────────────────────────┘   │
│            │                                             │
│            │  Prochaines actions                        │
│            │  [ Voir toutes les actions →  ]            │
└────────────┴─────────────────────────────────────────────┘
```

## Composants clés
- **KPI cards** : 4 blocs principaux (joueurs actifs / blessés / charge moy / humeur moy)
- **Graphique charge collective** : barres RPE sur 7 jours, avec seuil danger horizontal
- **Feed alertes** : liste colorée par gravité (rouge = médical, orange = charge, bleu = info)
- **Mini-actions dues** : top 5 des actions en retard avec assignation joueur
- **Selector d'équipe** : si multi-équipes, switcher rapide en haut

---

---

# PAGE 03 — GESTION DES ÉQUIPES

## Contexte métier
Un club peut gérer plusieurs équipes (U17, U19, Première, Féminine...). Chaque équipe a un nom, un sport, une catégorie, un staff associé et un roster de joueurs. Le CRUD doit être simple et permettre l'archivage (pas de suppression définitive des données).

## 03a — Liste des Équipes

```
┌─────────────────────────────────────────────────────────┐
│ Équipes                            [+ Nouvelle équipe]  │
│ ─────────────────────────────────────────────────────   │
│ 🔍 Rechercher une équipe...     [Filtre : Actives ▼]   │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 🏆 Équipe Première          Football · 26 joueurs  │  │
│ │    Saison 2024/2025  ·  Staff : Thomas M.          │  │
│ │                           [Voir] [Modifier] [···]  │  │
│ ├───────────────────────────────────────────────────┤  │
│ │ 🥈 U19 Nationaux            Football · 20 joueurs  │  │
│ │    Saison 2024/2025  ·  Staff : Julien R.          │  │
│ │                           [Voir] [Modifier] [···]  │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ Pagination : < 1 2 3 > | 12 équipes au total           │
└─────────────────────────────────────────────────────────┘
```

## 03b — Détail d'une Équipe

```
┌──────────────────────────────────────────────────────────┐
│ ← Retour   Équipe Première   [Modifier] [Archiver]      │
│ ──────────────────────────────────────────────────────── │
│ ┌─────────────────────┐  ┌──────────────────────────┐   │
│ │ Sport    : Football │  │ Joueurs actifs  : 24 / 26 │   │
│ │ Catégorie: Seniors  │  │ Blessés         : 2       │   │
│ │ Saison   : 2024/25  │  │ RPE moyen (7j)  : 6.8    │   │
│ │ Couleurs : 🔵⚪      │  │ Humeur moy.(7j) : 😊 7.2  │   │
│ └─────────────────────┘  └──────────────────────────┘   │
│                                                          │
│ Roster                       [+ Ajouter un joueur]      │
│ ┌────────────────────────────────────────────────────┐  │
│ │ [Avatar] Dubois Marc       #10  Milieu  🔴 Blessé  │  │
│ │ [Avatar] Martin Rémi       #7   Attaq.  🟢 Actif   │  │
│ │ [Avatar] Garcia Luis       #4   Défens. 🟡 Limité  │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Staff associé                                            │
│ Thomas M. (Entraîneur) · Julien R. (Prépa physique)     │
└──────────────────────────────────────────────────────────┘
```

## 03c — Formulaire Équipe (Création / Modification)

**Champs :** Nom de l'équipe · Sport (select) · Catégorie d'âge · Saison · Couleur principale · Logo upload · Responsable staff · Description libre

---

---

# PAGE 04 — GESTION DES JOUEURS

## Contexte métier
Le joueur est l'entité centrale de l'application. Sa fiche regroupe l'identité, le profil physique, la position, le numéro, l'équipe, et sert de hub vers tous les modules (santé, effort, émotions, stats). Le statut du joueur est critique : actif / blessé / indisponible / suspendu / prêté.

## 04a — Liste des Joueurs

```
┌──────────────────────────────────────────────────────────┐
│ Joueurs                             [+ Nouveau joueur]   │
│ ──────────────────────────────────────────────────────── │
│ 🔍 Rechercher...  [Équipe ▼] [Poste ▼] [Statut ▼]      │
│                                                          │
│ Vue : [Grille ▦] [Liste ≡]                              │
│                                                          │
│ ── VUE GRILLE ──────────────────────────────────────    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ [Photo]  │ │ [Photo]  │ │ [Photo]  │ │ [Photo]  │   │
│ │ Dubois M.│ │ Martin R.│ │ Garcia L.│ │ Koné A.  │   │
│ │ #10      │ │ #7       │ │ #4       │ │ #1       │   │
│ │ Milieu   │ │ Attaquant│ │ Défenseur│ │ Gardien  │   │
│ │ 🔴Blessé │ │ 🟢Actif  │ │ 🟡Limité │ │ 🟢Actif  │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────────────────────────────────────────────────────────┘
```

## 04b — Profil Joueur (Hub central)

```
┌──────────────────────────────────────────────────────────┐
│ ← Joueurs   Marc Dubois   #10   [Modifier] [···]        │
│ ──────────────────────────────────────────────────────── │
│ ┌────────────┐  Nom       : Dubois Marc                 │
│ │  [Photo]   │  Né le     : 14/03/1998  (27 ans)        │
│ │            │  Nationalité: 🇫🇷 Française               │
│ │  🔴 Blessé │  Poste     : Milieu central               │
│ └────────────┘  Équipe    : Équipe Première              │
│                 Pied fort  : Droite                      │
│                 Taille / Poids : 182 cm / 77 kg          │
│                 Contrat    : jusqu'au 30/06/2026          │
│ ──────────────────────────────────────────────────────── │
│ Navigation rapide :                                      │
│ [Effort RPE] [Émotions] [Médical] [Actions] [Stats]     │
│ ──────────────────────────────────────────────────────── │
│ Dernière saisie RPE : hier · 7.5                        │
│ Dernière émotion    : hier · 😟 Anxieux                  │
│ Alerte médicale     : 🔴 Douleur genou gauche (J+3)     │
│ Actions en attente  : 3 actions non réalisées            │
└──────────────────────────────────────────────────────────┘
```

## 04c — Formulaire Joueur

**Onglets du formulaire :**
- **Identité** : Prénom / Nom / Date de naissance / Nationalité / Photo
- **Profil sportif** : Poste principal / Poste secondaire / N° de maillot / Pied fort / Équipe
- **Physique** : Taille / Poids / IMC (calculé auto) / VO2max (si dispo)
- **Contractuel** : Date d'arrivée / Date de fin contrat / Statut du joueur / Notes

---

---

# PAGE 05 — PERCEPTION DE L'EFFORT (RPE)

## Contexte métier
La **RPE** (Rate of Perceived Exertion) est un outil scientifique issu de l'échelle de Borg (1–10 ou 6–20). En sport moderne, on utilise la **session-RPE** : l'entraîneur demande au joueur "combien d'effort as-tu ressenti ?" après chaque séance. Multiplié par la durée (en minutes), cela donne la **charge d'entraînement** (ACWR — Acute:Chronic Workload Ratio). Les seuils : < 4 = léger, 4–6 = modéré, 7–8 = intense, ≥ 9 = maximal. L'accumulation de charges élevées sans récupération = risque blessure.

## 05a — Saisie RPE (vue Staff)

```
┌──────────────────────────────────────────────────────────┐
│ Saisie RPE — Session du 09/06/2025    [Séance : Matin ▼]│
│ Type de séance : [Entraînement ▼]  Durée : [90] min     │
│ ──────────────────────────────────────────────────────── │
│ Joueur              RPE  (1 très facile → 10 maximal)   │
│ ─────────────────────────────────────────────────────── │
│ Dubois Marc     ○1 ○2 ○3 ○4 ○5 ●6 ○7 ○8 ○9 ○10  [Absent]│
│ Martin Rémi     ○1 ○2 ○3 ○4 ○5 ○6 ○7 ●8 ○9 ○10         │
│ Garcia Luis     ○1 ○2 ●3 ○4 ○5 ○6 ○7 ○8 ○9 ○10  [Blessé]│
│                                                          │
│ Charge collective estimée : 6.8 × 90 = 612 UA           │
│                                                          │
│ [Enregistrer tout]                                       │
└──────────────────────────────────────────────────────────┘
```

## 05b — Historique RPE d'un Joueur

```
┌──────────────────────────────────────────────────────────┐
│ RPE — Marc Dubois        [Période : 30 derniers jours ▼]│
│ ──────────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐    │
│ │  Graphique ligne  :  RPE quotidien + zone danger  │    │
│ │  Barre secondaire :  Charge cumulée (UA)           │    │
│ │  Ligne pointillée :  Moyenne mobile 7 jours        │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ ACWR (ratio charge aiguë/chronique) : 1.12 ✅           │
│ ⚠️ Seuil d'alerte : ACWR > 1.5 = risque blessure élevé │
│                                                          │
│ Historique tableau :                                     │
│ Date       │ Séance     │ RPE │ Durée │ Charge │ Note   │
│ 09/06      │ Entraîn.   │ 7   │ 90min │ 630 UA │        │
│ 08/06      │ Match      │ 9   │ 95min │ 855 UA │        │
│ 07/06      │ Repos      │ -   │ -     │ -      │        │
└──────────────────────────────────────────────────────────┘
```

## 05c — Formulaire saisie individuelle

**Champs :** Joueur (select) · Date · Type de séance (entraînement / match / gym / repos) · Durée (minutes) · RPE (1–10 slider avec couleurs + libellé) · Note libre

---

---

# PAGE 06 — PERCEPTION ÉMOTIONNELLE

## Contexte métier
La **bien-être psychologique** est un prédicteur fort de performance et de blessure. Les modèles utilisés en sport de haut niveau incluent le **POMS** (Profile of Mood States), le **Hooper Index**, et la **Well-Being Scale de McLean**. Les dimensions à mesurer : Fatigue / Humeur générale / Stress / Motivation / Qualité du sommeil / Douleurs musculaires. L'objectif est de détecter les signaux faibles : un joueur qui décroche émotionnellement avant qu'il ne chute physiquement.

## 06a — Saisie Émotionnelle (vue Joueur ou Staff)

```
┌──────────────────────────────────────────────────────────┐
│ Comment tu te sens aujourd'hui, Marc ?                   │
│ 09/06/2025 · Matin                                       │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ 😴 Fatigue générale                                      │
│ ○ 1  ○ 2  ○ 3  ○ 4  ○ 5  ○ 6  ● 7  ○ 8  ○ 9  ○ 10    │
│ Très reposé ←──────────────────────→ Épuisé             │
│                                                          │
│ 😊 Humeur                                                │
│ ○ 1  ○ 2  ○ 3  ● 4  ○ 5  ○ 6  ○ 7  ○ 8  ○ 9  ○ 10    │
│ Très bonne ←───────────────────────→ Très mauvaise      │
│                                                          │
│ 😰 Stress / Tension                                      │
│ [Slider visuel 1–10 avec emojis progressifs]            │
│                                                          │
│ 💪 Motivation                                            │
│ [Slider visuel 1–10]                                    │
│                                                          │
│ 🌙 Qualité du sommeil (nuit passée)                     │
│ [Slider visuel 1–10]                                    │
│                                                          │
│ 🦵 Douleurs musculaires                                  │
│ [Slider visuel 1–10]                                    │
│                                                          │
│ 💬 Note libre (facultatif)                              │
│ ┌──────────────────────────────────────────────────┐   │
│ │ "Je sens mes jambes lourdes depuis hier soir..."  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ Score bien-être global : 5.8 / 10  ⚠️ Attention         │
│ [Enregistrer]                                            │
└──────────────────────────────────────────────────────────┘
```

## 06b — Historique Émotionnel d'un Joueur

```
┌──────────────────────────────────────────────────────────┐
│ Bien-être — Marc Dubois    [Période : 14 jours ▼]        │
│ ──────────────────────────────────────────────────────── │
│ ┌──────────────────────────────────────────────────┐    │
│ │  Graphique radar (POMS dernière saisie)          │    │
│ │  + Graphique ligne multi-axes (toutes dimensions)│    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ Heatmap calendrier (score quotidien par couleur)         │
│ L   M   M   J   V   S   D                               │
│ 🟡  🟢  🔴  🟡  🟢  ⬜  ⬜                              │
│                                                          │
│ Tableau historique : Date · Fatigue · Humeur · Stress    │
│ · Motivation · Sommeil · Douleur · Score · Note          │
└──────────────────────────────────────────────────────────┘
```

---

---

# PAGE 07 — SUIVI MÉDICAL

## Contexte métier
Le suivi médical en sport professionnel couvre : les **blessures** (classification par type, localisation anatomique, gravité selon jours d'absence), les **bilans de santé** périodiques, les traitements en cours, et les protocoles de retour à l'entraînement (RTP — Return To Play). Le système **OSICS** (Orchard Sports Injury & Illness Classification) est le standard international. La confidentialité médicale impose une gestion des droits stricte (seul le médecin et le joueur accèdent aux détails).

## 07a — Dossier Médical d'un Joueur

```
┌──────────────────────────────────────────────────────────┐
│ Suivi Médical — Marc Dubois         [+ Nouvelle entrée] │
│ 🔒 Accès restreint (Médecin + Staff autorisé)           │
│ ──────────────────────────────────────────────────────── │
│ Statut actuel : 🔴 Indisponible — Blessure active       │
│ RTP estimé    : 12/06/2025 (dans 3 jours)               │
│                                                          │
│ Blessure active                                          │
│ ┌──────────────────────────────────────────────────┐   │
│ │ 🔴 Entorse genou gauche (LCM)                    │   │
│ │    Date : 07/06/2025 · Type : Traumatique         │   │
│ │    Gravité : Grade 2 · Absence estimée : 7 jours  │   │
│ │    Localisation : Genou gauche · Zone : LCM        │   │
│ │    Traitement : Glaçage + bandage + kiné 2×/jour  │   │
│ │    Protocole RTP : Étape 2/5 (reprise course)     │   │
│ │    [Voir détail] [Modifier] [Clôturer]            │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ Historique médical (cette saison)                        │
│ ──────────────────────────────────────────────────────── │
│ 15/03 · Contracture ischio  · 3 jours · Résolu ✅       │
│ 20/01 · Ampoule pied droit  · 1 jour  · Résolu ✅       │
│                                                          │
│ Bilans médicaux planifiés                                │
│ Prochain bilan saisonnier : 01/07/2025                  │
└──────────────────────────────────────────────────────────┘
```

## 07b — Formulaire Nouvelle Entrée Médicale

**Onglets :**
- **Blessure** : Date · Mécanisme (traumatique / surcharge / maladie) · Zone anatomique (sélecteur corps humain) · Diagnostic · Gravité (léger / modéré / grave) · Jours d'absence · Traitement · Protocole RTP
- **Bilan santé** : Date · Type de bilan · Résultats · Recommandations · Prochain bilan
- **Traitement en cours** : Médicament / Soin · Posologie · Durée · Prescripteur

## 07c — Vue Globale Médicale (Staff)

```
┌──────────────────────────────────────────────────────────┐
│ Infirmerie — Équipe Première         [Vue mensuelle ▼]  │
│ ──────────────────────────────────────────────────────── │
│ Blessés actuellement (3)                                 │
│ 🔴 Dubois M.   — Genou    — J+3 de RTP                  │
│ 🔴 Fernandez T.— Cheville — J+7 de RTP                  │
│ 🟡 Petit N.    — Dos      — Surveillance                 │
│                                                          │
│ Statistiques blessures (saison)                          │
│ Total blessures : 12 · Jours perdus : 47 · Type : 60% surcharge│
│ [Graphique zones anatomiques les plus touchées]          │
└──────────────────────────────────────────────────────────┘
```

---

---

# PAGE 08 — ACTIONS À RÉALISER

## Contexte métier
Le module **actions** est un système de tâches intelligentes lié aux joueurs. Il permet au staff de créer des actions de suivi individualisées : exercice de rééducation à faire, objectif mental à travailler, rendez-vous médical à prendre, travail vidéo assigné. Chaque action a un responsable, une échéance, une priorité et un statut. C'est le lien opérationnel entre l'analyse et le terrain.

## 08a — Liste des Actions

```
┌──────────────────────────────────────────────────────────┐
│ Actions                              [+ Nouvelle action] │
│ ──────────────────────────────────────────────────────── │
│ Filtres : [Joueur ▼] [Assigné à ▼] [Statut ▼] [Date ▼] │
│                                                          │
│ En retard (3)                                            │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 🔴 Dubois M. — Séance kiné matin        Échue J-2  │  │
│ │    Assigné : Dr Moreau · Priorité : Haute           │  │
│ │    [Marquer fait] [Reporter] [Détail]               │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Aujourd'hui (5)                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 🟡 Martin R. — Visionnage vidéo pressing   Auj. 17h│  │
│ │ 🟡 Garcia L. — Entretien psychologique     Auj. 11h│  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ À venir (12)                                             │
│ [Voir tout...]                                           │
└──────────────────────────────────────────────────────────┘
```

## 08b — Formulaire Action

**Champs :** Joueur concerné · Titre de l'action · Description / Consigne détaillée · Catégorie (médical / physique / mental / tactique / administratif) · Priorité (faible / normale / haute / critique) · Date limite · Assigné à (staff member) · Rappel (toggle + délai) · Pièce jointe

## 08c — Vue Kanban (optionnel)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  À faire     │ │ En cours     │ │ En attente   │ │ Terminé ✅   │
│  ──────────  │ │ ──────────   │ │ ──────────   │ │ ──────────   │
│ [Card action]│ │ [Card action]│ │ [Card action]│ │ [Card action]│
│ [Card action]│ │              │ │              │ │ [Card action]│
│ [+ Ajouter] │ │              │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

---

---

# PAGE 09 — STATISTIQUES INDIVIDUELLES

## Contexte métier
Les stats individuelles varient selon le sport. Pour le **football** : buts / passes décisives / km parcourus / duels gagnés / taux de passes réussies / xG (expected goals). Pour le **basketball** : points / rebonds / passes / interceptions / +/-. Le module doit être configurable par sport. Les données viennent soit d'une saisie manuelle, soit d'une intégration GPS/tracking. L'objectif est le **suivi de progression** saison par saison.

## 09a — Vue Stats d'un Joueur

```
┌──────────────────────────────────────────────────────────┐
│ Statistiques — Marc Dubois   [Saison 2024/25 ▼]         │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ Saison complète                  Moyenne par match       │
│ ┌─────────────────────────────────────────────────┐    │
│ │  Matchs joués : 22 / 28       Min moy : 78'      │    │
│ │  Buts         : 6              0.27 / match       │    │
│ │  Passes déc.  : 9              0.41 / match       │    │
│ │  Km parcourus : 240 km        10.9 km / match     │    │
│ │  Taux passes  : 87%                               │    │
│ └─────────────────────────────────────────────────┘    │
│                                                          │
│ Évolution saison  [Métrique : Buts ▼]                   │
│ ┌──────────────────────────────────────────────────┐    │
│ │  [Graphique ligne — buts par journée de compét.]  │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ Profil radar (comparaison au poste)                     │
│ ┌──────────────────────────────────────────────────┐    │
│ │  [Spider chart : Vitesse / Technique / Physique   │    │
│ │   / Mental / Collectif / Efficacité]              │    │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ Match par match                      [+ Saisir un match]│
│ Date     │ Adversaire  │ Min │ Buts │ Passes │ Note    │
│ 08/06    │ Bordeaux    │ 90' │  1   │   2    │  8/10   │
└──────────────────────────────────────────────────────────┘
```

## 09b — Formulaire Saisie Stats (par match)

**Champs :** Joueur · Date du match · Adversaire · Compétition · Temps de jeu (minutes) + Poste joué · Titulaire ou remplaçant · Stats spécifiques au sport (configurables) · Note de performance (1–10) · Commentaire coach

---

---

# PAGE 10 — BILAN PAR JOUEUR

## Contexte métier
C'est la page la plus dense et la plus valorisée par le staff. Elle agrège **toutes les données** d'un joueur sur une période choisie : charge physique, bien-être, médical, stats de jeu, actions réalisées. L'objectif est de dresser un **portrait complet** du joueur pour : les entretiens de fin de saison, le suivi de progression, les décisions de staffing, les transferts.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ Bilan joueur — Marc Dubois       [Période : Saison ▼]   │
│                              [Exporter PDF] [Imprimer]  │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ [Photo]  Marc Dubois · #10 · Milieu central         │  │
│ │          27 ans · Équipe Première · Droitier        │  │
│ │          Saison 2024/25 : 22 matchs · 1782 min      │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ── SANTÉ & DISPONIBILITÉ ─────────────────────────────  │
│ Disponibilité saison : 78%  (22/28 matchs)              │
│ Blessures : 2 · Jours perdus : 12 · Types : surcharge   │
│ [Mini timeline blessures + disponibilité]               │
│                                                          │
│ ── CHARGE & BIEN-ÊTRE ────────────────────────────────  │
│ RPE moyen saison : 6.8 / 10  ↑ +0.3 vs saison préc.   │
│ Bien-être moyen  : 7.1 / 10  ↔ stable                  │
│ [Graphique croisé RPE + Bien-être sur la saison]        │
│ Tendance  : ⚠️ Surcharge en février (ACWR > 1.5)        │
│                                                          │
│ ── PERFORMANCES ──────────────────────────────────────  │
│ 6 buts · 9 passes déc. · 87% taux passes · 10.9km/match│
│ [Graphique radar comparatif N-1 vs N]                   │
│                                                          │
│ ── ACTIONS & OBJECTIFS ───────────────────────────────  │
│ Actions assignées   : 18                                 │
│ Actions réalisées   : 14 (78%)                          │
│ Actions en retard   : 2                                  │
│                                                          │
│ ── COMMENTAIRE STAFF ─────────────────────────────────  │
│ ┌──────────────────────────────────────────────────┐   │
│ │  [Zone de texte libre — synthèse entraîneur]      │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ Axes de progression suggérés :                          │
│ · Réduire les périodes de surcharge (gestion charge)    │
│ · Travailler la récupération active post-match          │
│                                                          │
│ [Enregistrer le bilan] [Générer rapport PDF]            │
└──────────────────────────────────────────────────────────┘
```

---

---

# PAGE 11 — BILAN PAR ÉQUIPE

## Contexte métier
La vue collective permet au staff de comparer les joueurs entre eux sur les mêmes indicateurs, d'identifier les patterns collectifs (toute l'équipe sous-récupérée avant une trêve ? Baisse de moral après une défaite ?), et de piloter la planification des charges sur la saison. C'est aussi la page utilisée pour les **revues de performance collectives** avec la direction sportive.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│ Bilan Équipe — Équipe Première   [Saison 2024/25 ▼]     │
│                              [Exporter PDF] [Partager]  │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ ── SYNTHÈSE GLOBALE ──────────────────────────────────  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ Effectif │ │ Dispon.  │ │RPE moyen │ │ Bien-être │   │
│ │   26     │ │   82%    │ │   6.7    │ │    7.0    │   │
│ │  joueurs │ │ saison   │ │          │ │  /10      │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                          │
│ ── COMPARATIF JOUEURS ────────────────────────────────  │
│ Métrique : [Buts ▼]  Affichage : [Barres ▼]            │
│ ┌──────────────────────────────────────────────────┐   │
│ │  [Graphique comparatif horizontal — tous joueurs] │   │
│ │  Ordonné par valeur, highlight meilleur/moyen/bas  │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ── HEATMAP CHARGE COLLECTIVE ─────────────────────────  │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Calendrier couleur : RPE moyen équipe par jour    │   │
│ │ 🟢 Léger  🟡 Modéré  🟠 Intense  🔴 Maximal      │   │
│ └──────────────────────────────────────────────────┘   │
│                                                          │
│ ── BLESSURES SAISON ──────────────────────────────────  │
│ Total : 18 blessures · 67 jours perdus                  │
│ Période la plus à risque : Février (après trêve)        │
│ Zone la plus touchée : Ischio-jambiers (28%)            │
│ [Graphique anatomique + diagramme beignet zones]        │
│                                                          │
│ ── TABLEAU RÉCAPITULATIF JOUEURS ─────────────────────  │
│ Nom         │ Matchs │ Buts │ Passes │ RPE moy │ Dispon.│
│ Dubois M.   │  22    │  6   │   9    │  6.8    │  78%  │
│ Martin R.   │  26    │  12  │   4    │  6.2    │  93%  │
│ [Tous les joueurs — triable par colonne]                │
│                                                          │
│ ── RECOMMANDATIONS ───────────────────────────────────  │
│ [Zone commentaire libre staff]                          │
│                                                          │
│ [Générer rapport complet PDF]                           │
└──────────────────────────────────────────────────────────┘
```

---

---

## ✅ Récapitulatif des Pages à Designer

| # | Page | Sous-écrans |
|---|------|-------------|
| 01 | Authentification | Login · Forgot password · Reset |
| 02 | Dashboard Home | Vue synthèse principale |
| 03 | Gestion Équipes | Liste · Détail · Form création/édition |
| 04 | Gestion Joueurs | Liste (grille + liste) · Profil hub · Form |
| 05 | RPE Effort | Saisie collective · Historique joueur · Form individuel |
| 06 | Émotions | Saisie joueur · Historique · Heatmap |
| 07 | Suivi Médical | Dossier joueur · Form entrée · Vue infirmerie |
| 08 | Actions | Liste · Form · Vue Kanban |
| 09 | Stats Individuelles | Vue stats · Form match · Radar |
| 10 | Bilan Joueur | Vue synthèse complète + export |
| 11 | Bilan Équipe | Vue collective + heatmap + tableau + export |

**Total : ~30 écrans distincts**

---

## 🔧 Contraintes Techniques à Intégrer dans Figma

```
Breakpoints :
  Desktop  : 1440px (layout principal)
  Tablet   : 768px  (sidebar collapse → top nav)
  Mobile   : 375px  (bottom nav, tableaux scrollables)

Composants à créer dans le Design System Figma :
  - Sidebar / TopBar / BottomNav (mobile)
  - Cards (standard / KPI / alerte / joueur)
  - Formulaires (inputs, selects, sliders RPE, date picker)
  - Graphiques (placeholders : Line / Bar / Radar / Heatmap)
  - Badges statut joueur
  - Avatars avec fallback initiales
  - Boutons (primary / secondary / danger / ghost)
  - Modales et drawers
  - Toasts / Notifications
  - Tables avec pagination
  - Empty states
  - Loading states (skeleton screens)

Tokens de couleur (à créer en variables Figma) :
  bg-deep / surface / surface-elevated / 
  accent-green / accent-warning / accent-danger / accent-info /
  text-primary / text-secondary / text-muted / border-subtle

Icônes : Lucide Icons (cohérent avec l'écosystème Tailwind)
```

---

*Cahier des charges généré le 09/06/2025 — Version 1.0*
*À utiliser comme prompt dans Figma Make pour générer les maquettes*