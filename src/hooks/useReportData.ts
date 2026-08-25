import { useEffect, useMemo, useState } from 'react';
import { usePerformanceData } from './usePerformanceData';
import { useObjectives } from './useObjectives';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { objectivesApi } from '../api';
import { teamWellnessAvg, wellnessRawValue, WELLNESS_DIMENSIONS } from '../utils/wellness';
import { teamAvgRpe, computeAcwr, computeTsb } from '../utils/rpe';
import { averageWeeklyLoad, weeklyLoadBuckets, teamAvgWeeklyLoad } from '../utils/weeklyLoad';
import { indicatorByKey, periodValueOf } from '../data/crossAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { PlayerCrossData, TeamCrossData } from '../data/crossAnalysis';
import type { Objective, Player, RPEEntry } from '../data/types';
import type { WellnessSectionData } from '../components/ReportWellnessSection';
import type { MedicalSectionData, MedicalEvent } from '../components/ReportMedicalSection';
import type { StatsSectionData } from '../components/ReportStatsSection';
import type { EvaluatedObjective } from '../components/ReportObjectivesSection';
import type { PlayerRpeSectionData } from '../components/ReportPlayerRpeSection';
import type { PlayerWellnessSectionData } from '../components/ReportPlayerWellnessSection';
import type { PlayerMedicalSectionData } from '../components/ReportPlayerMedicalSection';
import type { PlayerStatsSectionData } from '../components/ReportPlayerStatsSection';

/** Tout ce qu'un bloc individuel du rapport peut avoir besoin d'afficher, pour un joueur. */
export interface PlayerReportBundle {
  player: Player;
  rpe: PlayerRpeSectionData;
  wellness: PlayerWellnessSectionData;
  medical: PlayerMedicalSectionData;
  stats: PlayerStatsSectionData;
  objectives: EvaluatedObjective[];
}

/**
 * Les données de rapport, côté équipe ET côté joueur.
 *
 * Tout vient de `usePerformanceData` — le même chargement que la page d'analyse collective, donc
 * les mêmes chiffres — puis est mis à plat bloc par bloc. Les gabarits ne calculent rien : ils
 * affichent ce qui leur est passé.
 *
 * Les repères collectifs des blocs individuels (charge hebdo d'équipe, RPE moyen, dimensions de
 * bien-être du groupe) sont recalculés ICI depuis la même source, et non repris de
 * `useTeamRpeHistory` : un joueur comparé au groupe doit l'être sur des dénominateurs identiques
 * aux siens, sinon l'écart affiché mélange deux méthodes de calcul.
 */
export function useReportData(from: string, to: string) {
  const { selected } = useTeamSeason();
  const { data, loading } = usePerformanceData({ tactical: false });
  const { objectives } = useObjectives({ teamId: selected?.team.id, seasonId: selected?.season.id });
  const [playerObjectives, setPlayerObjectives] = useState<Objective[]>([]);

  const players = useMemo(() => data?.players ?? [], [data]);
  const inRange = (d: string) => d >= from && d <= to;

  // Les objectifs individuels de tout l'effectif en une requête — un rapport couvrant douze
  // joueuses ne doit pas en déclencher douze.
  const rosterKey = players.map(p => p.player.id).join(',');
  useEffect(() => {
    const ids = rosterKey ? rosterKey.split(',') : [];
    if (!selected || ids.length === 0) { setPlayerObjectives([]); return; }
    let cancelled = false;
    objectivesApi.list({ playerIds: ids, seasonId: selected.season.id })
      .then(rows => { if (!cancelled) setPlayerObjectives(rows); }, () => { if (!cancelled) setPlayerObjectives([]); });
    return () => { cancelled = true; };
  }, [rosterKey, selected?.season.id]);

  // ── Sections d'équipe ─────────────────────────────────────────────────────

  const wellness: WellnessSectionData = useMemo(() => ({
    entries:       players.flatMap(p => p.wellness.filter(w => inRange(w.date))),
    seasonEntries: players.flatMap(p => p.wellness),
    rosterSize:    players.length,
    players: players
      .map(p => {
        const entries = p.wellness.filter(w => inRange(w.date));
        if (entries.length === 0) return null;
        const score = teamWellnessAvg(entries).value ?? 0;
        // La dimension la plus basse une fois remise dans le sens « plus haut = mieux ».
        const worst = WELLNESS_DIMENSIONS
          .map(dim => ({
            label: dim.shortLabel,
            value: teamWellnessAvg(
              entries.map(e => ({ ...e, [dim.key]: wellnessRawValue(Number(e[dim.key]), dim.inverted) })),
              dim.key,
            ).value ?? 10,
          }))
          .sort((a, b) => a.value - b.value)[0];
        return {
          name: playerNameShort(p.player),
          score,
          entries: entries.length,
          worstDim: worst && worst.value < 6 ? worst.label : undefined,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null),
  }), [players, from, to]);

  const medical: MedicalSectionData = useMemo(() => {
    const all: MedicalEvent[] = players.flatMap(p =>
      p.medical.map(record => ({ record, playerName: playerNameShort(p.player) })));
    return {
      events:  all.filter(e => inRange(e.record.date)).sort((a, b) => b.record.date.localeCompare(a.record.date)),
      // Les blessures en cours ne sont pas bornées à la période : une blessure de janvier encore
      // ouverte concerne toujours l'effectif d'aujourd'hui.
      ongoing: all.filter(e => e.record.type === 'injury' && e.record.status === 'active')
                  .sort((a, b) => a.record.date.localeCompare(b.record.date)),
      roster:  players.map(p => p.player),
    };
  }, [players, from, to]);

  const teamGames = useMemo(
    () => (data?.teamMatchStats ?? []).filter(m => inRange(m.date)),
    [data, from, to]);

  const stats: StatsSectionData = useMemo(() => ({
    teamStats: teamGames,
    playerStats: players.map(p => ({
      name: playerNameShort(p.player),
      stats: p.matchStats.filter(s => inRange(s.date)),
    })),
  }), [players, teamGames, from, to]);

  const evaluatedObjectives: EvaluatedObjective[] = useMemo(
    () => (data ? objectives.map(o => evaluateTeamObjective(o, data, from, to)) : []),
    [data, objectives, from, to]);

  // ── Repères collectifs des blocs individuels ──────────────────────────────

  const teamRpeRefs = useMemo(() => {
    const rows = players.flatMap(p => p.rpe.filter(r => inRange(r.date)).map(toLoadRow(p.player.id)));
    return {
      avgWeeklyLoad: teamAvgWeeklyLoad(rows).value,
      avgRpe:        teamAvgRpe(rows).value,
      // Séances où au moins un joueur a saisi son RPE : le dénominateur naturel de l'assiduité.
      sessions:      new Set(players.flatMap(p => p.rpe.filter(r => inRange(r.date)).map(r => r.sessionId))).size,
    };
  }, [players, from, to]);

  const teamWellnessRefs = useMemo(() => {
    const entries = wellness.entries;
    return {
      avg: teamWellnessAvg(entries).value,
      dims: WELLNESS_DIMENSIONS.map(dim => ({
        key: dim.key,
        value: teamWellnessAvg(
          entries.map(e => ({ ...e, [dim.key]: wellnessRawValue(Number(e[dim.key]), dim.inverted) })),
          dim.key,
        ).value ?? 0,
      })),
      // Jours où le questionnaire a réellement circulé — un joueur ne peut pas répondre un jour
      // où personne ne l'a fait, rapporter ses saisies aux jours du calendrier n'aurait aucun sens.
      questionnaireDays: new Set(entries.map(e => e.date)).size,
    };
  }, [wellness]);

  const teamMinutesByMatchId = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of teamGames) {
      if (m.matchId && m.teamMinutes) map.set(m.matchId, m.teamMinutes);
    }
    return map;
  }, [teamGames]);

  // ── Blocs individuels ─────────────────────────────────────────────────────

  const byPlayer = useMemo(() => {
    const map = new Map<string, PlayerReportBundle>();
    if (!data) return map;

    const objectivesOf = new Map<string, Objective[]>();
    for (const o of playerObjectives) {
      if (!o.playerId) continue;
      const list = objectivesOf.get(o.playerId) ?? [];
      list.push(o);
      objectivesOf.set(o.playerId, list);
    }

    for (const p of players) {
      const id = p.player.id;
      const periodRpe   = p.rpe.filter(r => inRange(r.date));
      const periodRows  = periodRpe.map(toLoadRow(id));
      const seasonRows  = p.rpe.map(toLoadRow(id));
      const rpeValues   = periodRpe.map(r => r.rpe);
      const seasonRpeValues = p.rpe.map(r => r.rpe);

      const periodWellness = p.wellness.filter(w => inRange(w.date));
      const periodMedical  = p.medical.filter(r => inRange(r.date));
      const periodGames    = p.matchStats.filter(s => inRange(s.date));

      map.set(id, {
        player: p.player,
        rpe: {
          player: p.player,
          avgWeeklyLoad:       averageWeeklyLoad(periodRows),
          seasonAvgWeeklyLoad: averageWeeklyLoad(seasonRows),
          teamAvgWeeklyLoad:   teamRpeRefs.avgWeeklyLoad,
          avgRpe:       mean(rpeValues),
          seasonAvgRpe: mean(seasonRpeValues),
          teamAvgRpe:   teamRpeRefs.avgRpe,
          sessions:     new Set(periodRpe.map(r => r.sessionId)).size,
          teamSessions: teamRpeRefs.sessions,
          totalLoad:    Math.round(periodRows.reduce((s, r) => s + r.rpe * (r.actualDuration ?? r.plannedDuration), 0)),
          weeks: weeklyLoadBuckets(periodRows).map(b => ({
            week: b.week,
            load: Math.round(b.load),
            sessions: periodRpe.filter(r => sameWeek(r.date, b.week)).length,
          })),
          // Calculés sur tout l'historique du joueur, toutes saisons : 28 jours de charge
          // chronique fiables même en début de saison (cf. `allTimeRpe`).
          acwr:      computeAcwr(p.allTimeRpe),
          freshness: computeTsb(p.allTimeRpe),
        },
        wellness: {
          player: p.player,
          entries: periodWellness,
          seasonEntries: p.wellness,
          teamAvg: teamWellnessRefs.avg,
          teamDims: teamWellnessRefs.dims,
          questionnaireDays: teamWellnessRefs.questionnaireDays,
        },
        medical: {
          player: p.player,
          records: [...periodMedical].sort((a, b) => b.date.localeCompare(a.date)),
          ongoing: p.medical.filter(r => r.type === 'injury' && r.status === 'active')
                            .sort((a, b) => a.date.localeCompare(b.date)),
          seasonRecords: p.medical,
        },
        stats: {
          player: p.player,
          games: periodGames,
          teamGames: teamGames.length,
          teamMinutesByMatchId,
        },
        objectives: (objectivesOf.get(id) ?? []).map(o => evaluatePlayerObjective(o, p, from, to)),
      });
    }
    return map;
  }, [data, players, playerObjectives, teamRpeRefs, teamWellnessRefs, teamGames, teamMinutesByMatchId, from, to]);

  return {
    loading,
    roster: players.map(p => p.player),
    wellness, medical, stats, objectives: evaluatedObjectives,
    byPlayer,
  };
}

/** `RPEEntry` → la forme attendue par les utilitaires de charge hebdomadaire. */
const toLoadRow = (playerId: string) => (r: RPEEntry) => ({
  date: r.date, playerId, rpe: r.rpe,
  actualDuration: r.actualDuration, plannedDuration: r.plannedDuration,
});

function sameWeek(date: string, monday: string): boolean {
  const d = new Date(date + 'T12:00:00').getTime();
  const start = new Date(monday + 'T12:00:00').getTime();
  return d >= start && d < start + 7 * 86400000;
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function evaluateTeamObjective(
  objective: Objective, data: TeamCrossData, from: string, to: string,
): EvaluatedObjective {
  const def = indicatorByKey(objective.indicatorKey);
  if (!def) return { objective, label: objective.indicatorKey, unit: '', value: null, met: null };
  // Même chemin d'agrégation qu'ailleurs : la valeur d'équipe de la période si l'indicateur en
  // définit une, sinon la moyenne des valeurs individuelles.
  const value = def.teamPeriodValue
    ? def.teamPeriodValue(data, from, to)
    : avgOfPlayers(data.players.map(p => periodValueOf(def, p, from, to)));
  return {
    objective, label: def.label, unit: def.unit ?? '', value,
    met: value === null ? null : compare(value, objective.comparator, objective.thresholdValue),
  };
}

function evaluatePlayerObjective(
  objective: Objective, player: PlayerCrossData, from: string, to: string,
): EvaluatedObjective {
  const def = indicatorByKey(objective.indicatorKey);
  if (!def) return { objective, label: objective.indicatorKey, unit: '', value: null, met: null };
  const value = periodValueOf(def, player, from, to);
  return {
    objective, label: def.label, unit: def.unit ?? '', value,
    met: value === null ? null : compare(value, objective.comparator, objective.thresholdValue),
  };
}

function avgOfPlayers(values: (number | null)[]): number | null {
  const ok = values.filter((v): v is number => v !== null);
  return ok.length === 0 ? null : Math.round((ok.reduce((s, v) => s + v, 0) / ok.length) * 100) / 100;
}

function compare(value: number, comparator: 'gte' | 'lte' | 'eq', threshold: number): boolean {
  switch (comparator) {
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'eq':  return value === threshold;
  }
}
