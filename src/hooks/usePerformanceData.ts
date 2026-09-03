import { useState, useEffect } from 'react';
import { playersApi, statsApi, wellnessApi, medicalApi, rpeApi, attendanceApi } from '../api';
import type { MatchScope } from '../api/matches';
import { tacticalConfigApi } from '../api/tacticalConfig';
import { tacticalActionsApi } from '../api/tacticalEvents';
import { hydrateTacticalActions } from '../data/tacticalHydration';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { isoToday } from '../components/DateRangeCard';
import type { TeamCrossData } from '../data/crossAnalysis';

export interface UsePerformanceDataOptions {
  /** Réintègre les matchs amicaux dans TOUTES les analyses de la page (moyennes, bilan, PCA,
   *  corrélations, objectifs). `false` par défaut : un amical se joue avec des règles aménagées,
   *  contre un adversaire d'une autre division, en testant des rotations — le mélanger aux
   *  officiels fausse les moyennes autant que le bilan. L'inclusion reste utile en présaison,
   *  quand les amicaux sont les seules données existantes : c'est un geste explicite du staff. */
  includeFriendlies?: boolean;
  /** Charge aussi la config + les événements tactiques de la saison (2 requêtes de plus) —
   *  activé par défaut car Performance collective/individuelle en ont besoin pour "Tendances
   *  tactiques" et les attributs "Rentabilité de ..." d'Objectifs/Corrélations. Le Dashboard ne
   *  s'en sert jamais : y passer `{ tactical: false }` pour éviter ce coût à chaque visite. */
  tactical?: boolean;
}

/**
 * Étapes du chargement, dans l'ordre où elles se terminent — affichées à l'utilisateur pendant
 * l'attente. Une progression nommée rassure là où un spinner opaque laisse croire à un blocage.
 */
export const LOAD_STEPS = ['Effectif', 'Statistiques de match', 'Charge & bien-être', 'Tactique'] as const;
export type LoadStep = typeof LOAD_STEPS[number];

/**
 * Cache mémoire des données de performance, par (équipe, saison, tactique).
 *
 * Motivation : Performance collective et Performance individuelle consomment EXACTEMENT le même
 * jeu de données (11 requêtes couvrant toute la saison, en deux vagues séquentielles). Sans cache,
 * chaque aller-retour entre les deux pages rechargeait tout, et l'attente était intégrale à chaque
 * navigation.
 *
 * Stratégie « stale-while-revalidate » : on rend immédiatement la copie en cache, puis on
 * rafraîchit en arrière-plan et on met à jour à l'arrivée. La navigation est donc instantanée sans
 * jamais servir de données périmées durablement — ce qui compte, car le staff saisit des données
 * sur d'autres pages entre deux visites.
 */
const CACHE = new Map<string, TeamCrossData>();
// `friendlies` fait partie de la clé : avec et sans amicaux, ce sont deux jeux de données
// différents. Les confondre servirait des moyennes incluant les amicaux à un écran qui les exclut.
const cacheKey = (teamId: string, seasonId: string, tactical: boolean, friendlies: boolean) =>
  `${teamId}:${seasonId}:${tactical ? 'tac' : 'notac'}:${friendlies ? 'amicaux' : 'officiels'}`;

/** Vide le cache d'une équipe/saison — appelé par `reload()`. */
export function invalidatePerformanceData(teamId: string, seasonId: string) {
  for (const tactical of [true, false]) {
    for (const friendlies of [true, false]) {
      CACHE.delete(cacheKey(teamId, seasonId, tactical, friendlies));
    }
  }
}

/** Charge toutes les données de la saison sélectionnée, fusionnées par joueur (croisement multi-domaines). */
export function usePerformanceData(options: UsePerformanceDataOptions = {}) {
  const { tactical: includeTactical = true, includeFriendlies = false } = options;
  const scope: MatchScope = includeFriendlies ? 'all' : 'official';
  const { selected } = useTeamSeason();
  const [data, setData] = useState<TeamCrossData | null>(null);
  const [loading, setLoading] = useState(true);
  /** Étapes déjà terminées — alimente l'écran d'attente. */
  const [doneSteps, setDoneSteps] = useState<LoadStep[]>([]);
  // Incrémenté par `reload()` pour forcer un rechargement complet (ex. après suppression des
  // données tactiques d'un match depuis "Tendances tactiques" — plus simple et plus sûr qu'une
  // mise à jour locale partielle vu le nombre de champs dérivés de ces données).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const { team, season } = selected;
    const key = cacheKey(team.id, season.id, includeTactical, includeFriendlies);

    // Copie en cache : on l'affiche tout de suite et on rafraîchit en silence derrière.
    const cached = CACHE.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setDoneSteps([]);
    }
    const markDone = (step: LoadStep) => { if (!cancelled && !cached) setDoneSteps(prev => [...prev, step]); };
    Promise.all([
      playersApi.listBySeason(season.id),
      statsApi.listAllStatsBySeason(team.id, season.id, scope),
      statsApi.listTeamStatsBySeason(team.id, season.id, scope),
      rpeApi.list({ seasonId: season.id }),
      attendanceApi.listSessions(team.id, season.id),
      includeTactical ? tacticalConfigApi.getForTeam(team.id) : Promise.resolve(null),
    ]).then(async ([players, matchStats, teamMatchStats, rpe, sessions, tacticalConfig]) => {
      markDone('Effectif');
      markDone('Statistiques de match');
      const seasonMatchIds = teamMatchStats.filter(t => t.matchId).map(t => t.matchId as string);
      const [medical, attendance, allTimeRpeRows, wellness, tacticalEvents] = await Promise.all([
        players.length ? medicalApi.list({ playerIds: players.map(p => p.id) }) : Promise.resolve([]),
        attendanceApi.listAttendance(sessions.map(s => s.id)),
        // Toutes saisons confondues — nécessaire pour un ACWR/TSB fiable (28j de charge
        // chronique) même en tout début de saison, contrairement à `rpe` borné à la saison.
        players.length ? rpeApi.listRpeWithSessionByPlayerIds(players.map(p => p.id)) : Promise.resolve([]),
        // wellness_entries n'a pas de season_id : borner explicitement à la fin de saison, sinon une
        // saison passée récupère aussi les entrées des saisons suivantes jusqu'à aujourd'hui. Scopé aux
        // joueurs de la saison (playerIds) pour ne pas remonter les autres équipes du club et rester
        // sous le plafond de lignes de l'API sur un effectif/historique conséquent.
        players.length
          ? wellnessApi.list({ playerIds: players.map(p => p.id), from: season.startDate, to: season.endDate < isoToday() ? season.endDate : isoToday() })
          : Promise.resolve([]),
        tacticalConfig ? tacticalActionsApi.getForMatches(seasonMatchIds) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      markDone('Charge & bien-être');
      markDone('Tactique');
      const sessionDate = new Map(sessions.map(s => [s.id, s.date]));
      // Minutes cumulées de tout l'effectif par match (5 joueurs sur le terrain en permanence
      // ⇒ Σmin ≈ 5 × durée du match) — attaché à TeamMatchStat pour corriger usagePct par la
      // part de minutes jouées (calcPlayerAdvanced). Champ client-only, jamais lu depuis la DB.
      const teamMinutesByMatchId = new Map<string, number>();
      for (const m of matchStats) {
        if (!m.matchId) continue;
        teamMinutesByMatchId.set(m.matchId, (teamMinutesByMatchId.get(m.matchId) ?? 0) + m.min);
      }
      const enrichedTeamMatchStats = teamMatchStats.map(t => ({
        ...t,
        teamMinutes: t.matchId ? teamMinutesByMatchId.get(t.matchId) : undefined,
      }));
      const teamStatsByMatchId = new Map(
        enrichedTeamMatchStats.filter(t => t.matchId).map(t => [t.matchId as string, t]),
      );
      const sorted = [...players].sort((a, b) => a.lastName.localeCompare(b.lastName));
      const built: TeamCrossData = {
        teamMatchStats: enrichedTeamMatchStats,
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
          // Réhydratation une seule fois ici : les codes stockés redeviennent des libellés de
          // catalogue, et toute l'analyse en aval garde la forme qu'elle a toujours eue.
          events: hydrateTacticalActions(tacticalEvents, tacticalConfig.dimensions, tacticalConfig.options),
          categories: tacticalConfig.categories,
          dimensions: tacticalConfig.dimensions,
          options: tacticalConfig.options,
        } : undefined,
      };
      CACHE.set(key, built);
      setData(built);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.team.id, selected?.season.id, includeTactical, includeFriendlies, reloadToken]);

  return {
    data, loading, seasonStart: selected?.season.startDate, seasonEnd: selected?.season.endDate,
    /** Étapes déjà terminées — à passer à `<LoadingSteps>` pendant l'attente. */
    doneSteps,
    reload: () => {
      if (selected) invalidatePerformanceData(selected.team.id, selected.season.id);
      setReloadToken(t => t + 1);
    },
  };
}
