import { useCallback, useEffect, useState } from 'react';
import { objectivesApi } from '../api';
import type { Objective } from '../data/types';

/**
 * Objectifs d'un sujet (joueur ou équipe) POUR UNE SAISON. `seasonId` n'est pas optionnel par
 * confort : sans lui, un objectif défini la saison passée restait affiché et évalué sur les matchs
 * de la saison courante.
 */
export function useObjectives(subject: { playerId?: string; teamId?: string; seasonId?: string }) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if ((!subject.playerId && !subject.teamId) || !subject.seasonId) {
      setObjectives([]); setLoading(false); return;
    }
    setLoading(true);
    objectivesApi.list(subject).then(setObjectives).finally(() => setLoading(false));
  }, [subject.playerId, subject.teamId, subject.seasonId]);

  useEffect(() => { reload(); }, [reload]);

  return { objectives, loading, reload };
}
