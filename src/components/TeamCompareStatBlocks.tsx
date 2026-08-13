import { Block, MetricRow, MetricBarRow, SubLabel } from './TrendBlocks';
import { teamWellnessAvg, type WellnessMetric } from '../utils/wellness';
import { teamAvgWeeklyLoad } from '../utils/weeklyLoad';
import { teamAvgRpe } from '../utils/rpe';
import { ratioFromSums, pctFromSums } from '../utils/ratioFromSums';
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
// Ratio des sommes (jamais la moyenne des ratios) — brique partagée, cf. utils/ratioFromSums.ts.
function ptsFor(t: TeamMatchStat): number { return t.fg2m * 2 + t.fg3m * 3 + t.ftm; }
function fga(t: TeamMatchStat): number { return t.fg2a + t.fg3a; }
function fgm(t: TeamMatchStat): number { return t.fg2m + t.fg3m; }
function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return Math.round(num / den * 100) / 100;
}
// Règle d'équipe : moyenne par joueuse puis moyenne des joueuses (et non l'agrégat quotidien,
// qui donnait une voix par jour et sur-pondérait les joueuses saisissant le plus souvent).
const wA = (entries: WellnessEntry[], key: WellnessMetric) => teamWellnessAvg(entries, key).value;

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
  // ORtg/DRtg d'un GROUPE de matchs : points × 100 / possessions, sommés puis divisés — et non la
  // moyenne des ORtg de chaque match, qui pondérerait chaque match à égalité quel que soit son
  // rythme. Les matchs sans possessions saisies sortent d'eux-mêmes (dénominateur nul).
  // DRtg se rapporte aux possessions ADVERSES quand elles sont connues, cohérent avec la vue
  // `team_match_stats_full` corrigée (cf. docs/CALCULS.md § 8).
  const oppPoss = (t: TeamMatchStat) => t.opp_possessions ?? t.possessions;
  const ortgP = pctFromSums(matchP, t => t.scoreUs, t => t.possessions);
  const ortgS = pctFromSums(matchS, t => t.scoreUs, t => t.possessions);
  const drtgP = pctFromSums(matchP, t => t.scoreThem, oppPoss);
  const drtgS = pctFromSums(matchS, t => t.scoreThem, oppPoss);

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

  // Ces quatre ratios lisaient les colonnes déjà agrégées (`toPct`, `ftRate`, `drebPct`, `orebPct`)
  // et les moyennaient match par match — alors que les six ratios ci-dessus utilisaient bien le
  // ratio des sommes, dans le même bloc. Ils repartent maintenant des compteurs bruts, comme eux.
  const toPctP   = pctFromSums(matchP, t => t.bp, t => t.possessions);
  const toPctS   = pctFromSums(matchS, t => t.bp, t => t.possessions);
  const drebPctP = pctFromSums(matchP, t => t.rd, t => t.rd + t.opp_ro);
  const drebPctS = pctFromSums(matchS, t => t.rd, t => t.rd + t.opp_ro);
  const orebPctP = pctFromSums(matchP, t => t.ro, t => t.ro + t.opp_rd);
  const orebPctS = pctFromSums(matchS, t => t.ro, t => t.ro + t.opp_rd);
  const ftRateP  = ratioFromSums(matchP, t => t.fta, fga, 1);
  const ftRateS  = ratioFromSums(matchS, t => t.fta, fga, 1);

  // RPE d'équipe : règle de l'app — moyenne par joueuse puis moyenne des joueuses (les groupes
  // comparés couvrent plusieurs séances, donc une moyenne à plat pondérerait par l'assiduité).
  const rpeAvgP = teamAvgRpe(a.rpe).value, rpeAvgS = teamAvgRpe(b.rpe).value;
  // Charge d'équipe : une voix par joueuse (cf. teamAvgWeeklyLoad), pas une voix par semaine.
  const loadWkP = teamAvgWeeklyLoad(a.rpe).value, loadWkS = teamAvgWeeklyLoad(b.rpe).value;

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
            <Row label="% BP"              period={toPctP}                season={toPctS}                unit="%" higherIsBetter={false} />
            <Row label="Fautes provoquées" period={p(t => t.fte)}         season={s(t => t.fte)}         dec={1} />
            {/* FT Rate est un RATIO (0,28 = 28 LF pour 100 tirs), pas un pourcentage : même forme
                qu'en base (ft_rate NUMERIC(4,2)) et que dans le boxscore. */}
            <Row label="FT Rate"           period={ftRateP}               season={ftRateS}               dec={2} />
          </>
        </Block>

        <div style={{ marginTop: 'auto' }}>
          <Block title="Rebonds" badge={{ period: rebP, season: rebS }} contentHeight={height(BH.reb)}>
            <>
              <Row label="Totaux"      period={rebP}              season={rebS}              dec={1} />
              <Row label="% Totaux"    period={trebPctP}          season={trebPctS}          unit="%" />
              <Row label="Défensifs"   period={p(t => t.rd)}       season={s(t => t.rd)}       dec={1} />
              <Row label="% défensifs" period={drebPctP}           season={drebPctS}           unit="%" />
              <Row label="Offensifs"   period={p(t => t.ro)}       season={s(t => t.ro)}       dec={1} />
              <Row label="% offensifs" period={orebPctP}           season={orebPctS}           unit="%" />
            </>
          </Block>
        </div>
      </div>
    </div>
  );
}
