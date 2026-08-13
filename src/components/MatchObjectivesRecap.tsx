import { useEffect, useMemo, useState } from 'react';
import { Target, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { EmptyState } from './EmptyState';
import { Badge } from './Badge';
import { PlayerAvatar } from './PlayerAvatar';
import { objectivesApi } from '../api';
import { evaluateObjectiveAt } from '../utils/objectiveStatus';
import { indicatorByKey, type CrossScope, type PlayerCrossData, type TeamCrossData } from '../data/crossAnalysis';
import { importanceConfig, comparatorConfig } from '../data/config';
import { fmt1 } from '../utils/format';
import { playerNameFull } from '../utils/playerName';
import type { Match, MatchStat, Objective, Player, TeamMatchStat } from '../data/types';

interface Props {
  match: Match;
  /** Stat collective de CE match — suffit à évaluer les objectifs d'équipe. */
  teamStats: TeamMatchStat | null;
  /** Stats individuelles de CE match. */
  individualStats: MatchStat[];
  players: Player[];
}

/** Une ligne évaluée, prête à l'affichage. */
interface Row {
  objective: Objective;
  label: string;
  unit: string;
  value: number;
  met: boolean;
}

/* ── Rendu d'une ligne ───────────────────────────────────────────────────── */

function ObjectiveLine({ row }: { row: Row }) {
  const imp = importanceConfig[row.objective.importance];
  const cmp = comparatorConfig[row.objective.comparator];
  const color = row.met ? '#00E5A0' : '#EF4444';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      backgroundColor: imp.bg, borderRadius: 6, borderLeft: `3px solid ${imp.color}`,
    }}>
      <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, flex: 1, minWidth: 0 }}>
        {row.label}
      </span>
      <span style={{ color: '#475569', fontSize: '0.72rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {cmp.symbol} {row.objective.thresholdValue}{row.unit ? ` ${row.unit}` : ''}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 62, justifyContent: 'flex-end' }}>
        <span style={{ color, fontSize: '0.95rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
          {fmt1(row.value)}
        </span>
        {row.met ? <CheckCircle2 size={13} style={{ color }} /> : <XCircle size={13} style={{ color }} />}
      </span>
    </div>
  );
}

/* ── Composant ───────────────────────────────────────────────────────────── */

/**
 * Récapitulatif des objectifs sur CE match — collectifs, puis par joueuse.
 *
 * Volontairement en lecture seule, et pas une réutilisation d'`ObjectivesPanel` : sur une fiche
 * match, la question n'est pas de gérer les objectifs mais de savoir lesquels ont été tenus ce
 * jour-là. La gestion reste sur les pages Performance.
 *
 * N'effectue aucune requête de statistiques : les `CrossScope` sont reconstruits à partir des
 * stats du match déjà chargées par la page. Seuls les objectifs eux-mêmes sont lus.
 */
export function MatchObjectivesRecap({ match, teamStats, individualStats, players }: Props) {
  const [teamObjectives, setTeamObjectives] = useState<Objective[]>([]);
  const [playerObjectives, setPlayerObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      objectivesApi.list({ teamId: match.teamId, seasonId: match.seasonId, active: true }),
      // Objectifs de joueuses de la saison : une requête, filtrée ensuite par joueuse présente.
      objectivesApi.list({ seasonId: match.seasonId, active: true }),
    ])
      .then(([team, all]) => {
        if (cancelled) return;
        setTeamObjectives(team);
        setPlayerObjectives(all.filter(o => o.playerId));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [match.teamId, match.seasonId]);

  /** Périmètre équipe reconstruit depuis la seule stat collective du match. */
  const teamRows = useMemo<Row[]>(() => {
    if (!teamStats) return [];
    const scope: CrossScope = { team: { players: [], teamMatchStats: [teamStats] } as TeamCrossData };
    return teamObjectives.flatMap(o => {
      const def = indicatorByKey(o.indicatorKey);
      const res = evaluateObjectiveAt(o, scope, match.date);
      return def && res ? [{ objective: o, label: def.label, unit: def.unit, ...res }] : [];
    });
  }, [teamObjectives, teamStats, match.date]);

  /** Idem par joueuse, depuis sa ligne de stats du match. */
  const playerGroups = useMemo(() => {
    const statByPlayer = new Map(individualStats.map(s => [s.playerId, s]));
    const teamStatsByMatchId = new Map(teamStats?.matchId ? [[teamStats.matchId, teamStats]] : []);
    return players.flatMap(p => {
      const stat = statByPlayer.get(p.id);
      const objectives = playerObjectives.filter(o => o.playerId === p.id);
      if (!stat || !objectives.length) return [];
      const scope: CrossScope = {
        player: {
          player: p, matchStats: [stat], teamStatsByMatchId,
          rpe: [], allTimeRpe: [], wellness: [], medical: [], attendance: [],
        } as PlayerCrossData,
      };
      const rows = objectives.flatMap(o => {
        const def = indicatorByKey(o.indicatorKey);
        const res = evaluateObjectiveAt(o, scope, match.date);
        return def && res ? [{ objective: o, label: def.label, unit: def.unit, ...res }] : [];
      });
      return rows.length ? [{ player: p, rows }] : [];
    });
  }, [players, playerObjectives, individualStats, teamStats, match.date]);

  if (loading) return <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>;

  if (teamRows.length === 0 && playerGroups.length === 0) {
    return (
      <EmptyState message="Aucun objectif mesurable sur ce match. Les objectifs se définissent depuis Performance collective ou individuelle." />
    );
  }

  const metCount = (rows: Row[]) => rows.filter(r => r.met).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {teamRows.length > 0 && (
        <Card>
          <CardTitle icon={<Target size={12} style={{ color: '#3B82F6' }} />} mb={10}
            info={`${metCount(teamRows)}/${teamRows.length} atteint${metCount(teamRows) > 1 ? 's' : ''}`}>
            Objectifs collectifs
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {teamRows.map(r => <ObjectiveLine key={r.objective.id} row={r} />)}
          </div>
        </Card>
      )}

      {playerGroups.map(({ player, rows }) => (
        <Card key={player.id}>
          <CardTitle mb={10} info={`${metCount(rows)}/${rows.length} atteint${metCount(rows) > 1 ? 's' : ''}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <PlayerAvatar player={player} size={20} />
              {playerNameFull(player)}
            </span>
          </CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => <ObjectiveLine key={r.objective.id} row={r} />)}
          </div>
        </Card>
      ))}

      {teamRows.length === 0 && (
        <Badge color="#475569" label="Aucun objectif collectif mesurable sur ce match" size="sm" />
      )}
    </div>
  );
}
