# Prise de statistiques — référence complète

Documentation exhaustive de la feature : base de données, couche réseau, domaine, écran, tests.
Elle décrit **ce qui existe**, fichier par fichier, avec l'intention de pouvoir la sortir de
Stamina et la faire vivre seule (§ 14).

Pour le **raisonnement** derrière chaque décision — pourquoi l'événementiel, pourquoi pas de
colonne `id`, pourquoi le mode changement est explicite — voir [STATS_LIVE.md](STATS_LIVE.md),
qui est le journal de conception. Ce document-ci est la carte ; celui-là est le carnet de route.

---

## 1. Ce que c'est

Un écran qui **pointe un match action par action**, en direct depuis le bord du terrain ou après
coup depuis une vidéo, et qui en dérive tout le reste : boxscore, score, minutes, grille de tir,
combinaisons de cinq, play-by-play, totaux collectifs.

Le principe tient en une phrase : **rien n'est saisi deux fois, rien n'est stocké deux fois**.
Une seule table de faits (`match_events`), et toutes les lectures sont des fonctions pures de
cette table. Le score n'est pas saisi, il se compte. Les minutes ne sont pas saisies, elles se
déduisent des rotations. L'évaluation n'est pas stockée, elle se calcule.

### Périmètre

| Dans | Hors |
|---|---|
| Tirs (avec ou sans position), lancers francs | Vidéo synchronisée au chrono |
| Rebonds off./déf., passes décisives, ballons perdus | Suivi des systèmes de jeu (c'est l'écran *Prise live*) |
| Interceptions, contres, fautes commises/provoquées | Temps de possession, distance parcourue |
| Rotations des deux bancs | Arbitrage automatique avec la feuille officielle |
| Effectif adverse saisi à la volée | Multi-saisisseurs temps réel (websocket) |

---

## 2. Vue d'ensemble

```
┌─ Écran ─────────────────────────────────────────────────────────────────┐
│ MatchStatsTracker.tsx        saisie + lecture immédiate                  │
│ MatchLineupsPanel / MatchShotChartPanel / MatchFlowPanel   lecture seule │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ hooks : useMatchClock, useClockHotkey, useMatchTracking
┌───────────────▼─────────────────────────────────────────────────────────┐
│ Domaine PUR (src/data) — aucune dépendance réseau, tout est testé        │
│ matchEvents · shotChart · matchClock · matchFlow · playByPlay            │
│ boxscoreTotals · eventQueue · liveTrackingAnalysis                       │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────────────┐
│ API (src/api) — PostgREST via supabase-js                                │
│ matchEvents · matchEventQueue (file hors-ligne) · matchLive · stats      │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────────────┐
│ PostgreSQL (Supabase) — RLS par équipe                                   │
│ match_events · match_lineup_events · match_opponent_players              │
│ match_roster   →  publication  →  match_stats · opponent_match_stats     │
│                                    team_match_stats · matches            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Règle d'architecture absolue** : `src/data` n'importe JAMAIS `src/api`. Le domaine ne connaît
pas le réseau. C'est ce qui rend les 101 tests de cette feature exécutables sans base.

### Le trajet d'une action, de bout en bout

Exemple : un 3 points réussi par le n° 8.

1. **Clic sur le terrain** — `handleCourtClick` convertit le pixel en mètres via le `viewBox`
   (`x = (clientX − left) / width × 15`). Un cercle en pointillés marque la position.
2. **Clic sur le joueur** — ou l'inverse : l'ordre est libre. Quand les deux sont connus, `✓`/`✗`
   apparaissent **sur le point** du tir.
3. `record(sel, {type:'shot', made:true, x, y})` — seul chemin d'écriture. Il vérifie
   `allowsAuthor`, puis appelle `pushEvent`.
4. `pushEvent` fige `seq = max(seq)+1`, `quarter`, `gameTimeSeconds = clock.getElapsedSeconds()`
   (valeur **exacte**, pas l'arrondi d'affichage) et les deux instantanés `onCourt` /
   `onCourtThem`. L'état local est mis à jour **tout de suite**, la sélection est désarmée.
5. `enqueueInsert(event)` pousse dans la file `localStorage` puis déclenche un `flushQueue`.
6. `matchEventsApi.insert` écrit la ligne. En cas de `23505` (deux saisisseurs), il relit
   `max(seq)`, réessaie à `max+1` et lève un drapeau de resynchronisation.
7. L'écran se recalcule **entièrement** depuis `events` : score, boxscore, grilles, lineups,
   historique. Aucun compteur incrémental n'existe.
8. **Publication** (geste explicite) : `boxscoreFromEvents` → `match_stats`,
   `teamTotalsFromEvents` → `team_match_stats`, `quarterSplits` → `matches.quarter_scores`,
   `scoreFromEvents` → `matches.score_us/score_them`.

---

## 3. Base de données

Toutes les migrations sont des **blocs SQL ajoutés à la fin de `schema.sql`**, exécutés à la main
dans le SQL Editor de Supabase. Pas de CLI, pas de dossier `migrations/`. Chaque bloc est
rejouable (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) et se termine par une requête de
vérification en commentaire.

### 3.1 `match_events` — la table de faits

```sql
CREATE TABLE IF NOT EXISTS match_events (
  match_id          UUID     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq               SMALLINT NOT NULL,
  quarter           SMALLINT NOT NULL,
  game_time_seconds INTEGER  NOT NULL,
  side              TEXT     NOT NULL CHECK (side IN ('us', 'them')),

  player_id          UUID REFERENCES players(id),
  opponent_player_id UUID REFERENCES match_opponent_players(id) ON DELETE SET NULL,

  type TEXT NOT NULL CHECK (type IN (
    'shot', 'ft', 'reb_off', 'reb_def', 'ast', 'stl', 'blk', 'tov', 'foul', 'foul_drawn'
  )),

  made  BOOLEAN,
  x     NUMERIC(4,2) CHECK (x >= 0 AND x <= 15),
  y     NUMERIC(4,2) CHECK (y >= 0 AND y <= 14),
  value SMALLINT CHECK (value IN (2, 3)),

  on_court      UUID[] NOT NULL DEFAULT '{}',
  on_court_them UUID[] NOT NULL DEFAULT '{}',

  PRIMARY KEY (match_id, seq),

  CONSTRAINT event_one_author CHECK (player_id IS NULL OR opponent_player_id IS NULL),
  CONSTRAINT event_made_only_on_shots CHECK (
    (type IN ('shot', 'ft') AND made IS NOT NULL) OR
    (type NOT IN ('shot', 'ft') AND made IS NULL)),
  CONSTRAINT event_position_only_on_shots CHECK (
    type = 'shot' OR (x IS NULL AND y IS NULL AND value IS NULL)),
  CONSTRAINT event_position_xor_value CHECK (
    type <> 'shot' OR (x IS NOT NULL AND y IS NOT NULL AND value IS NULL)
                   OR (x IS NULL AND y IS NULL AND value IS NOT NULL))
);

CREATE INDEX ON match_events (match_id, player_id);
```

**Clé naturelle `(match_id, seq)`, pas de colonne `id`.** Supprimer une action se fait sans
relire la ligne, et la file hors-ligne peut désigner une action qui n'est pas encore partie.

**`player_id IS NULL` est un cas normal**, pas une donnée manquante :
* côté `them`, c'est le mode de suivi courant (« sans joueur ») ;
* côté `us`, c'est l'action d'équipe — rebond d'équipe, 24 secondes.

**`x`/`y` sont en mètres**, dans le repère du demi-terrain de `utils/diagram.ts` : 15 m de large,
14 m de profondeur, panier en **(7.5, 1.575)**. C'est exactement le `viewBox` du SVG, donc la
conversion pixel → mètre est un simple rapport et les coordonnées ne dépendent pas de la taille
d'affichage.

**`value` et `x/y` s'excluent.** Un tir porte soit une position (la valeur est alors dérivée par
`shotValue`), soit une valeur figée (saisie sans position) — jamais les deux, jamais aucune des
deux. Un seul endroit fait autorité sur « combien vaut ce tir ».

**Les instantanés `on_court` / `on_court_them`** sont dupliqués sur chaque ligne, volontairement.
C'est ce qui permet de lire un +/- ou une statistique de combinaison sans rejouer l'historique
des changements — et ce qui rend une action juste même si les rotations sont corrigées après.

### 3.2 Tables satellites

| Table | Clé | Rôle |
|---|---|---|
| `match_opponent_players` | `id` UUID | Effectif adverse saisi à la volée. Aucun effectif adverse n'existe en base : ces joueurs n'ont de sens que pour un match. |
| `match_roster` | `(match_id, player_id)` | La feuille de match. **Convention : aucune ligne = tout l'effectif est disponible.** |
| `match_lineup_events` | `(match_id, side, seq)` | Un changement. `on_court` est l'instantané **complet** après le changement. Le **premier** événement d'un camp EST son cinq de départ. |
| `match_live_actions` | `(match_id, seq)` | Appartient à l'autre écran (*Prise live*, systèmes de jeu). Partage `match_lineup_events` et `match_opponent_players`. |

### 3.3 Durée d'un quart-temps

```sql
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS period_duration_seconds SMALLINT NOT NULL DEFAULT 600
    CHECK (period_duration_seconds BETWEEN 60 AND 1200);
```

Portée par **le match**, pas par le navigateur : c'est elle qui convertit (quart-temps, temps
écoulé) en axe de temps continu, donc elle détermine les minutes publiées. Tant qu'elle vivait en
`localStorage`, un match saisi en 8 minutes sur la tablette du club repartait à 10 depuis un
autre appareil et les minutes changeaient selon qui publiait.

Les prolongations ne sont pas concernées : **5 minutes en FIBA**, quelle que soit la durée des
quarts-temps (`OVERTIME_SECONDS`).

### 3.4 Row Level Security

Le motif est le même sur les cinq tables :

```sql
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_events_select" ON match_events
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));

CREATE POLICY "match_events_write" ON match_events
  FOR ALL TO authenticated
  USING      (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));
```

⚠️ **`WITH CHECK` est obligatoire sur les politiques d'écriture.** Sans lui, `USING` ne filtre que
les lignes *existantes* : les `SELECT`, `UPDATE` et `DELETE` passent, et tout `INSERT` est refusé
avec `new row violates row-level security policy`. C'est exactement le bug qu'a produit la
première version de cette politique.

`accessible_team_ids()` / `writable_team_ids()` sont des fonctions `SECURITY DEFINER` définies
plus haut dans `schema.sql` ; elles portent tout le modèle de permissions (rôle d'organisation,
rôle par équipe).

### 3.5 Tables d'arrivée (publication)

| Table | Écrite par | Contenu |
|---|---|---|
| `match_stats` | `bulkUpsertForMatch` | Une ligne par joueur de notre effectif. `pts` et `eval` y sont des colonnes calculées côté base. |
| `opponent_match_stats` | `bulkUpsertOpponentStatsForMatch` | Une ligne par joueur adverse **nommé**. |
| `team_match_stats` | `upsertTeamStats` | Une ligne par match, deux jeux de colonnes (`x` / `opp_x`), plus les ratios avancés en colonnes `GENERATED`. |
| `matches` | `matchesApi.update` | `score_us`, `score_them`, `result`, `quarter_scores`. |

Ce sont les tables que lit **tout le reste de l'application** : stats avancées, four factors, PCA,
archétypes, objectifs, rapports. La prise de statistiques n'a aucun chemin privilégié — elle
écrit exactement ce qu'écrit l'import de feuille de marque CSV.

---

## 4. Couche API (`src/api`)

### `matchEvents.ts` — `matchEventsApi`

| Méthode | Notes |
|---|---|
| `getByMatchId(matchId)` | Trié par `seq`. Les numériques PostgREST arrivent en **chaînes** : la conversion en nombre est faite ici, une fois. |
| `insert(event) → seq` | Rend le `seq` **effectif**. Sur `23505` (doublon), relit `max(seq)`, réessaie à `max+1` et lève `needsResync`. |
| `delete(matchId, seq)` | Sans cascade : une action ne détermine jamais l'état d'une autre. |
| `getByMatchIds(ids)` | Vues saison. **Découpé par lots de 25** : une liste d'UUID entière part dans l'URL PostgREST et une saison de 40 matchs dépasserait la limite du serveur. |
| `countForMatch(matchId)` | `head: true`, aucun transfert de lignes. |
| `deleteForMatch(matchId)` | Remise à zéro d'un match. |

### `matchLive.ts` — `matchLiveApi`

Partagé avec l'écran *Prise live*. Rotations (`insertLineupEvent`, `deleteLineupEvent`,
`updateLineupEventRoster`, `updateLineupEventOnCourt`), effectif adverse
(`getOpponentPlayers`, `addOpponentPlayer`, `deleteOpponentPlayer`), feuille de match
(`getRoster`, `setRoster`).

`addOpponentPlayer` est le seul appel **synchrone obligatoire** de l'écran : l'identifiant vient
de la base (clé étrangère), on ne peut pas l'inventer côté client puis espérer que l'insertion
suive. C'est pourquoi l'effectif adverse ne passe pas par la file d'attente.

### `stats.ts` — `statsApi` (partagé avec l'import CSV)

`bulkUpsertForMatch` et `bulkUpsertOpponentStatsForMatch` sont des **DELETE puis INSERT** : le
dernier geste fait foi. Toutes deux **ne touchent à rien** quand la liste est vide — le `return`
était placé *après* le DELETE, et publier un match suivi en adversaire anonyme (le cas courant)
effaçait un boxscore adverse importé sans le remplacer.

---

## 5. File d'attente hors-ligne (`src/api/matchEventQueue.ts`)

Une salle de sport est l'endroit où le réseau tombe. Sans file, une action refusée restait
affichée à l'écran, n'était jamais réessayée, et disparaissait au rechargement — divergence
silencieuse, le pire des cas pour une saisie qu'on ne peut pas refaire.

* FIFO en `localStorage` (`stamina.matchEventQueue`) : survit au rechargement et à la fermeture
  du navigateur.
* **L'ordre est conservé et la file s'arrête au premier échec** : rejouer une suppression avant
  son insertion écrirait une action qui n'existe plus.
* `queueDelete` (pur, testé dans `src/data/eventQueue.ts`) **annule une insertion encore en
  file** au lieu d'empiler une suppression orpheline, et jette au passage une correction devenue
  sans objet — un `update` sur une ligne absente échouerait indéfiniment, et la file s'arrête au
  premier échec.
* `queueUpdate` (corriger le temps d'une action) **corrige l'insertion elle-même** quand elle est
  encore en file, et ne garde sinon qu'une seule correction par action, la dernière.
* `queueError()` expose la panne **avérée** — c'est elle qui justifie un bandeau, pas la taille de
  la file : une action en vol pendant 200 ms est le fonctionnement normal, et l'annoncer faisait
  clignoter une alerte à chaque tap.
* Un écouteur `online` relance la file toute seule.
* `takeResyncFlag()` : un `seq` réattribué signifie qu'un autre appareil écrit sur le même match
  → l'écran se recharge.

**Seules les actions passent par la file**, pas les rotations ni l'effectif adverse : ce sont les
écritures fréquentes, celles qu'on ne peut pas retrouver après coup, et les seules entièrement
sérialisables.

---

## 6. Domaine pur (`src/data`)

### `matchEvents.ts` — le cœur

| Export | Rôle |
|---|---|
| `EVENT_LABELS` | Nom court de chaque type, en français. **La seule liste**, partagée par l'écran et l'export. |
| `eventPoints(e)` | 0 pour tout ce qui n'est pas un tir réussi. |
| `scoreFromEvents(events)` | Le score n'est jamais saisi. |
| `plusMinusFromEvents(events, side)` | **Au point près** (le suivi live travaille à la possession). Vide côté adverse tant que ses rotations ne sont pas pointées — un +/- sans cinq connu n'existe pas, et 0 se lirait « neutre ». |
| `evaluation(row)` | Évaluation FFBB (§ 6.1). |
| `boxscoreFromEvents(...)` | Une ligne par joueur ayant **une action OU du temps de jeu**. Les actions sans auteur sont ignorées ici. |
| `teamTotalsFromEvents(events, side)` | Totaux collectifs — ils comptent **tout**, actions sans auteur comprises. |
| `possessionsFromEvents(events, side)` | `fga − ro + tov + 0,44 × fta`. |
| `trackerHistory(events, lineupEvents)` | Actions **et** changements mêlés, du plus récent au plus ancien. À instant égal, le changement passe **sous** l'action : un remplacement se fait sur ballon mort, le jeu reprend après. |
| `lineupStatsFromEvents(...)` | Combinaisons de cinq : temps, possessions, points pour/contre, +/-. Regroupées sur le cinq **trié**, donc un cinq qui sort et revient donne UNE ligne au temps cumulé, pas deux — c'est la combinaison qu'on lit, pas le passage. |
| `byGameTime(a, b)` | Ordre **chronologique** (quart-temps, temps, rang). Pas l'ordre de saisie — voir § 12.1. |
| `editableTimeWindow(...)` | Bornes dans lesquelles le temps d'une saisie peut être corrigé sans invalider un cinq figé (§ 8). |
| `backwardsLineupChange(...)` | Premier changement de banc daté avant le précédent — le seul cas où du temps de jeu disparaît vraiment. |
| `sortLineupRows(...)` | Tri des combinaisons, partagé par l'écran de saisie et l'onglet Lineups. Les ratios `null` tombent en bas dans les deux sens. |

#### 6.1 L'évaluation, et le piège des deux colonnes de fautes

```ts
eval = (pts + ro + rd + pd + ct + interceptions + fpr)
     − (tirs manqués + LF manqués + bp)
```

* **`fpr` = fautes PROVOQUÉES**, donc un **crédit**, malgré ce que son nom laisse croire.
* **`fte` = fautes COMMISES**, et elles **ne sont pas retranchées** : l'index d'efficacité FIBA
  les retranche, l'évaluation FFBB non — et c'est l'évaluation FFBB que lit le staff.

Cette formule a été **vérifiée sur 457 lignes importées de l'eMarque**, à la ligne près. C'est
cette confrontation qui a révélé que les deux colonnes étaient lues **à l'envers dans toute
l'application** : `max(fte) = 5` (le plafond d'élimination FIBA) quand `fpr` monte à 9, et la
colonne `eval` de l'eMarque se reproduit exactement en **ajoutant** `fpr`. La correction a touché
l'évaluation, la ventilation des fautes de la saisie, le registre d'indicateurs, la PCA, les clés
d'archétypes, la table d'en-têtes de l'import CSV et tous les libellés d'écran. Voir
[CALCULS.md](CALCULS.md) § 14.

### `shotChart.ts` — géométrie

Neuf zones : `cercle`, `raquette`, `mid_gauche/axe/droite`, `corner_gauche/droite`,
`aile_gauche/droite`, `arc_axe`.

* `shotValue(x, y)` — **la portion droite du corner prime sur le rayon de l'arc** : un tir en
  corner vaut 3 points même à 6,60 m du panier.
* `shotZone(x, y)` — angle depuis le panier, tiers gauche/axe/droite.
* `shotEventValue(event)` — **la position fait autorité quand elle existe**, sinon la valeur
  figée. `null` pour tout ce qui n'est pas un tir du champ.
* `MIN_ATTEMPTS_FOR_PCT = 10` — sous ce volume, un pourcentage par zone ne veut rien dire.

### `matchClock.ts` — position du chrono, sans horloge interne

Le temps se **déduit de l'horloge murale**, il ne se compte pas en tics. Un `setInterval` d'une
seconde est bridé à une fois par minute dès que l'onglet passe en arrière-plan, et ne tourne pas
du tout pendant que l'appareil dort : une tablette posée écran éteint pendant un temps mort
perdait des minutes entières, et **toutes les actions pointées ensuite étaient datées faux**, y
compris les minutes publiées.

| Export | Rôle |
|---|---|
| `REGULATION_PERIODS = 4`, `OVERTIME_SECONDS = 300` | Une prolongation dure 5 min même dans un match en 8 min. |
| `periodSeconds(q, reg)` | Durée du quart-temps `q`. |
| `absoluteSeconds(q, t, reg)` | Position sur l'axe **continu**. Ne peut pas se réduire à `(q−1) × durée` : sans le découpage, la 2ᵉ prolongation était placée 5 minutes trop loin. |
| `elapsedAt(pos, now, period)` | **Borné au quart-temps.** Sans cette borne, le chrono continuait derrière un affichage figé à 00:00 et les actions basculaient dans le quart-temps suivant. |
| `isExpired`, `freeze`, `seek`, `remainingAt` | `seek` **conserve l'état de marche** : recaler le temps sur la table de marque ne doit pas arrêter le chrono. |
| `parseClockInput(raw)` | `mm:ss`, `m:ss` ou un nombre de secondes. `null` sur saisie illisible → l'appelant garde la valeur précédente plutôt que d'écrire un temps inventé. |

### Les autres modules

| Fichier | Contenu |
|---|---|
| `matchFlow.ts` | `scoreTimeline` (un point par panier), `detectRuns` (séries **strictes** N-0, seuil 6), `quarterSplits`. |
| `playByPlay.ts` | `playByPlayEntries` est **la** construction ; `playByPlayRows` n'en est que l'aplatissement CSV. Une seule source pour l'écran et l'export, sinon les deux finissent par ne plus raconter la même chose. |
| `boxscoreTotals.ts` | `unattributedLine` : l'écart entre le total d'équipe et la somme des lignes individuelles — la ligne « Équipe » de la feuille FIBA. Bornée à zéro par colonne : un total inférieur est une incohérence de données, pas une action de jeu. |
| `eventQueue.ts` | `queueDelete`, pur et testé. |
| `liveTrackingAnalysis.ts` | Partagé avec l'autre écran : `playingTime`, `lineupIntervals`, `periodLabel`, `formatClock`. |

---

## 7. Hooks

### `useMatchClock(matchId?, regulationSeconds?)`

* La **position** (`quarter`, `elapsedSeconds`) vit en `localStorage`, par match
  (`stamina.matchClock.<id>`) ; les deux écrans du direct passent le même id, donc ils partagent
  le chrono. Le chrono **revient toujours en pause** : le temps passé hors de l'écran n'est pas
  du temps de jeu.
* La **durée** vient du match, jamais du navigateur.
* `elapsedSeconds` est **arrondi à 5 secondes** (`COARSE_SECONDS`) : c'est la valeur des
  agrégations, et elle évite de recalculer tout le boxscore soixante fois par minute.
* `getElapsedSeconds()` donne la valeur **exacte** — c'est elle qu'on écrit sur une action et à
  la publication.
* `subscribeSeconds` + `useClockSeconds` isolent le rendu à la seconde dans le seul composant qui
  affiche le chrono (`useSyncExternalStore`).

### `useClockHotkey(clock, enabled)`

Touche **`S`**, partagée par les deux écrans de saisie. **Pas la barre espace** : elle réactive le
dernier bouton cliqué, donc on réenregistrait l'action précédente en croyant arrêter le chrono.
L'ancien garde-fou (ignorer l'espace quand le focus est sur un bouton) évitait le
double-déclenchement mais rendait le raccourci muet une fois sur deux — pire, on croyait le
chrono arrêté.

### `useMatchTracking(matchId)`

Chargeur **en lecture seule** (actions, rotations, adversaires) pour les panneaux d'analyse, avec
`hasData`, `lastQuarter`, `lastElapsedSeconds`. Ouvrir l'écran de saisie pour lire une analyse,
c'est ouvrir un écran qui écrit.

---

## 8. L'écran de saisie (`MatchStatsTracker.tsx`)

~2 250 lignes, un seul fichier. `canEdit` conditionne toute écriture.

### Disposition

Trois colonnes : **notre effectif · terrain + palette · effectif adverse**. Largeurs mesurées, pas
devinées : le terrain est borné entre 280 et 340 px (en dessous il n'est plus assez précis pour
distinguer deux zones voisines, au-dessus il ne gagne rien et écrase la palette). Les bascules à
1399 px (une colonne) et 799 px (terrain au-dessus de la palette) découlent de ce calcul.

### Les gestes

**L'ordre est libre.** Action → joueur, ou joueur → action ; tir posé → auteur, ou auteur → tir.
Les deux chemins produisent le même événement en deux taps, et `record()` est le seul à écrire.

Enregistrer une action **désarme le joueur sélectionné**, quel que soit le chemin : deux actions
d'affilée sont presque toujours le fait de deux joueurs différents.

Le **chaînage** arme la suite probable : un tir manqué allume les rebonds, un tir réussi allume la
passe décisive.

### « Sans joueur »

Un bouton dans chaque colonne d'effectif, au même gabarit qu'un joueur — les actions sans auteur
se pointent comme n'importe quelle autre : on arme l'auteur, puis on tape l'action.

* Côté **adverse** : ouvert à **tout**. Suivre l'adversaire en agrégé est le cas normal.
* Côté **nous** : limité à `reb_def`, `reb_off`, `tov` (`allowsAuthor`). Un « sans joueur » ouvert
  à tout deviendrait le raccourci du soir de match, et notre propre boxscore individuel se
  viderait sans que rien ne l'annonce.

L'écran **éteint ce qu'il refusera**, dans les deux sens : auteur d'équipe armé → la palette et le
terrain se grisent sauf les trois actions ; action non-équipe armée → « Sans joueur » se grise.

### Le mode changement

Les rotations sont derrière un **interrupteur explicite** (`c`), au milieu de l'écran, à distance
égale des deux bancs. Hors de ce mode, aucun tap ne peut modifier la composition — un tap destiné
à armer un joueur sortait quelqu'un du terrain. `resolveSubstitution` et `resolveLineupEntry` sont
**purs et exportés**, donc testés : ce sont eux qui décident, le composant ne fait qu'appliquer.

Quand le cinq est complet, le mode se referme tout seul.

### Barre de commandes

`Plein écran` (seul à gauche — il agit sur l'écran) · `Publier` · `Exporter` · `Réglages`.
Gabarit partagé `topBtnStyle` : quatre boutons côte à côte qui ne se ressemblent pas se lisent
comme quatre choses de natures différentes. L'état désactivé se voit, et l'infobulle dit ce qui
manque.

### Corriger un temps

Le temps de chaque ligne de l'historique se corrige d'un clic, sur place, en `mm:ss` — **en
décompte**, comme on le lit sur la table de marque (§ 8.1). La fenêtre autorisée est montrée à côté du
champ *avant* la frappe — `05:40–08:12` — et une valeur hors fenêtre est **refusée**, pas rabotée
en silence : un temps ramené tout seul à la borne serait faux sans que personne l'ait demandé.

C'est le geste dont a besoin celui qui laisse le chrono à l'arrêt et pose le temps à la main à
chaque changement : une frappe de travers sur un changement fausse deux intervalles et les minutes
de tout un cinq. La règle des bornes est en § 12.1.

### 8.1 Écoulé en base, décompté à l'écran

`game_time_seconds` stocke le temps **écoulé** depuis le début du quart-temps : c'est ce qui
permet de le convertir en axe de temps continu (`absoluteSeconds`), donc de mesurer un intervalle
qui chevauche une fin de quart-temps.

Mais **personne ne lit un match comme ça**. Le coach, l'arbitre et la feuille de marque comptent à
rebours. L'historique affichait donc `03:00` là où la table de marque du même écran affichait
`07:00`, pour la même action — et le CSV, censé arbitrer un désaccord avec la feuille officielle,
ne se lisait pas dans le même sens qu'elle.

`formatGameClock(quarter, gameTimeSeconds, regulationSeconds)` fait la conversion, au seul moment
de l'affichage. Elle s'applique partout où un temps de SAISIE est montré — historique, bandeau
d'alerte, confirmations, champ de correction, play-by-play, export CSV, et l'écran *Prise live*.
Une prolongation décompte depuis 5 minutes.

Elle ne s'applique **pas** aux DURÉES (temps de jeu d'un cinq, filtre « au moins 3:00 »), qui
restent des durées : `formatClock` reste là pour elles, et les confondre afficherait un temps de
jeu à l'envers.

### L'alerte « un changement est daté avant le précédent »

`lineupIntervals` borne à zéro un intervalle négatif : le cinq concerné est alors crédité de zéro
seconde, en silence. La cause habituelle est un quart-temps qu'on a oublié d'avancer avant de
poser le temps du suivant. Le bandeau n'est pas masquable et nomme le banc, les deux temps en
cause et le geste à faire.

`backwardsLineupChange` ne regarde **que les changements**, et compare sur l'axe absolu — c'est la
définition exacte du dégât, pas une approximation. Une première version surveillait aussi les
ACTIONS : leur temps n'entre dans aucune durée, et l'alerte s'allumait définitivement dès le
premier recalage du chrono en arrière, ou à la première correction de temps — qui est justement là
pour ça. Un avertissement qui ne s'éteint plus n'avertit plus de rien.

### Confirmations

Trois gestes détruisent une donnée et passent par `ConfirmModal` : **supprimer une action**,
**retirer un joueur adverse**, **annuler le dernier geste**. La boîte **dit ce qu'elle va
détruire** (quart-temps, temps, libellé) : une confirmation qui demande seulement « êtes-vous
sûr ? » se valide sans lire. Son bouton de retour s'appelle *Retour* — sur cet écran, « Annuler »
est le nom d'un geste destructeur.

Un **changement** n'est défaisable que s'il est réellement le dernier : une fois qu'une action a
été enregistrée derrière lui, le retirer laisserait cette action avec un cinq qui n'a jamais
existé.

### Vidéo

Fichier **local** (`<input type="file">` → `URL.createObjectURL`). Rien n'est envoyé ni stocké ;
l'URL d'objet est révoquée au changement de fichier et au démontage. Cadre redimensionnable
(`resize: vertical`), hauteur retenue en `localStorage`.

**Indépendante du chrono**, volontairement : la caler sur l'axe de temps du match demande un point
de repère que seule la table de marque donne, et une vidéo mal calée daterait faux *toutes* les
actions pointées derrière — on remplacerait une saisie approximative par une saisie fausse avec
l'air d'être précise.

### Réglages et stockage local

| Clé `localStorage` | Contenu |
|---|---|
| `stamina.shotInput` | `court` (défaut) ou `buttons`. **Seul endroit** qui décide du mode de saisie des tirs. |
| `stamina.matchClock.<matchId>` | Position du chrono. |
| `stamina.trackerVideoHeight` | Hauteur du cadre vidéo. |
| `stamina.matchEventQueue` | File d'attente des écritures. |

Le mode de saisie est une **habitude de l'opérateur**, pas une donnée du match : il reste par
navigateur, jamais en base. Un match peut mélanger les deux — chaque tir porte ce qu'il porte.

### Raccourcis

| Touche | Effet |
|---|---|
| `s` | chrono marche/arrêt |
| `c` | mode changement |
| `échap` | annule le tir en cours, la désignation de changement, ou la sélection |

Trois, pas trente. Les dix lettres d'action ont été retirées : autant de mnémoniques à mémoriser,
c'est une charge, pas un gain. Rien n'écoute tant qu'une modale est ouverte, ni quand un champ a
le focus.

---

## 9. Panneaux de lecture

| Composant | Onglet | Contenu |
|---|---|---|
| `MatchShotChartPanel` | Grille de tirs | Carte + tableau par zone, filtres équipe/joueur/réussite/quart-temps. |
| `SeasonShotChartPanel` | (page saison) | Même explorateur sur plusieurs matchs. **Aucun joueur adverse sélectionnable** : les identifiants adverses sont propres à un match, deux « Camille D. » de deux clubs ne sont pas la même personne. |
| `MatchLineupsPanel` | Lineups | Combinaisons avec temps, possessions, pts/poss., +/-, plus une lecture par joueur. |
| `MatchFlowPanel` | Play-by-play | Courbe d'écart, séries sans réponse, flux d'actions. |
| `MatchQuarterPanel` | QT par QT | Score par quart-temps, cumul, meilleur/pire quart-temps, plus le détail par tir **quand le match a été pointé**. Seul panneau qui sert aussi les matchs importés : il part de `matches.quarter_scores`. |
| `MatchFourFactors` | Four factors | Les quatre facteurs de Dean Oliver, nous contre l'adversaire. Ne dépend que de `team_match_stats` : s'affiche même sans aucune ligne individuelle. |
| `ShotChartExplorer` | — | Le corps commun des deux grilles de tir. |
| `MatchScoreboard` | — | Table de marque + chrono, **partagée** avec l'écran *Prise live* : deux écrans du même produit ne peuvent pas afficher deux tables de marque différentes. |

Onglets de la page match : `saisie` (Prise statistiques) et `direct` (Prise live) dans le groupe
**Saisie**. **Les slugs ne changent jamais** — les notifications ciblent un onglet par son slug.

---

## 10. Publication

Geste **explicite**, jamais automatique : un match en cours écrirait des demi-vérités, et à la
mi-temps un joueur à 4 points ferait chuter sa moyenne de saison.

1. `openPublish` relève **ce qui existe déjà** (lignes individuelles, adverses, totaux, score) pour
   que la confirmation annonce ce qui va disparaître.
2. La modale alerte sur deux cas : **minutes toutes à zéro** (chrono jamais lancé) et **aucune
   rotation** (pas de cinq de départ, donc pas de +/- ni de minutes).
3. Deux portées : **publication d'étape** (les statistiques partent, la fiche du match ne bouge
   pas) et **publication finale** (score, résultat et scores par quart-temps compris).
4. À **égalité**, le résultat déjà enregistré est conservé : `matches.result` n'a pas de nul, et
   le basket non plus — à égalité, le match n'est pas fini. L'inscrire en défaite faussait le
   bilan de saison à chaque publication d'étape.

---

## 11. Tests

**101 tests unitaires**, tous purs, aucun DOM, aucune base :

| Fichier | Tests |
|---|---|
| `src/data/matchEvents.test.ts` | 35 — **dont la géométrie de `shotChart`** (corner à 3 points à 6,60 m, bascule exacte sur l'arc). Elles y sont par héritage, pas par choix : `shotChart.ts` n'a pas de fichier de test à son nom. |
| `src/data/matchClock.test.ts` | 17 |
| `src/components/MatchStatsTracker.test.ts` | 14 (`resolveSubstitution`, `resolveLineupEntry`, `allowsAuthor`) |
| `src/data/matchFlow.test.ts` | 9 |
| `src/data/playByPlay.test.ts` | 11 |
| `src/data/boxscoreTotals.test.ts` | 5 |
| `src/data/eventQueue.test.ts` | 10 |

```bash
npm test              # vitest run
npm run typecheck     # tsc -b --noEmit  ← PAS `tsc --noEmit` : sans -b, une config
                      #   « solution » à références ne vérifie rien du tout
```

### Vérification contre une vraie base

```bash
E2E_EMAIL=… E2E_PASSWORD=… npx vite-node scripts/check-tracker.mjs
```

**30 vérifications.** Le script crée un match jetable daté 2019, exerce ce que les tests unitaires
ne peuvent pas atteindre — RLS, contraintes `CHECK`, aller-retour de sérialisation, chemin de
publication — puis le supprime (cascade). Il vérifie notamment que la base **refuse** ce qu'elle
doit refuser : tir sans réussite, tir avec position *et* valeur, rebond avec une réussite, tir
hors du terrain.

C'est ce script qui a révélé que la migration `match_events` avait été appliquée **partiellement**
sur la vraie base : cinq écritures illégales étaient acceptées. D'où le bloc `RÉPARATION` en fin
de `schema.sql`, rejouable.

---

## 12. Invariants à ne jamais casser

1. **`src/data` n'importe jamais `src/api`.**
2. Le score, les minutes, l'évaluation et les possessions **se dérivent**, ils ne se stockent
   jamais dans `match_events`.
3. `shotEventValue` est **le seul** à dire ce que vaut un tir.
4. Une action porte l'instantané des **deux** cinq, figé à la saisie — d'où l'interdiction de
   franchir un changement en corrigeant un temps (§ 8).
5. `getElapsedSeconds()` (exact) pour écrire ; `elapsedSeconds` (arrondi) pour afficher.
6. `fte` = commises, `fpr` = provoquées, et l'évaluation **ajoute** `fpr`.
7. Toute politique RLS d'écriture porte un `WITH CHECK` explicite.
8. Les slugs d'onglets sont stables.
9. La publication remplace en bloc, mais **ne vide jamais** une table quand il n'y a rien à
   écrire.
10. **L'ordre de saisie (`seq`) n'est PAS l'ordre chronologique.** Il l'a été jusqu'à ce que le
    temps devienne corrigeable. Tout ce qui lit le match dans le temps trie par `byGameTime` ;
    `seq` ne sert plus qu'à départager deux actions du même instant — fréquent, puisque le chrono
    est souvent à l'arrêt.

### 12.1 Le temps corrigeable, et pourquoi il ne franchit pas un changement

Le temps d'une saisie se corrige sur place dans l'historique. Deux règles suffisent à ce qu'aucun
calcul n'ait besoin d'être rejoué :

* une **action** reste entre les deux changements de banc qui l'encadrent (les deux bancs
  comptent : elle porte les deux cinq) ;
* un **changement** reste entre les deux saisies qui l'encadrent, actions comprises.

Sans cette borne, déplacer une action de l'autre côté d'un changement laisserait ses points
crédités à un cinq qui n'était pas sur le terrain — en silence, l'instantané étant figé. On aurait
alors le choix entre recalculer les instantanés en cascade à chaque correction, ou vivre avec un
écran qui ment. La borne supprime le problème au lieu de le réparer, et elle se dit en une phrase
de basket : *une action appartient au cinq qui l'a jouée*.

À temps égal, la convention de `trackerHistory` tranche (le changement précède l'action), et les
bornes sont inclusives. C'est ce qui laisse de la place quand le chrono est à l'arrêt et qu'une
série entière de saisies porte le même temps.

Le **quart-temps** ne se corrige pas : il détermine les scores par quart-temps publiés.

---

## 13. Pièges déjà payés

| Symptôme | Cause | Correctif |
|---|---|---|
| `new row violates row-level security policy` | Politique d'écriture sans `WITH CHECK` | Ajouter `WITH CHECK` |
| Minutes fausses après un temps mort | `setInterval` bridé en arrière-plan | Chrono déduit de l'horloge murale |
| Chrono qui continue après 00:00 | Pas de borne haute | `elapsedAt` borné au quart-temps |
| 2ᵉ prolongation décalée de 5 min | `(q−1) × durée` | `absoluteSeconds` avec découpage |
| Fautes inversées partout | Commentaire de schéma erroné, aligné par tout le code | Vérification sur 457 lignes réelles |
| Boxscore adverse effacé à la publication | `return` après le `DELETE` | `return` avant |
| `typecheck` qui ne vérifie rien | `tsc --noEmit` sur une config à références | `tsc -b --noEmit` |
| `Cannot access 'X' before initialization` | Valeur d'affichage déclarée avant les fonctions de nommage | Déclarer après (deux fois le cas) |
| Alerte qui clignote à chaque tap | Bandeau lié à la taille de la file | Bandeau lié à `queueError()` |
| Le temps de jeu de tout un cinq compté zéro | Temps posé pour le quart-temps suivant sans avoir changé de quart-temps : l'intervalle devient négatif et `lineupIntervals` le borne à zéro, sans un mot | `backwardsLineupChange` |
| Alerte permanente sur le temps | Le même détecteur surveillait aussi les actions, dont le désordre ne coûte rien — et que la correction de temps produit volontairement | Ne surveiller que ce qui casse une durée : les changements |

---

## 14. Extraire la feature dans un projet à part

### 14.1 Fichiers du périmètre

**Domaine pur — se déplace tel quel, zéro modification** (~1 200 lignes + tests)

```
src/data/matchEvents.ts        matchClock.ts      shotChart.ts
src/data/matchFlow.ts          playByPlay.ts      boxscoreTotals.ts
src/data/eventQueue.ts         liveTrackingAnalysis.ts   (partiel, voir 14.3)
+ les 7 fichiers .test.ts correspondants
```

**Réseau — à réécrire si la base change de forme** (~500 lignes)

```
src/api/matchEvents.ts   matchEventQueue.ts   matchLive.ts   stats.ts (partiel)
```

**Écran** (~3 500 lignes)

```
src/components/MatchStatsTracker.tsx      MatchScoreboard.tsx   DiagramCourt.tsx
src/components/ShotChart.tsx              ShotChartExplorer.tsx
src/components/MatchShotChartPanel.tsx    SeasonShotChartPanel.tsx
src/components/MatchLineupsPanel.tsx      MatchFlowPanel.tsx
src/hooks/useMatchClock.ts  useClockHotkey.ts  useMatchTracking.ts
src/utils/diagram.ts (géométrie du terrain)   src/utils/csv.ts
```

**Base** : les blocs `match_opponent_players`, `match_roster`, `match_lineup_events`,
`match_events`, `period_duration_seconds` et le bloc `RÉPARATION` de `schema.sql`.

**Vérification** : `scripts/check-tracker.mjs`.

### 14.2 Ce qui vient du reste de Stamina et devra être fourni

| Dépendance | Ce qu'elle apporte | Coût de remplacement |
|---|---|---|
| `matches`, `players` (tables) | Le match et l'effectif | **Structurel** : un match et des joueurs sont le minimum vital |
| `accessible_team_ids()` / `writable_team_ids()` | Tout le modèle de permissions | À remplacer par le modèle du nouveau projet |
| `TeamSeasonContext` | Nom et couleur de l'équipe | Trivial (deux props) |
| `Modal`, `LAYER`, `EmptyState` | Coquille de modale, plans de superposition | Trivial |
| `playerNameShort/Full`, `PlayerAvatar` | Affichage d'un joueur | Trivial |
| `statsApi` (publication) | `match_stats`, `team_match_stats`, `opponent_match_stats` | **À décider** : voir 14.4 |
| `supabase` client | PostgREST + auth | Structurel si on quitte Supabase |
| `lucide-react` | Icônes | Trivial |

### 14.3 Points d'attention

* **`liveTrackingAnalysis.ts` est partagé** avec l'écran *Prise live* (systèmes de jeu). Seuls
  `playingTime`, `lineupIntervals`, `periodLabel` et `formatClock` servent à la prise de
  statistiques ; le reste (`playStats`, `lineupStats`, `playerPlusMinus`) appartient à l'autre
  écran et peut rester derrière.
* **`match_lineup_events` et `match_opponent_players` sont partagées** par les deux écrans. En
  extraction, elles suivent la prise de statistiques.
* **`MatchScoreboard` est partagée** : à dupliquer ou à emporter.
* L'écran est **un seul fichier de 2 250 lignes**. C'est assumé (tout l'état d'une saisie est
  couplé), mais c'est le premier endroit à découper si le projet extrait doit vivre à plusieurs.
* Les styles sont **en ligne**, sans framework CSS : rien à porter, mais rien à réutiliser non
  plus.

### 14.4 Ce que « publier » devient hors de Stamina

La publication n'est pas une fonctionnalité de la saisie : c'est le **pont** entre la saisie et
l'analytique de Stamina. Trois options pour un projet extrait :

1. **La couper** — le produit s'arrête au play-by-play et à l'export CSV. `boxscoreFromEvents` et
   `teamTotalsFromEvents` restent utiles pour l'affichage à l'écran.
2. **La garder en export** — même calcul, sortie fichier (CSV/JSON) au lieu d'un `INSERT`.
3. **La garder en API** — `match_stats` / `team_match_stats` deviennent le contrat de sortie du
   produit extrait, ce qui permettrait à Stamina de rester un consommateur parmi d'autres.

C'est la seule décision d'architecture réellement ouverte de l'extraction. Le reste — événements,
dérivations, écran — ne dépend de rien d'autre que d'un match et d'une liste de joueurs.

---

## 15. Voir aussi

* [STATS_LIVE.md](STATS_LIVE.md) — le journal de conception : pourquoi chaque choix, ce qui a été
  écarté, les phases.
* [CALCULS.md](CALCULS.md) — toutes les formules de l'application, dont l'évaluation et les four
  factors.
* [FORMATS_CSV.md](FORMATS_CSV.md) — l'import de feuille de marque, qui écrit dans les mêmes
  tables d'arrivée.
* [SETUP.md](SETUP.md) — installation, Supabase, variables d'environnement.
