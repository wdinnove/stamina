/**
 * FAQ de la page d'aide.
 *
 * Seul contenu de l'aide qui ne se déduit PAS du code : le glossaire et les formules sont générés
 * depuis le registre d'indicateurs, précisément pour ne pas avoir à les réécrire ici.
 *
 * Critère d'entrée : une question réellement posée, ou un piège de lecture identifié. Pas une
 * documentation exhaustive — la doc technique vit dans `docs/CALCULS.md`.
 */
export interface FaqEntry {
  theme: string;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  // ── Lire les chiffres ──
  {
    theme: 'Lire les chiffres',
    question: "Pourquoi une joueuse qui joue peu ressort première au %USG ?",
    answer:
      "Parce qu'il y a deux colonnes différentes, et que celle qui trie n'est peut-être pas celle que vous croyez.\n\n" +
      "• %USG = la part des possessions de l'équipe qu'elle a utilisées. Une remplaçante très sollicitée sur 8 minutes y reste basse, mécaniquement.\n" +
      "• %USG/min = la même part rapportée aux minutes réellement jouées. Elle répond à « quand elle est sur le terrain, combien de ballons prend-elle ? ». C'est là qu'une joueuse à faible temps de jeu peut arriver en tête — et ce n'est pas une anomalie, c'est ce que la colonne mesure.\n\n" +
      "Regardez toujours la colonne Min à côté : un %USG/min élevé sur 6 minutes ne dit pas la même chose que sur 30.",
  },
  {
    theme: 'Lire les chiffres',
    question: "Je n'arrive pas à retrouver le %USG à la main avec la colonne Possessions",
    answer:
      "C'est normal : ce sont deux comptages de possessions différents, et c'est volontaire.\n\n" +
      "• La colonne « Possessions » affichée mesure le RYTHME du match : tirs tentés − rebonds offensifs + ballons perdus + 0,44 × lancers tentés. On retire les rebonds offensifs parce qu'ils prolongent la même possession.\n" +
      "• Le dénominateur du %USG compte les ACTIONS TERMINÉES par l'effectif : tirs tentés + ballons perdus + 0,44 × lancers tentés, sans retirer les rebonds offensifs.\n\n" +
      "La raison est simple : avec le second, la somme des %USG de toutes les joueuses fait exactement 100 %. Avec le premier, elle dépasserait 100 % et la colonne ne voudrait plus rien dire. L'écart entre les deux chiffres vaut le nombre de rebonds offensifs du match.",
  },
  {
    theme: 'Lire les chiffres',
    question: "Le même chiffre est différent d'un écran à l'autre, c'est un bug ?",
    answer:
      "Le plus souvent non : vérifiez d'abord la période sélectionnée. Performance individuelle et Performance collective ont chacune leur propre filtre de dates, et ils ne sont pas synchronisés.\n\n" +
      "À période identique, les deux écrans affichent le même chiffre : ils passent par le même calcul. Si un écart persiste à période égale, c'est un bug — signalez-le.",
  },
  {
    theme: 'Lire les chiffres',
    question: "Pourquoi la moyenne d'équipe ne correspond pas à la moyenne des semaines affichées ?",
    answer:
      "C'est un choix, pas une erreur, et il est structurel.\n\n" +
      "Un chiffre d'équipe est toujours la moyenne NON PONDÉRÉE des joueuses : chaque joueuse compte pour une, quel que soit son nombre de saisies. Sinon, deux blessées qui arrêtent de loguer feraient monter le RPE moyen sans que personne s'entraîne plus dur.\n\n" +
      "Conséquence mathématique : la valeur d'une période n'est pas la moyenne des valeurs de ses semaines. Aucune formule ne peut offrir les deux réconciliations à la fois dès que l'assiduité varie. L'app privilégie la cohérence avec la colonne des joueuses, qui est celle qu'on vérifie à l'œil.",
  },
  {
    theme: 'Lire les chiffres',
    question: "Que veut dire le « · 8 joueurs » à côté d'un chiffre d'équipe ?",
    answer:
      "Le nombre de joueuses sur lesquelles la moyenne est calculée. Comme chaque joueuse compte pour une, une moyenne sur 3 joueuses est beaucoup plus sensible qu'une moyenne sur 12 : une seule saisie inhabituelle peut la déplacer.\n\n" +
      "C'est pour ça que ce nombre est affiché systématiquement — sans lui, on ne peut pas juger de la solidité du chiffre.",
  },
  {
    theme: 'Lire les chiffres',
    question: "Pourquoi un pourcentage de saison n'est pas la moyenne des pourcentages des matchs ?",
    answer:
      "Parce que ce serait faux. Un match où une joueuse prend un seul tir et le rentre donnerait 100 %, et pèserait autant qu'un match à 20 tirs.\n\n" +
      "L'app additionne d'abord les tirs réussis et les tirs tentés sur toute la période, puis divise. C'est la seule méthode qui donne le vrai pourcentage.",
  },

  // ── Charge & bien-être ──
  {
    theme: 'Charge & bien-être',
    question: "Que signifie concrètement la charge en UA ?",
    answer:
      "UA = unité arbitraire. C'est l'effort ressenti (RPE, de 0 à 10) multiplié par la durée de la séance en minutes : 90 minutes à RPE 7 font 630 UA.\n\n" +
      "Le chiffre n'a pas de sens dans l'absolu — il sert à comparer une semaine à une autre, et à repérer les variations brutales. C'est la méthode standard (Foster), utilisée précisément parce qu'elle ne demande aucun matériel.",
  },
  {
    theme: 'Charge & bien-être',
    question: "L'ACWR est à 1,6, faut-il s'inquiéter ?",
    answer:
      "C'est un signal, pas un diagnostic. L'ACWR compare la charge des 7 derniers jours à celle des 28 derniers : au-dessus de 1,5, la charge a augmenté vite, ce que la littérature associe à un risque accru de blessure.\n\n" +
      "Deux réserves de lecture : il faut au moins 28 jours d'historique pour qu'il veuille dire quelque chose (l'app le signale sinon), et une reprise après coupure fait mécaniquement grimper le ratio sans qu'il y ait surcharge réelle.",
  },
  {
    theme: 'Charge & bien-être',
    question: "Pourquoi ai-je deux indicateurs de « charge habituelle » différents ?",
    answer:
      "Parce qu'ils viennent de deux modèles distincts, tous deux standards.\n\n" +
      "• L'ACWR compare 7 jours à 28 jours (Gabbett).\n" +
      "• La Fraîcheur (TSB) compare une fatigue à 7 jours à une forme construite sur 42 jours (Banister).\n\n" +
      "Ils ne sont donc pas censés coïncider. L'ACWR répond à « la charge a-t-elle augmenté trop vite ? », la fraîcheur à « la joueuse est-elle reposée aujourd'hui ? ».",
  },
  {
    theme: 'Charge & bien-être',
    question: "Pourquoi la fatigue affichée monte quand la joueuse va mieux ?",
    answer:
      "Les six axes de bien-être sont redressés à l'affichage : partout dans l'app, 10 = au mieux. La fatigue, le stress et les douleurs sont saisis dans le sens inverse (10 = épuisée), donc retournés avant affichage.\n\n" +
      "Sans ce redressement, une moyenne des six axes n'aurait aucun sens : les axes inversés annuleraient les autres.",
  },

  // ── Objectifs & tâches ──
  {
    theme: 'Objectifs & tâches',
    question: "Mes objectifs ont disparu au changement de saison.",
    answer:
      "Ils sont rattachés à une saison, volontairement : un objectif défini l'an dernier n'a pas à être évalué sur les matchs de cette année.\n\n" +
      "Le bouton « Reprendre la saison passée » recopie ceux que vous voulez garder. Le report est explicite plutôt qu'automatique : sinon on accumulerait chaque année des objectifs devenus hors sujet. Un second clic ne crée pas de doublons.",
  },
  {
    theme: 'Objectifs & tâches',
    question: "Que veut dire « — » à la place d'un verdict d'objectif ?",
    answer:
      "Il n'y a pas assez de données sur la fenêtre pour se prononcer. L'app préfère ne rien dire plutôt qu'afficher un « non atteint » qui ne serait qu'une absence de match.",
  },
  {
    theme: 'Objectifs & tâches',
    question: "Pourquoi « 3 derniers matchs » et pas « 3 dernières semaines » ?",
    answer:
      "Parce qu'un objectif de match se juge en matchs. La fenêtre compte bien 3 matchs joués, même s'ils sont étalés sur un mois ou concentrés sur un week-end de tournoi.",
  },

  // ── Archétypes ──
  {
    theme: 'Archétypes',
    question: "Un score d'archétype de 50 %, c'est bien ou pas ?",
    answer:
      "C'est le milieu du groupe. Un score situe la joueuse par rapport aux autres joueuses de son groupe de postes, pas sur une échelle absolue : 50 % veut dire « ni marquée ni à l'opposé » sur ce profil.\n\n" +
      "Un score bas n'est donc pas un défaut — il dit seulement que ce n'est pas son rôle.",
  },
  {
    theme: 'Archétypes',
    question: "Quelle différence entre le badge « ? » et le badge « Estimation » ?",
    answer:
      "• « ? » = fiabilité. Dépend de la joueuse : pas assez de matchs ou de minutes pour que son score soit significatif. Il disparaît quand l'échantillon grossit.\n" +
      "• « Estimation » = limite de méthode. Dépend du profil, jamais de la joueuse : ce rôle n'est pas entièrement mesurable avec les données saisies. Il ne disparaîtra pas avec le temps.",
  },
  {
    theme: 'Archétypes',
    question: "Pourquoi certains profils ont un nom descriptif plutôt qu'un nom de rôle ?",
    answer:
      "Parce qu'un profil ne doit rien promettre que ses indicateurs ne mesurent. Un « moteur d'énergie » se reconnaît aux déviations, ballons libres récupérés et écrans — aucune de ces données n'est saisie sur une feuille de match.\n\n" +
      "Plutôt que de garder un nom flatteur pour un calcul qui mesure autre chose, le profil s'appelle « Présence au rebond et au contact » : c'est exactement ce qu'il évalue.",
  },

  // ── Notifications ──
  {
    theme: 'Notifications',
    question: "Je ne reçois pas les notifications push sur iPhone.",
    answer:
      "iOS n'envoie de notifications push à une application web que si elle a été ajoutée à l'écran d'accueil. Ouvrez l'app dans Safari, puis Partager → « Sur l'écran d'accueil », et lancez-la depuis cette icône.\n\n" +
      "Vérifiez ensuite que l'appareil est bien abonné dans Mon profil → Notifications : l'interrupteur ne concerne que l'appareil utilisé.",
  },
  {
    theme: 'Notifications',
    question: "Pourquoi je ne peux pas couper les notifications « Dans l'app » ?",
    answer:
      "Elles alimentent votre centre de notifications, c'est-à-dire l'historique de ce qui s'est passé dans l'équipe. Il n'y a pas de réglage personnel pour les désactiver.\n\n" +
      "En revanche votre équipe peut les couper par catégorie, depuis Configuration → Équipe → Notifications. La colonne le reflète alors.",
  },
];
