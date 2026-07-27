import { useCallback, useEffect, useState } from 'react';
import { archetypesApi } from '../api';
import type { PlayerArchetypeReport } from '../data/archetypes';

/** Calcule les archétypes de tout l'effectif pour une équipe/saison (le percentile de chaque
 *  joueur dépend du reste du groupe) — un composant n'affichant qu'un seul joueur filtre
 *  ensuite `reports` sur son `playerId`. Ne recharge que si l'équipe ou la saison change. */
export function useArchetypes(teamId?: string, seasonId?: string) {
  const [reports, setReports] = useState<PlayerArchetypeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    if (!teamId || !seasonId) { setReports([]); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    archetypesApi.computeForSeason(teamId, seasonId)
      .then(setReports)
      .catch(err => { setReports([]); setError(err); })
      .finally(() => setLoading(false));
  }, [teamId, seasonId]);

  useEffect(() => { reload(); }, [reload]);

  return { reports, loading, error, reload };
}
