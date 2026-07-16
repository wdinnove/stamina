import { Block, MetricRow, SubLabel, createSignalCollector, AnalyticalSummary } from './TrendBlocks';
import { aggregateTeamWellnessDaily, wellnessAvg } from '../utils/wellness';
import { averageWeeklyLoad } from '../utils/weeklyLoad';
import type { TeamMatchStat, RPEEntry, WellnessEntry } from '../data/types';

interface TeamDynStatTabProps {
  periodStats:      TeamMatchStat[];
  seasonStats:      TeamMatchStat[];
  periodLabel?:     string;
  periodRpe:        RPEEntry[];
  seasonRpe:        RPEEntry[];
  periodWellness:   WellnessEntry[];
  seasonWellness:   WellnessEntry[];
  evalAvgP:         number | null;
  evalAvgAll:       number | null;
}

// ── Helpers (mêmes formules que le tableau/l'onglet Matchs de Performance collective) ──

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

function tsPctTeam(arr: TeamMatchStat[]): number | null {
  const d = arr.reduce((s, t) => s + 2 * (fga(t) + 0.44 * t.fta), 0);
  if (d === 0) return null;
  return Math.round(arr.reduce((s, t) => s + ptsFor(t), 0) / d * 1000) / 10;
}

function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den === 0) return null;
  return Math.round(num / den * 100) / 100;
}

const wA = (entries: WellnessEntry[], key: 'score' | 'sleep' | 'fatigue' | 'mood' | 'motivation' | 'stress' | 'soreness') =>
  wellnessAvg(aggregateTeamWellnessDaily(entries).map(e => Number(e[key])));

// Hauteurs fixes du contenu de chaque bloc (px) — identiques données/vide, mêmes valeurs que PlayerDynStatTab
const BH = { perf: 204, scoring: 415, play: 315, def: 174, reb: 233, rpe: 115, well: 263 } as const;

/** Tendances au niveau équipe (période vs saison) — mêmes attributs/catégories que PlayerDynStatTab. */
export function TeamDynStatTab({
  periodStats, seasonStats, periodLabel,
  periodRpe, seasonRpe, periodWellness, seasonWellness,
  evalAvgP, evalAvgAll,
}: TeamDynStatTabProps) {
  const sum = (arr: TeamMatchStat[], pick: (t: TeamMatchStat) => number) => arr.reduce((s, t) => s + pick(t), 0);
  const p = (pick: (t: TeamMatchStat) => number) => avgField(periodStats, pick);
  const s = (pick: (t: TeamMatchStat) => number) => avgField(seasonStats, pick);

  // ── Performance globale ────────────────────────────────────────────────
  const ptsP = avgField(periodStats, ptsFor), ptsS = avgField(seasonStats, ptsFor);
  const ptsAgainstP = p(t => t.scoreThem), ptsAgainstS = s(t => t.scoreThem);
  const diffP = ratio(ptsP !== null && ptsAgainstP !== null ? ptsP - ptsAgainstP : null, 1);
  const diffS = ratio(ptsS !== null && ptsAgainstS !== null ? ptsS - ptsAgainstS : null, 1);
  const ortgP = p(t => t.offRating), ortgS = s(t => t.offRating);
  const drtgP = p(t => t.defRating), drtgS = s(t => t.defRating);

  // ── Scoring ─────────────────────────────────────────────────────────────
  const efgP = pctFromSums(periodStats, fgm, fga), efgS = pctFromSums(seasonStats, fgm, fga);
  const fg2PctP = pctFromSums(periodStats, t => t.fg2m, t => t.fg2a), fg2PctS = pctFromSums(seasonStats, t => t.fg2m, t => t.fg2a);
  const fg3PctP = pctFromSums(periodStats, t => t.fg3m, t => t.fg3a), fg3PctS = pctFromSums(seasonStats, t => t.fg3m, t => t.fg3a);
  const ftPctP  = pctFromSums(periodStats, t => t.ftm,  t => t.fta),  ftPctS  = pctFromSums(seasonStats, t => t.ftm,  t => t.fta);

  // ── Défense ──────────────────────────────────────────────────────────────
  // (ct, intercepts, rd, fpr : moyennes directes plus bas)

  // ── Playmaking ───────────────────────────────────────────────────────────
  // % PD approximé par le taux de paniers assistés (PD / paniers marqués) — l'assist ratio
  // NBA-style (PD / possessions utilisées) suppose des données on/off-court non disponibles ici.
  const astShareP = pctFromSums(periodStats, t => t.pd, fgm), astShareS = pctFromSums(seasonStats, t => t.pd, fgm);
  const pdBpP = ratio(sum(periodStats, t => t.pd), sum(periodStats, t => t.bp));
  const pdBpS = ratio(sum(seasonStats, t => t.pd), sum(seasonStats, t => t.bp));

  // ── Rebonds ──────────────────────────────────────────────────────────────
  const rebP = p(t => t.rt), rebS = s(t => t.rt);
  const trebPctP = pctFromSums(periodStats, t => t.rt, t => t.rt + t.opp_rt);
  const trebPctS = pctFromSums(seasonStats, t => t.rt, t => t.rt + t.opp_rt);

  // ── Charge physique équipe ────────────────────────────────────────────────
  const rpeAvgP = wellnessAvg(periodRpe.map(r => r.rpe));
  const rpeAvgS = wellnessAvg(seasonRpe.map(r => r.rpe));
  const loadWkP = averageWeeklyLoad(periodRpe);
  const loadWkS = averageWeeklyLoad(seasonRpe);

  // ── Bien-être équipe ───────────────────────────────────────────────────────
  const scoP = wA(periodWellness, 'score'),      scoS = wA(seasonWellness, 'score');
  const slpP = wA(periodWellness, 'sleep'),      slpS = wA(seasonWellness, 'sleep');
  const fatP = wA(periodWellness, 'fatigue'),    fatS = wA(seasonWellness, 'fatigue');
  const modP = wA(periodWellness, 'mood'),       modS = wA(seasonWellness, 'mood');
  const motP = wA(periodWellness, 'motivation'), motS = wA(seasonWellness, 'motivation');
  const strP = wA(periodWellness, 'stress'),     strS = wA(seasonWellness, 'stress');
  const sorP = wA(periodWellness, 'soreness'),   sorS = wA(seasonWellness, 'soreness');

  // ── Résumé analytique ──────────────────────────────────────────────────────
  const { signals, add } = createSignalCollector();
  add('Points',           ptsP,   ptsS,   '');
  add('Évaluation',       evalAvgP, evalAvgAll, '');
  add('+/-',              diffP,  diffS,  '', 1, true, 10);
  add('Adresse globale',  pctFromSums(periodStats, fgm, fga), pctFromSums(seasonStats, fgm, fga), '%');
  add('eFG%',             efgP,   efgS,   '%');
  add('TS%',              tsPctTeam(periodStats), tsPctTeam(seasonStats), '%');
  add('Adresse 2pts',     fg2PctP, fg2PctS, '%');
  add('Adresse 3pts',     fg3PctP, fg3PctS, '%');
  add('Adresse LF',       ftPctP,  ftPctS,  '%');
  add('Total rebonds',    rebP,   rebS,   '');
  add('Reb. offensifs',   p(t => t.ro), s(t => t.ro), '');
  add('Passes décisives', p(t => t.pd), s(t => t.pd), '');
  add('Ballons perdus',   p(t => t.bp), s(t => t.bp), '', 1, false);
  add('Ratio PD/BP',      pdBpP,  pdBpS,  '', 2);
  add('Contres',          p(t => t.ct), s(t => t.ct), '');
  add('Interceptions',    p(t => t.intercepts), s(t => t.intercepts), '');
  add('RPE moyen',        rpeAvgP, rpeAvgS, '', 1, false);
  add('Charge hebdo.',    loadWkP !== null ? +loadWkP : null, loadWkS !== null ? +loadWkS : null, ' UA', 0, false, 10);
  add('Bien-être',        scoP, scoS, '');
  add('Sommeil',          slpP, slpS, '');
  add('Fatigue',          fatP, fatS, '', 1, false);
  add('Stress',           strP, strS, '', 1, false);
  add('Motivation',       motP, motS, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 12 }}>

        {/* ── Col 1 : Performance + Charge + Bien-être ────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Block title="Résultats" subtitle={periodLabel} badge={{ period: evalAvgP, season: evalAvgAll }} contentHeight={BH.perf}>
            <>
              <MetricRow label="Points"            period={ptsP} season={ptsS} />
              <MetricRow label="Points concédés"   period={ptsAgainstP} season={ptsAgainstS} higherIsBetter={false} />
              <MetricRow label="Évaluation"        period={evalAvgP} season={evalAvgAll} />
              <MetricRow label="Offensive Rating"  period={ortgP} season={ortgS} dec={1} />
              <MetricRow label="Defensive Rating"  period={drtgP} season={drtgS} dec={1} higherIsBetter={false} />
            </>
          </Block>

          <Block title="Charge physique équipe" subtitle={periodRpe.length ? `${periodRpe.length} entrée${periodRpe.length > 1 ? 's' : ''}` : undefined} badge={{ period: loadWkP !== null ? +loadWkP : null, season: loadWkS !== null ? +loadWkS : null, higherIsBetter: false }} contentHeight={BH.rpe}>
            <>
              <MetricRow label="RPE moyen"     period={rpeAvgP} season={rpeAvgS} higherIsBetter={false} />
              <MetricRow label="Charge hebdo." period={loadWkP !== null ? +loadWkP : null} season={loadWkS !== null ? +loadWkS : null} unit=" UA" dec={0} higherIsBetter={false} />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
            <Block title="Bien-être équipe" subtitle={periodWellness.length ? `${periodWellness.length} entrée${periodWellness.length > 1 ? 's' : ''}` : undefined} badge={{ period: scoP, season: scoS }} contentHeight={BH.well}>
              <>
                <MetricRow label="Score global" period={scoP} season={scoS} />
                <MetricRow label="Sommeil"       period={slpP} season={slpS} />
                <MetricRow label="Fatigue"       period={fatP} season={fatS} higherIsBetter={false} />
                <MetricRow label="Humeur"        period={modP} season={modS} />
                <MetricRow label="Motivation"    period={motP} season={motS} />
                <MetricRow label="Stress"        period={strP} season={strS} higherIsBetter={false} />
                <MetricRow label="Douleurs"      period={sorP} season={sorS} higherIsBetter={false} />
              </>
            </Block>
          </div>
        </div>

        {/* ── Col 2 : Scoring + Défense ────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Block title="Scoring" badge={{ period: efgP, season: efgS }} contentHeight={BH.scoring}>
            <>
              <MetricRow label="eFG%"    period={efgP} season={efgS} unit="%" />
              <SubLabel>2 pts</SubLabel>
              <MetricRow label="Tentés"  period={p(t => t.fg2a)} season={s(t => t.fg2a)} dec={1} />
              <MetricRow label="Réussis" period={p(t => t.fg2m)} season={s(t => t.fg2m)} dec={1} />
              <MetricRow label="%"       period={fg2PctP} season={fg2PctS} unit="%" />
              <SubLabel>3 pts</SubLabel>
              <MetricRow label="Tentés"  period={p(t => t.fg3a)} season={s(t => t.fg3a)} dec={1} />
              <MetricRow label="Réussis" period={p(t => t.fg3m)} season={s(t => t.fg3m)} dec={1} />
              <MetricRow label="%"       period={fg3PctP} season={fg3PctS} unit="%" />
              <SubLabel>Lancers francs</SubLabel>
              <MetricRow label="Tentés"  period={p(t => t.fta)} season={s(t => t.fta)} dec={1} />
              <MetricRow label="Réussis" period={p(t => t.ftm)} season={s(t => t.ftm)} dec={1} />
              <MetricRow label="%"       period={ftPctP} season={ftPctS} unit="%" />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
            <Block title="Défense" badge={{ period: p(t => t.intercepts), season: s(t => t.intercepts) }} contentHeight={BH.def}>
              <>
                <MetricRow label="Contres"             period={p(t => t.ct)}         season={s(t => t.ct)} />
                <MetricRow label="Interceptions"       period={p(t => t.intercepts)} season={s(t => t.intercepts)} />
                <MetricRow label="Reb. défensifs"      period={p(t => t.rd)}         season={s(t => t.rd)} dec={1} />
                <MetricRow label="Fautes personnelles" period={p(t => t.fpr)}        season={s(t => t.fpr)} higherIsBetter={false} />
              </>
            </Block>
          </div>
        </div>

        {/* ── Col 3 : Playmaking + Rebonds ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Block title="Playmaking" badge={{ period: pdBpP, season: pdBpS }} contentHeight={BH.play}>
            <>
              <MetricRow label="Possessions"      period={p(t => t.possessions)} season={s(t => t.possessions)} dec={1} />
              <MetricRow label="Points"           period={ptsP} season={ptsS} dec={1} />
              <MetricRow label="Passes décisives" period={p(t => t.pd)} season={s(t => t.pd)} dec={1} />
              <MetricRow label="% PD"             period={astShareP} season={astShareS} unit="%" />
              <MetricRow label="Ballons perdus"   period={p(t => t.bp)} season={s(t => t.bp)} dec={1} higherIsBetter={false} />
              <MetricRow label="% BP"             period={p(t => t.toPct)} season={s(t => t.toPct)} unit="%" higherIsBetter={false} />
              <MetricRow label="Fautes provoquées" period={p(t => t.fte)} season={s(t => t.fte)} dec={1} />
              <MetricRow label="FT Rate"          period={p(t => t.ftRate)} season={s(t => t.ftRate)} unit="%" />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
            <Block title="Rebonds" badge={{ period: rebP, season: rebS }} contentHeight={BH.reb}>
              <>
                <MetricRow label="Totaux"      period={rebP}     season={rebS}     dec={1} />
                <MetricRow label="% Totaux"    period={trebPctP} season={trebPctS} unit="%" />
                <MetricRow label="Défensifs"   period={p(t => t.rd)} season={s(t => t.rd)} dec={1} />
                <MetricRow label="% défensifs" period={p(t => t.drebPct)} season={s(t => t.drebPct)} unit="%" />
                <MetricRow label="Offensifs"   period={p(t => t.ro)} season={s(t => t.ro)} dec={1} />
                <MetricRow label="% offensifs" period={p(t => t.orebPct)} season={s(t => t.orebPct)} unit="%" />
              </>
            </Block>
          </div>
        </div>
      </div>

      <AnalyticalSummary signals={signals} />
    </div>
  );
}
