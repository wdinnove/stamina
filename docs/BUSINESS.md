# Stamina — plan de commercialisation

> Rédigé le 15 août 2026, à partir de l'état du dépôt à cette date : ~49 k lignes,
> 27 pages, 41 tables, 148 policies RLS, multi-tenant en place
> (`organizations` → `teams` → `seasons`), 5 domaines croisés (match, charge,
> bien-être, médical, assiduité) + tactique + archétypes + PCA.
>
> Ce document est une analyse, pas un conseil juridique. La section 5 identifie les
> risques et l'ordre dans lequel les traiter ; les rédactions contractuelles et
> l'AIPD doivent être relues par un avocat ou un DPO.

---

## 1. Ce que Stamina vend (et ce qu'il ne vend pas)

Ne pas vendre « une app de stats ». Ce marché est pris (Hudl, Genius, les feuilles
FFBB) et se perd sur la vidéo.

Ce que personne ne donne à un club de NM2/NF2, et qui existe déjà ici :

> **Le croisement charge × bien-être × médical × performance, avec un verdict
> « risque de blessure — maintenant ».**

ACWR, PMC/TSB, corrélations décalées avec ancrage sur match
([`src/data/crossAnalysis.ts`](../src/data/crossAnalysis.ts)) — c'est de la science
du sport qu'on trouve chez Kitman Labs ou Smartabase à 15–40 k€/an, réservée aux
clubs pros. Vendable ici à 490 €. **C'est le pitch en une phrase.**

Le reste (séances, exercices, tactique, archétypes) est la raison pour laquelle les
clubs restent abonnés, pas la raison pour laquelle ils signent.

**Ce qui manque pour vendre** : facturation, onboarding self-service, page de vente,
contrat, mode démo. ≈ 3–4 semaines de travail, pas 6 mois.

---

## 2. Marché et segments

| Segment | Volume FR | Budget annuel type | Prêt à payer |
|---|---|---|---|
| Clubs régionaux / départementaux | ~3 500 | 20–80 k€ | 0–300 € |
| **NM2/NM3, NF2/NF3** | ~500 équipes | 80–300 k€ | **400–900 €** |
| **NM1, NF1, centres de formation, pôles** | ~150 structures | 0,3–1,5 M€ | **1 500–4 000 €** |
| Pro B / Betclic Élite / LFB | ~50 | 2–12 M€ | 5–20 k€ (cycle long, appel d'offres, DSI) |
| Hors basket (hand, volley, rugby amateur) | ×5 le marché | idem | idem, après adaptation |

**Cible année 1** : NM2/NF2 + NM1 + centres de formation, en France, en basket.
~600 structures adressables.

- 3 % = 18 clients ≈ **15 k€ ARR**
- 10 % à 3 ans ≈ **60–80 k€ ARR**

Très bon complément de revenu solo, pas une licorne — et c'est cohérent avec une
structure de coûts quasi nulle.

---

## 3. Modèle de licence

**Par équipe, par saison, facturé d'avance, aligné sur le calendrier sportif
(1er juillet – 30 juin).**

Pourquoi pas de per-seat : le staff d'un club amateur, c'est 3 à 8 bénévoles ;
facturer au siège tue l'adoption et oblige à policer les comptes partagés.
Pourquoi pas de per-player : ça pénalise les groupes larges, exactement ceux qui ont
le plus besoin de l'outil.

| Formule | Contenu | Prix HT / saison |
|---|---|---|
| **Découverte** | 1 équipe, RPE + bien-être + assiduité, 1 saison d'historique, ≤20 joueurs, sans médical ni export | **0 €** |
| **Équipe** | 1 équipe, tout sauf module médical, staff illimité, historique illimité | **490 €** |
| **Club** | jusqu'à 5 équipes, espace club, comparaison inter-équipes, rôles par équipe | **1 490 €** |
| **Performance** | équipes illimitées, module médical, module personnalité, support prioritaire, onboarding | **3 900 €** |
| Add-on onboarding | paramétrage, import historique, 2 h de formation staff en visio | **690 €** one-shot |

**Repère de vente** : 490 € ≈ **35 € par joueuse et par saison**, soit moins qu'une
licence FFBB. C'est l'argument qui ferme la discussion en comité directeur.
1 490 € pour 5 équipes = le prix d'un jeu de maillots.

Trois règles :

1. **Facturer en juin–août.** 80 % des signatures s'y feront ; le reste de l'année
   sert à construire le pipe.
2. **Remise ligue/comité : −30 %** si un comité départemental achète pour ≥10 clubs.
   C'est le canal de distribution le moins cher.
3. **Gratuité assumée pour le club actuel**, en échange du droit de le citer en
   référence et d'un témoignage vidéo du coach. Une référence NF2 vaut plus que 490 €.

---

## 4. Économie unitaire

Coûts fixes, hors module médical :

| Poste | € / an |
|---|---|
| Supabase Pro + Vercel Pro + MailerSend | ~800 |
| Domaine, facturation (Stripe ~1,5 %) | ~200 |
| Assurance RC Pro éditeur logiciel | 500–900 |
| Comptabilité (SASU) | 800–1 500 |
| **Total** | **~2 500–3 500** |

**Seuil de rentabilité : 6 à 8 clients formule Équipe.** Au-delà, tout est marge
jusqu'à ~200 clubs (l'infra reste sous 3 000 €/an).

**Le vrai coût variable est le temps de support** : ~2–4 h par club le premier mois,
puis ~1 h/mois. Au-delà de **40 clients**, intenable seul → recruter ou plafonner.

**Ne pas prendre d'investisseur.** Ce produit n'a pas besoin de capital, il a besoin
de 20 coachs convaincus.

---

## 5. Problèmes juridiques, par ordre de gravité

### 🔴 5.1 Hébergement de données de santé (HDS) — le seul vrai bloquant

L'article L.1111-8 du Code de la santé publique impose une **certification HDS** à
quiconque héberge, pour le compte d'un tiers, des données de santé « recueillies à
l'occasion d'activités de prévention, de diagnostic, de soins ».

La table [`medical_records`](../schema.sql) contient diagnostic, localisation,
gravité, traitement et protocole de retour au jeu, saisis par un kiné ou un médecin
(`staff.role IN ('kine','medecin')`). Dès qu'un professionnel de santé s'en sert
dans un contexte de soin → **hébergement de données de santé**.

Or **ni Supabase ni Vercel ne sont certifiés HDS**. La certification coûte
15–30 k€ en initial + audits annuels, ou impose de migrer vers un hébergeur certifié
(OVHcloud, Scaleway, Clever Cloud, Outscale).

**Marche à suivre :**

1. **Année 1 : ne pas commercialiser le module médical.** Les formules Équipe et
   Club l'excluent. On garde 90 % de la valeur avec 10 % du risque.
2. Requalifier ce qui reste en **« indisponibilité sportive »** : statut, dates,
   zone corporelle — sans diagnostic ni traitement, saisi par le coach et non par un
   soignant. Reste une donnée de l'article 9 RGPD (consentement + AIPD), mais
   l'argument HDS tombe largement.
3. **Le bien-être / POMS est un cas plus favorable** : auto-déclaration à un
   entraîneur pour piloter la charge, hors contexte de soin. Article 9 oui, HDS
   probablement non — mais cette position doit être écrite noir sur blanc dans l'AIPD.
4. Le module médical complet devient une option **Performance**, vendue seulement
   avec un hébergement HDS. Pari année 3, quand 3 clubs pros le demandent et le
   financent.

### 🔴 5.2 RGPD — Stamina est sous-traitant, le club est responsable de traitement

À produire **avant la première facture** :

- **Contrat de sous-traitance article 28 (DPA)** annexé aux CGV : finalités, durée,
  sécurité, sous-traitants ultérieurs (Supabase, Vercel, MailerSend, Google OAuth),
  assistance, réversibilité, suppression en fin de contrat.
- **Registre article 30.2** (celui du sous-traitant — court).
- **AIPD (DPIA) modèle**, offerte au club. **Obligatoire ici** : données de santé +
  suivi systématique + mineurs = trois critères CNIL. La livrer pré-remplie est un
  argument de vente majeur, aucun club amateur ne sait la faire.
- **Base légale** : consentement explicite du joueur, révocable, **sans conséquence
  sportive au refus**, et prouvable. Pour une joueuse pro salariée, le déséquilibre
  coach/joueuse fragilise le consentement → imposer au club une information écrite
  préalable et l'avis du CSE quand il existe.
- **Mineurs** : les équipes U18/U21 déclenchent l'article 8 (15 ans en France) →
  consentement parental, formulaire dédié, mentions en langage clair. Sujet de
  premier ordre, pas une note de bas de page.
- **Transferts hors UE** : Vercel Inc. et MailerSend sont américains. Vérifier
  région Supabase = EU, signer CCT/DPF, documenter la liste des sous-traitants. À
  terme, un front hébergé en Europe est un argument commercial (et un déblocage pour
  les structures fédérales).

### 🟠 5.3 « MBTI » est une marque déposée

`MBTI` est une marque de The Myers-Briggs Company. Le module produit les 16 codes
canoniques — **dans un produit commercial**. Risque de contrefaçon de marque réel et
facile à éviter.

**État au 17 août 2026** : le sigle n'est plus visible nulle part côté utilisateur.
Il n'apparaissait dans aucun texte d'UI ni d'email ; la dernière surface exposée
était l'URL publique `/joueur/:id/mbti`, devenue `/joueur/:id/personnalite` (l'ancien
chemin redirige, les liens déjà envoyés continuent d'aboutir). Restent en base la
table `mbti_responses` et deux fonctions `SECURITY DEFINER` appelées depuis le
navigateur — non affichées, mais lisibles dans l'onglet Réseau.

**Ce qui trahit encore l'origine**, indépendamment du sigle : les 16 codes à 4
lettres affichés en évidence (fiche joueur, tableau d'effectif, « Types présents »),
les 8 initiales de pôle sur les barres d'axe, et les `essence` des fiches qui
commencent toutes par le code. La note précédente disait « les lettres peuvent
rester (usage de 16Personalities) » : vrai sur le plan de la marque, faux sur le plan
de la perception — ce sont elles qui rendent la source reconnaissable au premier coup
d'œil. Voir [le plan de dé-lettrisation](DELETTRISATION.md).

Deux surnoms de type reprennent mot pour mot la nomenclature 16Personalities FR
(`ENTP` « Le débatteur », `ENTJ` « Le commandant ») : seuls emprunts textuels exacts
relevés, à réécrire.

Le questionnaire lui-même n'expose rien : 24 affirmations maison en échelle d'accord,
là où le MBTI officiel est un choix forcé A/B de 93 items. Les libellés d'axes sont
des phrases en français courant, pas la nomenclature canonique.

### 🟠 5.4 Psychométrie et droit du travail

Pour des joueuses sous contrat, un questionnaire de personnalité est une **méthode
d'évaluation** au sens des articles L.1222-2 et L.1222-3 du Code du travail :
pertinence par rapport à la finalité, information préalable de la salariée,
information/consultation du CSE. Si un profil sert à écarter quelqu'un d'un rôle,
on entre dans le champ de la discrimination (L.1132-1).

Les commentaires de [`src/data/mbti/types.ts`](../src/data/mbti/types.ts) disent
déjà l'essentiel (« outil indicatif, jamais un diagnostic », « rien ici ne doit
servir à écarter un joueur »). **Faire remonter cette mention dans l'UI, dans les
CGU, et en tête du panneau staff.**

Le module « frictions » ([`src/data/mbti/friction.ts`](../src/data/mbti/friction.ts))
est le plus explosif de l'app en cas de litige RH → le réserver à la formule
Performance, avec acceptation explicite d'une clause d'usage.

### 🟠 5.5 « Risque de blessure » — la frontière du dispositif médical

Revendiquer la **prévention d'une blessure** rapproche de la définition du
dispositif médical (règlement UE 2017/745), donc du marquage CE. L'app est
aujourd'hui du bon côté : sortie descriptive, facteurs listés, pas de verdict
clinique ([`RiskVerdictCard.tsx`](../src/components/RiskVerdictCard.tsx)).
**C'est le vocabulaire commercial qui peut faire basculer.**

- À bannir du site : « prévient les blessures », « détecte », « diagnostique ».
- À utiliser : « signale des situations de charge inhabituelle », « aide à la
  décision de l'encadrement ».
- **Ne pas ajouter de modèle prédictif entraîné sans avis juridique** — ce serait le
  moment où l'AI Act (annexe III, évaluation dans le contexte du travail) et le MDR
  deviennent tous deux discutables.

### 🟡 5.6 Propriété du code — à vérifier immédiatement

L'article L.113-9 du CPI attribue **automatiquement à l'employeur** les droits sur
un logiciel créé par un salarié dans l'exercice de ses fonctions. Si une ligne de
Stamina a été écrite sur temps de travail, matériel pro, ou dans le champ de la
mission, la propriété est discutable — et c'est exactement ce qu'un acquéreur ou un
client grand compte vérifiera.

**Faire signer une attestation de non-revendication par l'employeur, datée, avant de
facturer quoi que ce soit.** Une page, gratuite aujourd'hui, impossible à obtenir
après un désaccord.

Accessoirement : [`ATTRIBUTIONS.md`](../ATTRIBUTIONS.md) mentionne des photos
Unsplash issues de Figma Make → vérifier qu'aucune ne subsiste en production.

### 🟡 5.7 Structure, contrat, assurance

- **SASU** plutôt que micro-entreprise : responsabilité limitée (données de santé),
  crédibilité auprès des clubs et ligues, possibilité de rester à l'IS sans se verser
  de salaire. Surcoût comptable (~1 000 €/an) absorbé dès 3 clients.
- **CGV + contrat de licence SaaS** : durée = saison, non-cession, disponibilité
  *best effort* **sans SLA chiffré au début** (ne jamais écrire 99,9 % en solo),
  limitation de responsabilité au montant de l'abonnement, **exclusion explicite de
  toute responsabilité en cas de blessure d'un joueur**.
- **RC Pro éditeur de logiciel** avec extension cyber/RGPD — 500–900 €/an,
  indispensable dès le premier client payant.
- **Réversibilité** : export complet des données du club en un clic, garanti
  contractuellement. Obligation RGPD *et* meilleure réponse à l'objection « et si tu
  arrêtes ? ». Prévoir un séquestre de code pour les gros contrats.

---

## 6. Feuille de route 12 mois

**T1 (sept–déc)** — Dé-lettriser le module de personnalité (le sigle, lui, est déjà
parti de toute surface visible — cf. 5.3). Sortir le module médical des formules
vendues. Rédiger DPA + CGV + AIPD modèle. Obtenir l'attestation employeur. Créer la
SASU. En parallèle : faire tourner l'app sur le club actuel, filmer 3 témoignages,
produire 5 captures d'écran vendeuses.

**T2 (jan–mars)** — Facturation Stripe, onboarding self-service, page de vente.
Démarcher **20 clubs NM2/NF2 de la ligue**, en direct, **par le coach** — jamais par
le secrétariat. Objectif : 5 pilotes gratuits jusqu'en juin.

**T3 (avr–juin)** — Convertir les pilotes en payants pour la saison suivante.
Approcher **un comité départemental ou une ligue régionale** avec une offre groupée.
Moment décisif : les budgets clubs se votent en mai–juin.

**T4 (juil–août)** — Encaisser la saison. Objectif réaliste : **12–20 clients,
8–15 k€ HT**. Puis arbitrer : creuser le basket, ou porter au handball (le modèle de
données est générique à ~80 % — seuls `basketball_position`, le CSV feuille de match
FFBB et les archétypes sont spécifiques).

---

## 7. Le piège principal

La tentation naturelle sera d'ajouter des fonctionnalités (113 commits en deux mois).
**Le produit n'est plus le problème.** À partir de maintenant, chaque heure passée à
coder une fonctionnalité de plus est une heure non passée à parler à un coach. Le
premier chèque validera plus d'hypothèses que six mois de développement.
