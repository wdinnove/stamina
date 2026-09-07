/**
 * Joueurs proposés dans un sélecteur d'historique (RPE, bien-être).
 *
 * L'effectif de la saison, puis les partenaires d'entraînement venus au moins une fois avec
 * l'équipe : leurs saisies sont bien enregistrées, elles doivent rester consultables les jours
 * où ils ne sont pas pointés. Le reste du club — les autres équipes — n'a rien à faire dans
 * cette liste : la RLS des joueurs est cadrée par ORGANISATION, pas par équipe, si bien qu'une
 * liste org-wide fait défiler tout le club pour choisir un de ses quinze joueurs.
 *
 * `selectedId` est ajouté s'il manque : on arrive aussi ici par lien direct (ligne d'une séance,
 * favori, retour arrière), et un `<select>` dont la valeur ne correspond à aucune option
 * s'affiche vide.
 */
export function historyPlayerOptions<T extends { id: string }>(
  roster: T[],
  orgPlayers: T[],
  guestIds: Iterable<string>,
  selectedId?: string | null,
): T[] {
  const guests    = new Set(guestIds);
  const rosterIds = new Set(roster.map(p => p.id));
  const list = [...roster, ...orgPlayers.filter(p => guests.has(p.id) && !rosterIds.has(p.id))];

  if (selectedId && !list.some(p => p.id === selectedId)) {
    const outsider = orgPlayers.find(p => p.id === selectedId);
    if (outsider) list.push(outsider);
  }
  return list;
}
