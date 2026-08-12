/**
 * Échelle unique des plans de superposition (z-index).
 *
 * Elle existe parce que son absence produisait des bugs visibles : la modale était sous les barres
 * de navigation (son haut et son bas passaient dessous sur mobile), et le tiroir de navigation
 * plein écran s'affichait sous la TopBar, si bien qu'on voyait deux en-têtes superposés.
 *
 * `bars` est la référence : tout ce qui doit recouvrir la navigation monte au-dessus. Les valeurs
 * sont espacées de 50 pour laisser de la place à un intercalaire sans tout renuméroter.
 *
 * ⚠️ Ne pas écrire de z-index en dur dans un composant. Si un besoin n'entre dans aucun plan
 * ci-dessous, ajouter une entrée ici avec son intention, pas un nombre magique sur place.
 */
export const LAYER = {
  /** Bouton de repli de la sidebar desktop — dans le flux de la sidebar, pas un plan flottant. */
  sidebarToggle: 10,
  /** Sidebar desktop. Sous les barres : elle ne les chevauche pas. */
  sidebar: 50,
  /** Bouton flottant de recherche (mobile). Au-dessus du contenu, sous les barres qu'il ne
   *  chevauche pas (il est posé au-dessus de la barre du bas, pas dessus). */
  fab: 150,
  /** TopBar et MobileBottomBar. Référence de l'échelle. */
  bars: 200,
  /** Voile sombre du tiroir de navigation mobile. */
  drawerOverlay: 290,
  /** Tiroir de navigation mobile plein écran. Recouvre les barres : son propre en-tête (logo +
   *  croix) remplace la TopBar, sinon les deux se superposent. */
  drawer: 300,
  /** Menus déroulants et popovers ancrés : sélecteur d'équipe, barres de filtres, cellules de
   *  présence. Au-dessus des barres, car certains sont positionnés en `fixed`. */
  dropdown: 350,
  /** Modales. */
  modal: 400,
  /** Modale ouverte PAR-DESSUS une autre — typiquement une confirmation de suppression lancée
   *  depuis un formulaire déjà en modale. */
  modalOverModal: 500,
  /** Visionneuse d'image plein écran. */
  lightbox: 600,
} as const;

/**
 * Marge verticale à réserver dans une modale pour ne pas passer sous les barres de navigation
 * mobiles (56 px de haut, 56 px en bas, + une respiration). Voir `Modal`.
 */
export const MOBILE_BAR_INSET = 72;
