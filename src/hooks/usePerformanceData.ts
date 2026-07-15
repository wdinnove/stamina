import { useState, useEffect } from 'react';
import { playersApi, statsApi, wellnessApi, medicalApi, rpeApi, attendanceApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { isoToday } from '../components/DateRangeCard';
import type { TeamCrossData } from '../data/crossAnalysis';

/** Charge toutes les données de la saison sélectionnée, fusionnées par joueur (croisement multi-domaines). */
export function usePerformanceData() {
  const { selected } = useTeamSeason();
  const [data, setData] = useState<TeamCrossData | null>(null);
  const [loading, setLoading] = useState(true);

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
      // wellness_entries n'a pas de season_id : borner explicitement à la fin de saison,
      // sinon une saison passée récupère aussi les entrées des saisons suivantes jusqu'à aujourd'hui.
      wellnessApi.list({ from: season.startDate, to: season.endDate < isoToday() ? season.endDate : isoToday() }),
      attendanceApi.listSessions(team.id, season.id),
    ]).then(async ([players, matchStats, teamMatchStats, rpe, wellness, sessions]) => {
      const [medical, attendance] = await Promise.all([
        players.length ? medicalApi.list({ playerIds: players.map(p => p.id) }) : Promise.resolve([]),
        attendanceApi.listAttendance(sessions.map(s => s.id)),
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
          wellness: wellness.filter(w => w.playerId === pl.id),
          medical: medical.filter(m => m.playerId === pl.id),
          attendance: attendance
            .filter(a => a.playerId === pl.id && sessionDate.has(a.sessionId))
            .map(a => ({ date: sessionDate.get(a.sessionId)!, status: a.status })),
        })),
      });
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.team.id, selected?.season.id]);

  return { data, loading, seasonStart: selected?.season.startDate, seasonEnd: selected?.season.endDate };
}
