# Formats CSV attendus par Stamina — statistiques tactiques

Document de référence destiné à être donné tel quel à l'assistant qui prépare les fichiers.
Il décrit **exactement** ce que l'application sait lire ; tout écart se traduit par des données
mal rattachées, pas par un message d'erreur.

Trois fichiers types, deux moments :

| Fichier | Quand | Ce qu'il crée |
| --- | --- | --- |
| **Configuration** | une fois, puis à chaque évolution de la taxonomie | catégories, dimensions, options attendues |
| **Match, un CSV par thème** | après chaque match | les actions du match (format recommandé) |
| **Match, fichier unique** | alternative | idem, toutes catégories dans un seul fichier |

---

## 0. Règles communes aux trois fichiers

- **Encodage UTF-8.** Le BOM est toléré. Les accents doivent être écrits en clair (`Finalité`,
  `Opportunité`, `Chloé`) ; un fichier ré-encodé en Latin-1 est rattrapé automatiquement, mais
  autant ne pas s'en remettre à ce filet.
- **Séparateur : `;` recommandé**, `,` et tabulation acceptés. **Un seul séparateur par fichier.**
- Une cellule contenant le séparateur doit être entourée de guillemets doubles (`"Drive; kick"`),
  un guillemet interne se doublant (`""`).
- Les lignes entièrement vides sont ignorées, où qu'elles soient.
- **Comparaison des noms : insensible à la casse, aux accents et aux espaces multiples.**
  `Finalite`, `Finalité` et `FINALITE` désignent la même dimension. Il n'y aura donc jamais de
  doublon, mais **c'est la première orthographe rencontrée qui restera affichée partout** :
  écrire toujours de la même façon, d'un fichier à l'autre et d'un match à l'autre.
- Sont traitées comme « pas de valeur » : une cellule vide, ou contenant `/`, `-`, `--`, `.`,
  `na`, `n/a` (casse et espaces indifférents).

---

## 1. Fichier de configuration

Objet : pré-créer la taxonomie de l'équipe — catégories, leurs dimensions, et le catalogue
d'options attendues de chaque dimension. Se dépose dans **Configuration → Statistiques tactiques
→ Importer un CSV**.

### Structure

Une ligne par dimension : catégorie, dimension, puis ses options.

```
Categorie;Dimension;Options
Defense Pick;Forme de jeu;Protect;Step;Switch;Chase
Defense Pick;Zone;P-TOP 5;P-SIDE 5;P-SIDE 4
Defense Pick;Finalite;Scoring;Faute;Perte de balle;Rebond defensif;Rebond offensif;Ballon mort
Defense Pick;Valeur
Attaque rapide;Temps fort;Easy basket;Drive & kick;Passing;Cut;Iso;Post-up
Attaque rapide;Valeur
```

### Règles

- La **ligne d'en-tête est facultative** : elle est reconnue à sa première cellule (`Categorie`,
  `Category` ou `Categories`) et ignorée. Sans en-tête, la première ligne est déjà une donnée.
- Le nombre d'options par ligne est **libre** : autant de colonnes que nécessaire.
- Le format « une ligne par option », à 3 colonnes fixes en répétant catégorie et dimension,
  donne **exactement le même résultat**. Les deux écritures peuvent même cohabiter dans un
  fichier : les lignes d'une même catégorie/dimension sont fusionnées, dans l'ordre du fichier.
- Une ligne **sans dimension** (une seule cellule) crée la catégorie seule.
- Une **dimension sans option** ne reçoit pas de catalogue : toute valeur du CSV de match y sera
  alors acceptée sans avertissement. C'est le cas normal de la dimension `Valeur`.
- L'ordre du fichier donne l'ordre d'affichage des catégories, dimensions et options.
- **L'import est purement additif, donc rejouable.** Ce qui existe déjà est réutilisé tel quel :
  jamais renommé, jamais supprimé. Les options présentes en base et absentes du fichier restent
  en place. Rejouer un fichier enrichi n'ajoute que les nouveautés.
  → Pour **supprimer** une option ou renommer une catégorie, il faut passer par l'écran de
  configuration ; aucun fichier ne le fera.
- L'écran de configuration **exporte** au même format : on exporte, on édite dans un tableur, on
  réimporte.

### La dimension `Valeur` — le seul nom imposé

Toute la rentabilité de l'application (moyennes, seuils de couleur, objectifs) est calculée à
partir d'une dimension **nommée exactement `Valeur`** dans sa catégorie : c'est elle qui porte
les points générés ou concédés par l'action.

- Déclarer `Valeur` sans options dans la configuration de **chaque** catégorie qui doit avoir une
  rentabilité.
- Une catégorie ne peut en avoir **qu'une seule**.
- Une catégorie sans `Valeur` fonctionne, mais n'aura jamais de rentabilité, seulement des
  répartitions en pourcentage.

---

## 2. Fichiers de match : un CSV par thème (recommandé)

Objet : les actions d'un match. Se déposent dans la fiche du match → **Importer les statistiques
tactiques → onglet « Un fichier par thème »**, plusieurs fichiers à la fois ou en plusieurs fois.

### Structure

Un fichier par catégorie. Une ligne d'en-tête, puis une ligne par action.

```
Debut;Fin;N°;Joueuses;Forme de jeu;Zone;Finalite;Rentabilite
09:48;10:06;Defense Pick 001;#3 Melissa, #9 Lau;Protect;P-SIDE 5;Faute;1
14:00;14:18;Defense Pick 002;#1 Yana, #0 Cynthia;Switch;P-SIDE 5;Rebond defensif;0
```

### Le nom du fichier donne la catégorie

`Defense_tout-terrain.csv` → catégorie **`Defense tout-terrain`**. Extension retirée, `_` rendus
aux espaces, tirets conservés.

> **Le nom du fichier ne doit contenir QUE le nom du thème.** Pas de date, pas d'adversaire, pas
> de numéro de journée : `Defense_Pick_2026-09-01.csv` créerait une catégorie
> « Defense Pick 2026-09-01 » à côté de la vraie. Le match est déjà choisi dans l'application ;
> le fichier n'a pas à le rappeler. Si un classement par match est nécessaire, le mettre dans le
> **dossier**, jamais dans le nom du fichier.

Le nom obtenu doit correspondre à une catégorie du fichier de configuration (aux accents et à la
casse près). Sinon la catégorie est créée à la volée, sans catalogue d'options.

### Les colonnes

- **Une colonne par dimension**, l'en-tête portant le nom de la dimension **tel qu'écrit dans le
  fichier de configuration**.
- Les colonnes de repérage vidéo `Debut`, `Fin`, `N°` (ainsi que `No`, `Numero`, `Start`, `End`)
  sont reconnues et **décochées d'office** à l'import — les laisser ne coûte rien, elles ne
  deviendront pas des dimensions. Chaque colonne reste cochable ou décochable à la main.
- **Pas deux colonnes de même nom** dans un fichier, **pas de colonne sans titre** : ces
  colonnes-là sont refusées (une dimension ne porte qu'une valeur par action).
- Le nombre et l'ordre des colonnes peuvent différer d'un thème à l'autre. Ils doivent en
  revanche rester **stables d'un match à l'autre** pour un même thème.
- Une cellule vide est acceptée : l'action n'aura simplement pas de valeur sur cette dimension.

### La colonne des points

- L'écran d'import demande, fichier par fichier, quelle colonne porte les points de l'action ;
  elle est importée sous le nom `Valeur`.
- Elle est **détectée automatiquement** si elle s'appelle `Valeur` (choix alors figé) ou, à
  défaut, `Rentabilite` / `Points` / `Score`.
- **Valeurs autorisées : `0`, `1`, `2`, `3`, `4`** — un entier, rien d'autre.
- Une action dont cette cellule est vide est **importée quand même**, sans score : elle compte
  dans les volumes et les répartitions, et n'entre pas dans la moyenne de rentabilité. Renseigner
  `0` reste préférable quand l'action a réellement rapporté zéro — ce n'est pas la même chose
  qu'une action non notée.

### Les valeurs

- Reprendre **exactement** les libellés du catalogue de la configuration. Une valeur inconnue est
  importée **et ajoutée au catalogue** pour pouvoir être stockée ; l'écran d'import liste tout ce
  qu'il a ajouté, à relire aussitôt : c'est là que se voient les fautes de frappe, qui créeraient
  sinon une option de plus à chaque variante.
- C'est aussi ce qui donne sa valeur au fichier de configuration : catalogue complet, aucune
  option parasite créée à l'import.

### La colonne des joueuses

Une colonne nommée `Joueuses` (ou `Joueurs`, `Players`) n'est pas traitée comme une dimension :
elle est **découpée en joueuses**. La cellule `#0 Cynthia, #14 Eva Ha` donne deux jetons, et
l'écran d'import fait rapprocher chaque jeton distinct d'une joueuse de l'effectif via une liste
déroulante — le rapprochement automatique se fait d'abord sur le numéro de maillot, puis sur le
prénom s'il ne désigne qu'une seule joueuse.

- Écrire le **numéro de maillot en tête** de chaque jeton (`#0 Cynthia`) : c'est la seule donnée
  que l'export vidéo et l'application partagent de façon fiable. Deux joueuses prénommées Eva ne
  se distinguent que par là.
- Séparer les joueuses par des **virgules**.
- Un jeton laissé « hors effectif » n'est pas enregistré ; le reste de l'action l'est quand même.

### Portée de l'import

Importer des fichiers par thème **ne remplace que les catégories présentes dans les fichiers
déposés**, pour ce match. Les autres catégories déjà saisies pour ce match sont conservées. On
peut donc livrer les thèmes en plusieurs fois — à condition de viser le même match.

---

## 3. Variante : un seul fichier pour tout le match

Même contenu, un seul fichier, découpé par des lignes `Category:` :

```
Category: Defense Pick
Valeur,Forme de jeu,Zone,Finalité
1,Protect,P-SIDE 5,Faute
0,Switch,P-SIDE 5,Rebond defensif

Category: Attaque rapide
Valeur,Temps fort,Finalité,Reconquête
2,Easy basket,Scoring,Interception
```

- Une ligne `Category: <nom>` par catégorie, immédiatement suivie de la ligne des dimensions,
  puis d'une ligne par action.
- Ici **aucune colonne n'est écartée** et **aucune n'est renommée** : la colonne des points doit
  s'appeler `Valeur` dans le fichier.
- ⚠ Cet import **remplace tout le tactique du match** : le fichier doit contenir toutes les
  catégories du match, pas seulement celles qui ont changé.

---

## 4. Checklist avant livraison

1. Encodage UTF-8, séparateur unique et cohérent dans tout le fichier.
2. Noms de fichiers : **thème seul**, sans date ni adversaire.
3. Noms de catégories et de dimensions **identiques** à ceux du fichier de configuration,
   orthographe et accents compris.
4. Une dimension `Valeur` déclarée dans la configuration de chaque catégorie à rentabilité.
5. Colonne des points en `0`–`4` ; laisser vide seulement une action réellement non notée.
6. Numéro de maillot en tête de chaque joueuse, joueuses séparées par des virgules.
7. Aucune colonne dupliquée, aucune colonne sans titre.
8. Valeurs prises dans le catalogue d'options ; toute nouvelle valeur légitime ajoutée d'abord au
   fichier de configuration, pour éviter qu'une faute de frappe y entre toute seule.
9. Tous les fichiers d'un même match importés dans **ce** match.

---

## 5. Exemple complet, tiré de la saison en cours

Configuration reconstituée à partir des 8 fichiers du match analysé — options réellement
observées, donc **à compléter** avec celles qui n'apparaissent pas dans une seule rencontre
(`Chase` pour `Defense Pick`, `P-TOP 4` pour `Defense Pick`, etc.).

```
Categorie;Dimension;Options
Attaque rapide;Valeur
Attaque rapide;Temps fort;Cut;Drive & kick;Easy basket;High-post;Iso;P-SIDE 5;Passing;Post-up
Attaque rapide;Forme de jeu;Chasse;Contre-attaque;Direct;Opportunité;Sans annonce;Transfert
Attaque rapide;Finalité;Ballon mort;Faute;Perte de balle;Rebond defensif;Rebond offensif;Scoring
Attaque rapide;Reconquête;Interception;Panier encaisse;Rebond defensif
Attaque vs M2M;Valeur
Attaque vs M2M;Temps fort;Cut;Drive & kick;Easy basket;Handoff;High-post;Iso;P-SIDE 4;P-SIDE 5;P-TOP 4;P-TOP 5;Passing;Post-up;Screen
Attaque vs M2M;Forme de jeu;Chasse;Direct;Maillot;Rebond offensif;Sans annonce;Tete;Touche fond;Transfert
Attaque vs M2M;Finalité;Ballon mort;Faute;Perte de balle;Rebond defensif;Rebond offensif;Scoring
Defense Exterieur;Valeur
Defense Exterieur;Forme de jeu;Cut;Drive & kick;Iso;Passing
Defense Exterieur;Finalité;Faute;Perte de balle;Rebond defensif;Rebond offensif;Scoring
Defense Pick;Valeur
Defense Pick;Forme de jeu;Protect;Step;Switch
Defense Pick;Zone;P-SIDE 4;P-SIDE 5;P-TOP 5
Defense Pick;Finalité;Ballon mort;Faute;Perte de balle;Rebond defensif;Rebond offensif;Scoring
Defense Post-up;Valeur
Defense Post-up;Forme de jeu;Sans trap;Trap
Defense Post-up;Finalité;Faute;Perte de balle;Rebond defensif;Scoring
Defense Screen;Valeur
Defense Screen;Forme de jeu;Chase;Switch
Defense Screen;Finalité;Perte de balle;Rebond defensif;Rebond offensif;Scoring
Defense tout-terrain;Valeur
Defense tout-terrain;Finalité;Ballon mort;Faute;Perte de balle;Rebond defensif
Repli defensif;Valeur
Repli defensif;Finalité;Ballon mort;Faute;Perte de balle;Rebond defensif;Scoring
```

Deux points relevés dans les fichiers d'origine, à trancher avant de figer la configuration :

- **`Finalite` / `Finalité` selon les fichiers.** Sans conséquence technique (même dimension
  après normalisation), mais l'orthographe du premier import s'affichera partout. La version
  accentuée est retenue ci-dessus.
- **`Temps fort` et `Forme de jeu` sont inversées entre attaque et défense.** Dans les deux
  fichiers d'attaque, `Temps fort` contient les formes de jeu (`Passing`, `Post-up`, `P-SIDE 5`,
  `Screen`…) et `Forme de jeu` contient les déclencheurs (`Contre-attaque`, `Opportunité`,
  `Transfert`, `Maillot`, `Tete`…) — l'inverse des fichiers de défense, où `Forme de jeu` porte
  bien la forme de jeu (`Protect`, `Step`, `Switch`, `Trap`…). Chaque dimension appartenant à sa
  catégorie, rien ne casse ; mais comparer « forme de jeu » entre attaque et défense n'aura pas
  de sens tant que les deux colonnes ne sont pas remises dans le même ordre à l'export vidéo.
