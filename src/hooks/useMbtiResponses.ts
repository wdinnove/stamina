import { useState, useEffect, useCallback } from 'react';
import { mbtiApi } from '../api/mbti';
import type { MbtiResponse } from '../data/types';

/**
 * Réponses au questionnaire de personnalité pour un ensemble de joueuses.
 *
 * Une seule requête pour tout l'effectif (`.in('player_id', …)`), pas une par joueuse : le panel
 * collectif comme le panel individuel s'appuient dessus. `reload` sert après une réinitialisation.
 */
export function useMbtiResponses(playerIds: string[]) {
  const [responses, setResponses] = useState<MbtiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Les ids arrivent souvent d'un `.map()` recréé à chaque rendu : on dépend de leur contenu,
  // pas de l'identité du tableau, sinon la requête repartirait en boucle.
  const key = playerIds.join(',');

  const load = useCallback(() => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) { setResponses([]); setLoading(false); return; }
    setLoading(true);
    mbtiApi.listByPlayers(ids)
      .then(rows => { setResponses(rows); setError(null); })
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(load, [load]);

  return { responses, loading, error, reload: load };
}
