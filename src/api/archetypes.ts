import type { TeamMatchStat } from '../data/types';
import type { PlayerArchetypeReport } from '../data/archetypes';
import { aggregateRawStats, computeArchetypesForSquad } from '../data/archetypes';
import { statsApi } from './stats';

/**
 * Pont Supabase du moteur d'archétypes : récupère les données déjà exposées par `statsApi`
 * pour une saison, puis délègue tout le calcul à `src/data/archetypes` (aucune logique
 * métier ici). Calculé à la demande côté client, comme `crossAnalysis`/`pca` aujourd'hui —
 * pas de matérialisation nécessaire au vu du volume de données d'une équipe.
 */
export const archetypesApi = {
  async computeForSeason(teamId: string, seasonId: string): Promise<PlayerArchetypeReport[]> {
    const [matchStats, teamMatchStats] = await Promise.all([
      statsApi.listAllStatsBySeason(teamId, seasonId),
      statsApi.listTeamStatsBySeason(teamId, seasonId),
    ]);

    const teamStatsByMatchId = new Map<string, TeamMatchStat>();
    for (const team of teamMatchStats) {
      if (team.matchId) teamStatsByMatchId.set(team.matchId, team);
    }

    const raws = aggregateRawStats(matchStats, teamStatsByMatchId, seasonId);
    return computeArchetypesForSquad(raws);
  },
};
