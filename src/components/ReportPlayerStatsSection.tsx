import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, SplitRow, KeyValueRow,
  reportDec, MUTED, FAINT, type Tone,
} from './ReportKit';
import { ratioFromSums } from '../utils/ratioFromSums';
import type { MatchStat, Player } from '../data/types';

export interface PlayerStatsSectionData {
  player: Player;
  /** Ses feuilles de match sur la période. */
  games: MatchStat[];
  /** Matchs joués par l'équipe sur la période — pour situer sa présence. */
  teamGames: number;
  /** Minutes cumulées de tout l'effectif sur ces matchs, par matchId — sert à sa part de jeu. */
  teamMinutesByMatchId: Map<string, number>;
}

function avgOf<T>(rows: T[], get: (r: T) => number | null | undefined): number | null {
  const values = rows.map(get).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * La feuille de stats d'UN joueur.
 *
 * Le bloc d'équipe donne un bilan ; celui-ci donne un rôle. Les moyennes par match ne suffisent pas
 * à le décrire — un joueur à 8 points en 12 minutes et un joueur à 8 points en 30 minutes ne font
 * pas le même métier. D'où les valeurs ramenées à 30 minutes à côté des moyennes brutes, et le
 * temps de jeu traité comme un chiffre clé et non comme une colonne parmi d'autres.
 *
 * Les pourcentages somment tentatives et réussites de tous les matchs (`ratioFromSums`), ils ne
 * moyennent jamais les pourcentages match par match.
 */
export function ReportPlayerStatsSection({ index, subject, data }: {
  index: number | string;
  subject: string;
  data: PlayerStatsSectionData;
}) {
  const games = [...data.games].sort((a, b) => b.date.localeCompare(a.date));
  const wins = games.filter(g => g.result === 'win').length;
  const starts = games.filter(g => g.starter).length;

  const min = avgOf(games, g => g.min);
  const pts = avgOf(games, g => g.pts);
  const reb = avgOf(games, g => g.ro + g.rd);
  const ast = avgOf(games, g => g.pd);
  const stl = avgOf(games, g => g.intercepts);
  const blk = avgOf(games, g => g.ct);
  const to  = avgOf(games, g => g.bp);
  const evalAvg = avgOf(games, g => g.eval);
  const plusMinus = avgOf(games, g => g.plusMinus);

  const fg2 = ratioFromSums(games, g => g.fg2m, g => g.fg2a);
  const fg3 = ratioFromSums(games, g => g.fg3m, g => g.fg3a);
  const ft  = ratioFromSums(games, g => g.ftm,  g => g.fta);

  // Ramené à 30 minutes : la seule façon de comparer un titulaire et un joueur de rotation.
  const totalMin = games.reduce((s, g) => s + g.min, 0);
  const per30 = (total: number) => (totalMin > 0 ? (total / totalMin) * 30 : null);
  const pts30 = per30(games.reduce((s, g) => s + g.pts, 0));
  const reb30 = per30(games.reduce((s, g) => s + g.ro + g.rd, 0));
  const ast30 = per30(games.reduce((s, g) => s + g.pd, 0));

  // Part du temps de jeu de l'équipe, sur les matchs qu'il a disputés.
  const sharePlayed = games.reduce((acc, g) => {
    const teamMin = g.matchId ? data.teamMinutesByMatchId.get(g.matchId) : undefined;
    return teamMin && teamMin > 0 ? { min: acc.min + g.min, team: acc.team + teamMin } : acc;
  }, { min: 0, team: 0 });
  // 5 joueurs sur le terrain en permanence : sa part vaut 5 × ses minutes / minutes de l'effectif.
  const sharePct = sharePlayed.team > 0
    ? Math.min(100, Math.round((sharePlayed.min / sharePlayed.team) * 500)) : null;

  return (
    <>
      <SectionHeading index={index} label="Statistiques basket" subject={subject} />

      {games.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucun match avec statistiques sur la période
          {data.teamGames > 0 && <> alors que l'équipe en a disputé {data.teamGames}</>}.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Matchs joués"
              value={<>{games.length}<span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {data.teamGames}</span></>}
              tone={data.teamGames > 0 && games.length / data.teamGames >= 0.8 ? 'good' : 'neutral'}
              hint={`${starts} fois titulaire`}
            />
            <StatBlock
              label="Temps de jeu"
              value={reportDec(min)}
              unit="min"
              hint={sharePct !== null ? `${sharePct} % du temps disponible` : 'par match, en moyenne'}
            />
            <StatBlock
              label="Points"
              value={reportDec(pts)}
              hint={pts30 !== null ? `${reportDec(pts30)} pour 30 min` : 'par match, en moyenne'}
            />
            <StatBlock
              label="Évaluation"
              value={reportDec(evalAvg)}
              tone={evalAvg === null ? 'neutral' : evalAvg >= 10 ? 'good' : evalAvg >= 5 ? 'neutral' : 'warn'}
              hint={plusMinus === null ? 'par match, en moyenne' : `${plusMinus > 0 ? '+' : ''}${reportDec(plusMinus)} de +/− moyen`}
            />
          </StatRow>

          <SplitRow
            left={<>
              <BlockTitle>Moyennes par match</BlockTitle>
              <KeyValueRow label="Rebonds" value={reportDec(reb)} note={reb30 !== null ? `${reportDec(reb30)} /30 min` : undefined} />
              <KeyValueRow label="Passes décisives" value={reportDec(ast)} note={ast30 !== null ? `${reportDec(ast30)} /30 min` : undefined} />
              <KeyValueRow label="Interceptions" value={reportDec(stl)} />
              <KeyValueRow label="Contres" value={reportDec(blk)} />
              <KeyValueRow label="Balles perdues" value={reportDec(to)}
                note={ast !== null && to !== null && to > 0 ? `${reportDec(ast / to)} pd/bp` : undefined} last />
            </>}
            right={<>
              <BlockTitle>Adresse sur la période</BlockTitle>
              <KeyValueRow label="2 points" value={fg2 === null ? '—' : `${reportDec(fg2)} %`}
                note={`${games.reduce((s, g) => s + g.fg2m, 0)}/${games.reduce((s, g) => s + g.fg2a, 0)}`} />
              <KeyValueRow label="3 points" value={fg3 === null ? '—' : `${reportDec(fg3)} %`}
                note={`${games.reduce((s, g) => s + g.fg3m, 0)}/${games.reduce((s, g) => s + g.fg3a, 0)}`} />
              <KeyValueRow label="Lancers francs" value={ft === null ? '—' : `${reportDec(ft)} %`}
                note={`${games.reduce((s, g) => s + g.ftm, 0)}/${games.reduce((s, g) => s + g.fta, 0)}`} />
              <KeyValueRow label="Bilan personnel" value={`${wins} V — ${games.length - wins} D`}
                tone={wins > games.length - wins ? 'good' : wins === games.length - wins ? 'neutral' : 'bad'} />
              <KeyValueRow label="Fautes provoquées / commises"
                value={`${reportDec(avgOf(games, g => g.fpr))} / ${reportDec(avgOf(games, g => g.fte))}`} last />
            </>}
          />

          <div style={{ height: 18 }} />

          <Findings items={playerStatsFindings(data, games, min, pts, evalAvg, fg3, to, ast, sharePct)} />
        </>
      )}
    </>
  );
}

export function playerStatsFindings(
  data: PlayerStatsSectionData,
  games: MatchStat[],
  min: number | null,
  pts: number | null,
  evalAvg: number | null,
  fg3: number | null,
  turnovers: number | null,
  assists: number | null,
  sharePct: number | null,
): { tone: Tone; text: string }[] {
  if (games.length === 0) return [{ tone: 'neutral', text: 'Aucun match sur la période.' }];

  const out: { tone: Tone; text: string }[] = [];

  out.push({
    tone: 'neutral',
    text: `${games.length} match${games.length > 1 ? 's' : ''} disputé${games.length > 1 ? 's' : ''} sur ${data.teamGames} — ${reportDec(min)} minutes et ${reportDec(pts)} points de moyenne${sharePct !== null ? `, soit ${sharePct} % du temps de jeu disponible` : ''}.`,
  });

  if (data.teamGames > 0 && games.length < data.teamGames * 0.6) {
    out.push({
      tone: 'warn',
      text: `Absent de ${data.teamGames - games.length} match${data.teamGames - games.length > 1 ? 's' : ''} sur la période : ses moyennes portent sur un échantillon réduit.`,
    });
  }

  if (evalAvg !== null) {
    out.push({
      tone: evalAvg >= 12 ? 'good' : evalAvg < 4 ? 'warn' : 'neutral',
      text: evalAvg >= 12
        ? `Évaluation moyenne de ${reportDec(evalAvg)} : contribution nettement au-dessus de son temps de jeu.`
        : evalAvg < 4
          ? `Évaluation moyenne de ${reportDec(evalAvg)} : rendement faible au regard des minutes accordées.`
          : `Évaluation moyenne de ${reportDec(evalAvg)} sur la période.`,
    });
  }

  const threes = games.reduce((s, g) => s + g.fg3a, 0);
  if (fg3 !== null && threes >= 15 && (fg3 < 25 || fg3 >= 38)) {
    out.push({
      tone: fg3 < 25 ? 'warn' : 'good',
      text: fg3 < 25
        ? `${reportDec(fg3)} % à 3 points sur ${threes} tentatives : volume réel, rendement insuffisant.`
        : `${reportDec(fg3)} % à 3 points sur ${threes} tentatives : c'est une arme fiable.`,
    });
  }

  if (out.length < 4 && turnovers !== null && assists !== null && turnovers >= 3 && assists < turnovers) {
    out.push({
      tone: 'warn',
      text: `${reportDec(turnovers)} balles perdues pour ${reportDec(assists)} passes décisives par match : rapport à redresser.`,
    });
  }

  return out.slice(0, 3);
}
