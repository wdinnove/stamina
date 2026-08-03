import type { MatchStat, TeamMatchStat } from '../data/types';
import type { PlayerArchetypeReport, PlayerPositionInfo, RawPlayerStats } from '../data/archetypes';
import { aggregateRawStats, computeArchetypesForSquad } from '../data/archetypes';
import { statsApi } from './stats';
import { playersApi } from './players';
import { matchesApi } from './matches';

/** Suffixe qui identifie une entrée "historique" (saisons précédentes de la même équipe) dans
 *  le pool de comparaison — jamais retourné dans les rapports, seulement dans le calcul des
 *  percentiles (voir computeForSeason). */
const HISTORY_SUFFIX = '::history';
const realId = (poolId: string) => poolId.endsWith(HISTORY_SUFFIX) ? poolId.slice(0, -HISTORY_SUFFIX.length) : poolId;

/**
 * Pont Supabase du moteur d'archétypes : récupère les données déjà exposées par `statsApi`/
 * `playersApi`/`matchesApi`, puis délègue tout le calcul à `src/data/archetypes` (aucune
 * logique métier ici). Calculé à la demande côté client, comme `crossAnalysis`/`pca`
 * aujourd'hui — pas de matérialisation nécessaire au vu du volume de données d'une équipe.
 */
export const archetypesApi = {
  async computeForSeason(teamId: string, seasonId: string): Promise<PlayerArchetypeReport[]> {
    const [currentSeasonMatches, allMatchStats, allTeamMatchStats, currentPlayers] = await Promise.all([
      matchesApi.listBySeason(teamId, seasonId),
      statsApi.listAllStatsByTeam(teamId),
      statsApi.listTeamStatsByTeam(teamId),
      playersApi.listBySeason(seasonId),
    ]);

    const teamStatsByMatchId = new Map<string, TeamMatchStat>();
    for (const team of allTeamMatchStats) {
      if (team.matchId) teamStatsByMatchId.set(team.matchId, team);
    }

    // Sépare les stats de la saison courante (retournées telles quelles) de celles des saisons
    // précédentes de la même équipe (servent uniquement à élargir le pool de comparaison par
    // poste — voir positionGroups.ts : un groupe scopé à une seule saison est souvent trop petit
    // pour un percentile fiable, même avec le signal de confiance dégradée).
    const currentMatchIds = new Set(currentSeasonMatches.map(m => m.id));
    const isCurrent = (s: MatchStat) => !!s.matchId && currentMatchIds.has(s.matchId);
    const currentMatchStats = allMatchStats.filter(isCurrent);
    const historicalMatchStats = allMatchStats.filter(s => !isCurrent(s));

    const currentRaws = aggregateRawStats(currentMatchStats, teamStatsByMatchId, seasonId);
    const historicalRawsRaw = aggregateRawStats(historicalMatchStats, teamStatsByMatchId, 'historique');
    const historicalRaws: RawPlayerStats[] = historicalRawsRaw.map(r => ({ ...r, playerId: `${r.playerId}${HISTORY_SUFFIX}` }));

    const currentPlayerIds = new Set(currentRaws.map(r => r.playerId));
    const historicalOnlyIds = [...new Set(historicalRawsRaw.map(r => r.playerId))].filter(id => !currentPlayerIds.has(id));
    const historicalOnlyPlayers = await playersApi.getByIds(historicalOnlyIds);

    const positionByRealId = new Map<string, PlayerPositionInfo>();
    for (const p of currentPlayers) positionByRealId.set(p.id, { position: p.position, secondaryPosition: p.secondaryPosition });
    for (const p of historicalOnlyPlayers) positionByRealId.set(p.id, { position: p.position, secondaryPosition: p.secondaryPosition });

    const poolRaws = [...currentRaws, ...historicalRaws];
    const playerPositions = new Map<string, PlayerPositionInfo>();
    for (const r of poolRaws) {
      const info = positionByRealId.get(realId(r.playerId));
      if (info) playerPositions.set(r.playerId, info);
    }

    const reports = computeArchetypesForSquad(poolRaws, playerPositions);
    // Seules les entrées de la saison courante sont pertinentes à retourner — l'historique n'a
    // servi qu'à élargir le pool de comparaison, il ne produit jamais son propre rapport.
    return reports.filter(r => currentPlayerIds.has(r.playerId));
  },
};
