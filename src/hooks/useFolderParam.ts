import { useCallback, useEffect } from 'react';
import { useUrlState } from './useUrlState';
import type { TeamFolder } from '../data/types';

/** Nom du paramètre d'URL, en français comme les routes (`/exercices`, `/systemes`). */
export const FOLDER_PARAM = 'dossier';

/**
 * Dossier ouvert dans une bibliothèque (exercices, systèmes), porté par l'URL — cf. `useUrlState`
 * pour le pourquoi.
 *
 * Deux différences avec un filtre ordinaire. Ouvrir un dossier EST une navigation : ça empile une
 * entrée d'historique, et Précédent remonte d'un niveau au lieu de quitter la page. Et
 * l'identifiant est vérifié — un dossier peut avoir été supprimé, appartenir à une autre équipe,
 * ou venir d'un lien périmé : on retombe alors à la racine plutôt que d'afficher une bibliothèque
 * vide sans explication, en REMPLAÇANT l'entrée d'historique pour ne pas piéger le bouton
 * Précédent sur une adresse qu'on vient d'invalider.
 *
 * `foldersLoaded` évite la fausse manœuvre du premier rendu : tant que les dossiers ne sont pas
 * arrivés, aucun identifiant n'est vérifiable et l'URL doit être laissée telle quelle.
 */
export function useFolderParam(folders: TeamFolder[], foldersLoaded: boolean) {
  const [folderId, setFolderId] = useUrlState(FOLDER_PARAM, '', { push: true });
  const activeFolder = folderId || null;

  const setActiveFolder = useCallback((id: string | null, options?: { replace?: boolean }) => {
    setFolderId(id ?? '', { push: !options?.replace });
  }, [setFolderId]);

  useEffect(() => {
    if (!foldersLoaded || !activeFolder) return;
    if (!folders.some(f => f.id === activeFolder)) setActiveFolder(null, { replace: true });
  }, [foldersLoaded, folders, activeFolder, setActiveFolder]);

  return [activeFolder, setActiveFolder] as const;
}
