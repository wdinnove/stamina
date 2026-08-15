import { Block, MetricRow, MetricBarRow, SubLabel } from './TrendBlocks';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat } from '../data/types';
import { calcPlayerAdvancedForPeriod, perMatchPtsProd } from '../data/playerAdvanced';
import type { PlayerAdvancedStats } from '../data/playerAdvanced';

import { averageWeeklyLoad } from '../utils/weeklyLoad';
import { roundedAvg } from '../utils/avg';

/**
 * Rendu des blocs "Tendances" (Performance/Charge/Bien-être/Scoring/Défense/Playmaking/Rebonds)
 * pour DEUX ensembles de données arbitraires — extrait de PlayerDynStatTab pour être réutilisé par
 * tous les modes de comparaison joueur (par période, par match, par saison, par joueur) : seule la
 * façon de constituer `a`/`b` change, l'affichage reste strictement identique. `display` (contrôlé
 * par le parent, choisi dans la card Filtres de chaque onglet) bascule entre un rendu détaillé
 * (lignes chiffrées) et un rendu graphique (barres A/B).
 */

export interface CompareDataset {
  /** Nom du second terme dans les phrases de comparaison (ex. "saison", "groupe B", "Marc Dupont") */
  label: string;
  matchStats: MatchStat[];
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
}

interface Props {
  a: CompareDataset;
  b: CompareDataset;
  teamStatsMap?: Map<string, TeamMatchStat>;
  display: 'blocks' | 'chart';
}

// ── Helpers (identiques à PlayerDynStatTab) ────────────────────────────────

const n = (v: unknown): number => Number(v) || 0;
function avg(vals: number[]): number | null {
  if (!vals.length) return null;
  return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

type NumKey = 'min' | 'pts' | 'fg2m' | 'fg2a' | 'fg3m' | 'fg3a' | 'ftm' | 'fta'
            | 'ro' | 'rd' | 'pd' | 'ct' | 'intercepts' | 'bp' | 'fte' | 'fpr';

function pm(ms: MatchStat[], key: NumKey): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + n(m[key]), 0) / ms.length).toFixed(2);
}

function shotPct(ms: MatchStat[], made: 'fg2m' | 'fg3m' | 'ftm', att: 'fg2a' | 'fg3a' | 'fta'): number | null {
  const a = ms.reduce((s, m) => s + m[att], 0);
  if (a === 0) return null;
  return +(ms.reduce((s, m) => s + m[made], 0) / a * 100).toFixed(1);
}

function fgPct(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + m.fg3m, 0) / fga * 100).toFixed(1);
}

function eFgPct(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + 1.5 * m.fg3m, 0) / fga * 100).toFixed(1);
}

function tsPct(ms: MatchStat[]): number | null {
  const d = ms.reduce((s, m) => s + 2 * (m.fg2a + m.fg3a + 0.44 * m.fta), 0);
  if (d === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / d * 100).toFixed(1);
}

function fgaPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0) / ms.length).toFixed(1);
}

function fgmPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + m.fg3m, 0) / ms.length).toFixed(1);
}

function threePtRate(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg3a, 0) / fga * 100).toFixed(1);
}

/** FT Rate : un RATIO (0,28 = 28 lancers tentés pour 100 tirs), pas un pourcentage — même forme
 *  qu'en base (`ft_rate NUMERIC(4,2)`), que le boxscore avancé et que la fiche match. Cette
 *  surface l'affichait ×100 avec un suffixe « % », si bien que le même joueur lisait 0,28 dans un
 *  onglet et 28 % dans l'autre. */
function ftRate(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fta, 0) / fga).toFixed(2);
}

function astToRatio(ms: MatchStat[]): number | null {
  const bp = ms.reduce((s, m) => s + m.bp, 0);
  if (bp === 0) return null;
  return +(ms.reduce((s, m) => s + m.pd, 0) / bp).toFixed(2);
}

function ptsPerMin(ms: MatchStat[]): number | null {
  const mins = ms.reduce((s, m) => s + m.min, 0);
  if (mins === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / mins).toFixed(2);
}

function ficPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  const t = ms.reduce((s, m) => {
    const missedFG = (m.fg2a + m.fg3a) - (m.fg2m + m.fg3m);
    const missedFT = (m.fta - m.ftm) * 0.5;
    return s + m.pts + (m.ro + m.rd) + m.pd + m.ct + m.intercepts
           - missedFG - missedFT - m.bp;
  }, 0);
  return +(t / ms.length).toFixed(1);
}

function indPossPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.bp, 0) / ms.length).toFixed(1);
}

function ortgSimple(ms: MatchStat[]): number | null {
  const poss = ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.bp, 0);
  if (!ms.length || poss === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / poss * 100).toFixed(1);
}

/** Ratios avancés d'un groupe de matchs — sommes puis division (cf. calcPlayerAdvancedForPeriod),
 *  jamais la moyenne des ratios match par match. */
function advOf(ms: MatchStat[], map: Map<string, TeamMatchStat> | undefined) {
  const period = calcPlayerAdvancedForPeriod(ms, map);
  return {
    get: (key: keyof PlayerAdvancedStats) => period.stats[key],
    // Volume : moyenne par match, comme les lignes Points / Passes décisives voisines.
    ptsProdPerMatch: perMatchPtsProd(period),
  };
}

// Hauteurs fixes du contenu de chaque bloc (px) en mode détaillé — non appliquées en mode
// graphique, où chaque ligne prend plus de place (deux barres au lieu d'une ligne de chiffres).
const BH = { perf: 204, scoring: 415, play: 357, def: 174, reb: 233, rpe: 115, well: 263 } as const;

// ── Main ──────────────────────────────────────────────────────────────────────

export function PlayerCompareStatBlocks({ a, b, teamStatsMap, display }: Props) {
  const Row = display === 'chart' ? MetricBarRow : MetricRow;
  const height = (px: number) => display === 'blocks' ? px : undefined;

  const matchP = a.matchStats;
  const matchS = b.matchStats;

  const p = (k: NumKey) => pm(matchP, k);
  const s = (k: NumKey) => pm(matchS, k);

  const evalP = roundedAvg(matchP.filter(m => m.eval !== null).map(m => m.eval!));
  const evalS = roundedAvg(matchS.filter(m => m.eval !== null).map(m => m.eval!));
  const pmP   = avg(matchP.filter(m => m.plusMinus !== null).map(m => m.plusMinus!));
  const pmS   = avg(matchS.filter(m => m.plusMinus !== null).map(m => m.plusMinus!));

  const rebP = matchP.length ? +(matchP.reduce((s, m) => s + m.ro + m.rd, 0) / matchP.length).toFixed(1) : null;
  const rebS = matchS.length ? +(matchS.reduce((s, m) => s + m.ro + m.rd, 0) / matchS.length).toFixed(1) : null;

  const pFg   = fgPct(matchP);         const sFg   = fgPct(matchS);
  const pFg2  = shotPct(matchP, 'fg2m', 'fg2a'); const sFg2  = shotPct(matchS, 'fg2m', 'fg2a');
  const pFg3  = shotPct(matchP, 'fg3m', 'fg3a'); const sFg3  = shotPct(matchS, 'fg3m', 'fg3a');
  const pFt   = shotPct(matchP, 'ftm', 'fta');   const sFt   = shotPct(matchS, 'ftm', 'fta');
  const pEfg  = eFgPct(matchP);        const sEfg  = eFgPct(matchS);
  const pTs   = tsPct(matchP);         const sTs   = tsPct(matchS);
  const pFga  = fgaPerMatch(matchP);   const sFga  = fgaPerMatch(matchS);
  const pFgm  = fgmPerMatch(matchP);   const sFgm  = fgmPerMatch(matchS);
  const p3r   = threePtRate(matchP);   const s3r   = threePtRate(matchS);
  const pFtr  = ftRate(matchP);        const sFtr  = ftRate(matchS);
  const pFic  = ficPerMatch(matchP);   const sFic  = ficPerMatch(matchS);
  const pPtMn = ptsPerMin(matchP);     const sPtMn = ptsPerMin(matchS);
  const pAsto = astToRatio(matchP);    const sAsto = astToRatio(matchS);
  const advP = advOf(matchP, teamStatsMap); const advS = advOf(matchS, teamStatsMap);
  const pRoSh    = advP.get('orebPct');    const sRoSh    = advS.get('orebPct');
  const pRdSh    = advP.get('drebPct');    const sRdSh    = advS.get('drebPct');
  const pTrebPct = advP.get('trebPct');    const sTrebPct = advS.get('trebPct');
  const pAstR    = advP.get('astPct');     const sAstR    = advS.get('astPct');
  const pTovR    = advP.get('tovPct');     const sTovR    = advS.get('tovPct');
  const pPtsG    = advP.ptsProdPerMatch;   const sPtsG    = advS.ptsProdPerMatch;
  const pOrtg = ortgSimple(matchP);    const sOrtg = ortgSimple(matchS);
  const pUsgRaw = advP.get('usagePctRaw'); const sUsgRaw = advS.get('usagePctRaw');
  const pUsg    = advP.get('usagePct');    const sUsg    = advS.get('usagePct');
  const pPoss = indPossPerMatch(matchP); const sPoss = indPossPerMatch(matchS);

  void pFga; void pFgm; void pTs; void sFga; void sFgm; void sTs; void pFic; void sFic; // gardés pour parité avec PlayerDynStatTab (signaux potentiels futurs), non affichés dans les blocs

  // ── RPE ───────────────────────────────────────────────────────────────────

  const pRpe = avg(a.rpe.map(r => r.rpe)); const sRpe = avg(b.rpe.map(r => r.rpe));
  const toWeeklyRow = (r: RPEEntry) => ({ date: r.date, playerId: 'p', rpe: r.rpe, actualDuration: r.actualDuration, plannedDuration: r.plannedDuration });
  const pLoadWk = averageWeeklyLoad(a.rpe.map(toWeeklyRow));
  const sLoadWk = averageWeeklyLoad(b.rpe.map(toWeeklyRow));

  // ── Bien-être ─────────────────────────────────────────────────────────────

  const wA = (arr: WellnessEntry[], key: 'score' | 'sleep' | 'fatigue' | 'mood' | 'motivation' | 'stress' | 'soreness') =>
    roundedAvg(arr.map(w => n(w[key])));

  const pSco = wA(a.wellness, 'score');       const sSco = wA(b.wellness, 'score');
  const pSlp = wA(a.wellness, 'sleep');       const sSlp = wA(b.wellness, 'sleep');
  const pFat = wA(a.wellness, 'fatigue');     const sFat = wA(b.wellness, 'fatigue');
  const pMod = wA(a.wellness, 'mood');        const sMod = wA(b.wellness, 'mood');
  const pMot = wA(a.wellness, 'motivation');  const sMot = wA(b.wellness, 'motivation');
  const pStr = wA(a.wellness, 'stress');      const sStr = wA(b.wellness, 'stress');
  const pSor = wA(a.wellness, 'soreness');    const sSor = wA(b.wellness, 'soreness');

  const mSub = matchP.length ? `${matchP.length} match${matchP.length > 1 ? 's' : ''}` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 12 }}>

        {/* ── Col 1 : Performance + Charge + Bien-être ────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <Block title="Performance globale" subtitle={mSub} badge={{ period: evalP, season: evalS }} contentHeight={height(BH.perf)}>
            <>
              <Row label="Temps de jeu"    period={p('min')} season={s('min')} />
              <Row label="Points"           period={p('pts')} season={s('pts')} />
              <Row label="Évaluation"       period={evalP}    season={evalS} />
              <Row label="+/-"              period={pmP}      season={pmS}      sign />
              <Row label="Offensive Rating" period={pOrtg}    season={sOrtg}    dec={1} />
            </>
          </Block>

          <Block title="Charge physique" subtitle={a.rpe.length ? `${a.rpe.length} séance${a.rpe.length > 1 ? 's' : ''}` : undefined} badge={{ period: pLoadWk !== null ? +pLoadWk : null, season: sLoadWk !== null ? +sLoadWk : null, higherIsBetter: false }} contentHeight={height(BH.rpe)}>
            <>
              <Row label="RPE moyen"    period={pRpe}     season={sRpe}     higherIsBetter={false} />
              <Row label="Charge hebdo." period={pLoadWk !== null ? +pLoadWk : null} season={sLoadWk !== null ? +sLoadWk : null} unit=" UA" dec={0} higherIsBetter={false} />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
          <Block title="Bien-être" subtitle={a.wellness.length ? `${a.wellness.length} entrée${a.wellness.length > 1 ? 's' : ''}` : undefined} badge={{ period: pSco, season: sSco }} contentHeight={height(BH.well)}>
            <>
              <Row label="Score global" period={pSco} season={sSco} />
              <Row label="Sommeil"       period={pSlp} season={sSlp} />
              <Row label="Fatigue"       period={pFat} season={sFat} higherIsBetter={false} />
              <Row label="Humeur"        period={pMod} season={sMod} />
              <Row label="Motivation"    period={pMot} season={sMot} />
              <Row label="Stress"        period={pStr} season={sStr} higherIsBetter={false} />
              <Row label="Douleurs"      period={pSor} season={sSor} higherIsBetter={false} />
            </>
          </Block>
          </div>
        </div>

        {/* ── Col 2 : Scoring + Défense ────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <Block title="Scoring" badge={{ period: pEfg, season: sEfg }} contentHeight={height(BH.scoring)}>
            <>
              <Row label="eFG%"    period={pEfg}      season={sEfg}      unit="%" />
              <SubLabel>2 pts</SubLabel>
              <Row label="Tentés"  period={p('fg2a')} season={s('fg2a')} dec={1} />
              <Row label="Réussis" period={p('fg2m')} season={s('fg2m')} dec={1} />
              <Row label="%"       period={pFg2}      season={sFg2}      unit="%" />
              <SubLabel>3 pts</SubLabel>
              <Row label="Tentés"  period={p('fg3a')} season={s('fg3a')} dec={1} />
              <Row label="Réussis" period={p('fg3m')} season={s('fg3m')} dec={1} />
              <Row label="%"       period={pFg3}      season={sFg3}      unit="%" />
              <SubLabel>Lancers francs</SubLabel>
              <Row label="Tentés"  period={p('fta')}  season={s('fta')}  dec={1} />
              <Row label="Réussis" period={p('ftm')}  season={s('ftm')}  dec={1} />
              <Row label="%"       period={pFt}       season={sFt}       unit="%" />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
          <Block title="Défense" badge={{ period: p('intercepts'), season: s('intercepts') }} contentHeight={height(BH.def)}>
            <>
              <Row label="Contres"             period={p('ct')}         season={s('ct')} />
              <Row label="Interceptions"       period={p('intercepts')} season={s('intercepts')} />
              <Row label="Reb. défensifs"      period={p('rd')}         season={s('rd')}         dec={1} />
              <Row label="Fautes personnelles" period={p('fpr')}        season={s('fpr')}        higherIsBetter={false} />
            </>
          </Block>
          </div>
        </div>

        {/* ── Col 3 : Playmaking + Rebonds ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          <Block title="Playmaking" badge={{ period: pPtsG, season: sPtsG }} contentHeight={height(BH.play)}>
            <>
              <Row label="Possessions"       period={pPoss}    season={sPoss}    dec={1} />
              <Row label="%USG"              period={pUsgRaw}  season={sUsgRaw}  unit="%" />
              <Row label="%USG/min"          period={pUsg}     season={sUsg}     unit="%" />
              <Row label="Points générés"    period={pPtsG}    season={sPtsG}    dec={1} />
              <Row label="Points"            period={p('pts')} season={s('pts')} dec={1} />
              <Row label="Passes décisives"  period={p('pd')}  season={s('pd')}  dec={1} />
              <Row label="% PD"              period={pAstR}    season={sAstR}    unit="%" />
              <Row label="Ballons perdus"    period={p('bp')}  season={s('bp')}  dec={1} higherIsBetter={false} />
              <Row label="% BP"              period={pTovR}    season={sTovR}    unit="%" higherIsBetter={false} />
              <Row label="Fautes provoquées" period={p('fte')} season={s('fte')} dec={1} />
              <Row label="FT Rate"           period={pFtr}     season={sFtr}     dec={2} />
            </>
          </Block>

          <div style={{ marginTop: 'auto' }}>
          <Block title="Rebonds" badge={{ period: rebP, season: rebS }} contentHeight={height(BH.reb)}>
            <>
              <Row label="Totaux"      period={rebP}     season={rebS}     dec={1} />
              <Row label="% Totaux"    period={pTrebPct} season={sTrebPct} unit="%" />
              <Row label="Défensifs"   period={p('rd')}  season={s('rd')}  dec={1} />
              <Row label="% défensifs" period={pRdSh}    season={sRdSh}    unit="%" />
              <Row label="Offensifs"   period={p('ro')}  season={s('ro')}  dec={1} />
              <Row label="% offensifs" period={pRoSh}    season={sRoSh}    unit="%" />
            </>
          </Block>
          </div>
        </div>
      </div>
    </div>
  );
}
