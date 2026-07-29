import type { TeamMatchStat } from '../data/types';
import type { PlayerArchetypeReport, PlayerPositionInfo } from '../data/archetypes';
import { aggregateRawStats, computeArchetypesForSquad } from '../data/archetypes';
import { statsApi } from './stats';
import { playersApi } from './players';

/**
 * Pont Supabase du moteur d'archétypes : récupère les données déjà exposées par `statsApi`/
 * `playersApi` pour une saison, puis délègue tout le calcul à `src/data/archetypes` (aucune
 * logique métier ici). Calculé à la demande côté client, comme `crossAnalysis`/`pca`
 * aujourd'hui — pas de matérialisation nécessaire au vu du volume de données d'une équipe.
 */
export const archetypesApi = {
  async computeForSeason(teamId: string, seasonId: string): Promise<PlayerArchetypeReport[]> {
    const [players, matchStats, teamMatchStats] = await Promise.all([
      playersApi.listBySeason(seasonId),
      statsApi.listAllStatsBySeason(teamId, seasonId),
      statsApi.listTeamStatsBySeason(teamId, seasonId),
    ]);

    const teamStatsByMatchId = new Map<string, TeamMatchStat>();
    for (const team of teamMatchStats) {
      if (team.matchId) teamStatsByMatchId.set(team.matchId, team);
    }
    const playerPositions = new Map<string, PlayerPositionInfo>(
      players.map(p => [p.id, { position: p.position, secondaryPosition: p.secondaryPosition }]),
    );

    const raws = aggregateRawStats(matchStats, teamStatsByMatchId, seasonId);
    return computeArchetypesForSquad(raws, playerPositions);
  },
};
