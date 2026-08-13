# Formules et calculs de l'application

Documentation de référence de tous les calculs statistiques/sportifs utilisés dans l'app, par thème. Pour chaque formule : le fichier source, la formule, et son interprétation.

---

## 0. Règle des moyennes d'équipe

Fichier source : [`src/utils/teamAverage.ts`](../src/utils/teamAverage.ts)

> **Tout chiffre d'équipe est la moyenne NON PONDÉRÉE des valeurs individuelles des joueuses du périmètre affiché.**

On agrège en deux étapes : d'abord la valeur de chaque joueuse, **puis** la moyenne des joueuses. Jamais une moyenne à plat des lignes brutes.

```
valeur_joueuse = moyenne de ses propres saisies
chiffre_équipe = moyenne non pondérée des valeur_joueuse
```

### Pourquoi

Une moyenne à plat des saisies revient à pondérer par l'assiduité :

```
moyenne_à_plat = Σ (n_joueuse × moyenne_joueuse) / Σ n_joueuse
```

Deux blessées qui arrêtent de loguer feraient donc **monter** le RPE moyen d'équipe sans que personne se soit entraîné plus dur ; des joueuses qui vont mal et saisissent moins feraient **monter** le score de bien-être. Comme l'assiduité est suivie comme un indicateur à part entière, la laisser pondérer les autres mélange deux signaux et en compte un deux fois.

L'écart entre les deux méthodes vaut exactement :

```
moyenne_à_plat − moyenne_équipe = Cov(n_joueuse, moyenne_joueuse) / n̄
```

Les deux coïncident donc au centième dès que toutes les joueuses ont le même nombre de saisies — l'écart mesure précisément l'hétérogénéité de l'assiduité.

### Deux corollaires

**Vérifiable à l'œil** : le chiffre d'équipe est toujours égal à la moyenne de la colonne de valeurs individuelles affichée en dessous. C'est la réconciliation que fait le staff, et elle est garantie par les tests de [`teamAverage.test.ts`](../src/utils/teamAverage.test.ts).

**La recomposition dans le temps n'est PAS exacte** : la valeur d'une période n'est pas la moyenne des valeurs de ses semaines. Ce n'est pas un bug. Aucune formule ne peut offrir les deux réconciliations à la fois dès que l'assiduité varie — contre-exemple minimal :

| | Semaine 1 | Semaine 2 | moyenne perso |
|---|---|---|---|
| Alice | 6 | 6 | 6 |
| Bea | 10 | — | 10 |
| **moyenne de la semaine** | **8** | **6** | |

Par joueuse : `(6 + 10) / 2` = **8**. Par semaine : `(8 + 6) / 2` = **7**. L'app choisit l'axe **joueuse**.

### Cas où la moyenne simple suffit

Sur **une seule séance** ou **un seul jour**, chaque joueuse n'a qu'une saisie : la moyenne à plat est déjà une voix par joueuse. Ces lignes utilisent donc `roundedAvg` directement (colonne RPE du tableau des séances, points de la timeline quotidienne). De même pour toute valeur mono-joueuse (historique d'une joueuse, comparaisons individuelles).

### Le `n` doit être affiché

Une moyenne non pondérée est nerveuse sur petit échantillon : une joueuse ayant une seule saisie pèse autant qu'une en ayant dix. `TeamAverage` transporte donc `players` à côté de `value`, et l'interface l'affiche systématiquement (« 6,2 · 8 joueurs »).

---

## 1. Charge d'entraînement & RPE

Fichier source : [`src/utils/rpe.ts`](../src/utils/rpe.ts), [`src/utils/weeklyLoad.ts`](../src/utils/weeklyLoad.ts)

### 1.1 Charge de séance (méthode RPE de Foster)

```
charge_séance (UA) = RPE (0-10) × durée réelle (min)
```

Si aucune durée réelle n'est saisie, on retombe sur la durée planifiée (`actualDuration ?? plannedDuration`). UA = « unités arbitraires », l'unité standard de la méthode RPE-based training load.

### 1.2 RPE moyen

Pour **une joueuse**, une **séance** ou un **jour** — une seule saisie par joueuse, donc moyenne simple ([`roundedAvg`](../src/utils/avg.ts)) :

```
RPE_moyen = (Σ RPE) / n     — arrondi à 1 décimale
```

Pour **l'équipe sur plusieurs séances** (période, semaine, saison) — règle du § 0, via [`teamAvgRpe`](../src/utils/rpe.ts) :

```
RPE_joueuse = (Σ ses RPE) / ses n saisies
RPE_équipe  = (Σ RPE_joueuse) / nb joueuses ayant saisi
```

Surfaces concernées : KPI de période et de saison (page RPE, Performance collective, Dashboard), vue « Semaine » du tableau d'historique, graphiques hebdo, lignes « RPE moyen » des comparaisons de groupes.

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

### 1.6 Charge hebdomadaire moyenne

**Une joueuse** ([`averageWeeklyLoad`](../src/utils/weeklyLoad.ts)) : moyenne **uniquement sur ses semaines actives** (≥ 1 séance) — une semaine creuse (blessure, trêve) n'entre pas dans le dénominateur, sinon la moyenne chute artificiellement.

**L'équipe** ([`teamAvgWeeklyLoad`](../src/utils/weeklyLoad.ts)) : règle du § 0, en deux étapes.

```
charge_hebdo_joueuse = moyenne de ses charges hebdo, sur SES semaines actives
charge_hebdo_équipe  = moyenne non pondérée des charge_hebdo_joueuse
```

Une semaine sans séance d'une joueuse ne compte **pas** comme un zéro : ce serait mélanger la charge absorbée et la disponibilité, suivie séparément (§ 3, Assiduité).

À noter : la charge d'**une** semaine (`weeklyLoadBuckets`, § 1.5) était déjà conforme à la règle — `charge totale ÷ joueuses distinctes` est exactement la moyenne non pondérée des charges hebdo individuelles. Seule l'agrégation de **plusieurs** semaines nécessitait une fonction dédiée.

#### Exemple — pourquoi une voix par joueuse et pas une voix par semaine

4 semaines. Alice et Bea s'entraînent les 4 ; Chloé revient de blessure en semaine 4 (2 séances allégées).

| Joueuse | S1 | S2 | S3 | S4 | sa moyenne |
|---|---|---|---|---|---|
| Alice | 3100 | 3100 | 3100 | 3100 | 3100 |
| Bea | 2890 | 2890 | 2890 | 2890 | 2890 |
| Chloé | — | — | — | 740 | 740 |
| **charge/joueuse de la semaine** | 2995 | 2995 | 2995 | 2243 | |

- Une voix par **semaine** : `(2995 × 3 + 2243) / 4` = **2807 UA** → zone *Soutenue*
- Une voix par **joueuse** : `(3100 + 2890 + 740) / 3` = **2243 UA** → zone *Normale*

Chloé n'est active qu'une semaine sur quatre : la première méthode dilue son effet à un quart, la seconde lui donne une voix entière. Cet exemple est encodé dans [`weeklyLoad.test.ts`](../src/utils/weeklyLoad.test.ts).

**Inchangé par ce choix** : le compteur « Semaines surcharge » (il lit les valeurs hebdo, identiques dans les deux méthodes) et les zones de surcharge **par joueuse** du classement, qui constituent la véritable détection de surcharge et ne passent par aucune moyenne d'équipe.

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

### 2.5 Moyennes d'équipe

Deux calculs distincts, à ne pas confondre.

**Un chiffre agrégé sur plusieurs jours** (KPI de période, de saison, comparaisons de groupes, radar POMS en vue équipe) — règle du § 0, via [`teamWellnessAvg`](../src/utils/wellness.ts) :

```
score_joueuse = moyenne de ses saisies sur la période
score_équipe  = moyenne non pondérée des score_joueuse
```

C'est essentiel sur un indicateur d'alerte : avec une moyenne à plat des saisies, un groupe qui saisit **moins** quand il va mal voit son score d'équipe **remonter** mécaniquement. Exemple ([`wellness.test.ts`](../src/utils/wellness.test.ts)) — Alice saisit 4 fois à 8/10, Bea une fois à 3/10 : moyenne à plat **7,0** (Bea est presque effacée) contre **5,5** avec la règle.

**Un point de série quotidienne** (graphiques d'évolution, corrélations) — [`aggregateTeamWellnessDaily`](../src/utils/wellness.ts) : une entrée synthétique par jour, chaque dimension étant la moyenne d'équipe des joueuses ayant saisi ce jour-là. Pas de report d'une saisie manquante. Cette fonction applique elle aussi la règle par joueuse, pour qu'une joueuse saisissant deux fois le même jour ne compte pas double.

⚠️ En vue équipe, ne jamais calculer une moyenne de période **à partir de la série quotidienne** : cela donnerait une voix par jour. `WellnessPomsPanel` reçoit donc deux jeux de données — `entries` (saisies brutes, pour les moyennes) et `series` (agrégat quotidien, pour les courbes).

### 2.6 Axe le plus dégradé (alerte)

Sur un ensemble d'entrées, l'axe (ressenti) le plus bas parmi tous les joueurs/jours, retenu seulement s'il est sous un seuil (5 par défaut).

---

## 2bis. Assiduité (présences)

Fichier source : [`src/utils/attendance.ts`](../src/utils/attendance.ts)

Une joueuse **en retard compte comme présente** : elle a participé à la séance.

**Une joueuse** (`presenceRate`) :

```
taux_joueuse = présences / séances où elle était attendue     — en %, arrondi à l'entier
```

**L'équipe** (`teamPresenceRate`) — règle du § 0 :

```
taux_équipe = moyenne non pondérée des taux_joueuse
```

Et non `Σ présences / Σ attendus`, qui pondère par le nombre de séances attendues de chaque joueuse. Exemple ([`attendance.test.ts`](../src/utils/attendance.test.ts)) — Alice présente à 20/20 séances, Bea arrivée en cours de saison absente à 0/2 : la somme des ratios donne **91 %** (Bea disparaît), la règle donne **50 %**.

« La joueuse type est présente à 82 % » est ce que le staff veut lire, pas « 82 % des présences attendues ont eu lieu ».

Seuils de couleur, identiques joueuse et équipe : ≥ 85 % vert, ≥ 70 % orange, sinon rouge.

Le **% de présence sur 28 jours glissants** utilisé par les corrélations et les objectifs reste un calcul par joueuse (`presenceSeries`, [`crossAnalysis.ts`](../src/data/crossAnalysis.ts)).

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

### Agrégation sur une période — ne jamais moyenner un ratio

Fichier source : [`calcPlayerAdvancedForPeriod`](../src/data/playerAdvanced.ts)

> **Un ratio s'agrège en sommant son numérateur et son dénominateur, puis en divisant. Jamais en moyennant les ratios de chaque match.**

```
eFG%_période = (Σ tirs_réussis + 0,5 × Σ 3pts_réussis) / Σ tirs_tentés × 100
```

Moyenner les eFG% match par match donnerait le même poids à un match à 1 tir qu'à un match à 20 tirs. Sur 4 matchs dont une entrée de 2 minutes où la joueuse rentre son unique tir, un 3 points :

| Match | Réussis | 3pts | Tentés | eFG% du match |
|---|---|---|---|---|
| M1 | 7 | 2 | 18 | 44,4 % |
| M2 | 5 | 1 | 14 | 39,3 % |
| M3 | 9 | 3 | 18 | 58,3 % |
| M4 *(2 min)* | 1 | 1 | 1 | 150,0 % |

Moyenne des ratios : **73,0 %**. Ratio des sommes : **50,0 %**. Cas encodé dans [`playerAdvanced.test.ts`](../src/data/playerAdvanced.test.ts).

**Deux périmètres de matchs distincts**, et c'est volontaire :

| Indicateurs | Matchs retenus | Pourquoi |
|---|---|---|
| `%USG`, `%USG/min`, `%PD`, `%TREB`, `%OREB`, `%DREB`, points générés | seulement ceux ayant une ligne `team_match_stats` | sinon le numérateur grossit sans son dénominateur |
| `eFG%`, `FT Rate`, `BP/poss`, `ORtg`, `%BP` | tous | ne dépendent que du joueur, on garde le maximum d'échantillon |

**Points générés** est le seul champ avancé qui n'est pas un ratio mais un volume (des points) : il est affiché en **moyenne par match**, homogène avec les colonnes Points / Rebonds / Passes voisines (`perMatchPtsProd`).

**Le mode « 25 min »** ne s'applique qu'aux volumes. Un ratio est par construction indépendant du temps de jeu — le ramener à 25 minutes n'aurait pas de sens.

**La série par match reste inchangée.** Un eFG% de match donné est une observation légitime : les graphiques d'évolution et les corrélations l'utilisent tel quel. Seule son *agrégation* posait problème. C'est pourquoi le correctif passe par un hook `periodValue` sur `IndicatorDef`, distinct de `playerSeries`, résolu par [`periodValueOf`](../src/data/crossAnalysis.ts) — point d'entrée unique du classement joueurs et des objectifs.

**Volumes : la moyenne porte sur les MATCHS, pas sur les dates.** La série est indexée par date, donc deux matchs joués le même jour (plateau, tournoi) n'y forment qu'un point. Sans `periodValue`, le classement compterait cette journée comme une seule observation alors que les tableaux font somme ÷ nombre de matchs. Tous les indicateurs du domaine match définissent donc un `periodValue` — un test le vérifie indicateur par indicateur.

**Précision d'affichage.** `IndicatorDef.decimals` porte la précision de l'indicateur (0 pour les % de tir, comme dans les tableaux ; 1 par défaut). Sans ça, le classement affichait `34,8 %` là où le tableau affichait `35 %`.

Les tableaux de stats avancées affichent les deux lectures de l'usage côte à côte :

- **%USG** : part des possessions de l'équipe utilisées par le joueur sur l'ensemble du match — dépend donc mécaniquement de son temps de jeu (un remplaçant très sollicité sur 8 minutes reste bas).
- **%USG/min** : la même part rapportée aux minutes réellement jouées (`minutes_équipe` = Σ des minutes de tout l'effectif sur les matchs couverts, ≈ 5 × durée du match) — répond à « quand il est sur le terrain, quelle part des possessions prend-il ? ».

`%USG/min` retombe silencieusement sur `%USG` quand la correction n'est pas applicable : `minutes_équipe` absente ou implausible (hors fourchette [150, 300] par match — saisie « collectif » sans lignes individuelles, colonne MIN non reconnue à l'import…), ou joueur ayant joué moins de 5 minutes (le facteur d'amplification y produirait des usages > 100 % pour 2-3 possessions de fin de match). Les deux colonnes étant affichées côte à côte, ce repli se lit à l'œil : les deux valeurs sont alors égales.

**Où chaque lecture est utilisée**

| Surface | Lecture |
|---|---|
| Boxscore avancé, classement joueurs, comparaisons, objectifs, corrélations | les deux, sélectionnables (`adv_usagePctRaw` et `adv_usagePct`) |
| Archétypes (`featureRegistry`) | `%USG/min` uniquement — un profil doit décrire un comportement de jeu, pas un volume de temps de jeu |

⚠️ Ne jamais nommer une de ces colonnes « USG% » tout court : c'est l'ambiguïté qui a fait ressortir une joueuse à faible temps de jeu en tête du classement d'usage.

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

La valeur d'une fenêtre passe par [`periodValueOf`](../src/data/crossAnalysis.ts) : ratio de sommes pour les ratios, moyenne sur les matchs pour les volumes (cf. § 4). Les fenêtres sont traduites en bornes de dates depuis les matchs joués — « 3 derniers matchs » désigne bien 3 matchs, pas 3 journées.

### 10.1 Rattachement à une saison

Un objectif appartient à une **saison**, pas à l'équipe en général (colonne `objectives.season_id`). Sans ça, un objectif défini en 2024-2025 restait affiché et évalué sur les matchs de la saison suivante.

Corollaire : au changement de saison, les objectifs de l'an passé n'apparaissent plus. Le report est **explicite** (`objectivesApi.copyFromSeason`, bouton « Reprendre la saison passée ») — un objectif de l'an dernier n'est pas forcément encore pertinent, et une reprise automatique ferait s'accumuler des objectifs périmés. La copie ignore les indicateurs déjà présents sur la saison cible, donc un second clic ne crée pas de doublons.

Même règle pour les **tâches** (`player_actions.season_id`), avec le même principe : un bandeau signale les tâches non terminées de la saison précédente et propose de les reporter, sans jamais le faire d'office.

### 10.2 Objectifs sur la fiche match

[`evaluateObjectiveAt`](../src/utils/objectiveStatus.ts) évalue un objectif sur **un seul match**, pour l'onglet « Objectifs » de la fiche match. Renvoie `null` hors du domaine match : un objectif de RPE ou de bien-être n'a rien à dire d'un match donné.

Aucune requête de statistiques n'est ajoutée — le périmètre d'évaluation est reconstruit depuis les stats du match déjà chargées par la page.

---

## 11. Médical

Fichier source : `src/components/MedicalCard.tsx`, `src/pages/PerformanceIndividuellePage.tsx`

```
jours_indisponibilité = arrondi( (date_retour_terrain − date_blessure) en jours )
```

Cumulé sur la saison pour obtenir le total de jours d'indisponibilité d'un joueur.

---

## 12. Archétypes — fiabilité vs limite de méthode

Fichiers source : [`src/data/archetypes/`](../src/data/archetypes/)

Deux informations distinctes accompagnent un score d'archétype. Elles étaient affichées dans le même point d'interrogation, si bien qu'on lisait une explication sur la méthode là où on cherchait à savoir si le chiffre était solide.

| Information | Porté par | Dépend de | Affichage |
|---|---|---|---|
| **Fiabilité** du score | `confidenceNote(confidence, sampleSize)` | la joueuse (matchs et minutes jouées) | badge `?`, une ligne sur deux |
| **Limite de méthode** du profil | `caveat` de la définition | le profil, jamais la joueuse | badge « Estimation » sur la fiche, note sous le tableau d'équipe |

Le message de fiabilité annonce explicitement le manque de données et le décompte (« Trop peu de données pour que ce score soit significatif (3 matchs, 24 min jouées) »). Un test vérifie qu'il ne parle jamais de méthode.

Le `caveat` étant une propriété du profil, il est affiché **une fois** sous le classement d'équipe plutôt que répété en tooltip sur chaque ligne.

### 12.1 Ce qu'un profil promet doit correspondre à ce qu'il mesure

Un profil est un jeu d'indicateurs pondérés ; son libellé ne doit rien promettre que ces indicateurs ne mesurent. Deux corrections issues de cette règle :

- « Moteur d'énergie » (rebond offensif + fautes provoquées) est devenu **« Présence au rebond et au contact »**. Un moteur d'énergie se reconnaît aux déviations, ballons libres récupérés et écrans — aucune de ces données n'est saisie.
- **« Intérieur shooteur (stretch 5) »** ajouté : il manquait. Volume ET adresse à 3 points, avec un poids négatif sur le rebond offensif — une intérieure qui reste au cercle est l'inverse d'un profil qui écarte le jeu.

⚠️ `fte` = fautes **reçues** (provoquées), `fpr` = fautes **commises**. Le schéma, le formulaire d'import et `featureRegistry` concordent ; le registre d'indicateurs avait les deux libellés inversés, si bien que « Fautes commises » affichait les fautes provoquées dans le classement, les objectifs et les corrélations.

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
