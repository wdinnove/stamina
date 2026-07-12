import React, { useEffect, useRef } from 'react';
import { DateRangeCard, useDateRange } from './DateRangeCard';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat } from '../data/types';
import { calcPlayerAdvanced } from '../data/playerAdvanced';
import type { PlayerAdvancedStats } from '../data/playerAdvanced';

interface Props {
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
  matchStats: MatchStat[];
  seasonStart?: string;
  seasonEnd?: string;
  teamStatsMap?: Map<string, TeamMatchStat>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Shooting %
function shotPct(ms: MatchStat[], made: 'fg2m' | 'fg3m' | 'ftm', att: 'fg2a' | 'fg3a' | 'fta'): number | null {
  const a = ms.reduce((s, m) => s + m[att], 0);
  if (a === 0) return null;
  return +(ms.reduce((s, m) => s + m[made], 0) / a * 100).toFixed(1);
}

// FG% global (hors LF)
function fgPct(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + m.fg3m, 0) / fga * 100).toFixed(1);
}

// eFG% = (FGM + 0.5·FG3M) / FGA
function eFgPct(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + 1.5 * m.fg3m, 0) / fga * 100).toFixed(1);
}

// TS% = PTS / (2 · (FGA + 0.44·FTA))
function tsPct(ms: MatchStat[]): number | null {
  const d = ms.reduce((s, m) => s + 2 * (m.fg2a + m.fg3a + 0.44 * m.fta), 0);
  if (d === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / d * 100).toFixed(1);
}

// Volume tirs de champ tentés / match (FGA)
function fgaPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0) / ms.length).toFixed(1);
}

// Tirs de champ réussis / match (FGM)
function fgmPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2m + m.fg3m, 0) / ms.length).toFixed(1);
}

// Part des tirs à 3pts = FG3A / FGA
function threePtRate(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fg3a, 0) / fga * 100).toFixed(1);
}

// Accès aux LF = FTA / FGA
function ftRate(ms: MatchStat[]): number | null {
  const fga = ms.reduce((s, m) => s + m.fg2a + m.fg3a, 0);
  if (fga === 0) return null;
  return +(ms.reduce((s, m) => s + m.fta, 0) / fga * 100).toFixed(1);
}

// Ratio PD / BP
function astToRatio(ms: MatchStat[]): number | null {
  const bp = ms.reduce((s, m) => s + m.bp, 0);
  if (bp === 0) return null;
  return +(ms.reduce((s, m) => s + m.pd, 0) / bp).toFixed(2);
}

// Points par minute
function ptsPerMin(ms: MatchStat[]): number | null {
  const mins = ms.reduce((s, m) => s + m.min, 0);
  if (mins === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / mins).toFixed(2);
}

// Points par zone (par match)
function ptsZone(ms: MatchStat[], zone: '2' | '3' | 'ft'): number | null {
  if (!ms.length) return null;
  const t = ms.reduce((s, m) =>
    zone === '2' ? s + m.fg2m * 2 : zone === '3' ? s + m.fg3m * 3 : s + m.ftm, 0);
  return +(t / ms.length).toFixed(1);
}

// Part du scoring par zone (%)
function ptsSharePct(ms: MatchStat[], zone: '2' | '3' | 'ft'): number | null {
  const totalPts = ms.reduce((s, m) => s + m.pts, 0);
  if (!ms.length || totalPts === 0) return null;
  const z = ms.reduce((s, m) =>
    zone === '2' ? s + m.fg2m * 2 : zone === '3' ? s + m.fg3m * 3 : s + m.ftm, 0);
  return +(z / totalPts * 100).toFixed(1);
}

// % rebonds offensifs dans le total rebonds
function roSharePct(ms: MatchStat[]): number | null {
  const total = ms.reduce((s, m) => s + m.ro + m.rd, 0);
  if (total === 0) return null;
  return +(ms.reduce((s, m) => s + m.ro, 0) / total * 100).toFixed(1);
}

// FIC (Floor Impact Counter) / match
// FIC = PTS + REB + PD + CT + INT − tirs_manqués − LF_manquées/2 − BP
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

// Possessions individuelles utilisées / match = FGA + 0.44·FTA + BP
function indPossPerMatch(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.bp, 0) / ms.length).toFixed(1);
}

// ORTG individuel simplifié : PTS / indPoss × 100
function ortgSimple(ms: MatchStat[]): number | null {
  const poss = ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.bp, 0);
  if (!ms.length || poss === 0) return null;
  return +(ms.reduce((s, m) => s + m.pts, 0) / poss * 100).toFixed(1);
}

// USG% = indPoss / teamPoss × 100 (même formule que les tableaux)
function usgFromTeam(ms: MatchStat[], map?: Map<string, TeamMatchStat>): number | null {
  if (!ms.length || !map) return null;
  const vals: number[] = [];
  for (const m of ms) {
    const t = map.get(m.matchId ?? '');
    if (!t) continue;
    const indPoss  = m.fg2a + m.fg3a + 0.44 * m.fta + m.bp;
    const teamPoss = t.fg2a + t.fg3a + 0.44 * t.fta + t.bp;
    if (teamPoss > 0) vals.push(indPoss / teamPoss * 100);
  }
  if (!vals.length) return null;
  return +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

// Points générés = PTS + PD × 2 (estimation)
function ptsGenerated(ms: MatchStat[]): number | null {
  if (!ms.length) return null;
  return +(ms.reduce((s, m) => s + m.pts + m.pd * 2, 0) / ms.length).toFixed(1);
}

// Assist Ratio : PD / (FGA + 0.44·FTA + PD + BP) × 100
function astRatio(ms: MatchStat[]): number | null {
  const denom = ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.pd + m.bp, 0);
  if (!ms.length || denom === 0) return null;
  return +(ms.reduce((s, m) => s + m.pd, 0) / denom * 100).toFixed(1);
}

// TOV Ratio : BP / (FGA + 0.44·FTA + PD + BP) × 100
function tovRatio(ms: MatchStat[]): number | null {
  const denom = ms.reduce((s, m) => s + m.fg2a + m.fg3a + 0.44 * m.fta + m.pd + m.bp, 0);
  if (!ms.length || denom === 0) return null;
  return +(ms.reduce((s, m) => s + m.bp, 0) / denom * 100).toFixed(1);
}

// % rebonds défensifs parmi les rebonds du joueur
function rdSharePct(ms: MatchStat[]): number | null {
  const total = ms.reduce((s, m) => s + m.ro + m.rd, 0);
  if (total === 0) return null;
  return +(ms.reduce((s, m) => s + m.rd, 0) / total * 100).toFixed(1);
}

// Rebonds par 40 min (normalisé)
function rebPer40(ms: MatchStat[]): number | null {
  const mins = ms.reduce((s, m) => s + m.min, 0);
  if (!ms.length || mins === 0) return null;
  return +(ms.reduce((s, m) => s + m.ro + m.rd, 0) / mins * 40).toFixed(1);
}
function rdPer40(ms: MatchStat[]): number | null {
  const mins = ms.reduce((s, m) => s + m.min, 0);
  if (!ms.length || mins === 0) return null;
  return +(ms.reduce((s, m) => s + m.rd, 0) / mins * 40).toFixed(1);
}
function roPer40(ms: MatchStat[]): number | null {
  const mins = ms.reduce((s, m) => s + m.min, 0);
  if (!ms.length || mins === 0) return null;
  return +(ms.reduce((s, m) => s + m.ro, 0) / mins * 40).toFixed(1);
}

// Moyenne d'un champ avancé sur un ensemble de matchs (même formule que les tableaux)
function avgAdv(ms: MatchStat[], map: Map<string, TeamMatchStat> | undefined, key: keyof PlayerAdvancedStats): number | null {
  if (!ms.length) return null;
  const vals: number[] = [];
  for (const m of ms) {
    const v = calcPlayerAdvanced(m, map?.get(m.matchId ?? ''))[key];
    if (v !== null && v !== undefined) vals.push(v as number);
  }
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
}

function deltaPct(period: number | null, season: number | null): number | null {
  if (period === null || season === null || season === 0) return null;
  return +((period - season) / Math.abs(season) * 100).toFixed(1);
}

function fmt(v: number | null, dec = 1): string {
  if (v === null) return '—';
  return v.toFixed(dec);
}

function zoneColor(pct: number, hib: boolean): string {
  const ok = hib ? pct > 0 : pct < 0;
  if (Math.abs(pct) >= 15) return ok ? '#00E5A0' : '#EF4444';
  if (Math.abs(pct) >= 7)  return ok ? '#4ADE80' : '#F87171';
  return ok ? '#6EE7B7' : '#FCA5A5';
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface MetricRowProps {
  label: string;
  period: number | null;
  season: number | null;
  unit?: string;
  higherIsBetter?: boolean;
  dec?: number;
  sign?: boolean;
  muted?: boolean; // stat secondaire / contexte
}

// Colonnes droites à largeur fixe pour alignement parfait sur toutes les lignes
const COL = { period: 56, arrow: 22, season: 56, evo: 18 } as const;

function MetricRow({ label, period, season, unit = '', higherIsBetter = true, dec = 1, sign = false, muted = false }: MetricRowProps) {
  const pct = deltaPct(period, season);
  const significant = !muted && pct !== null && Math.abs(pct) >= 3;
  const periodColor = muted
    ? '#475569'
    : significant ? zoneColor(pct!, higherIsBetter) : '#94A3B8';
  const evoColor = significant ? zoneColor(pct!, higherIsBetter) : pct !== null && !muted ? '#334155' : 'transparent';

  // % et " UA" s'affichent dans le chiffre, les autres unités vont dans le label
  const unitInNumber = unit === '%' || unit === ' UA';
  const unitSuffix = unitInNumber ? unit : '';
  const periodStr = period !== null ? `${sign && period > 0 ? '+' : ''}${fmt(period, dec)}${unitSuffix}` : '—';
  const seasonStr = season !== null ? `${sign && season > 0 ? '+' : ''}${fmt(season, dec)}${unitSuffix}` : '—';
  const evoStr    = pct === null || muted ? '' : significant ? (pct > 0 ? '↑' : '↓') : '=';
  const unitLabel = unit && !unitInNumber ? unit.trim() : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #1A1F28' }}>
      {/* Label + unité si pertinente */}
      <span style={{ flex: 1, fontSize: '0.7rem', color: muted ? '#3E4756' : '#64748B', lineHeight: 1.2 }}>
        {label}{unitLabel && <span style={{ color: '#334155', fontSize: '0.6rem', marginLeft: 3 }}>{unitLabel}</span>}
      </span>

      {/* Valeur période — largeur fixe, alignée à droite */}
      <span style={{ width: COL.period, flexShrink: 0, textAlign: 'right', fontSize: muted ? '0.78rem' : '0.88rem', fontWeight: 700, color: periodColor, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {periodStr}
      </span>

      {/* Flèche — largeur fixe, centrée */}
      <span style={{ width: COL.arrow, flexShrink: 0, textAlign: 'center', fontSize: '0.65rem', color: '#334155' }}>
        →
      </span>

      {/* Valeur saison — largeur fixe, alignée à gauche, blanche */}
      <span style={{ width: COL.season, flexShrink: 0, textAlign: 'left', fontSize: muted ? '0.78rem' : '0.88rem', fontWeight: 600, color: muted ? '#334155' : '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {seasonStr}
      </span>

      {/* Évolution — largeur fixe, alignée à droite */}
      <span style={{ width: COL.evo, flexShrink: 0, textAlign: 'right', fontSize: '0.62rem', fontWeight: 700, color: evoColor, whiteSpace: 'nowrap' }}>
        {evoStr}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: '#252A35', margin: '5px 0' }} />;
}

function SubLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#334155', fontWeight: 600, margin: '6px 0 3px' }}>
      {children}
    </div>
  );
}

// Hauteurs fixes du contenu de chaque bloc (px) — identiques données/vide
const BH = { perf: 204, scoring: 415, play: 357, def: 174, reb: 233, rpe: 115, well: 263 } as const;

function NoMatch({ message = 'Aucun match sur cette période' }: { message?: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: '0.72rem', color: '#334155', fontStyle: 'italic' }}>{message}</span>
    </div>
  );
}

interface BadgeProps { period: number | null; season: number | null; higherIsBetter?: boolean; }
function TrendBadge({ period, season, higherIsBetter = true }: BadgeProps) {
  const pct = deltaPct(period, season);
  const significant = pct !== null && Math.abs(pct) >= 3;
  const improved = significant && (higherIsBetter ? pct! > 0 : pct! < 0);
  const declined = significant && (higherIsBetter ? pct! < 0 : pct! > 0);
  const bg    = improved ? '#00E5A018' : declined ? '#EF444418' : '#1E2229';
  const color = improved ? '#00E5A0'   : declined ? '#EF4444'   : '#475569';
  const icon  = improved ? '↑'         : declined ? '↓'         : '=';
  return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: bg, border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color, lineHeight: 1 }}>{icon}</span>
    </div>
  );
}

interface BlockProps { title: string; subtitle?: string; children: React.ReactNode; badge?: BadgeProps; contentHeight?: number; }
function Block({ title, subtitle, children, badge, contentHeight }: BlockProps) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '12px 14px', ...(contentHeight !== undefined ? { height: contentHeight, display: 'flex', flexDirection: 'column' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        {badge && <TrendBadge {...badge} />}
        <span style={{ flex: 1, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', fontWeight: 700 }}>{title}</span>
        {subtitle && <span style={{ fontSize: '0.62rem', color: '#334155' }}>{subtitle}</span>}
      </div>
      <div style={contentHeight !== undefined ? { flex: 1, minHeight: 0, overflow: 'hidden' } : {}}>
        {children}
      </div>
    </div>
  );
}

interface Signal { label: string; pct: number; hib: boolean; pVal: number; sVal: number; unit: string; dec: number; }
// "en hausse/baisse" = direction réelle du chiffre (pas de la performance)
function toSentence(s: Signal): string {
  const dir = s.pct > 0 ? 'en hausse' : 'en baisse';
  return `${s.label} ${dir} de ${Math.abs(s.pct)}% · ${s.pVal.toFixed(s.dec)}${s.unit} vs ${s.sVal.toFixed(s.dec)}${s.unit} saison`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PlayerDynStatTab({ rpe, wellness, matchStats, seasonStart, seasonEnd, teamStatsMap }: Props) {
  const dateRange = useDateRange(seasonStart, 21, seasonEnd);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    dateRange.applyPreset(21);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inRange = (iso: string) => iso >= dateRange.from && iso <= dateRange.to;
  const rpeP   = rpe.filter(r => inRange(r.date));
  const wellP  = wellness.filter(w => inRange(w.date));
  const matchP = matchStats.filter(m => inRange(m.date));

  // Bornage à la saison en cours : rpe/wellness (contrairement à matchStats, déjà filtré par
  // saison à la source) sont l'historique complet du joueur toutes saisons confondues — sans ce
  // filtre, la comparaison "vs saison" mélangeait les saisons précédentes/suivantes avec la saison affichée.
  const seasonRpe      = seasonStart ? rpe.filter(r => r.date >= seasonStart && (!seasonEnd || r.date <= seasonEnd)) : rpe;
  const seasonWellness = seasonStart ? wellness.filter(w => w.date >= seasonStart && (!seasonEnd || w.date <= seasonEnd)) : wellness;

  // ── Match : valeurs période & saison ─────────────────────────────────────

  const p = (k: NumKey) => pm(matchP, k);
  const s = (k: NumKey) => pm(matchStats, k);

  const evalP = avg(matchP.filter(m => m.eval !== null).map(m => m.eval!));
  const evalS = avg(matchStats.filter(m => m.eval !== null).map(m => m.eval!));
  const pmP   = avg(matchP.filter(m => m.plusMinus !== null).map(m => m.plusMinus!));
  const pmS   = avg(matchStats.filter(m => m.plusMinus !== null).map(m => m.plusMinus!));

  const rebP = matchP.length     ? +(matchP.reduce((s, m) => s + m.ro + m.rd, 0) / matchP.length).toFixed(1) : null;
  const rebS = matchStats.length ? +(matchStats.reduce((s, m) => s + m.ro + m.rd, 0) / matchStats.length).toFixed(1) : null;

  // Métriques avancées
  const pFg   = fgPct(matchP);         const sFg   = fgPct(matchStats);
  const pFg2  = shotPct(matchP, 'fg2m', 'fg2a'); const sFg2  = shotPct(matchStats, 'fg2m', 'fg2a');
  const pFg3  = shotPct(matchP, 'fg3m', 'fg3a'); const sFg3  = shotPct(matchStats, 'fg3m', 'fg3a');
  const pFt   = shotPct(matchP, 'ftm', 'fta');   const sFt   = shotPct(matchStats, 'ftm', 'fta');
  const pEfg  = eFgPct(matchP);        const sEfg  = eFgPct(matchStats);
  const pTs   = tsPct(matchP);         const sTs   = tsPct(matchStats);
  const pFga  = fgaPerMatch(matchP);   const sFga  = fgaPerMatch(matchStats);
  const pFgm  = fgmPerMatch(matchP);   const sFgm  = fgmPerMatch(matchStats);
  const p3r   = threePtRate(matchP);   const s3r   = threePtRate(matchStats);
  const pFtr  = ftRate(matchP);        const sFtr  = ftRate(matchStats);
  const pFic  = ficPerMatch(matchP);   const sFic  = ficPerMatch(matchStats);
  const pPtMn = ptsPerMin(matchP);     const sPtMn = ptsPerMin(matchStats);
  const pAsto = astToRatio(matchP);    const sAsto = astToRatio(matchStats);
  const pRoSh    = avgAdv(matchP, teamStatsMap, 'orebPct');    const sRoSh    = avgAdv(matchStats, teamStatsMap, 'orebPct');
  const pRdSh    = avgAdv(matchP, teamStatsMap, 'drebPct');    const sRdSh    = avgAdv(matchStats, teamStatsMap, 'drebPct');
  const pTrebPct = avgAdv(matchP, teamStatsMap, 'trebPct');    const sTrebPct = avgAdv(matchStats, teamStatsMap, 'trebPct');
  const pAstR    = avgAdv(matchP, teamStatsMap, 'astPct');     const sAstR    = avgAdv(matchStats, teamStatsMap, 'astPct');
  const pTovR    = avgAdv(matchP, teamStatsMap, 'tovPct');     const sTovR    = avgAdv(matchStats, teamStatsMap, 'tovPct');
  const pPtsG    = avgAdv(matchP, teamStatsMap, 'ptsProd');    const sPtsG    = avgAdv(matchStats, teamStatsMap, 'ptsProd');
  const pOrtg = ortgSimple(matchP);    const sOrtg = ortgSimple(matchStats);
  const pUsg  = usgFromTeam(matchP, teamStatsMap);     const sUsg  = usgFromTeam(matchStats, teamStatsMap);
  const pPoss = indPossPerMatch(matchP); const sPoss = indPossPerMatch(matchStats);

  // Répartition scoring
  const pPt2  = ptsZone(matchP, '2');      const sPt2  = ptsZone(matchStats, '2');
  const pPt3  = ptsZone(matchP, '3');      const sPt3  = ptsZone(matchStats, '3');
  const pPtFt = ptsZone(matchP, 'ft');     const sPtFt = ptsZone(matchStats, 'ft');
  const pSh2  = ptsSharePct(matchP, '2');  const sSh2  = ptsSharePct(matchStats, '2');
  const pSh3  = ptsSharePct(matchP, '3');  const sSh3  = ptsSharePct(matchStats, '3');
  const pShFt = ptsSharePct(matchP, 'ft'); const sShFt = ptsSharePct(matchStats, 'ft');

  // ── RPE ───────────────────────────────────────────────────────────────────

  const pRpe = avg(rpeP.map(r => r.rpe)); const sRpe = avg(seasonRpe.map(r => r.rpe));
  const toLoad = (r: RPEEntry) => r.rpe * (r.actualDuration ?? r.plannedDuration);

  const pDays = dateRange.from && dateRange.to
    ? Math.max(7, (new Date(dateRange.to + 'T00:00:00').getTime() - new Date(dateRange.from + 'T00:00:00').getTime()) / 86400000 + 1) : 21;
  const pWeeks = pDays / 7;
  // rpe est trié par created_at (listPlayerHistory), pas par date : ne pas supposer rpe[0] = plus ancien
  const sRef   = seasonStart ?? [...rpe].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  const sDays  = sRef && dateRange.to
    ? Math.max(7, (new Date(dateRange.to + 'T00:00:00').getTime() - new Date(sRef + 'T00:00:00').getTime()) / 86400000 + 1) : 91;
  const sWeeks = sDays / 7;

  const pLoadWk = rpeP.length ? +(rpeP.reduce((s, r) => s + toLoad(r), 0) / pWeeks).toFixed(0) : null;
  const sLoadWk = seasonRpe.length  ? +(seasonRpe.reduce((s, r) => s + toLoad(r), 0) / sWeeks).toFixed(0)  : null;
  const pSessWk = +(rpeP.length / pWeeks).toFixed(1);
  const sSessWk = seasonRpe.length ? +(seasonRpe.length / sWeeks).toFixed(1) : null;

  // ── Bien-être ─────────────────────────────────────────────────────────────

  const wA = (arr: WellnessEntry[], key: 'score' | 'sleep' | 'fatigue' | 'mood' | 'motivation' | 'stress' | 'soreness') =>
    arr.length ? +(arr.reduce((s, w) => s + n(w[key]), 0) / arr.length).toFixed(2) : null;

  const pSco = wA(wellP, 'score');       const sSco = wA(seasonWellness, 'score');
  const pSlp = wA(wellP, 'sleep');       const sSlp = wA(seasonWellness, 'sleep');
  const pFat = wA(wellP, 'fatigue');     const sFat = wA(seasonWellness, 'fatigue');
  const pMod = wA(wellP, 'mood');        const sMod = wA(seasonWellness, 'mood');
  const pMot = wA(wellP, 'motivation');  const sMot = wA(seasonWellness, 'motivation');
  const pStr = wA(wellP, 'stress');      const sStr = wA(seasonWellness, 'stress');
  const pSor = wA(wellP, 'soreness');    const sSor = wA(seasonWellness, 'soreness');

  // ── Résumé analytique ─────────────────────────────────────────────────────

  const signals: Signal[] = [];
  function add(label: string, pv: number | null, sv: number | null, unit: string, dec = 1, hib = true, thr = 5) {
    const pct = deltaPct(pv, sv);
    if (pv === null || sv === null || pct === null || Math.abs(pct) < thr) return;
    signals.push({ label, pct, hib, pVal: pv, sVal: sv, unit, dec });
  }

  add('Points',             p('pts'),  s('pts'),  '');
  add('Temps de jeu',       p('min'),  s('min'),  'min');
  add('Pts / minute',       pPtMn,     sPtMn,     '', 2);
  add('Évaluation',         evalP,     evalS,     '');
  add('FIC',                pFic,      sFic,      '');
  add('+/-',                pmP,       pmS,       '', 1, true, 10);
  add('Adresse globale',    pFg,       sFg,       '%');
  add('eFG%',               pEfg,      sEfg,      '%');
  add('TS%',                pTs,       sTs,       '%');
  add('Adresse 2pts',       pFg2,      sFg2,      '%');
  add('Adresse 3pts',       pFg3,      sFg3,      '%');
  add('Adresse LF',         pFt,       sFt,       '%');
  add('Part tirs à 3pts',   p3r,       s3r,       '%');
  add('Accès aux LF',       pFtr,      sFtr,      '%');
  add('Total rebonds',      rebP,      rebS,      '');
  add('Reb. offensifs',     p('ro'),   s('ro'),   '');
  add('Passes décisives',   p('pd'),   s('pd'),   '');
  add('Ballons perdus',     p('bp'),   s('bp'),   '', 1, false);
  add('Ratio PD/BP',        pAsto,     sAsto,     '', 2);
  add('Contres',            p('ct'),   s('ct'),   '');
  add('Interceptions',      p('intercepts'), s('intercepts'), '');
  add('RPE moyen',          pRpe,      sRpe,      '', 1, false);
  add('Charge hebdo.',      pLoadWk !== null ? +pLoadWk : null, sLoadWk !== null ? +sLoadWk : null, ' UA', 0, false, 10);
  add('Bien-être',          pSco,      sSco,      '');
  add('Sommeil',            pSlp,      sSlp,      '');
  add('Fatigue',            pFat,      sFat,      '', 1, false);
  add('Stress',             pStr,      sStr,      '', 1, false);
  add('Motivation',         pMot,      sMot,      '');

  signals.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const improved = signals.filter(s => s.hib ? s.pct > 0 : s.pct < 0);
  const declined = signals.filter(s => s.hib ? s.pct < 0 : s.pct > 0);

  const noData   = matchP.length === 0 && rpeP.length === 0 && wellP.length === 0;
  const mSub     = matchP.length ? `${matchP.length} match${matchP.length > 1 ? 's' : ''}` : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, seasonStart, seasonEnd)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
        style={{ marginBottom: 0 }}
      />

      {noData ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#475569', fontSize: '0.85rem' }}>
          Aucune donnée sur cette période.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 12 }}>

            {/* ── Col 1 : Performance + Charge + Bien-être ────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <Block title="Performance globale" subtitle={mSub} badge={{ period: evalP, season: evalS }} contentHeight={BH.perf}>
                {matchP.length === 0 ? <NoMatch /> : (
                  <>
                    <MetricRow label="Temps de jeu"    period={p('min')} season={s('min')} />
                    <MetricRow label="Points"           period={p('pts')} season={s('pts')} />
                    <MetricRow label="Évaluation"       period={evalP}    season={evalS} />
                    <MetricRow label="+/-"              period={pmP}      season={pmS}      sign />
                    <MetricRow label="Offensive Rating" period={pOrtg}    season={sOrtg}    dec={1} />
                  </>
                )}
              </Block>

              <Block title="Charge physique" subtitle={rpeP.length ? `${rpeP.length} séance${rpeP.length > 1 ? 's' : ''}` : undefined} badge={{ period: pLoadWk !== null ? +pLoadWk : null, season: sLoadWk !== null ? +sLoadWk : null, higherIsBetter: false }} contentHeight={BH.rpe}>
                {rpeP.length === 0 ? <NoMatch message="Aucune séance sur cette période" /> : (
                  <>
                    <MetricRow label="RPE moyen"    period={pRpe}     season={sRpe}     higherIsBetter={false} />
                    <MetricRow label="Charge hebdo." period={pLoadWk !== null ? +pLoadWk : null} season={sLoadWk !== null ? +sLoadWk : null} unit=" UA" dec={0} higherIsBetter={false} />
                  </>
                )}
              </Block>

              <div style={{ marginTop: 'auto' }}>
              <Block title="Bien-être" subtitle={wellP.length ? `${wellP.length} entrée${wellP.length > 1 ? 's' : ''}` : undefined} badge={{ period: pSco, season: sSco }} contentHeight={BH.well}>
                {wellP.length === 0 ? <NoMatch message="Aucune entrée sur cette période" /> : (
                  <>
                    <MetricRow label="Score global" period={pSco} season={sSco} />
                    <MetricRow label="Sommeil"       period={pSlp} season={sSlp} />
                    <MetricRow label="Fatigue"       period={pFat} season={sFat} higherIsBetter={false} />
                    <MetricRow label="Humeur"        period={pMod} season={sMod} />
                    <MetricRow label="Motivation"    period={pMot} season={sMot} />
                    <MetricRow label="Stress"        period={pStr} season={sStr} higherIsBetter={false} />
                    <MetricRow label="Douleurs"      period={pSor} season={sSor} higherIsBetter={false} />
                  </>
                )}
              </Block>
              </div>
            </div>

            {/* ── Col 2 : Scoring + Défense ────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <Block title="Scoring" badge={{ period: pEfg, season: sEfg }} contentHeight={BH.scoring}>
                {matchP.length === 0 ? <NoMatch /> : (
                  <>
                    <MetricRow label="eFG%"    period={pEfg}      season={sEfg}      unit="%" />
                    <SubLabel>2 pts</SubLabel>
                    <MetricRow label="Tentés"  period={p('fg2a')} season={s('fg2a')} dec={1} />
                    <MetricRow label="Réussis" period={p('fg2m')} season={s('fg2m')} dec={1} />
                    <MetricRow label="%"       period={pFg2}      season={sFg2}      unit="%" />
                    <SubLabel>3 pts</SubLabel>
                    <MetricRow label="Tentés"  period={p('fg3a')} season={s('fg3a')} dec={1} />
                    <MetricRow label="Réussis" period={p('fg3m')} season={s('fg3m')} dec={1} />
                    <MetricRow label="%"       period={pFg3}      season={sFg3}      unit="%" />
                    <SubLabel>Lancers francs</SubLabel>
                    <MetricRow label="Tentés"  period={p('fta')}  season={s('fta')}  dec={1} />
                    <MetricRow label="Réussis" period={p('ftm')}  season={s('ftm')}  dec={1} />
                    <MetricRow label="%"       period={pFt}       season={sFt}       unit="%" />
                  </>
                )}
              </Block>

              <div style={{ marginTop: 'auto' }}>
              <Block title="Défense" badge={{ period: p('intercepts'), season: s('intercepts') }} contentHeight={BH.def}>
                {matchP.length === 0 ? <NoMatch /> : (
                  <>
                    <MetricRow label="Contres"             period={p('ct')}         season={s('ct')} />
                    <MetricRow label="Interceptions"       period={p('intercepts')} season={s('intercepts')} />
                    <MetricRow label="Reb. défensifs"      period={p('rd')}         season={s('rd')}         dec={1} />
                    <MetricRow label="Fautes personnelles" period={p('fpr')}        season={s('fpr')}        higherIsBetter={false} />
                  </>
                )}
              </Block>
              </div>
            </div>

            {/* ── Col 3 : Playmaking + Rebonds ─────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              <Block title="Playmaking" badge={{ period: pPtsG, season: sPtsG }} contentHeight={BH.play}>
                {matchP.length === 0 ? <NoMatch /> : (
                  <>
                    <MetricRow label="Possessions"       period={pPoss}    season={sPoss}    dec={1} />
                    <MetricRow label="% Usage"           period={pUsg}     season={sUsg}     unit="%" />
                    <MetricRow label="Points générés"    period={pPtsG}    season={sPtsG}    dec={1} />
                    <MetricRow label="Points"            period={p('pts')} season={s('pts')} dec={1} />
                    <MetricRow label="Passes décisives"  period={p('pd')}  season={s('pd')}  dec={1} />
                    <MetricRow label="% PD"              period={pAstR}    season={sAstR}    unit="%" />
                    <MetricRow label="Ballons perdus"    period={p('bp')}  season={s('bp')}  dec={1} higherIsBetter={false} />
                    <MetricRow label="% BP"              period={pTovR}    season={sTovR}    unit="%" higherIsBetter={false} />
                    <MetricRow label="Fautes provoquées" period={p('fte')} season={s('fte')} dec={1} />
                    <MetricRow label="FT Rate"           period={pFtr}     season={sFtr}     unit="%" />
                  </>
                )}
              </Block>

              <div style={{ marginTop: 'auto' }}>
              <Block title="Rebonds" badge={{ period: rebP, season: rebS }} contentHeight={BH.reb}>
                {matchP.length === 0 ? <NoMatch /> : (
                  <>
                    <MetricRow label="Totaux"      period={rebP}     season={rebS}     dec={1} />
                    <MetricRow label="% Totaux"    period={pTrebPct} season={sTrebPct} unit="%" />
                    <MetricRow label="Défensifs"   period={p('rd')}  season={s('rd')}  dec={1} />
                    <MetricRow label="% défensifs" period={pRdSh}    season={sRdSh}    unit="%" />
                    <MetricRow label="Offensifs"   period={p('ro')}  season={s('ro')}  dec={1} />
                    <MetricRow label="% offensifs" period={pRoSh}    season={sRoSh}    unit="%" />
                  </>
                )}
              </Block>
              </div>
            </div>
          </div>

          {/* ── Résumé analytique ──────────────────────────────────────── */}
          {signals.length > 0 && (
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#475569', fontWeight: 700, marginBottom: 14 }}>
                Résumé analytique
              </div>

              {/* ── Mobile : 1 colonne ── */}
              <div className="flex flex-col gap-5 lg:hidden">
                {improved.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.63rem', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↑ En progression</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {improved.map((sig, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                          <span style={{ color: '#00E5A0', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↑</span>
                          <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {declined.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.63rem', color: '#EF4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↓ À surveiller</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {declined.map((sig, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                          <span style={{ color: '#EF4444', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↓</span>
                          <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Desktop : 4 colonnes (2 ↑ + 2 ↓) ── */}
              <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px 20px' }}>
                {([0, 1] as const).map(colIdx => {
                  const half = Math.ceil(improved.length / 2);
                  const items = colIdx === 0 ? improved.slice(0, half) : improved.slice(half);
                  return (
                    <div key={`imp-${colIdx}`}>
                      {colIdx === 0 && improved.length > 0 && (
                        <div style={{ fontSize: '0.63rem', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↑ En progression</div>
                      )}
                      {colIdx === 1 && improved.length > 0 && (
                        <div style={{ fontSize: '0.63rem', color: 'transparent', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>·</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {items.map((sig, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                            <span style={{ color: '#00E5A0', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↑</span>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {([0, 1] as const).map(colIdx => {
                  const half = Math.ceil(declined.length / 2);
                  const items = colIdx === 0 ? declined.slice(0, half) : declined.slice(half);
                  return (
                    <div key={`dec-${colIdx}`}>
                      {colIdx === 0 && declined.length > 0 && (
                        <div style={{ fontSize: '0.63rem', color: '#EF4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>↓ À surveiller</div>
                      )}
                      {colIdx === 1 && declined.length > 0 && (
                        <div style={{ fontSize: '0.63rem', color: 'transparent', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>·</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {items.map((sig, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                            <span style={{ color: '#EF4444', fontSize: '0.72rem', flexShrink: 0, marginTop: 1 }}>↓</span>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.45 }}>{toSentence(sig)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </>
      )}
    </div>
  );
}
