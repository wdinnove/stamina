import { Block, MetricRow, MetricBarRow, SubLabel } from './TrendBlocks';
import { aggregateTeamWellnessDaily, wellnessAvg } from '../utils/wellness';
import { averageWeeklyLoad } from '../utils/weeklyLoad';
import type { RPEEntry, WellnessEntry, TeamMatchStat } from '../data/types';

/**
 * Rendu des blocs de comparaison équipe (Résultats/Charge/Bien-être/Scoring/Défense/Playmaking/
 * Rebonds) pour DEUX ensembles de matchs d'équipe arbitraires — extrait pour être réutilisé par
 * tous les modes de comparaison équipe ("Par match", "Par saison") : seule la façon de constituer
 * `a`/`b` change, l'affichage reste strictement identique. Même principe que PlayerCompareStatBlocks
 * côté individuel, mais sur des TeamMatchStat plutôt que des MatchStat par joueur.
 */

export interface TeamCompareDataset {
  /** Nom du second terme dans les phrases de comparaison (ex. "groupe B", "2024-2025") */
  label: string;
  matchStats: TeamMatchStat[];
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
  /** Moyenne d'évaluation joueurs sur ces matchs — null si non disponible pour ce regroupement */
  evalAvg: number | null;
}

interface Props {
  a: TeamCompareDataset;
  b: TeamCompareDataset;
  display: 'blocks' | 'chart';
}

// ── Formules équipe ─────────────────────────────────────────────────────────

function avgField(arr: TeamMatchStat[], pick: (t: TeamMatchStat) => number): number | null {
  if (!arr.length) return null;
  return Math.round(arr.reduce((s, t) => s + pick(t), 0) / arr.length * 10) / 10;
}
function pctFromSums(arr: TeamMatchStat[], made: (t: TeamMatchStat) => number, att: (t: TeamMatchStat) => number): number | null {
  const a = arr.reduce((s, t) => s + att(t), 0);
  if (a === 0) return null;
  return Math.round(arr.reduce((s, t) => s + made(t), 0) / a * 1000) / 10;
}
function ptsFor(t: TeamMatchStat): number { return t.fg2m * 2 + t.fg3m * 3 + t.ftm; }
function fga(t: TeamMatchStat): number { return t.fg2a + t.fg3a; }
function fgm(t: TeamMatchStat): number { return t.fg2m + t.fg3m; }
function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return Math.round(num / den * 100) / 100;
}
const wA = (entries: WellnessEntry[], key: 'score' | 'sleep' | 'fatigue' | 'mood' | 'motivation' | 'stress' | 'soreness') =>
  wellnessAvg(aggregateTeamWellnessDaily(entries).map(e => Number(e[key])));

const BH = { perf: 204, scoring: 415, play: 315, def: 174, reb: 233, rpe: 115, well: 263 } as const;

export function TeamCompareStatBlocks({ a, b, display }: Props) {
  const Row = display === 'chart' ? MetricBarRow : MetricRow;
  const height = (px: number) => display === 'blocks' ? px : undefined;

  const matchP = a.matchStats;
  const matchS = b.matchStats;

  const p = (pick: (t: TeamMatchStat) => number) => avgField(matchP, pick);
  const s = (pick: (t: TeamMatchStat) => number) => avgField(matchS, pick);
  const sum = (arr: TeamMatchStat[], pick: (t: TeamMatchStat) => number) => arr.reduce((acc, t) => acc + pick(t), 0);

  const ptsP = avgField(matchP, ptsFor), ptsS = avgField(matchS, ptsFor);
  const ptsAgainstP = p(t => t.scoreThem), ptsAgainstS = s(t => t.scoreThem);
  const ortgP = p(t => t.offRating), ortgS = s(t => t.offRating);
  const drtgP = p(t => t.defRating), drtgS = s(t => t.defRating);

  const efgP = pctFromSums(matchP, fgm, fga), efgS = pctFromSums(matchS, fgm, fga);
  const fg2PctP = pctFromSums(matchP, t => t.fg2m, t => t.fg2a), fg2PctS = pctFromSums(matchS, t => t.fg2m, t => t.fg2a);
  const fg3PctP = pctFromSums(matchP, t => t.fg3m, t => t.fg3a), fg3PctS = pctFromSums(matchS, t => t.fg3m, t => t.fg3a);
  const ftPctP  = pctFromSums(matchP, t => t.ftm,  t => t.fta),  ftPctS  = pctFromSums(matchS, t => t.ftm,  t => t.fta);

  const astShareP = pctFromSums(matchP, t => t.pd, fgm), astShareS = pctFromSums(matchS, t => t.pd, fgm);
  const pdBpP = ratio(sum(matchP, t => t.pd), sum(matchP, t => t.bp));
  const pdBpS = ratio(sum(matchS, t => t.pd), sum(matchS, t => t.bp));

  const rebP = p(t => t.rt), rebS = s(t => t.rt);
  const trebPctP = pctFromSums(matchP, t => t.rt, t => t.rt + t.opp_rt);
  const trebPctS = pctFromSums(matchS, t => t.rt, t => t.rt + t.opp_rt);

  const rpeAvgP = wellnessAvg(a.rpe.map(r => r.rpe)), rpeAvgS = wellnessAvg(b.rpe.map(r => r.rpe));
  const loadWkP = averageWeeklyLoad(a.rpe), loadWkS = averageWeeklyLoad(b.rpe);

  const scoP = wA(a.wellness, 'score'),      scoS = wA(b.wellness, 'score');
  const slpP = wA(a.wellness, 'sleep'),      slpS = wA(b.wellness, 'sleep');
  const fatP = wA(a.wellness, 'fatigue'),    fatS = wA(b.wellness, 'fatigue');
  const modP = wA(a.wellness, 'mood'),       modS = wA(b.wellness, 'mood');
  const motP = wA(a.wellness, 'motivation'), motS = wA(b.wellness, 'motivation');
  const strP = wA(a.wellness, 'stress'),     strS = wA(b.wellness, 'stress');
  const sorP = wA(a.wellness, 'soreness'),   sorS = wA(b.wellness, 'soreness');

  const mSub = matchP.length ? `${matchP.length} match${matchP.length > 1 ? 's' : ''}` : undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 12 }}>

      {/* ── Col 1 : Résultats + Charge + Bien-être ────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Block title="Résultats" subtitle={mSub} badge={{ period: a.evalAvg, season: b.evalAvg }} contentHeight={height(BH.perf)}>
          <>
            <Row label="Points"            period={ptsP} season={ptsS} />
            <Row label="Points concédés"   period={ptsAgainstP} season={ptsAgainstS} higherIsBetter={false} />
            <Row label="Évaluation"        period={a.evalAvg} season={b.evalAvg} />
            <Row label="Offensive Rating"  period={ortgP} season={ortgS} dec={1} />
            <Row label="Defensive Rating"  period={drtgP} season={drtgS} dec={1} higherIsBetter={false} />
          </>
        </Block>

        <Block title="Charge physique équipe" subtitle={a.rpe.length ? `${a.rpe.length} entrée${a.rpe.length > 1 ? 's' : ''}` : undefined} badge={{ period: loadWkP !== null ? +loadWkP : null, season: loadWkS !== null ? +loadWkS : null, higherIsBetter: false }} contentHeight={height(BH.rpe)}>
          <>
            <Row label="RPE moyen"     period={rpeAvgP} season={rpeAvgS} higherIsBetter={false} />
            <Row label="Charge hebdo." period={loadWkP !== null ? +loadWkP : null} season={loadWkS !== null ? +loadWkS : null} unit=" UA" dec={0} higherIsBetter={false} />
          </>
        </Block>

        <div style={{ marginTop: 'auto' }}>
          <Block title="Bien-être équipe" subtitle={a.wellness.length ? `${a.wellness.length} entrée${a.wellness.length > 1 ? 's' : ''}` : undefined} badge={{ period: scoP, season: scoS }} contentHeight={height(BH.well)}>
            <>
              <Row label="Score global" period={scoP} season={scoS} />
              <Row label="Sommeil"       period={slpP} season={slpS} />
              <Row label="Fatigue"       period={fatP} season={fatS} higherIsBetter={false} />
              <Row label="Humeur"        period={modP} season={modS} />
              <Row label="Motivation"    period={motP} season={motS} />
              <Row label="Stress"        period={strP} season={strS} higherIsBetter={false} />
              <Row label="Douleurs"      period={sorP} season={sorS} higherIsBetter={false} />
            </>
          </Block>
        </div>
      </div>

      {/* ── Col 2 : Scoring + Défense ────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Block title="Scoring" badge={{ period: efgP, season: efgS }} contentHeight={height(BH.scoring)}>
          <>
            <Row label="eFG%"    period={efgP}           season={efgS}           unit="%" />
            <SubLabel>2 pts</SubLabel>
            <Row label="Tentés"  period={p(t => t.fg2a)} season={s(t => t.fg2a)} dec={1} />
            <Row label="Réussis" period={p(t => t.fg2m)} season={s(t => t.fg2m)} dec={1} />
            <Row label="%"       period={fg2PctP}        season={fg2PctS}        unit="%" />
            <SubLabel>3 pts</SubLabel>
            <Row label="Tentés"  period={p(t => t.fg3a)} season={s(t => t.fg3a)} dec={1} />
            <Row label="Réussis" period={p(t => t.fg3m)} season={s(t => t.fg3m)} dec={1} />
            <Row label="%"       period={fg3PctP}        season={fg3PctS}        unit="%" />
            <SubLabel>Lancers francs</SubLabel>
            <Row label="Tentés"  period={p(t => t.fta)}  season={s(t => t.fta)}  dec={1} />
            <Row label="Réussis" period={p(t => t.ftm)}  season={s(t => t.ftm)}  dec={1} />
            <Row label="%"       period={ftPctP}         season={ftPctS}         unit="%" />
          </>
        </Block>

        <div style={{ marginTop: 'auto' }}>
          <Block title="Défense" badge={{ period: p(t => t.intercepts), season: s(t => t.intercepts) }} contentHeight={height(BH.def)}>
            <>
              <Row label="Contres"             period={p(t => t.ct)}         season={s(t => t.ct)} />
              <Row label="Interceptions"       period={p(t => t.intercepts)} season={s(t => t.intercepts)} />
              <Row label="Reb. défensifs"      period={p(t => t.rd)}         season={s(t => t.rd)} dec={1} />
              <Row label="Fautes personnelles" period={p(t => t.fpr)}        season={s(t => t.fpr)} higherIsBetter={false} />
            </>
          </Block>
        </div>
      </div>

      {/* ── Col 3 : Playmaking + Rebonds ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Block title="Playmaking" badge={{ period: pdBpP, season: pdBpS }} contentHeight={height(BH.play)}>
          <>
            <Row label="Possessions"       period={p(t => t.possessions)} season={s(t => t.possessions)} dec={1} />
            <Row label="Points"            period={ptsP}                  season={ptsS}                  dec={1} />
            <Row label="Passes décisives"  period={p(t => t.pd)}          season={s(t => t.pd)}          dec={1} />
            <Row label="% PD"              period={astShareP}             season={astShareS}             unit="%" />
            <Row label="Ballons perdus"    period={p(t => t.bp)}          season={s(t => t.bp)}          dec={1} higherIsBetter={false} />
            <Row label="% BP"              period={p(t => t.toPct)}       season={s(t => t.toPct)}       unit="%" higherIsBetter={false} />
            <Row label="Fautes provoquées" period={p(t => t.fte)}         season={s(t => t.fte)}         dec={1} />
            <Row label="FT Rate"           period={p(t => t.ftRate)}      season={s(t => t.ftRate)}      unit="%" />
          </>
        </Block>

        <div style={{ marginTop: 'auto' }}>
          <Block title="Rebonds" badge={{ period: rebP, season: rebS }} contentHeight={height(BH.reb)}>
            <>
              <Row label="Totaux"      period={rebP}              season={rebS}              dec={1} />
              <Row label="% Totaux"    period={trebPctP}          season={trebPctS}          unit="%" />
              <Row label="Défensifs"   period={p(t => t.rd)}       season={s(t => t.rd)}       dec={1} />
              <Row label="% défensifs" period={p(t => t.drebPct)}  season={s(t => t.drebPct)}  unit="%" />
              <Row label="Offensifs"   period={p(t => t.ro)}       season={s(t => t.ro)}       dec={1} />
              <Row label="% offensifs" period={p(t => t.orebPct)}  season={s(t => t.orebPct)}  unit="%" />
            </>
          </Block>
        </div>
      </div>
    </div>
  );
}
