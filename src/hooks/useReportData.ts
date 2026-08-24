import { useMemo } from 'react';
import { usePerformanceData } from './usePerformanceData';
import { useObjectives } from './useObjectives';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { teamWellnessAvg, wellnessRawValue, WELLNESS_DIMENSIONS } from '../utils/wellness';
import { indicatorByKey, periodValueOf } from '../data/crossAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { WellnessSectionData } from '../components/ReportWellnessSection';
import type { MedicalSectionData, MedicalEvent } from '../components/ReportMedicalSection';
import type { StatsSectionData } from '../components/ReportStatsSection';
import type { EvaluatedObjective } from '../components/ReportObjectivesSection';

/**
 * Les données des sections bien-être, médical, statistiques et objectifs d'un rapport.
 *
 * Tout vient de `usePerformanceData` — le même chargement que la page d'analyse collective, donc
 * les mêmes chiffres — puis est mis à plat section par section. Les gabarits ne calculent rien :
 * ils affichent ce qui leur est passé.
 *
 * La charge d'entraînement n'est pas ici : elle a son propre hook (`useTeamRpeHistory`), partagé
 * avec la page RPE.
 */
export function useReportData(from: string, to: string) {
  const { selected } = useTeamSeason();
  const { data, loading } = usePerformanceData({ tactical: false });
  const { objectives } = useObjectives({ teamId: selected?.team.id, seasonId: selected?.season.id });

  const inRange = (d: string) => d >= from && d <= to;

  const wellness: WellnessSectionData = useMemo(() => {
    const players = data?.players ?? [];
    return {
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
    };
  }, [data, from, to]);

  const medical: MedicalSectionData = useMemo(() => {
    const players = data?.players ?? [];
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
  }, [data, from, to]);

  const stats: StatsSectionData = useMemo(() => ({
    teamStats: (data?.teamMatchStats ?? []).filter(m => inRange(m.date)),
    playerStats: (data?.players ?? []).map(p => ({
      name: playerNameShort(p.player),
      stats: p.matchStats.filter(s => inRange(s.date)),
    })),
  }), [data, from, to]);

  const evaluatedObjectives: EvaluatedObjective[] = useMemo(() => {
    if (!data) return [];
    return objectives.map(objective => {
      const def = indicatorByKey(objective.indicatorKey);
      if (!def) {
        return { objective, label: objective.indicatorKey, unit: '', value: null, met: null };
      }
      // Même chemin d'agrégation qu'ailleurs : la valeur d'équipe de la période si l'indicateur
      // en définit une, sinon la moyenne des valeurs individuelles.
      const value = def.teamPeriodValue
        ? def.teamPeriodValue(data, from, to)
        : avgOfPlayers(data.players.map(p => periodValueOf(def, p, from, to)));
      return {
        objective,
        label: def.label,
        unit: def.unit ?? '',
        value,
        met: value === null ? null : compare(value, objective.comparator, objective.thresholdValue),
      };
    });
  }, [data, objectives, from, to]);

  return { loading, wellness, medical, stats, objectives: evaluatedObjectives };
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
