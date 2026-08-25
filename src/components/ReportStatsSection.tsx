import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, DataTable, SplitRow, Tag,
  reportInt, reportDec, reportDateNum, MUTED, FAINT, type Tone, type Column,
} from './ReportKit';
import { ratioFromSums } from '../utils/ratioFromSums';
import type { TeamMatchStat, MatchStat } from '../data/types';

export interface StatsSectionData {
  /** Matchs de la période (stats collectives). */
  teamStats: TeamMatchStat[];
  /** Stats individuelles de la période, tous joueurs confondus. */
  playerStats: { name: string; stats: MatchStat[] }[];
}

const WIN  = '#00875F';
const LOSS = '#B91C1C';

/** Moyenne simple d'un champ sur les matchs — pour les compteurs, jamais pour les ratios. */
function avgOf<T>(rows: T[], get: (r: T) => number | null | undefined): number | null {
  const values = rows.map(get).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * La section « statistiques basket » d'un rapport : le score-sheet classique de la période.
 *
 * Les pourcentages sont recalculés en sommant numérateurs et dénominateurs sur tous les matchs
 * (`ratioFromSums`), jamais en moyennant les pourcentages match par match — sinon un match à
 * trois tirs pèserait autant qu'un match à soixante.
 */
export function ReportStatsSection({ index, data }: { index: number | string; data: StatsSectionData }) {
  const games = data.teamStats;
  const wins   = games.filter(g => g.result === 'win').length;
  const losses = games.length - wins;

  const ptsFor     = avgOf(games, g => g.scoreUs);
  const ptsAgainst = avgOf(games, g => g.scoreThem);
  const diff = ptsFor !== null && ptsAgainst !== null ? ptsFor - ptsAgainst : null;

  const fg2  = ratioFromSums(games, g => g.fg2m, g => g.fg2a);
  const fg3  = ratioFromSums(games, g => g.fg3m, g => g.fg3a);
  const ft   = ratioFromSums(games, g => g.ftm,  g => g.fta);
  const efg  = ratioFromSums(games, g => g.fg2m + g.fg3m + 0.5 * g.fg3m, g => g.fg2a + g.fg3a);

  const reb = avgOf(games, g => g.rt);
  const ast = avgOf(games, g => g.pd);
  const to  = avgOf(games, g => g.bp);
  const stl = avgOf(games, g => g.intercepts);

  // Contributeurs : moyennes par match, sur les joueurs ayant réellement joué la période.
  const contributors = data.playerStats
    .filter(p => p.stats.length > 0)
    .map(p => ({
      name: p.name,
      games: p.stats.length,
      pts:  (avgOf(p.stats, s => s.pts)  ?? 0),
      reb:  (avgOf(p.stats, s => s.ro + s.rd) ?? 0),
      ast:  (avgOf(p.stats, s => s.pd)  ?? 0),
      evalAvg: avgOf(p.stats, s => s.eval),
    }))
    .sort((a, b) => (b.evalAvg ?? -Infinity) - (a.evalAvg ?? -Infinity));

  const contribCols: Column<typeof contributors[number]>[] = [
    { key: 'name', label: 'Joueur', render: p => <span style={{ fontWeight: 600 }}>{p.name}</span> },
    { key: 'g',    label: 'M',   align: 'right', width: 28, render: p => <span style={{ color: MUTED }}>{p.games}</span> },
    { key: 'pts',  label: 'Pts', align: 'right', width: 38, render: p => <span style={{ fontWeight: 700 }}>{reportDec(p.pts)}</span> },
    { key: 'reb',  label: 'Reb', align: 'right', width: 38, render: p => reportDec(p.reb) },
    { key: 'ast',  label: 'Pd',  align: 'right', width: 34, render: p => reportDec(p.ast) },
    { key: 'ev',   label: 'Éval', align: 'right', width: 40,
      render: p => <span style={{ fontWeight: 700 }}>{p.evalAvg === null ? '—' : reportDec(p.evalAvg)}</span> },
  ];

  const gameCols: Column<TeamMatchStat>[] = [
    { key: 'date', label: 'Date', width: 68, render: g => <span style={{ color: MUTED }}>{reportDateNum(g.date)}</span> },
    { key: 'opp',  label: 'Adversaire', render: g => (
      <span><span style={{ fontWeight: 600 }}>{g.opponent}</span>
        <span style={{ color: FAINT, fontSize: 9.5 }}> · {g.homeAway === 'home' ? 'dom.' : 'ext.'}</span></span>
    ) },
    { key: 'res', label: 'Rés.', width: 42, render: g => (
      <Tag label={g.result === 'win' ? 'V' : 'D'} color={g.result === 'win' ? WIN : LOSS} />
    ) },
    { key: 'score', label: 'Score', align: 'right', width: 62,
      render: g => <span style={{ fontWeight: 700 }}>{g.scoreUs} – {g.scoreThem}</span> },
    { key: 'ecart', label: 'Écart', align: 'right', width: 46, render: g => {
      const d = g.scoreUs - g.scoreThem;
      return <span style={{ fontWeight: 700, color: d > 0 ? WIN : LOSS }}>{d > 0 ? '+' : '−'}{Math.abs(d)}</span>;
    } },
  ];

  return (
    <>
      <SectionHeading index={index} label="Statistiques basket" subject="Équipe"
        hint="Matchs joués sur la période. Les pourcentages agrègent les tentatives de tous les matchs, ils ne moyennent pas les pourcentages match par match." />

      {games.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucun match avec statistiques sur la période.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Bilan"
              value={<>{wins}<span style={{ fontSize: 15, color: MUTED, fontWeight: 600 }}> V </span>{losses}<span style={{ fontSize: 15, color: MUTED, fontWeight: 600 }}> D</span></>}
              tone={wins > losses ? 'good' : wins === losses ? 'neutral' : 'bad'}
              hint={`${games.length} match${games.length > 1 ? 's' : ''} joué${games.length > 1 ? 's' : ''}`}
            />
            <StatBlock
              label="Points marqués"
              value={reportDec(ptsFor)}
              hint="par match, en moyenne"
            />
            <StatBlock
              label="Points encaissés"
              value={reportDec(ptsAgainst)}
              hint="par match, en moyenne"
            />
            <StatBlock
              label="Différentiel"
              value={diff === null ? '—' : <>{diff > 0 ? '+' : diff < 0 ? '−' : ''}{reportDec(Math.abs(diff))}</>}
              tone={diff === null ? 'neutral' : diff > 0 ? 'good' : 'bad'}
              hint="écart moyen par match"
            />
          </StatRow>

          <SplitRow
            left={<>
              <BlockTitle>Adresse</BlockTitle>
              <ShootingRow label="2 points"     value={fg2} />
              <ShootingRow label="3 points"     value={fg3} />
              <ShootingRow label="Lancers francs" value={ft} />
              <ShootingRow label="eFG%"         value={efg} last />
            </>}
            right={<>
              <BlockTitle>Autres moyennes par match</BlockTitle>
              <CounterRow label="Rebonds"        value={reb} />
              <CounterRow label="Passes décisives" value={ast} />
              <CounterRow label="Interceptions"  value={stl} />
              <CounterRow label="Balles perdues" value={to} last />
            </>}
          />

          <div style={{ margin: '20px 0' }}>
            <BlockTitle>Meilleurs contributeurs — moyennes par match</BlockTitle>
            <DataTable columns={contribCols} rows={contributors} cap={6}
              emptyLabel="Aucune statistique individuelle sur la période." />
          </div>

          <div style={{ marginBottom: 20 }}>
            <BlockTitle>Match par match</BlockTitle>
            <DataTable columns={gameCols} rows={[...games].sort((a, b) => b.date.localeCompare(a.date))} cap={7} />
          </div>

          <Findings items={statsFindings(games, wins, losses, diff, fg3, to)} />
        </>
      )}
    </>
  );
}

function ShootingRow({ label, value, last }: { label: string; value: number | null; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: last ? 'none' : '1px solid #E2E8F0' }}>
      <span style={{ fontSize: 11 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value === null ? '—' : `${reportDec(value)} %`}</span>
    </div>
  );
}

function CounterRow({ label, value, last }: { label: string; value: number | null; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: last ? 'none' : '1px solid #E2E8F0' }}>
      <span style={{ fontSize: 11 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{value === null ? '—' : reportDec(value)}</span>
    </div>
  );
}

export function statsFindings(
  games: TeamMatchStat[],
  wins: number,
  losses: number,
  diff: number | null,
  fg3: number | null,
  turnovers: number | null,
): { tone: Tone; text: string }[] {
  if (games.length === 0) return [{ tone: 'neutral', text: 'Aucun match sur la période.' }];

  const out: { tone: Tone; text: string }[] = [];

  out.push({
    tone: wins > losses ? 'good' : wins === losses ? 'neutral' : 'bad',
    text: `${wins} victoire${wins > 1 ? 's' : ''} pour ${losses} défaite${losses > 1 ? 's' : ''} sur la période${diff !== null ? `, avec un écart moyen de ${diff > 0 ? '+' : '−'}${reportDec(Math.abs(diff))} points` : ''}.`,
  });

  // Domicile / extérieur : l'écart le plus souvent commenté par un staff.
  const home = games.filter(g => g.homeAway === 'home');
  const away = games.filter(g => g.homeAway === 'away');
  if (home.length > 0 && away.length > 0) {
    const hw = home.filter(g => g.result === 'win').length;
    const aw = away.filter(g => g.result === 'win').length;
    out.push({
      tone: 'neutral',
      text: `À domicile : ${hw}/${home.length}. À l'extérieur : ${aw}/${away.length}.`,
    });
  }

  if (fg3 !== null && (fg3 < 25 || fg3 >= 35)) {
    out.push({
      tone: fg3 < 25 ? 'warn' : 'good',
      text: fg3 < 25
        ? `Adresse à 3 points de ${reportDec(fg3)} % : en dessous de ce qu'on attend d'un volume normal.`
        : `Adresse à 3 points de ${reportDec(fg3)} % : point fort de la période.`,
    });
  }

  if (turnovers !== null && turnovers >= 16) {
    out.push({
      tone: 'warn',
      text: `${reportDec(turnovers)} balles perdues par match en moyenne : volume élevé, à travailler.`,
    });
  }

  const blowouts = games.filter(g => Math.abs(g.scoreUs - g.scoreThem) >= 20).length;
  if (blowouts > 0 && out.length < 4) {
    out.push({ tone: 'neutral', text: `${blowouts} match${blowouts > 1 ? 's' : ''} avec un écart d'au moins 20 points.` });
  }

  return out.slice(0, 4);
}
