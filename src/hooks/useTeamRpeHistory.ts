import { useEffect, useMemo, useState } from 'react';
import { rpeApi } from '../api/rpe';
import { computeAcwr, computeTsb, avgRpe } from '../utils/rpe';
import type { LoadEntry } from '../utils/rpe';
import { mondayIso as getWeekMonday, averageWeeklyLoad } from '../utils/weeklyLoad';
import { fmtDateShort } from '../utils/dateFormat';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { Player, SessionType, TeamSessionRow, PlayerRank } from '../data/types';

export interface TeamChartDay {
  label: string;
  date: string;
  avg: number;
  max: number | null;
  min: number | null;
}

export interface TeamKpis {
  sessions: number;
  avg: number;
  max: number;
  min: number;
  totalLoad: number;
}

function todayStr(): string {
  return new Date().toLocaleDateString('sv');
}

/** Nombre de jours entre la 1ère entrée et aujourd'hui (0 si aucune entrée) — sert à juger la fiabilité de l'ACWR/TSB */
function historySpanDays(entries: LoadEntry[]): number {
  if (!entries.length) return 0;
  const firstDate = [...entries.map(e => e.date)].sort()[0];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(firstDate + 'T00:00:00');
  return Math.floor((today.getTime() - first.getTime()) / 86400000) + 1;
}

const MIN_RELIABLE_HISTORY_DAYS = 28;

/** Stats agrégées d'un joueur, sans le nom — résolu séparément depuis `roster` (cf. plus bas),
 * pour ne jamais dépendre de l'ordre d'arrivée entre le fetch RPE et le roster. */
interface PlayerStatsRaw {
  playerId:   string;
  nbSessions: number;
  avgRpe:     number;
  maxRpe:     number;
  totalLoad:  number;
  rpe3w:      number | null;
  weekLoads:  number[];
}

/**
 * Données d'historique équipe (RPE) pour une période donnée : timeline, sessions, classement
 * joueurs, KPIs, distribution par type de séance, moyennes saison, ACWR/TSB moyens de l'équipe.
 * Extrait de RPEPage pour être réutilisable par d'autres pages (perf individuelle/collective).
 */
export function useTeamRpeHistory(
  teamId: string | undefined,
  seasonId: string | undefined,
  from: string | undefined,
  to: string | undefined,
  roster: Player[],
) {
  const [teamChartData, setTeamChartData]       = useState<TeamChartDay[]>([]);
  const [teamSessionRows, setTeamSessionRows]   = useState<TeamSessionRow[]>([]);
  const [playerStatsRaw, setPlayerStatsRaw]     = useState<PlayerStatsRaw[]>([]);
  const [teamKpis, setTeamKpis]                 = useState<TeamKpis | null>(null);
  const [typeStats, setTypeStats]               = useState<Record<string, { count: number; avgRpe: number; totalLoad: number }>>({});
  const [loadingTeamHistory, setLoadingTeamHistory] = useState(false);
  const [teamHistoryError, setTeamHistoryError]     = useState<string | null>(null);
  const [teamSeasonAvgRpe, setTeamSeasonAvgRpe]     = useState<number | null>(null);
  const [teamSeasonAvgWeeklyLoad, setTeamSeasonAvgWeeklyLoad] = useState<number | null>(null);
  const [teamAcwrAvg, setTeamAcwrAvg]               = useState<number | null>(null);
  const [teamFreshAvg, setTeamFreshAvg]             = useState<number | null>(null);
  const [teamHistoryShort, setTeamHistoryShort]     = useState(false);

  // ── Load team history
  useEffect(() => {
    if (!teamId || !seasonId || !from || !to) return;
    setLoadingTeamHistory(true);
    setTeamHistoryError(null);

    const fromDate = from;
    const toDate   = to;
    // Périodes courtes (≤ 45j) : timeline dense (chaque jour, 0 si pas de séance).
    // Périodes longues (phase / saison) : timeline creuse (seulement les jours avec séance), sinon trop de points.
    const daySpan = Math.round((new Date(toDate + 'T12:00:00').getTime() - new Date(fromDate + 'T12:00:00').getTime()) / 86400000) + 1;
    let allDates: string[] | null = null;
    if (daySpan <= 45) {
      allDates = Array.from({ length: daySpan }, (_, i) => {
        const d = new Date(fromDate + 'T12:00:00');
        d.setDate(d.getDate() + i);
        return d.toLocaleDateString('sv');
      });
    }

    (async () => {
      let sessions: Array<{ id: string; date: string; sessionType: SessionType; plannedDuration: number }>;
      try {
        sessions = await rpeApi.listTeamSessionsInRange(teamId, seasonId, fromDate, toDate);
      } catch (err: unknown) {
        setTeamHistoryError((err as { message?: string })?.message ?? 'Erreur inattendue');
        setLoadingTeamHistory(false);
        return;
      }
      const sessionIds = sessions.map(s => s.id);
      const sessionMap = new Map(sessions.map(s => [s.id, s]));

      if (sessionIds.length === 0) {
        setTeamChartData([]);
        setTeamSessionRows([]);
        setPlayerStatsRaw([]);
        setTeamKpis(null);
        setTypeStats({});
        setLoadingTeamHistory(false);
        return;
      }

      let rpeRows: Array<{ rpe: number; actualDuration: number | undefined; playerId: string; sessionId: string }>;
      try {
        rpeRows = await rpeApi.listRpeDetailsBySessionIds(sessionIds);
      } catch (err: unknown) {
        setTeamHistoryError((err as { message?: string })?.message ?? 'Erreur inattendue');
        setLoadingTeamHistory(false);
        return;
      }

      // ── Per-session aggregation
      const entriesBySession = new Map<string, Array<{ rpe: number; actualDuration: number | undefined; playerId: string }>>();
      rpeRows.forEach(r => {
        if (!entriesBySession.has(r.sessionId)) entriesBySession.set(r.sessionId, []);
        entriesBySession.get(r.sessionId)!.push(r);
      });

      const sessionRows: TeamSessionRow[] = sessions
        .filter(s => (entriesBySession.get(s.id)?.length ?? 0) > 0)
        .map(s => {
          const entries = entriesBySession.get(s.id) ?? [];
          const vals = entries.map(e => e.rpe);
          return {
            id:         s.id,
            date:       s.date,
            type:       s.sessionType,
            duration:   s.plannedDuration,
            nbPlayers:  vals.length,
            playerIds:  entries.map(e => e.playerId),
            avg:        avgRpe(vals) ?? 0,
            max:        Math.max(...vals),
            min:        Math.min(...vals),
            // Charge par joueur (actual_duration si saisie, sinon durée prévue) — pas une simple
            // multiplication par la durée prévue, qui ignore les durées réelles individuelles
            totalLoad:  Math.round(entries.reduce((sum, e) => sum + e.rpe * (e.actualDuration ?? s.plannedDuration), 0)),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

      // ── Global KPIs
      const allVals = rpeRows.map(r => r.rpe);
      const globalLoad = sessionRows.reduce((s, r) => s + r.totalLoad, 0);
      setTeamKpis({
        sessions:  sessionRows.length,
        avg:       avgRpe(allVals) ?? 0,
        max:       allVals.length ? Math.max(...allVals) : 0,
        min:       allVals.length ? Math.min(...allVals) : 0,
        totalLoad: globalLoad,
      });

      // ── Chart data (by date)
      const rpeByDate = new Map<string, number[]>();
      rpeRows.forEach(r => {
        const s = sessionMap.get(r.sessionId);
        if (!s) return;
        if (!rpeByDate.has(s.date)) rpeByDate.set(s.date, []);
        rpeByDate.get(s.date)!.push(r.rpe);
      });

      const chartDays = allDates ?? [...rpeByDate.keys()].sort();
      setTeamChartData(chartDays.map(dateStr => {
        const vals = rpeByDate.get(dateStr) ?? [];
        return {
          label: fmtDateShort(dateStr),
          date:  dateStr,
          avg:   avgRpe(vals) ?? 0,
          max:   vals.length ? Math.max(...vals) : null,
          min:   vals.length ? Math.min(...vals) : null,
        };
      }));

      setTeamSessionRows(sessionRows);

      // ── Player ranking
      const _3wAgo = new Date();
      _3wAgo.setDate(_3wAgo.getDate() - 21);
      const _3wAgoStr = _3wAgo.toLocaleDateString('sv');

      const playerMap = new Map<string, { rpes: number[]; sessions: Set<string>; load: number; rpes3w: number[] }>();
      const playerWeekLoadMap = new Map<string, Map<string, number>>();
      rpeRows.forEach(r => {
        if (!playerMap.has(r.playerId)) playerMap.set(r.playerId, { rpes: [], sessions: new Set(), load: 0, rpes3w: [] });
        const p    = playerMap.get(r.playerId)!;
        const sess = sessionMap.get(r.sessionId);
        const dur  = r.actualDuration ?? sess?.plannedDuration ?? 0;
        p.rpes.push(r.rpe);
        p.sessions.add(r.sessionId);
        p.load += r.rpe * dur;
        if (sess && sess.date >= _3wAgoStr) {
          p.rpes3w.push(r.rpe);
        }
        if (sess) {
          const wk = getWeekMonday(sess.date);
          if (!playerWeekLoadMap.has(r.playerId)) playerWeekLoadMap.set(r.playerId, new Map());
          const pw = playerWeekLoadMap.get(r.playerId)!;
          pw.set(wk, (pw.get(wk) ?? 0) + r.rpe * dur);
        }
      });

      const statsRaw: PlayerStatsRaw[] = Array.from(playerMap.entries()).map(([playerId, data]) => ({
        playerId,
        nbSessions: data.sessions.size,
        avgRpe:     avgRpe(data.rpes) ?? 0,
        maxRpe:     Math.max(...data.rpes),
        totalLoad:  Math.round(data.load),
        rpe3w:      avgRpe(data.rpes3w),
        weekLoads:  [...(playerWeekLoadMap.get(playerId)?.values() ?? [])],
      }));

      setPlayerStatsRaw(statsRaw);

      // ── Type distribution
      const typeMap = new Map<string, { count: number; rpes: number[]; totalLoad: number }>();
      sessionRows.forEach(s => {
        if (!typeMap.has(s.type)) typeMap.set(s.type, { count: 0, rpes: [], totalLoad: 0 });
        const t = typeMap.get(s.type)!;
        t.count++;
        t.totalLoad += s.totalLoad;
      });
      rpeRows.forEach(r => {
        const s = sessionMap.get(r.sessionId);
        if (!s) return;
        typeMap.get(s.sessionType)?.rpes.push(r.rpe);
      });

      const typeResult: Record<string, { count: number; avgRpe: number; totalLoad: number }> = {};
      typeMap.forEach((v, k) => {
        typeResult[k] = {
          count:     v.count,
          avgRpe:    avgRpe(v.rpes) ?? 0,
          totalLoad: v.totalLoad,
        };
      });
      setTypeStats(typeResult);
      setLoadingTeamHistory(false);
    })();
  }, [teamId, seasonId, from, to]);

  // ── Season-wide RPE / charge average for team (indépendant de la période sélectionnée)
  useEffect(() => {
    if (!teamId || !seasonId) { setTeamSeasonAvgRpe(null); setTeamSeasonAvgWeeklyLoad(null); return; }
    rpeApi.listTeamSessionsInRange(teamId, seasonId)
      .then(async sessions => {
        const sessionById = new Map(sessions.map(s => [s.id, s]));
        const ids = sessions.map(s => s.id);
        if (!ids.length) { setTeamSeasonAvgRpe(null); setTeamSeasonAvgWeeklyLoad(null); return; }
        const rows = await rpeApi.listRpeDetailsBySessionIds(ids);
        if (!rows.length) { setTeamSeasonAvgRpe(null); setTeamSeasonAvgWeeklyLoad(null); return; }
        setTeamSeasonAvgRpe(avgRpe(rows.map(r => r.rpe)));

        // Même fonction que le graphique et que "Semaines surcharge" (averageWeeklyLoad),
        // pour rester cohérent partout dans l'app.
        setTeamSeasonAvgWeeklyLoad(averageWeeklyLoad(rows.map(r => ({
          date: sessionById.get(r.sessionId)?.date ?? '',
          playerId: r.playerId,
          rpe: r.rpe,
          actualDuration: r.actualDuration,
          plannedDuration: sessionById.get(r.sessionId)?.plannedDuration ?? 0,
        })).filter(r => r.date)));
      }, () => {});
  }, [teamId, seasonId]);

  // ── Team-wide ACWR / Fraîcheur — moyenne des indicateurs individuels de chaque joueur (tout son historique, à ce jour)
  useEffect(() => {
    if (roster.length === 0) { setTeamAcwrAvg(null); setTeamFreshAvg(null); setTeamHistoryShort(false); return; }
    const playerIds = roster.map(p => p.id);
    rpeApi.listRpeWithSessionByPlayerIds(playerIds)
      .then(rows => {
        const byPlayer = new Map<string, LoadEntry[]>();
        rows.forEach(row => {
          if (!byPlayer.has(row.playerId)) byPlayer.set(row.playerId, []);
          byPlayer.get(row.playerId)!.push({
            date:            row.date,
            rpe:             row.rpe,
            actualDuration:  row.actualDuration,
            plannedDuration: row.plannedDuration,
          });
        });
        const today     = todayStr();
        const acwrs:      number[] = [];
        const freshVals:  number[] = [];
        const spans:      number[] = [];
        byPlayer.forEach(entries => {
          const a = computeAcwr(entries, today);
          if (a !== null) acwrs.push(a);
          const t = computeTsb(entries);
          if (t !== null) freshVals.push(t);
          spans.push(historySpanDays(entries));
        });
        setTeamAcwrAvg(acwrs.length ? Math.round(acwrs.reduce((s, v) => s + v, 0) / acwrs.length * 100) / 100 : null);
        setTeamFreshAvg(freshVals.length ? Math.round(freshVals.reduce((s, v) => s + v, 0) / freshVals.length * 10) / 10 : null);
        const avgSpan = spans.length ? spans.reduce((s, v) => s + v, 0) / spans.length : 0;
        setTeamHistoryShort(avgSpan < MIN_RELIABLE_HISTORY_DAYS);
      }, () => { setTeamAcwrAvg(null); setTeamFreshAvg(null); setTeamHistoryShort(false); });
  }, [roster]);

  // Résout le nom depuis `roster` à chaque rendu où l'un des deux change — jamais figé au
  // moment (potentiellement plus tôt) où le fetch RPE a résolu, contrairement à un ref mis à
  // jour par un effet séparé (source du bug "nom du joueur absent" selon l'ordre d'arrivée).
  const playerRanking: PlayerRank[] = useMemo(() => playerStatsRaw
    .map(s => {
      const player = roster.find(p => p.id === s.playerId);
      return { ...s, name: player ? playerNameShort(player) : '—', nameFull: player ? playerNameFull(player) : '—' };
    })
    .sort((a, b) => b.avgRpe - a.avgRpe),
  [playerStatsRaw, roster]);

  return {
    teamChartData, teamSessionRows, playerRanking, teamKpis, typeStats,
    loadingTeamHistory, teamHistoryError,
    teamSeasonAvgRpe, teamSeasonAvgWeeklyLoad,
    teamAcwrAvg, teamFreshAvg, teamHistoryShort,
  };
}
