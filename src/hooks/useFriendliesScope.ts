import { useState, useEffect, useCallback } from 'react';
import { matchesApi } from '../api/matches';

const STORAGE_KEY = 'stamina:includeFriendlies';

/**
 * Interrupteur « inclure les matchs amicaux dans les analyses », partagé par Performance
 * collective et Performance individuelle.
 *
 * Persisté dans `localStorage` plutôt que gardé en état local : les deux pages consomment le même
 * jeu de données (cf. le cache de `usePerformanceData`) et le staff navigue de l'une à l'autre en
 * permanence. Un périmètre qui changerait silencieusement en passant du collectif à l'individuel
 * ferait lire deux moyennes différentes du même effectif sans que rien ne l'explique.
 *
 * Le défaut est FAUX, et le reste tant que personne ne l'a touché : hors présaison, mélanger un
 * amical aux officiels fausse les moyennes et le bilan.
 */
function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Navigation privée ou stockage bloqué : le périmètre par défaut (officiels seuls) reste juste.
    return false;
  }
}

export function useFriendliesScope(teamId: string | undefined, seasonId: string | undefined) {
  const [includeFriendlies, setState] = useState(readStored);
  /** Nombre d'amicaux sur la saison — 0 signifie qu'il n'y a rien à réintégrer, donc rien à afficher. */
  const [friendlyCount, setFriendlyCount] = useState(0);

  useEffect(() => {
    if (!teamId || !seasonId) { setFriendlyCount(0); return; }
    let cancelled = false;
    matchesApi.countByKind(teamId, seasonId, 'friendly')
      .then(n => { if (!cancelled) setFriendlyCount(n); })
      .catch(() => { if (!cancelled) setFriendlyCount(0); });
    return () => { cancelled = true; };
  }, [teamId, seasonId]);

  const setIncludeFriendlies = useCallback((next: boolean) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Le choix vaut alors pour la session en cours seulement — sans conséquence sur les calculs.
    }
  }, []);

  return {
    // Une équipe sans aucun amical ne peut pas en inclure : on neutralise la valeur stockée au lieu
    // de laisser un `includeFriendlies` à vrai changer la clé de cache pour rien.
    includeFriendlies: includeFriendlies && friendlyCount > 0,
    setIncludeFriendlies,
    friendlyCount,
  };
}
