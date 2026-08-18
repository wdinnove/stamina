# Dé-lettrisation du module de personnalité

> **Statut : plan validé comme lecture, non engagé.** Rien de ce document n'est
> implémenté au 18 août 2026. À reprendre avant la première vente — voir
> [BUSINESS.md § 5.3](BUSINESS.md).

## Pourquoi

Le sigle `MBTI` n'est plus visible nulle part côté utilisateur : ni texte d'UI, ni
objet d'email, ni URL depuis que `/joueur/:id/mbti` est devenu
`/joueur/:id/personnalite`. Le risque de marque est donc traité.

Reste la **perception**. Ce qui trahit l'origine du modèle, ce n'est pas le sigle
(absent) mais les artefacts affichés : les 16 codes à 4 lettres, les 8 initiales de
pôle, et les textes de fiche qui commencent par le code. N'importe qui ayant fait
16Personalities reconnaît `INFP` en une seconde.

La note historique de BUSINESS.md disait « les 4 axes et les lettres peuvent rester
(usage de 16Personalities) » : exact sur le plan juridique, faux sur le plan de la
perception.

## Principe

Le profil n'est plus identifié par son code mais par son nom. **Aucune migration de
données** : le code à 4 lettres n'est pas stocké, il se recalcule à chaque affichage
depuis les 24 réponses brutes. Tout ce qui suit est de l'affichage.

Les identifiants de code (`MbtiType`, `mbti_responses`, `src/data/mbti/`,
`get_mbti_public_info`) ne bougent pas : invisibles, et les renommer serait du bruit
dans l'historique.

## Lot A — le code à 4 lettres

Cinq points de rendu :

| Où | Aujourd'hui | Après |
|---|---|---|
| `src/components/MbtiPlayerPanel.tsx:115` | `INFP` en 84 px, poids 900 | le surnom devient le titre ; les 4 barres d'axe en dessous portent le détail |
| `src/components/MbtiPlayerPanel.tsx:148` | `ISFP · L'artisan discret` (fiches candidates en cas d'égalité) | surnom seul |
| `src/components/MbtiTeamPanel.tsx:124` | colonnes `Type` **et** `Profil` | une seule colonne `Profil` — `Type` ne portait que le code |
| `src/components/MbtiTeamPanel.tsx:215` | `ENFP × 3` sous « Types présents » | `L'enthousiaste × 3`, section renommée « Profils présents » |
| `src/components/MbtiTeamPanel.tsx:266` | `Dupont + Martin · INTJ` | pôles partagés en mots, ou suffixe supprimé |

**L'obstacle est typographique** : un surnom fait 3 à 5 fois la largeur d'un code,
dans un tableau et des badges calibrés pour 4 caractères. Réponse retenue : ajouter
un champ `short` aux 16 fiches de `src/data/mbti/profiles/v1.ts` (« Stratège »,
« Idéaliste »…) pour les emplacements serrés, surnom complet sur la fiche joueur.
C'est le seul ajout de données du plan.

Effet de bord bienvenu : le `X` des égalités (`ISXP`, cf. `scoring.ts:5`) disparaît
de l'écran avec les codes.

## Lot B — les 8 initiales de pôle

Le lot qui demande une décision de vocabulaire. Les libellés d'axe étant déjà maison,
on les prolonge — **proposition à valider, pas une décision prise** :

| Axe (libellé existant, inchangé) | Pôle A | Pôle B |
|---|---|---|
| Où je prends mon énergie | Dans le groupe | Dans le calme |
| Comment je recueille l'information | Les faits | Les possibilités |
| Comment je décide | La logique | L'humain |
| Comment je m'organise | Le cadre | La souplesse |

Points de rendu : barres d'axe (`MbtiPlayerPanel.tsx:164-168`,
`MbtiTeamPanel.tsx:196-200`), frictions `E vs I · 33 pts` et `Terrain commun : I, T`
(`MbtiTeamPanel.tsx:244` et `:250`), badges d'égalité `T/F à égalité` →
« Décision : à égalité ».

Détail technique : ce dernier libellé est fabriqué par `tieLabel`
(`src/data/mbti/scoring.ts:78`) — une chaîne d'affichage logée dans le module de
calcul, et le seul texte visible assertionné par un test
(`scoring.test.ts:96`). Le passage aux mots est l'occasion de sortir ce formatage du
scoring. Les autres tests portent sur le calcul (`res.code === 'ISFP'`) : ils restent
verts et gardent les codes en interne, c'est leur place.

## Lot C — les 16 textes `essence` *(décision de contenu)*

Chacun commence littéralement par le code : « *INTJ pense en systèmes et en scénarios
à long terme…* ». Réécriture de l'amorce seule, 16 fois, dans
`src/data/mbti/profiles/v1.ts`. Aucune logique touchée.

**Ce sont les textes du cahier des charges**, recopiés tels quels selon l'en-tête du
fichier : à ne pas réécrire sans accord explicite.

## Lot D — deux surnoms empruntés

`ENTP` « Le débatteur » et `ENTJ` « Le commandant » reprennent mot pour mot la
nomenclature 16Personalities FR. Les 14 autres sont des formulations distinctes.
Deux valeurs à réécrire.

## Ce qui ne bouge pas

Les 24 affirmations (formulations maison, échelle d'accord — le MBTI officiel est un
choix forcé A/B de 93 items), les libellés d'axe, les disclaimers, la page publique
joueur (elle ne restitue aucun résultat), la base.

## Décision restée ouverte

**Le code disparaît-il complètement de l'UI, ou reste-t-il quelque part pour le
staff ?** Recommandation : nulle part. Un coach qui a fait 16Personalities fera le
rapprochement via les axes ; l'afficher, c'est tendre la passerelle qu'on cherche
justement à retirer. Si le pont doit être gardé pour les utilisateurs actuels, un
survol sur les barres d'axe est le compromis le moins voyant.

## Découpage d'exécution

- **A + B** se tiennent seuls et se livrent ensemble : ~5 fichiers, un test à ajuster.
- **C** et **D** sont des décisions de contenu, indépendantes et livrables à part.

## Ce qui ne relève pas du camouflage

Effacer la ressemblance règle le risque de marque, pas le droit du travail. Pour des
joueuses sous contrat, le questionnaire reste une méthode d'évaluation au sens de
L.1222-2/-3 : information préalable, consultation du CSE, pertinence. La surface doit
être dé-brandée, la documentation rester honnête — une mention du type « typologie à
4 axes, inspirée des modèles de préférences » dans les CGU et en tête du panneau
staff. Masquer la méthode aux intéressés retournerait le problème contre nous.
