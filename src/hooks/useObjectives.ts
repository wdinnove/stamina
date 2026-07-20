import { useCallback, useEffect, useState } from 'react';
import { objectivesApi } from '../api';
import type { Objective } from '../data/types';

export function useObjectives(subject: { playerId?: string; teamId?: string }) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!subject.playerId && !subject.teamId) { setObjectives([]); setLoading(false); return; }
    setLoading(true);
    objectivesApi.list(subject).then(setObjectives).finally(() => setLoading(false));
  }, [subject.playerId, subject.teamId]);

  useEffect(() => { reload(); }, [reload]);

  return { objectives, loading, reload };
}
