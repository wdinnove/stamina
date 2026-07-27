import { useCallback, useEffect, useState } from 'react';
import { archetypesApi } from '../api';
import type { PlayerArchetypeReport } from '../data/archetypes';

/** Calcule les archétypes de tout l'effectif pour une équipe/saison (le percentile de chaque
 *  joueur dépend du reste du groupe) — un composant n'affichant qu'un seul joueur filtre
 *  ensuite `reports` sur son `playerId`. Ne recharge que si l'équipe ou la saison change. */
export function useArchetypes(teamId?: string, seasonId?: string) {
  const [reports, setReports] = useState<PlayerArchetypeReport[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!teamId || !seasonId) { setReports([]); setLoading(false); return; }
    setLoading(true);
    archetypesApi.computeForSeason(teamId, seasonId).then(setReports).finally(() => setLoading(false));
  }, [teamId, seasonId]);

  useEffect(() => { reload(); }, [reload]);

  return { reports, loading, reload };
}
