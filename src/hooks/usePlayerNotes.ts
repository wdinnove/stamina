import { useCallback, useEffect, useState } from 'react';
import { notesApi } from '../api';
import type { PlayerNote } from '../data/types';

/**
 * Notes de suivi d'une saison — de tout l'effectif, ou d'un seul joueur si `playerId` est fourni.
 *
 * `seasonId` est requis, comme pour les objectifs : sans lui, la requête remonterait tout ce que
 * la RLS laisse passer, y compris les saisons précédentes.
 */
export function usePlayerNotes(subject: { seasonId?: string; playerId?: string }) {
  const [notes, setNotes] = useState<PlayerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const { seasonId, playerId } = subject;

  const reload = useCallback(() => {
    if (!seasonId) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    notesApi.list({ seasonId, playerId })
      .then(rows => { setNotes(rows); setError(null); })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [seasonId, playerId]);

  useEffect(() => { reload(); }, [reload]);

  return { notes, loading, error, reload };
}
