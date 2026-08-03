import { useCallback, useEffect, useRef, useState } from 'react';
import { archetypesApi } from '../api';
import type { PlayerArchetypeReport } from '../data/archetypes';

/** Calcule les archétypes de tout l'effectif pour une équipe/saison (le percentile de chaque
 *  joueur dépend du reste du groupe) — un composant n'affichant qu'un seul joueur filtre
 *  ensuite `reports` sur son `playerId`. Ne recharge que si l'équipe ou la saison change. */
export function useArchetypes(teamId?: string, seasonId?: string) {
  const [reports, setReports] = useState<PlayerArchetypeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Incrémenté à chaque appel — une réponse dont le numéro ne correspond plus au dernier appel
  // en cours est ignorée, pour qu'un changement rapide d'équipe/saison n'écrase pas des résultats
  // plus récents avec la réponse d'une requête précédente arrivée après coup.
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    if (!teamId || !seasonId) {
      if (!isStale()) { setReports([]); setError(null); setLoading(false); }
      return;
    }
    setLoading(true);
    setError(null);
    archetypesApi.computeForSeason(teamId, seasonId)
      .then(r => { if (!isStale()) setReports(r); })
      .catch(err => { if (!isStale()) { setReports([]); setError(err); } })
      .finally(() => { if (!isStale()) setLoading(false); });
  }, [teamId, seasonId]);

  useEffect(() => { reload(); }, [reload]);

  return { reports, loading, error, reload };
}
