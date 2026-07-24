import { useState, useEffect } from 'react';
import { playersApi, statsApi, wellnessApi, medicalApi, rpeApi, attendanceApi } from '../api';
import { tacticalConfigApi } from '../api/tacticalConfig';
import { tacticalEventsApi } from '../api/tacticalEvents';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { isoToday } from '../components/DateRangeCard';
import type { TeamCrossData } from '../data/crossAnalysis';

export interface UsePerformanceDataOptions {
  /** Charge aussi la config + les événements tactiques de la saison (2 requêtes de plus) —
   *  activé par défaut car Performance collective/individuelle en ont besoin pour "Tendances
   *  tactiques" et les attributs "Rentabilité de ..." d'Objectifs/Corrélations. Le Dashboard ne
   *  s'en sert jamais : y passer `{ tactical: false }` pour éviter ce coût à chaque visite. */
  tactical?: boolean;
}

/** Charge toutes les données de la saison sélectionnée, fusionnées par joueur (croisement multi-domaines). */
export function usePerformanceData(options: UsePerformanceDataOptions = {}) {
  const { tactical: includeTactical = true } = options;
  const { selected } = useTeamSeason();
  const [data, setData] = useState<TeamCrossData | null>(null);
  const [loading, setLoading] = useState(true);
  // Incrémenté par `reload()` pour forcer un rechargement complet (ex. après suppression des
  // données tactiques d'un match depuis "Tendances tactiques" — plus simple et plus sûr qu'une
  // mise à jour locale partielle vu le nombre de champs dérivés de ces données).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    const { team, season } = selected;
    Promise.all([
      playersApi.listBySeason(season.id),
      statsApi.listAllStatsBySeason(team.id, season.id),
      statsApi.listTeamStatsBySeason(team.id, season.id),
      rpeApi.list({ seasonId: season.id }),
      attendanceApi.listSessions(team.id, season.id),
      includeTactical ? tacticalConfigApi.getForTeam(team.id) : Promise.resolve(null),
    ]).then(async ([players, matchStats, teamMatchStats, rpe, sessions, tacticalConfig]) => {
      const seasonMatchIds = teamMatchStats.filter(t => t.matchId).map(t => t.matchId as string);
      const [medical, attendance, allTimeRpeRows, wellness, tacticalEvents] = await Promise.all([
        players.length ? medicalApi.list({ playerIds: players.map(p => p.id) }) : Promise.resolve([]),
        attendanceApi.listAttendance(sessions.map(s => s.id)),
        // Toutes saisons confondues — nécessaire pour un ACWR/TSB fiable (28j de charge
        // chronique) même en tout début de saison, contrairement à `rpe` borné à la saison.
        players.length ? rpeApi.listRpeWithSessionByPlayerIds(players.map(p => p.id)) : Promise.resolve([]),
        // wellness_entries n'a pas de season_id : borner explicitement à la fin de saison, sinon une
        // saison passée récupère aussi les entrées des saisons suivantes jusqu'à aujourd'hui. Scopé aux
        // joueuses de la saison (playerIds) pour ne pas remonter les autres équipes du club et rester
        // sous le plafond de lignes de l'API sur un effectif/historique conséquent.
        players.length
          ? wellnessApi.list({ playerIds: players.map(p => p.id), from: season.startDate, to: season.endDate < isoToday() ? season.endDate : isoToday() })
          : Promise.resolve([]),
        tacticalConfig ? tacticalEventsApi.getForMatches(seasonMatchIds) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      const sessionDate = new Map(sessions.map(s => [s.id, s.date]));
      const teamStatsByMatchId = new Map(
        teamMatchStats.filter(t => t.matchId).map(t => [t.matchId as string, t]),
      );
      const sorted = [...players].sort((a, b) => a.lastName.localeCompare(b.lastName));
      setData({
        teamMatchStats,
        players: sorted.map(pl => ({
          player: pl,
          teamStatsByMatchId,
          matchStats: matchStats.filter(m => m.playerId === pl.id),
          rpe: rpe.filter(e => e.playerId === pl.id),
          allTimeRpe: allTimeRpeRows.filter(r => r.playerId === pl.id),
          wellness: wellness.filter(w => w.playerId === pl.id),
          medical: medical.filter(m => m.playerId === pl.id),
          attendance: attendance
            .filter(a => a.playerId === pl.id && sessionDate.has(a.sessionId))
            .map(a => ({ date: sessionDate.get(a.sessionId)!, status: a.status })),
        })),
        tactical: tacticalConfig ? {
          events: tacticalEvents,
          categories: tacticalConfig.categories,
          dimensions: tacticalConfig.dimensions,
          options: tacticalConfig.options,
        } : undefined,
      });
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.team.id, selected?.season.id, includeTactical, reloadToken]);

  return {
    data, loading, seasonStart: selected?.season.startDate, seasonEnd: selected?.season.endDate,
    reload: () => setReloadToken(t => t + 1),
  };
}
