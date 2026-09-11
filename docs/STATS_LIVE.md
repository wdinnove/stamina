# Prise de statistiques en direct — plan

Objectif : un écran qui permet de **pointer un match action par action**, et d'en dériver le
boxscore, le temps de jeu, les zones de tir et le +/-. Aujourd'hui le boxscore n'entre dans
l'application que par **import CSV** (`MatchStatsImportModal`), donc toujours après le match et
toujours dépendant d'un fichier eMarque.

**Hors périmètre de ce document : les plays.** Le suivi par système attaque/défense existe déjà
(`plays`, `match_live_actions`, onglet « Suivi live ») et reste tel quel — voir
[§ 8](#8-articulation-avec-le-suivi-live-existant).

---

## 1. Point de départ — ce qui existe déjà

| Brique | Fichier | État |
|---|---|---|
| Boxscore par joueuse | `match_stats` + [`stats.ts`](../src/api/stats.ts) | ✅ complet, alimenté par CSV uniquement |
| Stats collectives | `team_match_stats` (+ vue `_full`) | ✅ eFG%, FT Rate, %BP, %REB, ratings — tout en colonnes générées |
| Chrono de match | [`useMatchClock.ts`](../src/hooks/useMatchClock.ts) | ✅ QT + prolongations, ajustable — **non persisté** |
| Rotations 2 bancs | `match_lineup_events` | ✅ instantané `on_court` à chaque changement |
| Temps de jeu | `playingTime()` dans [`liveTrackingAnalysis.ts`](../src/data/liveTrackingAnalysis.ts) | ✅ calculé, **jamais écrit dans `match_stats.min`** |
| Feuille de match | `match_roster` | ✅ |
| Effectif adverse | `match_opponent_players` | ✅ saisi à la volée |
| Terrain FIBA en mètres | [`diagram.ts`](../src/utils/diagram.ts) `HALF` + [`DiagramCourt.tsx`](../src/components/DiagramCourt.tsx) | ✅ demi-terrain 15 × 14 m, toutes les cotes |
| Aval analytique | `playerAdvanced`, PCA, archétypes, Four Factors, objectifs, rapports | ✅ tout part de `match_stats` |

**Il manque exactement un maillon : `joueuse × action × position`.** Le reste de la chaîne est en
place des deux côtés.

---

## 2. Ce qui se fait ailleurs

| Outil | À retenir |
|---|---|
| **eMarque V2 / FIBA LiveStats** | Play-by-play exhaustif, tir positionné sur le terrain, boxscore live, PDF officiel. Conçu pour **deux opérateurs de table** — hors de portée d'un coach seul. |
| **Hudl Instat / Synergy** | Tagging **après match, sur vidéo**. La valeur est dans les zones et les lineups, pas dans la vitesse de saisie. |
| **Swish / Easystats / GameChanger** | Un opérateur : geste **joueuse → action** en 2 taps, chaînage après un tir raté, undo permanent, **offline obligatoire**, lien de suivi public. |
| **Cleaning the Glass / PBP Stats** | Tout est **dérivé** d'un flux d'événements brut. Rien de pré-agrégé en base. |

Trois constantes chez tous, qui structurent ce plan :

1. **On stocke l'événement brut, on dérive tout le reste.** Une zone de tir stockée en dur, c'est
   un découpage figé pour toujours.
2. **Le geste tient en 2 ou 3 taps**, sinon la saisie décroche du jeu et l'écran est abandonné au
   bout d'un quart-temps.
3. **Ça marche sans réseau.** Un gymnase n'a pas de 4G.

---

## 3. Décision d'architecture

> **Une table d'événements. Le boxscore, le score, le temps de jeu, le +/- et les zones en sont
> tous dérivés — rien n'est saisi deux fois.**

Le point d'ancrage qui rend le chantier petit :

```
match_events  ──boxscoreFromEvents()──▶  BulkStatRow[]  ──statsApi.bulkUpsertForMatch()──▶  match_stats
```

`boxscoreFromEvents` est une fonction **pure**, testable sans DOM ni base, exactement comme
`liveTrackingAnalysis.ts` ou `tacticalAnalysis.ts`. Elle produit le type `BulkStatRow` qui existe
déjà. Donc dès la phase 0, **sans toucher une ligne en aval** : stats avancées, Four Factors, PCA,
archétypes, corrélations, objectifs, classements et rapports PDF fonctionnent sur des données
pointées en direct.

Ce qui n'est **pas** fait, et volontairement :

- **Pas de table de zones.** `x, y` en mètres, `shotZone(x, y)` est une fonction pure. Redécouper
  les zones dans six mois ne coûte rien et ne perd aucun tir.
- **Pas de colonne `points` par événement.** La valeur 2/3 se déduit de la géométrie
  (`shotValue`). Une colonne `value` existe uniquement pour les tirs saisis **sans** position
  (mode rapide), sinon elle reste NULL.
- **Pas de lien avec les plays.** Quand la question reviendra, une colonne nullable
  `possession_seq SMALLINT` suffira à rattacher un événement à sa possession. Rien à prévoir
  aujourd'hui.
- **Pas d'`id` sur la table.** Clé naturelle `(match_id, seq)`, comme `match_live_actions` et
  `tactical_actions` — le rang d'insertion suffit à ordonner.

---

## 4. Modèle de données

Bloc à coller dans `schema.sql` puis à exécuter dans le SQL Editor Supabase (convention du repo :
migrations manuelles, pas de CLI).

```sql
-- ================================================================
-- MIGRATION — Prise de statistiques en direct (match_events)
-- ================================================================
-- Une ligne par action de jeu ATTRIBUÉE (par opposition à match_live_actions, qui est une ligne
-- par POSSESSION, sans auteur). Les deux flux cohabitent sans se recouvrir : celui-ci répond à
-- « qui a fait quoi, d'où », celui-là à « ce système rapporte-t-il des points ».
--
-- Le score, le boxscore, le temps de jeu, le +/- et les zones sont TOUS dérivés de cette table :
-- aucune valeur agrégée n'y est stockée. `match_stats` n'est écrite qu'au moment explicite de la
-- publication (bouton du tracker), jamais en continu.
--
-- Coordonnées : repère du DEMI-TERRAIN de `utils/diagram.ts` (u = largeur 0..15, v = profondeur
-- 0..14, panier en (7.5, 1.575)), en MÈTRES — le même que les schémas d'exercice, donc les mêmes
-- constantes `HALF` servent au rendu et au calcul de zone. Tous les tirs du match sont ramenés
-- sur ce demi-terrain unique, quel que soit le panier réellement attaqué.

CREATE TABLE IF NOT EXISTS match_events (
  match_id          UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq               SMALLINT NOT NULL,
  quarter           SMALLINT NOT NULL,
  game_time_seconds INTEGER  NOT NULL,

  -- 'us' / 'them' : même convention que match_lineup_events.
  side              TEXT     NOT NULL CHECK (side IN ('us', 'them')),

  -- Auteur. NULL est un cas NORMAL et fréquent côté 'them' : on suit l'adversaire en agrégé
  -- (un rebond adverse, un panier encaissé) sans nommer le joueur. Un CHECK interdit de
  -- renseigner les deux à la fois.
  player_id          UUID REFERENCES players(id),
  opponent_player_id UUID REFERENCES match_opponent_players(id) ON DELETE SET NULL,

  type TEXT NOT NULL CHECK (type IN (
    'shot',        -- tir du champ (2 ou 3 pts, déduit de la position)
    'ft',          -- lancer franc
    'reb_off', 'reb_def',
    'ast',         -- passe décisive
    'stl',         -- interception
    'blk',         -- contre
    'tov',         -- ballon perdu
    'foul',        -- faute commise
    'foul_drawn'   -- faute reçue
  )),

  -- Réussite. Obligatoire pour 'shot' et 'ft', interdit ailleurs.
  made BOOLEAN,

  -- Position du tir, uniquement pour 'shot'. NULL = tir saisi en mode rapide, sans position :
  -- il compte dans le boxscore mais pas dans le shot chart.
  x NUMERIC(4,2) CHECK (x >= 0 AND x <= 15),
  y NUMERIC(4,2) CHECK (y >= 0 AND y <= 14),

  -- Valeur 2 ou 3 FIGÉE, uniquement pour un 'shot' sans position. Avec position, elle est
  -- dérivée par shotValue(x, y) et cette colonne reste NULL — un seul endroit fait autorité.
  value SMALLINT CHECK (value IN (2, 3)),

  -- Instantanés au moment de l'action, comme match_live_actions : lire un +/- ou une stat de
  -- cinq ne demande jamais de rejouer l'historique des changements.
  on_court      UUID[] NOT NULL DEFAULT '{}',
  on_court_them UUID[] NOT NULL DEFAULT '{}',

  PRIMARY KEY (match_id, seq),

  CONSTRAINT event_one_author CHECK (player_id IS NULL OR opponent_player_id IS NULL),
  CONSTRAINT event_made_only_on_shots CHECK (
    (type IN ('shot', 'ft') AND made IS NOT NULL) OR
    (type NOT IN ('shot', 'ft') AND made IS NULL)
  ),
  CONSTRAINT event_position_only_on_shots CHECK (
    type = 'shot' OR (x IS NULL AND y IS NULL AND value IS NULL)
  ),
  CONSTRAINT event_position_xor_value CHECK (
    type <> 'shot' OR (x IS NOT NULL AND y IS NOT NULL AND value IS NULL)
                   OR (x IS NULL AND y IS NULL AND value IS NOT NULL)
  )
);

CREATE INDEX ON match_events (match_id, player_id);

ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_events_select" ON match_events;
CREATE POLICY "match_events_select" ON match_events
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));

DROP POLICY IF EXISTS "match_events_write" ON match_events;
CREATE POLICY "match_events_write" ON match_events
  FOR ALL TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- Vérification
--   SELECT to_regclass('match_events');
```

Les quatre `CHECK` de cohérence ne sont pas de la décoration : ils empêchent qu'un bug de saisie
produise un événement à moitié renseigné qui fausse silencieusement un boxscore. C'est la
frontière de confiance, on ne la simplifie pas.

**Volume** : ~250 à 400 événements pour un match entièrement pointé. `seq` en `SMALLINT` tient
largement.

---

## 5. Les fonctions pures

### `src/data/matchEvents.ts`

```ts
/** Boxscore par joueuse, prêt pour statsApi.bulkUpsertForMatch. */
export function boxscoreFromEvents(
  events: MatchEvent[],
  lineupEvents: MatchLineupEvent[],
  periodDurationSeconds: number,
  endQuarter: number, endElapsedSeconds: number,
): BulkStatRow[]

/** Totaux collectifs des deux côtés, pour team_match_stats. */
export function teamTotalsFromEvents(events: MatchEvent[]): CollectiveStatInput & { opponent: ... }

/** Score courant, dérivé — jamais saisi. */
export function scoreFromEvents(events: MatchEvent[]): { us: number; them: number }

/** +/- au point près (et non à la possession comme playerPlusMinus). */
export function plusMinusFromEvents(events: MatchEvent[]): Map<string, number>

/** Score cumulé après chaque panier, pour la courbe d'écart / les runs. */
export function scoreTimeline(events: MatchEvent[]): { t: number; us: number; them: number }[]
```

Mapping vers `BulkStatRow`, colonne par colonne :

| Colonne `match_stats` | Dérivation |
|---|---|
| `fg2a` / `fg2m` | `shot` de valeur 2, tentés / réussis |
| `fg3a` / `fg3m` | `shot` de valeur 3 |
| `fta` / `ftm` | `ft` |
| `pts` | colonne **générée en base** — rien à calculer |
| `ro` / `rd` | `reb_off` / `reb_def` |
| `pd` `ct` `intercepts` `bp` | `ast` `blk` `stl` `tov` |
| `fpr` / `fte` | `foul` / `foul_drawn` |
| `min` | `playingTime()` **existant**, ÷ 60, arrondi à 0,1 |
| `starter` | présente dans le premier `match_lineup_events` du Q1 |
| `plus_minus` | `plusMinusFromEvents` |
| `eval` | `(pts + ro + rd + pd + ct + intercepts + fte) − (tirs ratés + LF ratés + bp + fpr)` |

⚠️ **`eval` est aujourd'hui importée, jamais calculée dans l'app.** La formule ci-dessus est la
convention FIBA/FFBB, mais il faut la **vérifier contre un match déjà importé** avant de publier
quoi que ce soit : un écart d'une unité sur une colonne que le staff lit tous les dimanches
détruit la confiance dans tout l'écran.

**`possessions`** pour `team_match_stats` suit la formule « rythme » de
[CALCULS.md § 4](CALCULS.md) : `fga − ro + bp + 0,44 × fta`. Côté adverse, `opp_possessions` n'est
calculable **que si l'adversaire est pointé en détail** (tirs tentés + rebonds + pertes). Sinon on
laisse **NULL** — la colonne l'accepte, et `opp_to_pct` / `oreb_pct` s'éteignent proprement
plutôt que d'afficher un chiffre faux.

### `src/data/shotChart.ts`

```ts
/** 2 ou 3 points, déduit de la géométrie FIBA (constantes HALF). */
export function shotValue(x: number, y: number): 2 | 3

/** Zone d'appartenance — le découpage vit ICI et nulle part ailleurs. */
export function shotZone(x: number, y: number): ShotZone

/** Volume, réussite et eFG% par zone, pour un camp. */
export function zoneStats(events: MatchEvent[], side: LineupSide): ZoneStatRow[]
```

**Découpage : 10 zones.** Sur le demi-terrain, panier en (7,5 ; 1,575), angle mesuré depuis le
panier (0° = axe du panier, tiers gauche / axe / droite à ±30°) :

| Zone | Définition (constantes `HALF`) |
|---|---|
| Cercle | distance au panier ≤ `restrictedR` (1,25 m) |
| Raquette | `abs(x − 7,5) ≤ laneHW` et `y ≤ laneV`, hors cercle |
| Mi-distance gauche / axe / droite | reste des 2 pts, par tiers d'angle |
| Corner 3 gauche / droite | `x ≤ threeInset` (0,9) ou `x ≥ 14,1` |
| Arc 3 aile gauche / axe / aile droite | distance ≥ `threeR` (6,75 m), par tiers d'angle |

Test à écrire dans `shotChart.test.ts` : le passage corner → arc doit tomber exactement sur
`threeStopV` (2,99 m), valeur déjà vérifiée par `diagram.test.ts`. C'est le seul point de la
géométrie où une erreur d'un centimètre change la valeur d'un tir.

**Affichage** : jamais un pourcentage nu. Un match donne 5 à 8 tirs par zone — un « 100 % » sur
2 tentatives n'est pas une information. On applique la règle déjà posée dans
[CALCULS.md](CALCULS.md) (« le `n` doit être affiché ») : le volume est affiché à côté du taux, et
le taux est grisé sous 10 tentatives. Pas de heatmap continue, pas de hexbin — le volume d'une
saison de club ne les supporte pas.

---

## 6. L'écran

Un mode **plein écran, orienté paysage**, et non un onglet coincé sous la navigation de la fiche
match : pendant 90 minutes de saisie, chaque pixel de chrome est un pixel perdu.

```
┌────────────────────────────────────────────────────────────────────────────┐
│      NOUS                 Q3                  ADVERSAIRE                   │
│       42                06:12                      38                      │   ← bloc partagé
├────────────────────────────────────────────────────────────────────────────┤   avec le suivi live
│              ⏮   +10s   ▶   -10s   ⏭                                  ⚙   │
├────────────────────────────────────────────────────────────────────────────┤
│ DERNIÈRES ACTIONS  (✓3·Marie)(RD·Sarah)(✗2·Léa)(…)(…)   ⟲ Annuler   ▾ 47   │
├──────────────────┬──────────────────────────────────┬──────────────────────┤
│ NOUS 5/5    [☰]  │      ⇄  MODE CHANGEMENT          │ ADVERSAIRE 5/5  [☰]  │
│  ● Léa           │  ┌────────────────┬─────────────┐│  SUR LE TERRAIN      │
│  ● Marie       ◀ │  │  Tirs [Nous]   │ LANCERS FR. ││  ● 7  Dupont         │
│  ● Sarah         │  │                │ ┌────┬────┐ ││  ● 12 Martin       ◀ │
│  ● Anaïs         │  │  demi-terrain  │ │Réu.│Raté│ ││  ● 15 Bernard        │
│  ● Jade          │  │    (340 px)    │ └────┴────┘ ││  BANC                │
│  BANC            │  │   tap = tir    │ REBONDS     ││  ○ 9  Petit          │
│  ○ 5  Emma       │  │                │ ┌────┬────┐ ││ ┌──────────────────┐ │
│  ○ 8  Lou        │  └────────────────┤ │Reb.│Reb.│ ││ │  Sans joueuse    │ │
│                  │  Raquette · 2 pts │ │déf.│off.│ ││ └──────────────────┘ │
│                  │                   │ CRÉATION …  ││                      │
├──────────────────┴──────────────────────────────────┴──────────────────────┤
│  ▾ BOXSCORE EN DIRECT   (replié)                                           │
└────────────────────────────────────────────────────────────────────────────┘
```

### Les gestes — l'ordre est libre

**Tir (3 taps, dans l'ordre qu'on veut)**

```
joueuse → terrain → ✓/✗        on sait déjà qui
terrain → joueuse → ✓/✗        on fige l'endroit, on attribue ensuite
```

Les deux chemins produisent le même événement. Imposer « joueuse d'abord » était une erreur : la
**position est l'information périssable** — on oublie l'endroit exact d'un tir en deux secondes,
jamais qui a tiré. C'est aussi pourquoi FIBA LiveStats est position-d'abord. Quand le point est
posé en premier, l'écran affiche « Qui a tiré ? » et les `✓`/`✗` n'apparaissent qu'une fois
l'auteur désigné : la question posée est toujours la bonne, une seule à la fois.

La valeur 2/3 n'est jamais saisie : elle sort de la position.

**Toute autre action (2 taps, dans l'ordre qu'on veut)**

```
joueuse → bouton de la palette
bouton de la palette → joueuse
```

Même principe que pour les tirs, et pour la même raison : ce qui vient en premier à l'esprit
dépend de l'action. Une perte de balle, on voit le ballon partir avant de reconnaître qui l'a
perdu ; un rebond, on voit qui l'a pris. Un bouton tapé sans joueuse armée **reste allumé en
ambre** et l'écran demande « qui ? » — exactement comme un point posé sur le terrain.

Une seule chose attend son auteur à la fois : poser un tir désarme l'action en attente, et
inversement. `échap` annule ce qui attend.

La joueuse **reste sélectionnée** entre deux actions : une séquence tir raté → rebond offensif →
tir de la même joueuse ne demande pas de la re-désigner.

### Les changements sont derrière un mode explicite

**Un seul interrupteur pour les deux bancs**, posé au milieu de l'écran, à distance égale des deux
effectifs — il était dupliqué par colonne alors qu'il n'y a qu'un mode, et deux boutons pour un
même état, c'est une question de plus à se poser en match. Le bouton porte lui-même la consigne du
moment (« tape la sortante, puis l'entrante »), au lieu de la répéter dans chaque colonne.

**Hors de ce mode, aucun tap ne peut modifier la composition** ; dans le mode, le geste est celui
du suivi live (sortante puis entrante, ou l'inverse), et **les deux colonnes** passent en ambre
pour qu'on ne s'y trompe pas.

Une désignation en attente sur un banc ne peut pas se conclure sur l'autre : taper une joueuse
adverse après avoir désigné une des nôtres recommence de ce côté-là plutôt que de fabriquer un
changement croisé. C'est encodé dans `resolveSubstitution` et testé.

**Une joueuse est armable si elle est sur le terrain, ou si aucun cinq n'a encore été posé de son
côté.** Ce second cas n'est pas un trou : il permet de pointer des statistiques sans tenir les
rotations du tout. Dès qu'un cinq existe, le banc se verrouille.

Ce n'est pas du confort. La première version prenait comme sortante la joueuse « armée pour la
saisie » : sélectionner Marie pour pointer son rebond, puis taper Léa au banc, **faisait sortir
Marie** — un tap silencieux qui corrompait minutes, +/- et instantanés `onCourt`. La décision
« qui sort, qui entre » est désormais une fonction pure isolée (`resolveSubstitution`), avec un
test dédié à cette régression précise.

### Clavier

Trois raccourcis, pas trente. Les dix lettres d'action ont été retirées : autant de mnémoniques à
mémoriser, c'est une charge, pas un gain — la palette est déjà à portée de pouce.

Ils vivent dans une **modale**, ouverte par le `⚙` **à droite** de la barre de commandes, pas dans
une légende permanente : trois lignes de rappel occupaient la barre en continu pour une
information qu'on lit une fois. La barre est une grille `1fr / auto / 1fr`, donc les boutons du
chrono restent au milieu exact quelle que soit la largeur de ce qu'on ajoute à droite.

| Touche | Effet |
|---|---|
| `espace` | chrono marche/arrêt (même raccourci que le suivi live) |
| `c` | bascule le mode changement |
| `échap` | annule le tir en cours, la désignation de changement, ou la sélection |

Toute frappe est ignorée dès qu'un champ a le focus : le formulaire d'ajout de joueuse adverse est
sur le même écran, taper « Dupont » ne doit rien déclencher.

### Accusé de réception

Chaque action pointée apparaît en tête d'un bandeau **sous le score**, et le chip le plus récent
**s'allume en vert puis retombe** en 900 ms. C'est le seul retour dont on a besoin en match :
savoir que le tap a été pris, sans quitter des yeux le centre de l'écran. Cinq actions y sont
visibles — de quoi contrôler ce qu'on vient de faire ; au-delà c'est de la relecture, et ça vit
dans le dépliant (`▾`) à côté du compteur.

`⟲ Annuler` est dans ce même bandeau, à côté de ce qu'il va défaire.

### Analyse des lineups

Sous le boxscore, l'équivalent de « Cinq les plus vues » du suivi live — mais dérivé du flux
d'événements, donc mesuré à l'action près, et **daté** : `lineupStatsFromEvents` croise les
intervalles de composition (`lineupIntervals`, extrait de `playingTime` pour ne pas dupliquer le
découpage temporel) avec les instantanés portés par chaque événement.

| Colonne | Sens |
|---|---|
| Cinq | les cinq joueurs, triés |
| Temps | durée réelle de la combinaison sur le terrain |
| Poss. | possessions du camp observé pendant ce temps (formule du rythme) |
| Pts/poss. | rentabilité offensive de la combinaison |
| Pour / Contre / +/- | points marqués, encaissés, écart |

Le **temps** est ce que le suivi live ne pouvait pas donner (il compte des possessions, pas des
durées), et c'est ce qui rend le +/- lisible : un +8 en deux minutes et un +8 sur un quart-temps
entier ne disent pas la même chose. Disponible pour les deux camps, l'adversaire compris dès que
ses rotations sont suivies.

### Feuille de match

Bouton `☰ Feuille` dans la colonne d'effectif. **Elle est vide au départ** : on compose le groupe
du jour en cochant les joueurs retenus, plutôt qu'en écartant les absents d'un effectif de saison
entier. C'est le geste réel du coach avant un match, et c'est exactement ce qui sera écrit dans
`match_roster`.

Seuls les joueurs cochés apparaissent au banc et peuvent entrer en jeu. Un `Tout sélectionner`
couvre le cas — fréquent — où tout le monde est là. Tant que la feuille est vide, le bouton reste
en ambre : il n'y a rien à saisir avant elle.

Un joueur **déjà sur le terrain ne peut pas être décoché** — le sortir par ce biais laisserait un
« ? » dans l'historique déjà enregistré ; il faut un vrai changement.

### Hiérarchie visuelle

- **Le bloc score + chrono est LE MÊME objet que celui du suivi live** (`MatchScoreboard`, partagé
  par les deux écrans). Deux tables de marque différentes pour le même match se lisent deux fois.
- **Intitulés complets, pas d'acronymes.** « Rebond défensif », pas `RD` — un écran utilisé
  quelques fois par mois ne peut pas supposer un jargon mémorisé.
- **Palette groupée par thème, deux boutons par ligne** — Lancers francs, Rebonds, Création,
  Défense, Fautes. On vise le groupe puis le côté, au lieu de relire dix libellés.
- **Annuler** vit dans le bandeau des dernières actions, à côté de ce qu'il va défaire — pas noyé
  dans les réglages de chrono.
- **Toutes les cibles font 44 px**, en particulier les chips de banc : la plus petite cible de
  l'écran ne peut pas être celle qui déclenche une rotation.
- **Deux ambres, deux verts, jamais confondus.** L'ambre signale toujours « ça attend quelque
  chose de toi » : action armée, changement désigné, tir sans auteur. Le vert du chaînage après un
  tir n'est qu'une suggestion, il ne bloque rien.
- **Le compteur `n/5` ne se tronque jamais** : seul le nom d'équipe se réduit à côté de lui, et il
  passe en ambre tant que le cinq est incomplet.
- **Le boxscore et les cinq sont repliés par défaut** : personne ne lit 15 colonnes pendant un
  match. Chacun a son sélecteur d'équipe.
- **Saisie et lecture sont séparées.** Le terrain du haut sert à enregistrer : les deux camps y
  sont dessinés ensemble pour donner un retour immédiat, la **couleur** disant l'équipe et la
  **forme** la réussite (disque marqué, croix manqué). L'analyse vit dans la carte « Grilles de
  tir », en bas, où chaque équipe a sa carte propre avec son `réussis/tentés` et son pourcentage.
  Un sélecteur de camp sur le terrain de saisie faisait disparaître les tirs qu'on venait
  d'enregistrer.

### Chaînage

Après un tir raté, `RO`/`RD` passent en avant-plan pendant ~6 s. Après un tir réussi, c'est `PD`.
**Aucune modale bloquante, aucun bouton « passer »** : si le coach ne répond rien, la séquence
s'éteint toute seule. Une modale à chaque tir raté, c'est l'écran abandonné à la mi-temps.

### L'adversaire : nominatif quand on peut, anonyme quand on ne peut pas

Les joueurs adverses n'existent pas en base : ils se saisissent dans une **feuille adverse**,
symétrique de la nôtre — bouton `☰ Feuille` en tête de colonne, numéro + nom, **Entrée enchaîne**
et rend la main au champ numéro, de sorte qu'on tape la feuille de l'autre banc d'une traite sans
quitter le clavier. Une joueuse déjà référencée par une action pointée ou présente sur le terrain
ne peut plus en être retirée : l'effacer laisserait un « ? » dans l'historique.

Une fois saisis, ils se gèrent **exactement comme les nôtres** : même palette, même terrain, même
geste de changement, colonne scindée terrain / banc. Leur boxscore alimentera
`opponent_match_stats`.

Les rotations adverses sont donc pointées elles aussi (`match_lineup_events` avec `side = 'them'`,
la table le prévoit depuis le début), ce qui donne côté adverse **les minutes, le cinq de départ
et le +/-** — ce dernier était structurellement vide tant que leur cinq restait inconnu.

Et une entrée **« Sans joueur »** reste toujours disponible : on n'enregistre pas un panier
encaissé moins bien parce qu'on n'a pas eu le numéro. Ces actions comptent au score et aux totaux
collectifs, sans ligne de boxscore individuel — `boxscoreFromEvents` les ignore par construction.

**La feuille adverse est donc facultative, et l'écran le dit.** Tant qu'elle est vide, la colonne
affiche que le suivi anonyme est un mode d'usage valable, pas une étape manquante : le score, les
totaux d'équipe et les possessions adverses restent justes ; seul leur boxscore individuel manque.
C'est le compromis réel d'un opérateur seul, il n'a pas à être présenté comme un défaut.

### Cas particuliers

| Cas | Traitement |
|---|---|
| Lancers francs | Pas de position. Une série de 2 = deux événements, un tap chacun. |
| Tir contré | `shot` raté chez nous + `blk` côté adverse (agrégé si l'adversaire n'est pas nommé). |
| Faute | Un seul événement de notre côté (`foul` ou `foul_drawn`). La faute symétrique adverse est agrégée. |
| Rebond d'équipe (ballon sorti) | Non pointé — n'entre dans aucune colonne de `match_stats`. |
| Erreur de saisie | `⟲ Annuler` (ou `retour`) + suppression ligne à ligne dans l'historique. |
| Suppression d'un changement de banc | `recomputeOnCourtSnapshots()` **existe déjà** : à étendre aux `match_events`. |

### Publication

Un bouton **« Publier »** dans la barre de commandes, explicite, jamais automatique. Il écrit
`match_stats`, `opponent_match_stats`, `team_match_stats` et `matches.score_us/score_them`.

**Le dernier geste fait foi, et l'écran le dit.** Ces écritures sont exactement celles de l'import
CSV, et elles remplacent en bloc (`bulkUpsertForMatch` fait DELETE puis INSERT, jamais de fusion
ligne à ligne). Avant d'ouvrir la confirmation, l'écran relève donc ce qui existe déjà pour ce
match et l'annonce **chiffré** : tant de lignes de boxscore, tant de lignes adverses, les totaux
d'équipe, le score enregistré. Le bouton de validation passe au rouge et devient « Remplacer »
quand il y a quelque chose à écraser, avec la mention explicite qu'un import de feuille de marque
serait perdu.

Le tracker publie plus riche que le CSV sur deux colonnes : les **titulaires** (`starter`, en dur à
`false` à l'import) et les **minutes**, dérivées des rotations réelles.

## 7. Phases

### Phase 0 — Boxscore live ✅

Le cœur. Utilisable seul, sans zones, sans offline.

- `match_events` + [`src/api/matchEvents.ts`](../src/api/matchEvents.ts) (calqué sur `matchLive.ts`)
- `src/data/matchEvents.ts` + `matchEvents.test.ts` — l'agrégation est la logique critique, elle
  est testée en premier
- Écran tracker plein écran, palette 2 taps, historique supprimable, UNDO
- Boxscore live affiché à côté, recalculé à chaque tap
- Bouton « Publier » → `match_stats` (+ `min` depuis `playingTime()`, + `eval`, + `plus_minus`)
- Effectif adverse saisi à la volée, plus un pointage anonyme toujours disponible

**Fin de phase 0** : un match peut être saisi de bout en bout sans CSV, et tout l'aval analytique
existant fonctionne dessus.

### Phase 1 — Zones de tir

- Tap sur `DiagramCourt` → `x, y` ; `shotValue` déduit 2/3
- `src/data/shotChart.ts` + tests de géométrie (corner/arc, valeurs limites)
- Shot chart : tirs bruts (✓ plein / ✗ creux) + tableau par zone (volume, FG%, eFG%)
- Filtres : joueuse, quart-temps, cinq sur le terrain
- Shot chart **défensif** : d'où l'adversaire nous marque (nécessite de pointer la position des
  tirs adverses — optionnel, un tap de plus)

### Phase 2 — Fiabilité terrain

Sans cette phase, l'écran est une démo.

- **File d'écriture offline** : la PWA est déjà en place ; il manque un buffer `localStorage` +
  flush au retour réseau. 400 événements tiennent largement, inutile d'aller chercher IndexedDB.
- **Chrono persisté** : aujourd'hui un rechargement en plein match repart à Q1 00:00. Tolérable
  pour 20 possessions pointées, pas pour 90 minutes de saisie.
- **Collision de `seq`** : `seq` est calculé côté client. Deux personnes qui saisissent le même
  match s'écrasent mutuellement (le problème existe déjà sur `match_live_actions`). Deux options :
  verrou « un seul saisisseur à la fois », ou `seq` attribué côté serveur.
- Export **play-by-play + feuille de match en PDF** (`jspdf` est déjà installé).

### Phase 3 — Analytique dérivée

- On/off et statistiques de cinq **au point près** (aujourd'hui à la possession)
- Courbe d'écart et détection des runs (`scoreTimeline`)
- Splits par quart-temps
- Shot chart **agrégé sur la saison**, par joueuse et par équipe
- Écart d'une joueuse à la moyenne de l'équipe, zone par zone

### Phase 4 — Diffusion

- Lien public de suivi live (score + boxscore) pour dirigeants et parents. Les briques existent
  (`publicLinks.ts`, pages publiques bien-être/MBTI). C'est la fonctionnalité à valeur commerciale
  directe pour [BUSINESS.md](BUSINESS.md) — et la seule du lot qui n'expose aucune donnée de
  santé, donc sans contrainte HDS.

---

## 8. Articulation avec le suivi live existant

Les plays sont hors périmètre, et les deux écrans restent **indépendants** :

- « Suivi live » continue de pointer possessions + play + rotations, inchangé.
- Le tracker écrit `match_events` et **n'écrit pas** `match_live_actions`.
- Les deux partagent le chrono, `match_roster`, `match_lineup_events` et
  `match_opponent_players` — donc les rotations pointées dans l'un servent à l'autre.

Conséquence assumée : un match saisi uniquement au tracker n'a pas de rentabilité par play, et un
match pointé uniquement en « Suivi live » n'a pas de boxscore. C'est cohérent — ce sont deux
questions différentes.

Le jour où les deux doivent se rejoindre : une colonne nullable `possession_seq` sur
`match_events`, et la possession se ferme sur son événement terminal (panier, rebond défensif
adverse, perte de balle) plutôt que d'être saisie à part. À ce moment-là seulement.

---

## 9. Décisions ouvertes

1. **Le score du match fait-il autorité depuis les événements ?** Si le tracker publie
   `matches.score_us/them`, une saisie incomplète (une action manquée) crée un écart avec la
   feuille officielle. Alternative : afficher le score dérivé en direct, mais ne jamais écraser un
   score saisi à la main.
2. **`eval` calculée ou laissée vide ?** Tant que la formule n'est pas confrontée à un match
   importé, la laisser à NULL est plus honnête qu'un chiffre proche mais faux.
3. **Tenir les deux bancs coûte de l'attention.** Les rotations adverses sont possibles, pas
   obligatoires : tant qu'aucun cinq adverse n'est posé, leurs joueurs restent tous sélectionnables
   et seul le `+/-` adverse manque. C'est le bon défaut — on ne bloque pas la saisie des stats sur
   une gestion de rotations que personne n'a le temps de tenir un soir de match.

## 10. Explicitement hors périmètre

Vidéo et timecode externe (le schéma le refuse déjà explicitement pour le tactique), heatmap
continue, grille NBA à 14 zones, positions défensives, tracking automatique. À rouvrir seulement
si le volume de données le justifie.
