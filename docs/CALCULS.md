# Formules et calculs de l'application

Documentation de référence de tous les calculs statistiques/sportifs utilisés dans l'app, par thème. Pour chaque formule : le fichier source, la formule, et son interprétation.

---

## 1. Charge d'entraînement & RPE

Fichier source : [`src/utils/rpe.ts`](../src/utils/rpe.ts), [`src/utils/weeklyLoad.ts`](../src/utils/weeklyLoad.ts)

### 1.1 Charge de séance (méthode RPE de Foster)

```
charge_séance (UA) = RPE (0-10) × durée réelle (min)
```

Si aucune durée réelle n'est saisie, on retombe sur la durée planifiée (`actualDuration ?? plannedDuration`). UA = « unités arbitraires », l'unité standard de la méthode RPE-based training load.

### 1.2 RPE moyen

```
RPE_moyen = (Σ RPE) / n     — arrondi à 1 décimale
```

Couleur associée à une valeur RPE (0-10) :

| RPE | Zone | Couleur |
|---|---|---|
| 0-4 | Normal | vert |
| 5-6 | Soutenu | jaune |
| 7 | Difficile | orange |
| 8-10 | Extrême | rouge |

### 1.3 ACWR — Acute:Chronic Workload Ratio (Gabbett 2016)

```
charge_aiguë (7j)    = Σ (RPE × durée) sur les 7 derniers jours / 7
charge_chronique (28j) = Σ (RPE × durée) sur les 28 derniers jours / 28
ACWR = charge_aiguë / charge_chronique
```

Fenêtres inclusives (7j = J-6 → J). Zones de risque de blessure :

| ACWR | Zone | Couleur |
|---|---|---|
| < 0,8 | Sous-charge | bleu |
| 0,8 – 1,3 | Zone optimale | vert |
| 1,3 – 1,5 | Risque modéré | orange |
| > 1,5 | Risque élevé | rouge |

### 1.4 PMC — Performance Management Chart (modèle de Banister)

Série quotidienne ATL (fatigue aiguë) / CTL (forme chronique) / TSB (fraîcheur), par décroissance exponentielle :

```
charge_du_jour = Σ (RPE × durée) ce jour-là

ATL_jour = ATL_veille × (1 − 1/7)  + charge_du_jour × (1/7)     — constante de temps 7 j
CTL_jour = CTL_veille × (1 − 1/42) + charge_du_jour × (1/42)    — constante de temps 42 j

TSB_jour = CTL_veille − ATL_veille   (fraîcheur AVANT la charge du jour)
```

Zones de fraîcheur (TSB) :

| TSB | Zone | Couleur |
|---|---|---|
| ≤ -30 | Surmenage | rouge |
| -30 à -10 | Chargé | orange |
| -10 à 5 | Zone optimale | vert |
| > 5 | Frais | bleu |

### 1.5 Charge hebdomadaire & zones

```
charge_semaine = Σ (RPE × durée) sur la semaine (lundi → dimanche) / nb joueurs distincts ayant loggué
```

4 zones (seuils configurables par club, défauts `lightMax=2750`, `normalMax=4250`) :

```
t1 = lightMax
t2 = (lightMax + normalMax) / 2
```

| Charge | Zone |
|---|---|
| ≤ t1 | Normale |
| t1 – t2 | Soutenue |
| t2 – normalMax | Élevée |
| > normalMax | Surcharge |

Le seuil « par séance » affiché en config = `seuil_hebdo / nb_séances_par_semaine`.

Charge hebdomadaire moyenne : moyenne calculée **uniquement sur les semaines actives** (≥ 1 séance) — une semaine creuse (blessure, trêve) n'entre pas dans le dénominateur, pour ne pas faire chuter la moyenne artificiellement.

---

## 2. Bien-être

Fichier source : [`src/utils/wellness.ts`](../src/utils/wellness.ts)

### 2.1 Les 6 dimensions

Chaque axe est saisi sur une échelle brute 1-10 dont le sens dépend de `inverted` :

| Dimension | Sens de la saisie brute | `inverted` |
|---|---|---|
| Fatigue | 10 = épuisé | oui |
| Humeur | 10 = très bonne | non |
| Stress / Tension | 10 = très stressé | oui |
| Motivation | 10 = très motivé | non |
| Qualité du sommeil | 10 = excellente | non |
| Douleurs musculaires | 10 = très intenses | oui |

### 2.2 Valeur « ressentie » (redressée)

Pour comparer les axes entre eux (plus haut = toujours mieux), les axes inversés sont retournés :

```
valeur_ressentie = inverted ? (11 − valeur_brute) : valeur_brute
```

Formule symétrique (involution : l'appliquer deux fois redonne la valeur de départ) — utilisée aussi bien pour convertir un ressenti global en 6 valeurs brutes (saisie rapide) que pour ré-afficher une valeur brute en ressenti (alertes, graphiques).

### 2.3 Score bien-être global

```
score = ( (11−fatigue) + humeur + (11−stress) + motivation + sommeil + (11−douleurs) ) / 6
```

Arrondi à 1 décimale. Cette formule est répliquée à l'identique côté base de données (colonne générée `wellness_entries.score` dans `schema.sql`) — à garder synchronisée si l'une des deux change.

### 2.4 Statut / couleur

```
statut : ≥ 7 → Bon (vert)  |  ≥ 5 → Moyen (orange)  |  < 5 → Faible (rouge)
```
Appliqué sur la valeur ressentie (donc après redressement des axes inversés).

### 2.5 Agrégat d'équipe

Moyenne, jour par jour, de chaque dimension entre tous les joueurs ayant saisi ce jour-là (pas de report d'une saisie manquante).

### 2.6 Axe le plus dégradé (alerte)

Sur un ensemble d'entrées, l'axe (ressenti) le plus bas parmi tous les joueurs/jours, retenu seulement s'il est sous un seuil (5 par défaut).

---

## 3. Corrélations

Fichier source : [`src/utils/correlation.ts`](../src/utils/correlation.ts)

### 3.1 Coefficient de corrélation de Pearson

```
r = Σ(xᵢ−x̄)(yᵢ−ȳ) / √( Σ(xᵢ−x̄)² × Σ(yᵢ−ȳ)² )
```

Retourne 0 si l'une des deux séries est constante (dénominateur nul).

### 3.2 Force du lien

| |r| | Force |
|---|---|
| ≥ 0,6 | Majeur |
| 0,4 – 0,6 | Fort |
| 0,25 – 0,4 | Modéré |
| < 0,25 | Léger |

### 3.3 Significativité statistique (p-value)

Test bilatéral H₀ : « r = 0 », via la statistique de Student :

```
t = r × √( (n−2) / (1−r²) )        — n−2 degrés de liberté
p = fonction bêta incomplète régularisée (méthode Numerical Recipes)
```

Seuil conventionnel : **α = 0,05**. Une corrélation est affichée comme « significative » si `p < 0,05`. Garde-fous : pas de corrélation calculée si moins de **5 observations appariées**, ou si l'une des deux séries n'a pas de variance.

### 3.4 Régression linéaire simple (moindres carrés)

```
pente  = Σ(xᵢ−x̄)(yᵢ−ȳ) / Σ(xᵢ−x̄)²
ordonnée_origine = ȳ − pente × x̄
```

### 3.5 Appariement des séries (analyse croisée)

Fichier source : [`src/data/crossAnalysis.ts`](../src/data/crossAnalysis.ts)

Selon les deux indicateurs croisés :

- **Match × quotidien** (ex. Éval vs Charge) : ancrage sur les dates de match — chaque match est une observation, l'autre indicateur est mesuré juste avant (fenêtre de `anchor.window` jours, décalée de `lagDays`, agrégée en moyenne/somme/dernière valeur).
- **Match × match** : appariement direct par date de match.
- **Quotidien × quotidien** (ex. Bien-être vs Sommeil) : appariement jour par jour, avec décalage (`lag` = 0, 3, 7 jours, ou `'week'` = moyenne des 7 jours précédents).
- **Blessures** : jamais de Pearson (série quasi 0/1 → chiffres trompeurs) ; uniquement les règles d'alerte (§5) et une surimpression graphique.

---

## 4. Statistiques avancées basket (par joueur)

Fichier source : [`src/data/playerAdvanced.ts`](../src/data/playerAdvanced.ts)

Notations : `fga` = tirs tentés (2+3 pts), `fgm` = tirs réussis, `indPoss` = possessions individuelles utilisées.

```
indPoss = fga + 0,44 × LF_tentés + ballons_perdus

eFG%      = (fgm + 0,5 × 3pts_réussis) / fga × 100
FT_Rate   = LF_tentés / fga
BP/Poss   = ballons_perdus / indPoss
ORtg      = points × 100 / indPoss
%BP       = ballons_perdus / indPoss × 100
```

Nécessitent en plus la stat collective de l'équipe sur le même match :

```
%USG     = indPoss / possessions_équipe × 100
%USG/min = indPoss × (minutes_équipe / 5) / (minutes_joueur × possessions_équipe) × 100
%PD      = passes_décisives / (tirs_réussis_équipe − tirs_réussis_joueur) × 100
%TREB    = (rebonds_off + rebonds_déf du joueur) / (rebonds_équipe + rebonds_adversaire, tous types) × 100
%DREB    = rebonds_déf_joueur / (rebonds_déf_équipe + rebonds_off_adversaire) × 100
%OREB    = rebonds_off_joueur / (rebonds_off_équipe + rebonds_déf_adversaire) × 100

Points_générés = points_marqués + passes_décisives × (points_marqués_au_tir_équipe / tirs_réussis_équipe)
```

Les tableaux de stats avancées affichent les deux lectures de l'usage côte à côte :

- **%USG** : part des possessions de l'équipe utilisées par le joueur sur l'ensemble du match — dépend donc mécaniquement de son temps de jeu (un remplaçant très sollicité sur 8 minutes reste bas).
- **%USG/min** : la même part rapportée aux minutes réellement jouées (`minutes_équipe` = Σ des minutes de tout l'effectif sur les matchs couverts, ≈ 5 × durée du match) — répond à « quand il est sur le terrain, quelle part des possessions prend-il ? ».

`%USG/min` retombe silencieusement sur `%USG` quand la correction n'est pas applicable : `minutes_équipe` absente ou implausible (hors fourchette [150, 300] par match — saisie « collectif » sans lignes individuelles, colonne MIN non reconnue à l'import…), ou joueur ayant joué moins de 5 minutes (le facteur d'amplification y produirait des usages > 100 % pour 2-3 possessions de fin de match).

---

## 5. Facteurs de victoire & impact joueur (PCA)

Fichier source : [`src/data/pca.ts`](../src/data/pca.ts)

### 5.1 Facteurs de victoire

Corrélation de Pearson entre chaque statistique collective (2%, 3%, rebonds, pertes de balle, ORtg, DRtg…) et le résultat du match (victoire = 1, défaite = 0). Nécessite au moins 4 matchs.

### 5.2 Impact joueur

Pour chaque joueur, corrélation de Pearson entre son évaluation match par match et le résultat de l'équipe (victoire/défaite). Un lien positif signifie que ses bons matchs coïncident avec des victoires — **corrélation, pas causalité**. Nécessite au moins 5 matchs avec évaluation.

### 5.3 Analyse en composantes principales (PCA)

Réduction des statistiques collectives de chaque match à 2 axes (PC1/PC2) via `ml-pca` (centré-réduit), pour visualiser en 2D la structure des performances et le pourcentage de variance expliquée par chaque axe.

---

## 6. Alertes de risque (règles explicites, pas de ML)

Fichier source : [`src/data/crossAnalysis.ts`](../src/data/crossAnalysis.ts) — fonction `detectRiskAlerts`

| Règle | Déclencheur |
|---|---|
| **R1** | ACWR > 1,5 pendant au moins 3 jours consécutifs |
| **R2** | Pic de charge/fraîcheur (ACWR > 1,5 ou TSB ≤ -30) suivi sous 10 jours d'une évaluation match ≥ 2 pts (ou 1 écart-type) sous la moyenne perso de la saison |
| **R3** | Blessure survenue dans les 14 jours suivant un pic de charge/fraîcheur |
| **R4** | Chute du score bien-être ≥ 2 pts d'une semaine à l'autre, alors que la charge hebdo est en zone « Élevée » ou « Surcharge » |

Une seule alerte par règle et par joueur (épisode le plus récent retenu).

---

## 7. Analyse tactique (rentabilité)

Fichier source : [`src/data/tacticalAnalysis.ts`](../src/data/tacticalAnalysis.ts)

Pour chaque catégorie d'action tactique disposant d'une dimension « Valeur » (points générés/concédés par l'action) :

```
rentabilité(option) = Σ valeur des actions ayant cette option / nb d'actions ayant une valeur
répartition%(option) = nb d'actions avec cette option / nb total d'actions de la dimension
```

Seuils de coloration de la rentabilité, configurables par catégorie (défauts : vert ≥ 1, bleu ≥ 0,6, orange ≥ 0,3, sinon rouge).

Une **matrice croisée** entre deux dimensions d'une même catégorie ne compte que les actions renseignées sur les deux dimensions à la fois.

---

## 8. Statistiques collectives & normalisation

Fichier source : `src/pages/PerformanceCollectivePage.tsx`

- Moyennes par match, pourcentages aux tirs (`réussis / tentés × 100`), agrégés par équipe.
- **Normalisation « pour 25 minutes »** (option `normalize25`) : permet de comparer des joueurs à temps de jeu différent en ramenant leurs stats à un volume de jeu standard :
  ```
  facteur = 25 / minutes_moyennes_jouées
  stat_normalisée = stat_brute × facteur
  ```

---

## 9. Assiduité

Fichier source : `src/pages/AttendancePage.tsx`, `src/data/crossAnalysis.ts`

```
% présence = nb séances "présent" ou "en retard" / nb séances programmées × 100
```

En analyse croisée, calculé en fenêtre glissante de **28 jours**. Coloration : ≥ 85 % vert, ≥ 70 % orange, sinon rouge.

---

## 10. Objectifs joueur/équipe

Fichier source : [`src/utils/objectiveStatus.ts`](../src/utils/objectiveStatus.ts)

Chaque objectif (indicateur + comparateur `≥`/`≤`/`=` + seuil) est évalué sur 3 fenêtres fixes, indépendamment du filtre de période actif sur la page :

```
valeur_fenêtre = moyenne des valeurs de l'indicateur sur la fenêtre
atteint = comparateur(valeur_fenêtre, seuil)
```

Fenêtres : **dernier match**, **3 derniers matchs**, **saison complète**. `null` si aucune donnée sur la fenêtre (pas de verdict plutôt qu'un faux « non atteint »).

---

## 11. Médical

Fichier source : `src/components/MedicalCard.tsx`, `src/pages/PerformanceIndividuellePage.tsx`

```
jours_indisponibilité = arrondi( (date_retour_terrain − date_blessure) en jours )
```

Cumulé sur la saison pour obtenir le total de jours d'indisponibilité d'un joueur.

---

## Récapitulatif des seuils & constantes clés

| Constante | Valeur | Usage |
|---|---|---|
| ACWR — sous-charge | < 0,8 | zone de charge |
| ACWR — zone optimale | 0,8 – 1,3 | zone de charge |
| ACWR — risque modéré | 1,3 – 1,5 | zone de charge |
| ACWR — risque élevé | > 1,5 | zone de charge, alerte R1 |
| TSB — surmenage | ≤ -30 | fraîcheur, alerte R2/R3 |
| TSB — chargé | -30 à -10 | fraîcheur |
| TSB — zone optimale | -10 à 5 | fraîcheur |
| TSB — frais | > 5 | fraîcheur |
| ATL — constante de temps | 7 jours | modèle de Banister |
| CTL — constante de temps | 42 jours | modèle de Banister |
| Charge hebdo — normale (défaut) | ≤ 2750 UA | configurable par club |
| Charge hebdo — élevée (défaut) | ≤ 4250 UA | configurable par club |
| Bien-être — bon | ≥ 7 | statut |
| Bien-être — moyen | ≥ 5 | statut |
| Corrélation — seuil de significativité (α) | 0,05 | test de Pearson |
| Corrélation — nb minimum d'observations | 5 | garde-fou |
| Facteurs de victoire — nb minimum de matchs | 4 | garde-fou |
| Impact joueur — nb minimum de matchs | 5 | garde-fou |
| Présence — bonne | ≥ 85 % | assiduité |
| Présence — moyenne | ≥ 70 % | assiduité |
| Normalisation stats | pour 25 min jouées | comparaison équitable |
