import type { MbtiProfile, MbtiType } from '../types';

/** Référentiel statique des 16 fiches (version 1 — texte fourni avec le cahier des charges).
 *  Ces fiches ne se calculent pas : elles sont recopiées telles quelles et ne changent pas.
 *  Une révision du texte donnera un `v2.ts`, comme pour les archétypes. */
export const MBTI_PROFILES_V1: Record<MbtiType, MbtiProfile> = {
  ISTJ: {
    nick: 'Le gardien rigoureux',
    essence: "ISTJ s'appuie sur les faits, l'expérience et un sens aigu du devoir. C'est quelqu'un sur qui on peut compter : il respecte ses engagements et préfère la méthode à l'improvisation.",
    forces: [
      'Fiabilité à toute épreuve',
      "Sens de l'organisation et de la rigueur",
      'Respecte la parole donnée et les délais',
      'Bon sens pratique, ancré dans le réel',
    ],
    vigilances: [
      "Peut manquer de flexibilité face à l'imprévu",
      'Difficulté à lâcher une méthode qui a fait ses preuves, même si le contexte change',
      'Peut sembler froid ou distant en apparence',
    ],
    stress: [
      'Changements de dernière minute sans préavis',
      'Désordre ou manque de clarté dans les rôles',
      'Sentiment de ne pas être pris au sérieux dans son expertise',
      'Incohérence entre les décisions et les règles annoncées',
    ],
    motiv: [
      'Un cadre stable et des attentes claires',
      'La reconnaissance du travail accompli, sans excès',
      'La continuité dans les méthodes qui fonctionnent',
      'Voir les efforts se traduire en résultats concrets',
    ],
    comm: [
      "Donner l'information à l'avance, pas à la dernière minute",
      'Être factuel et concret, éviter les grandes envolées',
      'Respecter les process établis avant de les challenger',
      "Un simple « merci, c'est du bon travail » suffit, pas besoin d'en faire plus",
    ],
  },
  ISFJ: {
    nick: 'Le protecteur discret',
    essence: "ISFJ conjugue sens du service et attachement aux repères éprouvés. Discret et loyal, il veille à ce que chacun se sente bien, souvent en arrière-plan.",
    forces: [
      'Dévouement et fiabilité',
      "Sens du détail et de l'organisation",
      "Grande capacité d'écoute",
      'Loyauté durable envers le groupe',
    ],
    vigilances: [
      'Peut avoir du mal à dire non ou à poser ses limites',
      'Tend à absorber les tensions du groupe sans les exprimer',
      "Résiste au changement, surtout s'il remet en cause des habitudes éprouvées",
    ],
    stress: [
      'Conflits ouverts ou tensions non réglées',
      'Critique vécue comme un rejet personnel',
      "Sentiment de ne pas être valorisé pour ce qu'il apporte",
      'Désorganisation soudaine du cadre habituel',
    ],
    motiv: [
      'Se sentir utile et apprécié',
      'Un climat de confiance et de bienveillance',
      'La stabilité du groupe et des repères',
      'Une reconnaissance sincère, exprimée en privé',
    ],
    comm: [
      'Privilégier un ton chaleureux et personnel',
      'Donner le feedback correctif en tête-à-tête, jamais devant le groupe',
      "Prendre le temps de demander comment il va, pas seulement ce qu'il fait",
      'Éviter la confrontation frontale, préférer le dialogue posé',
    ],
  },
  INFJ: {
    nick: 'Le visionnaire discret',
    essence: "INFJ associe intuition et profondeur de valeurs. Réservé en apparence, il a souvent une vision claire de ce qui a du sens, et cherche la cohérence entre ce qu'il fait et ce qu'il croit.",
    forces: [
      'Vision à long terme',
      'Grande empathie et écoute fine',
      'Capacité à fédérer autour d\'une idée porteuse de sens',
      'Exigence envers lui-même',
    ],
    vigilances: [
      "Peut se replier s'il se sent incompris",
      'Tend à idéaliser puis se déçoit si la réalité ne suit pas',
      'Difficulté à exprimer un désaccord de façon directe',
    ],
    stress: [
      'Superficialité ou manque de sens dans les tâches',
      'Conflits de valeurs non résolus',
      "Sentiment d'être incompris ou pas écouté",
      'Environnement trop bruyant ou trop exposé socialement',
    ],
    motiv: [
      'Donner du sens à son travail',
      'Voir les autres progresser grâce à son accompagnement',
      'Cohérence entre discours et actions',
      "Un espace pour réfléchir avant d'agir",
    ],
    comm: [
      'Aller en profondeur plutôt que rester en surface',
      'Expliquer le « pourquoi » derrière une décision',
      'Lui laisser du temps pour intégrer un retour ou une information',
      'Éviter le small talk permanent, privilégier les échanges qui comptent',
    ],
  },
  INTJ: {
    nick: 'Le stratège',
    essence: "INTJ pense en systèmes et en scénarios à long terme. Indépendant et exigeant, il cherche à comprendre en profondeur avant d'agir, et préfère l'efficacité à l'agitation.",
    forces: [
      'Vision stratégique claire',
      'Capacité à structurer des idées complexes',
      'Indépendance de pensée',
      'Détermination une fois la décision prise',
    ],
    vigilances: [
      'Peut sembler distant ou trop critique',
      'Impatience face à ce qui lui semble inefficace ou irrationnel',
      'Difficulté à exprimer les émotions, les siennes comme celles des autres',
    ],
    stress: [
      'Incompétence non corrigée dans son environnement',
      'Décisions arbitraires prises sans logique',
      'Absence de vision ou de direction claire',
      'Devoir justifier sans cesse des évidences pour lui',
    ],
    motiv: [
      'Maîtriser un sujet en profondeur',
      'Améliorer les systèmes et les process en place',
      "Autonomie de réflexion et d'action",
      'Relever des défis intellectuellement stimulants',
    ],
    comm: [
      'Aller droit au but, éviter le flou',
      'Présenter des arguments logiques et structurés',
      "Accepter le débat d'idées sans le prendre pour de l'opposition personnelle",
      "Ne pas s'attendre à beaucoup d'expression émotionnelle en retour, ce n'est pas un désintérêt",
    ],
  },
  ISTP: {
    nick: "L'artisan pragmatique",
    essence: "ISTP aime comprendre comment les choses fonctionnent, en testant plutôt qu'en théorisant. Calme sous pression, il agit avec efficacité quand la situation l'exige.",
    forces: [
      "Sang-froid dans l'urgence",
      'Sens pratique et habileté technique',
      "Autonomie et capacité d'adaptation rapide",
      'Discrétion, pas de besoin de mise en avant',
    ],
    vigilances: [
      'Peut sembler détaché ou peu impliqué émotionnellement',
      "Résiste aux règles qu'il juge arbitraires",
      'Communique peu spontanément ses ressentis',
    ],
    stress: [
      'Règles rigides imposées sans justification',
      'Être surveillé de près ou micromanagé',
      'Trop de réunions, pas assez d\'action concrète',
    ],
    motiv: [
      "Liberté d'action et autonomie",
      'Défis concrets à résoudre soi-même',
      'Confiance accordée sans contrôle permanent',
      'Voir un résultat tangible de son travail',
    ],
    comm: [
      'Rester court et concret, éviter les longs discours',
      "Lui laisser de l'espace, ne pas insister s'il se referme",
      'Préférer montrer plutôt qu\'expliquer longuement',
      "Respecter son besoin d'autonomie dans l'exécution",
    ],
  },
  ISFP: {
    nick: "L'artisan discret",
    essence: "ISFP agit avec authenticité, guidé par ses valeurs et son ressenti plus que par les conventions. Ancré dans le concret et le moment présent, il exprime peu ses émotions par les mots mais beaucoup par l'action.",
    forces: [
      'Authenticité et sincérité',
      'Sens esthétique et souci du détail',
      "Adaptabilité dans l'instant",
      "Grande capacité d'engagement discret et durable",
    ],
    vigilances: [
      "Peut éviter le conflit au point de ne pas exprimer un désaccord réel",
      'Sensible aux critiques, même bien intentionnées',
      'Difficulté à se projeter sur le très long terme',
    ],
    stress: [
      'Être mis en avant publiquement ou devoir « performer » devant un public',
      'Critique perçue comme une attaque personnelle',
      "Cadre trop rigide, sans place pour l'ajustement",
      'Conflit non résolu qui traîne',
    ],
    motiv: [
      'Impact concret et visible sur le terrain',
      'Climat de confiance et de respect mutuel',
      "Liberté de s'adapter à la situation plutôt que suivre un protocole figé",
      'Reconnaissance sincère de la qualité de son travail',
    ],
    comm: [
      'Privilégier le tête-à-tête, surtout pour un feedback correctif',
      'Être concret, avec des exemples précis, pas des généralités',
      "Expliquer le pourquoi d'une décision plutôt que l'imposer",
      "Laisser de l'espace pour réagir, sans forcer une réponse immédiate",
    ],
  },
  INFP: {
    nick: "L'idéaliste",
    essence: "INFP vit en cohérence avec ses valeurs profondes, avec une grande sensibilité et une forte créativité intérieure. Il s'engage pleinement dès qu'il trouve du sens à ce qu'il fait.",
    forces: [
      'Créativité et originalité',
      'Fidélité à ses valeurs',
      'Empathie sincère',
      "Capacité à s'investir à fond dans une cause",
    ],
    vigilances: [
      'Peut se démotiver brutalement si le sens disparaît',
      'Sensible aux critiques perçues comme un jugement de valeur',
      "Tendance à l'auto-critique excessive",
    ],
    stress: [
      'Conflits de valeurs non résolus',
      'Critiques dures ou jugement rapide',
      'Pression de conformité au groupe',
      'Sentiment de trahir ce en quoi il croit',
    ],
    motiv: [
      'Cohérence entre valeurs et actions',
      'Espace pour exprimer sa créativité',
      'Une cause ou un projet porteur de sens',
      'Relations authentiques, sans faux-semblant',
    ],
    comm: [
      'Aborder les choses avec bienveillance avant tout',
      "Éviter le jugement direct ou l'ironie",
      'Laisser du temps pour intégrer un retour, ne pas exiger une réaction immédiate',
      "Valoriser l'intention autant que le résultat",
    ],
  },
  INTP: {
    nick: 'Le penseur',
    essence: "INTP explore les idées et les systèmes par curiosité intellectuelle pure. Indépendant d'esprit, il aime comprendre en profondeur avant de conclure, et se méfie des évidences non démontrées.",
    forces: [
      "Capacité d'analyse fine",
      'Créativité conceptuelle',
      'Honnêteté intellectuelle',
      'Autonomie de pensée',
    ],
    vigilances: [
      "Peut sur-analyser au point de retarder l'action",
      "Se désintéresse vite d'une tâche répétitive",
      'Peu sensible aux enjeux relationnels du groupe si non signalés explicitement',
    ],
    stress: [
      'Routine sans intérêt intellectuel',
      'Décisions imposées sans logique claire',
      'Pression sociale à se conformer sans argument valable',
    ],
    motiv: [
      'Comprendre un sujet en profondeur',
      'Résoudre des problèmes nouveaux et complexes',
      'Liberté de penser différemment',
      "Débattre d'idées sans enjeu personnel",
    ],
    comm: [
      "Présenter des arguments rigoureux, pas des appels à l'autorité",
      'Accepter le débat sans le vivre comme un conflit',
      "Laisser de l'espace pour explorer avant de trancher",
      "Éviter d'exiger une adhésion immédiate sans explication",
    ],
  },
  ESTP: {
    nick: "L'homme d'action",
    essence: "ESTP vit dans l'instant et privilégie l'action à la réflexion prolongée. Énergique et pragmatique, il excelle quand il faut réagir vite et concrètement.",
    forces: [
      'Efficacité sous pression',
      "Sens pratique et rapidité d'exécution",
      'Aisance sociale et énergie contagieuse',
      'Capacité à saisir les opportunités',
    ],
    vigilances: [
      "Peut agir avant d'avoir pris le temps d'anticiper",
      'Se lasse vite des tâches répétitives ou théoriques',
      'Prend parfois des risques sans en mesurer toutes les conséquences',
    ],
    stress: [
      "Trop de théorie, pas assez d'action concrète",
      'Lenteur ou processus qui traînent',
      "Sentiment d'être bridé dans son autonomie",
    ],
    motiv: [
      'Résultats rapides et visibles',
      'Compétition et challenge',
      'Action directe sur le terrain',
      "Liberté de décider dans l'instant",
    ],
    comm: [
      'Être direct et concret, sans détour',
      'Garder un rythme rapide dans les échanges',
      'Éviter les longues explications théoriques',
      "Passer vite à « qu'est-ce qu'on fait maintenant »",
    ],
  },
  ESFP: {
    nick: 'Le showman',
    essence: "ESFP apporte de l'énergie et de la spontanéité au groupe. Chaleureux et sociable, il vit pleinement le moment présent et aime que les autres se sentent bien autour de lui.",
    forces: [
      'Enthousiasme communicatif',
      'Grande aisance relationnelle',
      "Adaptabilité dans l'instant",
      'Capacité à désamorcer les tensions par la légèreté',
    ],
    vigilances: [
      'Peut éviter les sujets difficiles pour préserver la bonne ambiance',
      'Sensible aux critiques, surtout en public',
      'Difficulté à se projeter sur le long terme',
    ],
    stress: [
      'Isolement prolongé',
      'Critiques publiques dures',
      'Routine trop stricte, sans place pour la spontanéité',
    ],
    motiv: [
      'Interactions humaines fréquentes',
      "Plaisir et énergie dans l'action",
      'Reconnaissance de ses pairs',
      'Ambiance positive au sein du groupe',
    ],
    comm: [
      'Adopter un ton positif et chaleureux',
      'Donner le feedback difficile avec tact, en privé',
      'Éviter la froideur ou la distance excessive',
      'Valoriser ses efforts autant que ses résultats',
    ],
  },
  ENFP: {
    nick: "L'enthousiaste",
    essence: "ENFP se nourrit de nouvelles idées et de connexions humaines authentiques. Curieux et inspirant, il voit du potentiel presque partout et communique facilement son enthousiasme.",
    forces: [
      'Créativité et vision des possibles',
      'Capacité à motiver et fédérer',
      'Grande adaptabilité',
      'Empathie sincère',
    ],
    vigilances: [
      'Peut se disperser entre plusieurs projets à la fois',
      'Se démotive si le sens ou la nouveauté disparaît',
      'Difficulté avec les tâches répétitives ou très cadrées',
    ],
    stress: [
      'Routine rigide et répétitive',
      'Manque de sens dans les tâches confiées',
      'Micromanagement ou contrôle excessif',
    ],
    motiv: [
      'Nouvelles idées à explorer',
      'Connexion humaine authentique',
      'Projets porteurs de sens',
      "Liberté de proposer et d'innover",
    ],
    comm: [
      'Partager son enthousiasme, pas seulement des consignes',
      "Laisser de la place à la créativité dans l'exécution",
      'Éviter le cadre trop strict sans justification',
      "L'impliquer dans la réflexion, pas seulement dans l'exécution",
    ],
  },
  ENTP: {
    nick: 'Le débatteur',
    essence: "ENTP aime challenger les idées et explorer des angles nouveaux. Vif d'esprit et à l'aise dans la contradiction, il stimule le groupe par ses questions et ses remises en cause.",
    forces: [
      "Créativité et esprit d'innovation",
      "Aisance dans le débat d'idées",
      'Capacité à voir plusieurs perspectives à la fois',
      'Énergie intellectuelle contagieuse',
    ],
    vigilances: [
      "Peut challenger au point d'épuiser le groupe",
      "Se lasse vite une fois l'idée explorée, moins motivé par l'exécution",
      'Peut froisser sans le vouloir en cherchant simplement à débattre',
    ],
    stress: [
      'Routine, absence de challenge intellectuel',
      'Rigidité imposée sans justification',
      'Sentiment de ne pas pouvoir remettre en question ce qui ne fonctionne pas',
    ],
    motiv: [
      'Débattre et confronter les idées',
      'Innover, trouver un angle nouveau',
      'Résoudre des problèmes inédits',
      'Liberté intellectuelle',
    ],
    comm: [
      'Accepter le débat sans le prendre pour un conflit personnel',
      "Répondre par des arguments solides plutôt que par l'autorité seule",
      'Canaliser son énergie vers des objectifs concrets',
      'Ne pas confondre son besoin de débattre avec de l\'opposition systématique',
    ],
  },
  ESTJ: {
    nick: "L'organisateur",
    essence: "ESTJ structure, décide et avance vers les résultats sans détour. Il aime que les rôles soient clairs et que chacun tienne ses engagements.",
    forces: [
      "Sens de l'organisation",
      'Leadership naturel et décisif',
      'Fiabilité et rigueur',
      'Capacité à faire avancer les choses concrètement',
    ],
    vigilances: [
      'Peut sembler autoritaire ou trop directif',
      'Impatience face à ce qui lui semble inefficace',
      'Difficulté à intégrer des approches différentes de la sienne',
    ],
    stress: [
      "Désordre et inefficacité dans l'organisation",
      'Non-respect des règles établies',
      'Décisions prises sans structure claire',
    ],
    motiv: [
      'Efficacité et ordre',
      'Résultats mesurables et concrets',
      'Structure claire des rôles et responsabilités',
      'Reconnaissance de sa compétence',
    ],
    comm: [
      'Être direct, structuré et factuel',
      "Aller à l'essentiel, éviter le flou",
      'Présenter les choses avec un plan clair',
      "Respecter la chaîne de décision qu'il a mise en place",
    ],
  },
  ESFJ: {
    nick: 'Le rassembleur',
    essence: "ESFJ veille à la cohésion et au bien-être du groupe. Chaleureux et organisé, il aime que chacun se sente inclus et que l'ambiance reste positive.",
    forces: [
      "Sens du collectif et de l'organisation",
      'Loyauté et fiabilité',
      "Grande capacité d'attention aux autres",
      'Capacité à fédérer autour de repères clairs',
    ],
    vigilances: [
      'Peut avoir du mal à gérer un désaccord ouvert',
      'Sensible aux tensions non résolues dans le groupe',
      "Cherche parfois l'approbation au détriment de ses propres besoins",
    ],
    stress: [
      'Conflits non résolus dans le groupe',
      'Critiques dures ou publiques',
      'Manque de reconnaissance pour son investissement',
    ],
    motiv: [
      'Harmonie et bonne ambiance du groupe',
      'Se sentir utile et apprécié',
      'Reconnaissance sociale de ses efforts',
      'Repères clairs et stables',
    ],
    comm: [
      'Adopter un ton chaleureux et personnel',
      'Valoriser publiquement, corriger en privé',
      'Donner le feedback avec tact et bienveillance',
      'Prendre le temps de la reconnaissance, même simple',
    ],
  },
  ENFJ: {
    nick: 'Le mobilisateur',
    essence: "ENFJ fédère et fait grandir les autres avec un charisme naturel. Empathique et engagé, il perçoit vite les dynamiques du groupe et cherche à en tirer le meilleur pour chacun.",
    forces: [
      'Charisme et capacité à fédérer',
      'Grande empathie',
      'Vision claire de ce qui fait grandir les autres',
      'Engagement sincère envers le collectif',
    ],
    vigilances: [
      "Peut s'oublier au profit du groupe",
      'Sensible aux tensions et aux non-dits',
      'Peut idéaliser les autres puis être déçu si la réalité ne suit pas',
    ],
    stress: [
      'Conflits de valeurs dans le groupe',
      'Tensions non exprimées ou non résolues',
      "Manque d'authenticité perçu chez les autres",
    ],
    motiv: [
      'Faire grandir les autres',
      "Cohésion et unité d'équipe",
      'Sens et impact collectif',
      'Relations authentiques et sincères',
    ],
    comm: [
      "Miser sur l'authenticité avant tout",
      'Donner un feedback constructif avec bienveillance',
      "L'impliquer dans les décisions qui le concernent",
      'Reconnaître son investissement, pas seulement les résultats',
    ],
  },
  ENTJ: {
    nick: 'Le commandant',
    essence: "ENTJ structure vite une situation complexe et avance avec détermination vers ses objectifs. Stratège et décisif, il aime diriger et voir les choses progresser.",
    forces: [
      'Leadership naturel et vision stratégique',
      'Capacité à structurer rapidement le chaos',
      'Détermination et ambition',
      "Compétence reconnue dans l'action",
    ],
    vigilances: [
      'Peut sembler dominant ou impatient',
      "Peu tolérant face à l'inefficacité perçue",
      'Peut sous-estimer l\'impact émotionnel de ses décisions',
    ],
    stress: [
      'Inefficacité et manque de vision chez les autres',
      'Résistance sans argument solide',
      'Sentiment de perdre du temps sur des détails secondaires',
    ],
    motiv: [
      'Atteindre des objectifs ambitieux',
      'Structurer et diriger',
      'Compétence reconnue autour de lui',
      'Progrès visible et mesurable',
    ],
    comm: [
      'Être direct, compétent et factuel',
      "Aller vite à l'essentiel",
      'Présenter les arguments avec assurance',
      'Éviter la lenteur ou le flou dans les échanges',
    ],
  },
};

/** Les 16 types, dans l'ordre du référentiel. */
export const MBTI_TYPES = Object.keys(MBTI_PROFILES_V1) as MbtiType[];
