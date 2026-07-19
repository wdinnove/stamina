import { useState, useEffect } from 'react';
import { rpeApi, wellnessApi } from '../api';
import type { RPEEntry, WellnessEntry } from '../data/types';

/**
 * Historique RPE et bien-être d'un joueur, toutes saisons confondues — nécessaire pour l'ACWR/TSB
 * (charge chronique sur 28j, potentiellement à cheval sur la saison précédente) et pour les
 * comparaisons inter-saisons (Comparer > Par saison/Par match), qui portent sur des périodes hors
 * de la saison sélectionnée ailleurs sur la page. Centralise ce qui était un fetch ad hoc dans
 * PerformanceIndividuellePage, sur le même principe que useTeamRpeHistory côté équipe.
 */
export function usePlayerAllTimeHistory(playerId: string | undefined) {
  const [rpe, setRpe] = useState<RPEEntry[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);

  useEffect(() => {
    if (!playerId) return;
    Promise.all([
      rpeApi.listPlayerHistory(playerId),
      wellnessApi.getByPlayer(playerId),
    ]).then(([rpeData, wellnessData]) => {
      setRpe(rpeData);
      setWellness(wellnessData);
    });
  }, [playerId]);

  return { rpe, wellness };
}
