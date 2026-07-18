/**
 * Moteur d'analyse de la performance (croisement multi-domaines).
 *
 * Généralise la fusion hebdomadaire que faisait PlayerDynamiqueTab (charge +
 * bien-être + TSB + éval) : un registre d'indicateurs issus des 5 domaines
 * (match, charge, bien-être, médical, assiduité), tous projetés sur un axe de
 * dates commun, corrélables deux à deux et scannés par des règles de risque.
 *
 * Réutilise les briques existantes : computeAcwr / computePmcSeries / tsbZone
 * (utils/rpe), correlatePairs (utils/correlation), getWeekTier / mondayIso
 * (utils/weeklyLoad), WELLNESS_DIMENSIONS (utils/wellness).
 *
 * Conventions de croisement :
 * - paire match × quotidien → ancrage sur match : chaque match est une
 *   observation, l'autre indicateur est mesuré juste avant (fenêtre `anchor`,
 *   décalée de `lagDays`) — c'est l'approche standard en sciences du sport,
 *   qui règle l'asymétrie de densité (matchs hebdo vs saisies quotidiennes) ;
 * - paire quotidien × quotidien → appariement jour à jour (A décalé de `lagDays`) ;
 * - blessures : jamais de Pearson (série 0/1 quasi vide → chiffres trompeurs),
 *   uniquement les règles de `detectRiskAlerts` et l'affichage en surimpression.
 */
import type {
  MatchStat, MedicalRecord, Player, RPEEntry, TeamMatchStat, TrainingAttendance, WellnessEntry,
} from './types';
import { VARIABLES } from './pca';
import { calcPlayerAdvanced, type PlayerAdvancedStats } from './playerAdvanced';
import { computeAcwr, acwrZone, computePmcSeries, tsbZone, rpeColor, type LoadEntry } from '../utils/rpe';
import { getWeekTier, mondayIso } from '../utils/weeklyLoad';
import { WELLNESS_DIMENSIONS, wellnessScoreColor, aggregateTeamWellnessDaily } from '../utils/wellness';
import { correlatePairs, MIN_CORRELATION_PAIRS, type CorrelationPair, type CorrelationResult } from '../utils/correlation';
import { playerNameFull } from '../utils/playerName';
import { fmt1 } from '../utils/format';

// ── Données d'entrée ──────────────────────────────────────────────────────────

export interface PlayerCrossData {
  player: Player;
  matchStats: MatchStat[];
  rpe: RPEEntry[];
  /** Historique RPE TOUTES saisons confondues — requis par ACWR/TSB (28j de charge chronique
   * fiable même en tout début de saison), contrairement à `rpe` qui est borné à la saison affichée. */
  allTimeRpe: LoadEntry[];
  wellness: WellnessEntry[];
  medical: MedicalRecord[];
  /** Présence par séance (date de la séance + statut du joueur) */
  attendance: { date: string; status: TrainingAttendance['status'] }[];
  /** Stats collectives par matchId — requises pour les stats avancées individuelles (usage%, %PD…) */
  teamStatsByMatchId?: Map<string, TeamMatchStat>;
}

export interface TeamCrossData {
  players: PlayerCrossData[];
  teamMatchStats: TeamMatchStat[];
}

/** Périmètre d'une analyse : un joueur OU une équipe */
export interface CrossScope {
  player?: PlayerCrossData;
  team?: TeamCrossData;
}

// ── Helpers dates ─────────────────────────────────────────────────────────────

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Jours YYYY-MM-DD entre from et to inclus (heure locale) */
export function eachDay(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const days: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  while (true) {
    const iso = cur.toLocaleDateString('sv');
    if (iso > to) break;
    days.push(iso);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('sv');
}

const fmtDayMonth = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

// ── Registre d'indicateurs ────────────────────────────────────────────────────

export type IndicatorDomain = 'match' | 'charge' | 'wellness' | 'presence';

export const DOMAIN_LABELS: Record<IndicatorDomain, string> = {
  match:    'Performance match',
  charge:   'Charge',
  wellness: 'Bien-être',
  presence: 'Assiduité',
};

export interface SeriesPoint { date: string; value: number }

export interface IndicatorDef {
  key: string;
  /** Libellé complet (menus déroulants) */
  label: string;
  /** Libellé court (axes, tooltips, colonnes) */
  shortLabel: string;
  domain: IndicatorDomain;
  /** Sous-groupe d'affichage dans le sélecteur (défaut : libellé du domaine) */
  group?: string;
  unit: string;
  color: string;
  /** Rendu : barres (volumes), ligne (états continus), points (valeurs ponctuelles type match) */
  chart: 'bar' | 'line' | 'dots';
  /** Domaine Y imposé (ex. échelles /10) */
  yDomain?: [number, number];
  /** Graduations Y explicites (ex. [0, 1] pour un indicateur binaire) — sinon Recharts génère les siennes */
  yTicks?: number[];
  /** Fenêtre pré-match (jours) et agrégat pour la corrélation ancrée sur match */
  anchor: { window: number; agg: 'mean' | 'sum' | 'last' };
  /** Agrégat lors du regroupement par semaine sur le graphique */
  weeklyAgg: 'mean' | 'sum';
  /** Couleur d'une valeur (zones de risque) — tableau comparatif */
  valueColor?: (v: number) => string;
  /** Libellé de zone d'une valeur (ex. "Frais", "Chargé") — toujours affiché à côté de la valeur quand présent */
  valueLabel?: (v: number) => string;
  /** Série individuelle (absent = indisponible en vue joueur) */
  playerSeries?: (d: PlayerCrossData, from: string, to: string) => SeriesPoint[];
  /** Série équipe dédiée (stats collectives) ; sinon moyenne des séries joueurs */
  teamSeries?: (d: TeamCrossData, from: string, to: string) => SeriesPoint[];
}

const sessionLoad = (e: RPEEntry) => e.rpe * (e.actualDuration ?? e.plannedDuration);

/** Moyenne par date des valeurs non nulles extraites des matchs */
function matchSeries<T extends { date: string }>(rows: T[], from: string, to: string, get: (m: T) => number | null | undefined): SeriesPoint[] {
  const byDate = new Map<string, number[]>();
  rows.forEach(m => {
    if (m.date < from || m.date > to) return;
    const v = get(m);
    if (v === null || v === undefined || Number.isNaN(v)) return;
    if (!byDate.has(m.date)) byDate.set(m.date, []);
    byDate.get(m.date)!.push(Number(v));
  });
  return [...byDate.entries()]
    .map(([date, vs]) => ({ date, value: round1(vs.reduce((a, b) => a + b, 0) / vs.length) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dailyLoadSeries(d: PlayerCrossData, from: string, to: string): SeriesPoint[] {
  const byDay = new Map<string, number>();
  d.rpe.forEach(e => {
    if (e.date < from || e.date > to) return;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + sessionLoad(e));
  });
  return [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

// ACWR/TSB ont besoin de tout l'historique (28j de charge chronique) pour être fiables en
// tout début de saison — contrairement aux autres séries, elles lisent `allTimeRpe` et non
// `rpe` (borné à la saison affichée), même convention que RPEPage/PlayerLoadPanel/MedicalPage.
function acwrSeries(d: PlayerCrossData, from: string, to: string): SeriesPoint[] {
  if (!d.allTimeRpe.length) return [];
  return eachDay(from, to)
    .map(date => ({ date, value: computeAcwr(d.allTimeRpe, date) }))
    .filter((p): p is SeriesPoint => p.value !== null)
    .map(p => ({ date: p.date, value: round2(p.value) }));
}

function tsbSeries(d: PlayerCrossData, from: string, to: string): SeriesPoint[] {
  return computePmcSeries(d.allTimeRpe, to)
    .filter(p => p.date >= from && p.date <= to)
    .map(p => ({ date: p.date, value: p.tsb }));
}

function wellnessSeries(d: PlayerCrossData, from: string, to: string, get: (w: WellnessEntry) => number): SeriesPoint[] {
  return matchSeries(d.wellness, from, to, get);
}

/**
 * Série quotidienne équipe pour un indicateur bien-être — agrège d'abord par jour via
 * `aggregateTeamWellnessDaily` (même fonction que WellnessPage/Dashboard/PerformanceCollective),
 * plutôt que de moyenner les séries individuelles entre elles (pondération différente en cas
 * de doubles saisies le même jour).
 */
function teamWellnessSeries(players: PlayerCrossData[], from: string, to: string, get: (e: WellnessEntry) => number): SeriesPoint[] {
  const allEntries = players.flatMap(p => p.wellness).filter(w => w.date >= from && w.date <= to);
  return aggregateTeamWellnessDaily(allEntries)
    .map(e => ({ date: e.date, value: round1(get(e)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** % de présence aux séances sur 28 jours glissants, jour par jour */
function presenceSeries(d: PlayerCrossData, from: string, to: string): SeriesPoint[] {
  if (!d.attendance.length) return [];
  const sorted = [...d.attendance].sort((a, b) => a.date.localeCompare(b.date));
  const points: SeriesPoint[] = [];
  for (const date of eachDay(from, to)) {
    const winStart = shiftDate(date, -27);
    const win = sorted.filter(a => a.date >= winStart && a.date <= date);
    if (!win.length) continue;
    const present = win.filter(a => a.status === 'present' || a.status === 'late').length;
    points.push({ date, value: Math.round((present / win.length) * 100) });
  }
  return points;
}

const presenceColor = (v: number) => v >= 85 ? '#00E5A0' : v >= 70 ? '#F59E0B' : '#EF4444';

/** Série de stats avancées individuelles — nécessite la stat collective du même match pour usage%/%PD/%REB/ptsProd */
function advSeries(d: PlayerCrossData, from: string, to: string, pick: (a: PlayerAdvancedStats) => number | null): SeriesPoint[] {
  return matchSeries(d.matchStats, from, to, m =>
    pick(calcPlayerAdvanced(m, d.teamStatsByMatchId?.get(m.matchId ?? '') ?? null)));
}

/** Indicateur de match individuel (valeur ponctuelle aux dates de match) */
function playerMatchStat(
  key: string, label: string, shortLabel: string, color: string, unit: string,
  get: (m: MatchStat) => number | null,
  group = 'Match — Statistiques brutes',
): IndicatorDef {
  return {
    key, label, shortLabel, domain: 'match', group, unit, color,
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    playerSeries: (d, f, t) => matchSeries(d.matchStats, f, t, get),
  };
}

/** Indicateur de match avancé individuel (calcPlayerAdvanced) */
function playerAdvStat(
  key: string, label: string, shortLabel: string, color: string,
  pick: (a: PlayerAdvancedStats) => number | null, unit = '%',
): IndicatorDef {
  return {
    key, label, shortLabel, domain: 'match', group: 'Match — Statistiques avancées', unit, color,
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    playerSeries: (d, f, t) => advSeries(d, f, t, pick),
  };
}

const TEAM_COLORS = ['#60A5FA', '#00E5A0', '#F59E0B', '#EC4899', '#8B5CF6', '#38BDF8', '#F97316', '#EAB308', '#2DD4BF', '#A78BFA'];

const INDICATORS: IndicatorDef[] = [
  // ── Match — Contexte (catégoriel, encodé en 0/1 pour être corrélable) ──
  {
    ...playerMatchStat('starter', 'Titulaire', 'Titulaire', '#60A5FA', '', m => m.starter ? 1 : 0, 'Match — Contexte'),
    yDomain: [-0.2, 1.2], yTicks: [0, 1],
    valueColor: v => v >= 0.5 ? '#00E5A0' : '#94A3B8',
    valueLabel: v => v >= 0.999 ? 'Titulaire' : v <= 0.001 ? 'Remplaçant' : `${Math.round(v * 100)}% des matchs`,
  },
  {
    ...playerMatchStat('homeAway', 'Domicile / extérieur', 'Domicile', '#38BDF8', '', m => m.homeAway === 'home' ? 1 : 0, 'Match — Contexte'),
    yDomain: [-0.2, 1.2], yTicks: [0, 1],
    valueColor: v => v >= 0.5 ? '#00E5A0' : '#94A3B8',
    valueLabel: v => v >= 0.999 ? 'Domicile' : v <= 0.001 ? 'Extérieur' : `${Math.round(v * 100)}% à domicile`,
  },
  {
    ...playerMatchStat('result', 'Résultat du match', 'Résultat', '#00E5A0', '', m => m.result === 'win' ? 1 : 0, 'Match — Contexte'),
    yDomain: [-0.2, 1.2], yTicks: [0, 1],
    valueColor: v => v >= 0.5 ? '#00E5A0' : '#EF4444',
    valueLabel: v => v >= 0.999 ? 'Victoire' : v <= 0.001 ? 'Défaite' : `${Math.round(v * 100)}% de victoires`,
  },
  // ── Match — Statistiques brutes (joueur ; en vue équipe = moyenne des joueurs) ──
  playerMatchStat('eval',      'Évaluation',       'Éval', '#60A5FA', '',    m => m.eval),
  playerMatchStat('plusMinus', '+/-',              '+/-',  '#3B82F6', '',    m => m.plusMinus),
  playerMatchStat('min',       'Minutes',          'Min',  '#94A3B8', 'min', m => m.min),
  playerMatchStat('pts',       'Points marqués',   'Pts',  '#38BDF8', 'pts', m => m.pts),
  playerMatchStat('fg2Pct',     'Réussite 2 pts (%)',           '2%',  '#00E5A0', '%', m => m.fg2a > 0 ? m.fg2m / m.fg2a * 100 : null),
  playerMatchStat('fg3Pct',     'Réussite 3 pts (%)',           '3%',  '#2DD4BF', '%', m => m.fg3a > 0 ? m.fg3m / m.fg3a * 100 : null),
  playerMatchStat('ftPct',      'Réussite lancers francs (%)',  'LF%', '#EAB308', '%', m => m.fta  > 0 ? m.ftm  / m.fta  * 100 : null),
  playerMatchStat('ro',         'Rebonds offensifs',            'RO',  '#F97316', '',  m => m.ro),
  playerMatchStat('rd',         'Rebonds défensifs',            'RD',  '#F59E0B', '',  m => m.rd),
  playerMatchStat('reb',        'Rebonds totaux',               'Reb', '#FB923C', '',  m => m.ro + m.rd),
  playerMatchStat('pd',         'Passes décisives',             'Pd',  '#8B5CF6', '',  m => m.pd),
  playerMatchStat('ct',         'Contres',                      'Ct',  '#A78BFA', '',  m => m.ct),
  playerMatchStat('intercepts', 'Interceptions',                'Int', '#EC4899', '',  m => m.intercepts),
  playerMatchStat('bp',         'Ballons perdus',               'Bp',  '#EF4444', '',  m => m.bp),
  playerMatchStat('fte',        'Fautes commises',              'Fte', '#F87171', '',  m => m.fte),
  playerMatchStat('fpr',        'Fautes provoquées',            'Fp',  '#4ADE80', '',  m => m.fpr),
  // ── Match — Statistiques avancées ──
  playerAdvStat('adv_offRating', 'ORtg individuel (pts × 100 / possessions utilisées)', 'ORtg', '#00E5A0', a => a.offRating, ''),
  playerAdvStat('adv_efgPct',   'eFG% individuel',                  'eFG%',   '#EAB308', a => a.efgPct),
  playerAdvStat('adv_ftRate',   'FT Rate individuel (LF tentés / tirs)', 'FTr', '#2DD4BF', a => a.ftRate, ''),
  playerAdvStat('adv_usagePct', '% Usage (possessions utilisées)',  'Usage%', '#60A5FA', a => a.usagePct),
  playerAdvStat('adv_astPct',   '% Passes décisives (paniers créés)', '%PD',  '#8B5CF6', a => a.astPct),
  playerAdvStat('adv_tovPct',   '% Ballons perdus par possession',  '%BP',    '#EF4444', a => a.tovPct),
  playerAdvStat('adv_trebPct',  '% Rebonds totaux captés',          '%TREB',  '#FB923C', a => a.trebPct),
  playerAdvStat('adv_orebPct',  '% Rebonds offensifs captés',       '%OREB',  '#F97316', a => a.orebPct),
  playerAdvStat('adv_drebPct',  '% Rebonds défensifs captés',       '%DREB',  '#F59E0B', a => a.drebPct),
  playerAdvStat('adv_ptsProd',  'Points générés (pts + passes converties)', 'PtsGén', '#38BDF8', a => a.ptsProd, 'pts'),
  // ── Match — Contexte équipe (catégoriel, encodé en 0/1 — même logique que côté joueur) ──
  {
    key: 'team_homeAway', label: 'Domicile / extérieur', shortLabel: 'Domicile', domain: 'match', group: 'Match — Contexte', unit: '', color: '#38BDF8',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    yDomain: [-0.2, 1.2], yTicks: [0, 1],
    valueColor: v => v >= 0.5 ? '#00E5A0' : '#94A3B8',
    valueLabel: v => v >= 0.999 ? 'Domicile' : v <= 0.001 ? 'Extérieur' : `${Math.round(v * 100)}% à domicile`,
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.homeAway === 'home' ? 1 : 0),
  },
  {
    key: 'team_result', label: 'Résultat du match', shortLabel: 'Résultat', domain: 'match', group: 'Match — Contexte', unit: '', color: '#00E5A0',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    yDomain: [-0.2, 1.2], yTicks: [0, 1],
    valueColor: v => v >= 0.5 ? '#00E5A0' : '#EF4444',
    valueLabel: v => v >= 0.999 ? 'Victoire' : v <= 0.001 ? 'Défaite' : `${Math.round(v * 100)}% de victoires`,
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.result === 'win' ? 1 : 0),
  },
  // ── Match — équipe (mêmes variables que les facteurs de victoire de pca.ts) ──
  {
    key: 'team_scorediff', label: 'Écart au score', shortLabel: 'Écart', domain: 'match', group: 'Match — équipe', unit: 'pts', color: '#A78BFA',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.scoreUs - m.scoreThem),
  },
  {
    key: 'team_ptsFor', label: 'Points marqués (équipe)', shortLabel: 'Pts+', domain: 'match', group: 'Match — équipe', unit: 'pts', color: '#00E5A0',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.scoreUs),
  },
  {
    key: 'team_ptsAgainst', label: 'Points encaissés', shortLabel: 'Pts−', domain: 'match', group: 'Match — équipe', unit: 'pts', color: '#EF4444',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.scoreThem),
  },
  {
    key: 'team_possessions', label: 'Possessions (rythme)', shortLabel: 'Poss', domain: 'match', group: 'Match — équipe', unit: '', color: '#2DD4BF',
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, m => m.possessions),
  },
  ...VARIABLES.map((v, i): IndicatorDef => ({
    key: `team_${v.key}`,
    label: v.longLabel,
    shortLabel: v.label,
    domain: 'match', group: 'Match — équipe',
    unit: v.key.includes('Pct') ? '%' : '',
    color: TEAM_COLORS[i % TEAM_COLORS.length],
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    teamSeries: (d, f, t) => matchSeries(d.teamMatchStats, f, t, v.get),
  })),
  // ── Charge ──
  {
    key: 'loadUa', label: 'Charge de séance (RPE × durée)', shortLabel: 'Charge', domain: 'charge', unit: 'UA', color: '#00E5A0',
    chart: 'bar', anchor: { window: 7, agg: 'sum' }, weeklyAgg: 'sum',
    playerSeries: dailyLoadSeries,
  },
  {
    key: 'rpe', label: 'RPE séance', shortLabel: 'RPE', domain: 'charge', unit: '/10', color: '#F97316',
    chart: 'dots', yDomain: [0, 10], anchor: { window: 7, agg: 'mean' }, weeklyAgg: 'mean',
    valueColor: rpeColor,
    playerSeries: (d, f, t) => matchSeries(d.rpe, f, t, e => e.rpe),
  },
  {
    key: 'acwr', label: 'Charge récente vs habituelle', shortLabel: 'Charge récente', domain: 'charge', unit: '', color: '#F59E0B',
    chart: 'line', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    valueColor: v => acwrZone(v)?.color ?? '#F1F5F9',
    valueLabel: v => acwrZone(v)?.label ?? '',
    playerSeries: acwrSeries,
  },
  {
    key: 'tsb', label: 'Fraîcheur', shortLabel: 'Fraîcheur', domain: 'charge', unit: '', color: '#8B5CF6',
    chart: 'line', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    valueColor: v => tsbZone(v).color,
    valueLabel: v => tsbZone(v).label,
    playerSeries: tsbSeries,
  },
  // ── Bien-être (axes redressés : plus haut = mieux, y compris fatigue/stress/courbatures) ──
  {
    key: 'well_score', label: 'Score bien-être global', shortLabel: 'Bien-être', domain: 'wellness', unit: '/10', color: '#EC4899',
    chart: 'line', yDomain: [0, 10], anchor: { window: 3, agg: 'mean' }, weeklyAgg: 'mean',
    valueColor: wellnessScoreColor,
    playerSeries: (d, f, t) => wellnessSeries(d, f, t, w => Number(w.score)),
    teamSeries: (team, f, t) => teamWellnessSeries(team.players, f, t, e => e.score),
  },
  ...WELLNESS_DIMENSIONS.map((dim): IndicatorDef => ({
    key: `well_${dim.key}`,
    label: dim.inverted ? `${dim.label} (redressé : 10 = au mieux)` : dim.label,
    shortLabel: dim.shortLabel,
    domain: 'wellness', unit: '/10', color: dim.color,
    chart: 'line', yDomain: [0, 10], anchor: { window: 3, agg: 'mean' }, weeklyAgg: 'mean',
    valueColor: wellnessScoreColor,
    playerSeries: (d, f, t) => wellnessSeries(d, f, t, w => {
      const raw = Number(w[dim.key]);
      return dim.inverted ? 11 - raw : raw;
    }),
    teamSeries: (team, f, t) => teamWellnessSeries(team.players, f, t, e => {
      const raw = Number(e[dim.key]);
      return dim.inverted ? 11 - raw : raw;
    }),
  })),
  // ── Assiduité ──
  {
    key: 'presence', label: 'Présence aux séances (28 j glissants)', shortLabel: 'Présence', domain: 'presence', unit: '%', color: '#2DD4BF',
    chart: 'line', yDomain: [0, 100], anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    valueColor: presenceColor,
    playerSeries: presenceSeries,
  },
];

export const teamIndicators   = () => INDICATORS.filter(i => i.teamSeries || i.playerSeries);
export const indicatorByKey   = (key: string) => INDICATORS.find(i => i.key === key);

/** Attributs propres à UN joueur (stats de match individuelles, charge, bien-être, assiduité — sa valeur à lui) */
export const playerAttributeIndicators = () => INDICATORS.filter(i => i.playerSeries);
/**
 * Attributs de L'ÉQUIPE : stats collectives dédiées (groupe « Match — équipe ») + moyenne d'équipe
 * pour les indicateurs non-match (charge/bien-être/assiduité). Les stats de match individuelles
 * (éval, +/-…) sont exclues : leur équivalent collectif existe déjà comme attribut équipe dédié.
 */
export const teamAttributeIndicators = () => INDICATORS.filter(i => i.teamSeries || (i.domain !== 'match' && i.playerSeries));

// ── Extraction de séries ──────────────────────────────────────────────────────

/** Moyenne, par date, des séries individuelles des joueurs disposant d'une valeur ce jour-là */
function aggregatePlayerSeries(players: PlayerCrossData[], def: IndicatorDef, from: string, to: string): SeriesPoint[] {
  const byDate = new Map<string, number[]>();
  players.forEach(p => {
    def.playerSeries!(p, from, to).forEach(pt => {
      if (!byDate.has(pt.date)) byDate.set(pt.date, []);
      byDate.get(pt.date)!.push(pt.value);
    });
  });
  return [...byDate.entries()]
    .map(([date, vs]) => ({ date, value: round1(vs.reduce((a, b) => a + b, 0) / vs.length) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Série d'un indicateur sur le périmètre donné (joueur ou équipe) */
export function getSeries(def: IndicatorDef, scope: CrossScope, from: string, to: string): SeriesPoint[] {
  if (scope.player && def.playerSeries) return def.playerSeries(scope.player, from, to);
  if (scope.team) {
    if (def.teamSeries) return def.teamSeries(scope.team, from, to);
    if (def.playerSeries) return aggregatePlayerSeries(scope.team.players, def, from, to);
  }
  return [];
}

/**
 * Sujet d'un côté de la corrélation : UN joueur précis, ou l'équipe (moyenne/collectif).
 * Contrairement à `CrossScope` (qui autorise les deux à la fois, avec priorité implicite au
 * joueur), un `Subject` est sans ambiguïté — nécessaire pour croiser deux sujets différents
 * (deux joueurs, ou un joueur et l'équipe) côte à côte.
 */
export type Subject = { kind: 'player'; player: PlayerCrossData } | { kind: 'team' };

export function sameSubject(x: Subject, y: Subject): boolean {
  if (x.kind === 'team' && y.kind === 'team') return true;
  return x.kind === 'player' && y.kind === 'player' && x.player.player.id === y.player.player.id;
}

/** Équivalent de `getSeries` pour un `Subject` explicite (voir `getSeries` pour la logique équipe) */
export function getSeriesFor(def: IndicatorDef, subject: Subject, team: TeamCrossData | undefined, from: string, to: string): SeriesPoint[] {
  if (subject.kind === 'player') return def.playerSeries ? def.playerSeries(subject.player, from, to) : [];
  if (!team) return [];
  if (def.teamSeries) return def.teamSeries(team, from, to);
  if (def.playerSeries) return aggregatePlayerSeries(team.players, def, from, to);
  return [];
}

// ── Corrélation ───────────────────────────────────────────────────────────────

/**
 * Valeur d'un prédicteur juste avant une date d'observation : fenêtre `anchor`
 * terminant à J-`lagDays`. Pour `agg: 'last'`, dernière valeur connue dans une
 * tolérance de 3 jours (les états quotidiens peuvent avoir des trous).
 */
function anchoredValue(pred: SeriesPoint[], obsDate: string, lagDays: number, anchor: IndicatorDef['anchor']): number | null {
  const end = shiftDate(obsDate, -lagDays);
  if (anchor.agg === 'last') {
    const floor = shiftDate(end, -3);
    for (let i = pred.length - 1; i >= 0; i--) {
      if (pred[i].date > end) continue;
      return pred[i].date >= floor ? pred[i].value : null;
    }
    return null;
  }
  const start = shiftDate(end, -(anchor.window - 1));
  const win = pred.filter(p => p.date >= start && p.date <= end);
  if (!win.length) return null;
  const sum = win.reduce((s, p) => s + p.value, 0);
  return anchor.agg === 'sum' ? sum : sum / win.length;
}

/** Décalage du prédicteur : un nombre de jours (instantané J/J-3/J-7), ou 'week' pour sa moyenne des 7 jours précédents */
export type LagMode = 0 | 3 | 7 | 'week';

const WEEK_ANCHOR: IndicatorDef['anchor'] = { window: 7, agg: 'mean' };
// Dernière valeur connue (tolérance 3j, cf. anchoredValue) — évite d'exiger une saisie exactement
// le jour décalé pour le croisement quotidien × quotidien (RPE/bien-être ne sont pas saisis tous les jours).
const LAST_ANCHOR: IndicatorDef['anchor'] = { window: 1, agg: 'last' };

/**
 * Cœur du calcul, indépendant de la façon dont chaque série est obtenue (scope partagé pour
 * les deux côtés, ou sujet indépendant par côté — cf. `correlateIndicators`/`correlateAcrossSubjects`).
 * Les paires retournées sont toujours orientées x = indicateur A, y = indicateur B. `lag` décale
 * le prédicteur (l'indicateur non-match, ou A si aucun des deux n'est un indicateur de match) :
 * un nombre de jours prend un instantané à J-n, `'week'` prend sa moyenne sur les 7 jours
 * précédents (plus stable qu'un instantané pour des indicateurs comme l'ACWR ou le TSB, mesurés
 * par défaut jour par jour).
 */
function correlatePairsForDefs(
  a: IndicatorDef, getA: (def: IndicatorDef, from: string, to: string) => SeriesPoint[],
  b: IndicatorDef, getB: (def: IndicatorDef, from: string, to: string) => SeriesPoint[],
  from: string, to: string, lag: LagMode,
): CorrelationResult | null {
  const aIsMatch = a.domain === 'match';
  const bIsMatch = b.domain === 'match';
  const weekMode = lag === 'week' && !(aIsMatch && bIsMatch);
  const lagDays = weekMode ? 0 : (lag === 'week' ? 0 : lag);
  const maxBack = lagDays + Math.max(a.anchor.window, b.anchor.window, weekMode ? WEEK_ANCHOR.window : 0) + 3;
  const extFrom = shiftDate(from, -maxBack);

  // Match × quotidien → ancrage sur match
  if (aIsMatch !== bIsMatch) {
    const outcome     = aIsMatch ? a : b;
    const predictor   = aIsMatch ? b : a;
    const getOutcome  = aIsMatch ? getA : getB;
    const getPredictor = aIsMatch ? getB : getA;
    const predictorAnchor = weekMode ? WEEK_ANCHOR : predictor.anchor;
    const outcomePts   = getOutcome(outcome, from, to);
    const predictorPts = getPredictor(predictor, extFrom, to);
    const pairs: CorrelationPair[] = [];
    for (const o of outcomePts) {
      const v = anchoredValue(predictorPts, o.date, lagDays, predictorAnchor);
      if (v === null) continue;
      pairs.push({
        x: round2(aIsMatch ? o.value : v),
        y: round2(aIsMatch ? v : o.value),
        date: o.date,
      });
    }
    return correlatePairs(pairs);
  }

  // Match × match → appariement par date de match (le décalage n'a pas de sens ici)
  if (aIsMatch && bIsMatch) {
    const aPts = getA(a, from, to);
    const bPts = getB(b, from, to);
    const aByDate = new Map(aPts.map(p => [p.date, p.value]));
    const pairs: CorrelationPair[] = [];
    for (const pb of bPts) {
      const av = aByDate.get(pb.date);
      if (av === undefined) continue;
      pairs.push({ x: round2(av), y: round2(pb.value), date: pb.date });
    }
    return correlatePairs(pairs);
  }

  // Quotidien × quotidien → A (moyenne semaine ou instantané J-lag) apparié à B jour par jour
  const aPts = getA(a, weekMode || lagDays ? extFrom : from, to);
  const bPts = getB(b, from, to);
  const pairs: CorrelationPair[] = [];
  if (weekMode) {
    for (const pb of bPts) {
      const av = anchoredValue(aPts, pb.date, 0, WEEK_ANCHOR);
      if (av === null) continue;
      pairs.push({ x: round2(av), y: round2(pb.value), date: pb.date });
    }
  } else {
    for (const pb of bPts) {
      const av = anchoredValue(aPts, pb.date, lagDays, LAST_ANCHOR);
      if (av === null) continue;
      pairs.push({ x: round2(av), y: round2(pb.value), date: pb.date });
    }
  }
  return correlatePairs(pairs);
}

/** Corrèle deux indicateurs sur un même scope (joueur et/ou équipe) — voir `correlatePairsForDefs`. */
export function correlateIndicators(
  a: IndicatorDef, b: IndicatorDef, scope: CrossScope,
  from: string, to: string, lag: LagMode = 0,
): CorrelationResult | null {
  if (a.key === b.key) return null;
  return correlatePairsForDefs(
    a, (def, f, t) => getSeries(def, scope, f, t),
    b, (def, f, t) => getSeries(def, scope, f, t),
    from, to, lag,
  );
}

/**
 * Corrèle deux indicateurs pour deux sujets indépendants (deux joueurs différents, un joueur et
 * l'équipe, etc.) — permet par ex. de croiser la charge d'un joueur avec l'évaluation d'un autre.
 */
export function correlateAcrossSubjects(
  a: IndicatorDef, subjectA: Subject,
  b: IndicatorDef, subjectB: Subject,
  team: TeamCrossData | undefined,
  from: string, to: string, lag: LagMode = 0,
): CorrelationResult | null {
  if (a.key === b.key && sameSubject(subjectA, subjectB)) return null;
  return correlatePairsForDefs(
    a, (def, f, t) => getSeriesFor(def, subjectA, team, f, t),
    b, (def, f, t) => getSeriesFor(def, subjectB, team, f, t),
    from, to, lag,
  );
}

// ── Zones à risque ────────────────────────────────────────────────────────────

type RiskLevel = 'red' | 'amber';

export interface RiskAlert {
  playerId: string;
  playerName: string;
  level: RiskLevel;
  /** Date de fin de l'épisode (tri et affichage) */
  date: string;
  title: string;
  detail: string;
}

/**
 * Règles explicites (pas de ML), paramétrées par les seuils de l'équipe :
 * R1 — ACWR > 1,5 au moins 3 jours consécutifs ;
 * R2 — pic de charge/fraîcheur suivi sous 10 jours d'une éval nettement sous la moyenne perso ;
 * R3 — blessure survenue dans les 14 jours après un pic de charge/fraîcheur ;
 * R4 — chute du score bien-être ≥ 2 pts d'une semaine à l'autre pendant une semaine « Élevée/Surcharge ».
 * Une alerte par règle et par joueur (l'épisode le plus récent).
 */
export function detectRiskAlerts(
  players: PlayerCrossData[],
  from: string, to: string,
  thresholds: { lightMax: number; normalMax: number },
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const days = eachDay(from, to);
  if (!days.length) return alerts;
  const extFrom = shiftDate(from, -14);

  for (const p of players) {
    if (!p.rpe.length && !p.allTimeRpe.length) continue; // toutes les règles reposent sur la charge
    const playerName = playerNameFull(p.player);

    // ACWR/TSB sur l'historique complet (pas juste la saison affichée) — sinon un épisode de
    // surcharge en tout début de saison peut être manqué faute des 28j de charge chronique.
    const acwrByDay = new Map<string, number>();
    for (const d of eachDay(extFrom, to)) {
      const a = computeAcwr(p.allTimeRpe, d);
      if (a !== null) acwrByDay.set(d, a);
    }
    const tsbByDay = new Map(computePmcSeries(p.allTimeRpe, to).map(pt => [pt.date, pt.tsb]));
    const redDay = (d: string) => (acwrByDay.get(d) ?? 0) > 1.5 || (tsbByDay.get(d) ?? 99) <= -30;

    // R1 — ACWR > 1,5 au moins 3 jours consécutifs (épisode le plus récent)
    let episode: { start: string; end: string; peak: number } | null = null;
    let run: string[] = [];
    for (const d of [...days, '']) { // sentinelle pour clore la dernière série
      if (d && (acwrByDay.get(d) ?? 0) > 1.5) { run.push(d); continue; }
      if (run.length >= 3) {
        episode = {
          start: run[0], end: run[run.length - 1],
          peak: Math.max(...run.map(x => acwrByDay.get(x) ?? 0)),
        };
      }
      run = [];
    }
    if (episode) {
      alerts.push({
        playerId: p.player.id, playerName, level: 'red', date: episode.end,
        title: 'Charge en zone rouge',
        detail: `Charge d'entraînement en forte hausse du ${fmtDayMonth(episode.start)} au ${fmtDayMonth(episode.end)} (jusqu'à ${episode.peak.toFixed(1)}× la charge habituelle)`,
      });
    }

    // R2 — pic de charge suivi sous 10 jours d'une éval nettement sous la moyenne perso
    const evals = p.matchStats.filter(m => m.eval !== null);
    if (evals.length >= MIN_CORRELATION_PAIRS) {
      const vals = evals.map(m => Number(m.eval));
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      const floor = mean - Math.max(sd, 2); // au moins 2 pts sous la moyenne
      let hit: MatchStat | null = null;
      for (const m of evals) {
        if (m.date < from || m.date > to || Number(m.eval) >= floor) continue;
        const winStart = shiftDate(m.date, -10);
        const peaked = eachDay(winStart, shiftDate(m.date, -1)).some(redDay);
        if (peaked) hit = m;
      }
      if (hit) {
        alerts.push({
          playerId: p.player.id, playerName, level: 'amber', date: hit.date,
          title: 'Baisse de perf après pic de charge',
          detail: `Éval ${hit.eval} vs ${round1(mean)} de moyenne saison (${hit.opponent}, ${fmtDayMonth(hit.date)}), après un pic de charge dans les 10 jours précédents`,
        });
      }
    }

    // R3 — blessure dans les 14 jours suivant un pic de charge/fraîcheur
    for (const rec of p.medical) {
      if (rec.type !== 'injury' || rec.date < from || rec.date > to) continue;
      const peaked = eachDay(shiftDate(rec.date, -14), rec.date).some(redDay);
      if (peaked) {
        alerts.push({
          playerId: p.player.id, playerName, level: 'red', date: rec.date,
          title: 'Blessure précédée d\'un pic de charge',
          detail: `${rec.location || rec.description || 'Blessure'} le ${fmtDayMonth(rec.date)} — charge d'entraînement ou fraîcheur en zone à risque dans les 14 jours précédents`,
        });
        break; // une seule alerte blessure par joueur
      }
    }

    // R4 — chute du bien-être ≥ 2 pts d'une semaine à l'autre sous charge hebdo élevée
    if (p.wellness.length) {
      const wellByWeek = new Map<string, number[]>();
      p.wellness.forEach(w => {
        if (w.date < extFrom || w.date > to) return;
        const k = mondayIso(w.date);
        if (!wellByWeek.has(k)) wellByWeek.set(k, []);
        wellByWeek.get(k)!.push(Number(w.score));
      });
      const loadByWeek = new Map<string, number>();
      p.rpe.forEach(e => {
        if (e.date < extFrom || e.date > to) return;
        const k = mondayIso(e.date);
        loadByWeek.set(k, (loadByWeek.get(k) ?? 0) + sessionLoad(e));
      });
      const weekKeys = [...new Set(days.map(mondayIso))].sort();
      const weekAvg = (k: string) => {
        const vs = wellByWeek.get(k);
        return vs?.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
      };
      let drop: { week: string; prev: number; curr: number; tier: string } | null = null;
      for (let i = 1; i < weekKeys.length; i++) {
        const prev = weekAvg(weekKeys[i - 1]);
        const curr = weekAvg(weekKeys[i]);
        if (prev === null || curr === null || prev - curr < 2) continue;
        const tier = getWeekTier(loadByWeek.get(weekKeys[i]) ?? 0, thresholds.lightMax, thresholds.normalMax);
        if (tier.label === 'Élevée' || tier.label === 'Surcharge') {
          drop = { week: weekKeys[i], prev: round1(prev), curr: round1(curr), tier: tier.label };
        }
      }
      if (drop) {
        alerts.push({
          playerId: p.player.id, playerName, level: 'amber', date: drop.week,
          title: 'Bien-être en chute sous charge élevée',
          detail: `Score ${fmt1(drop.curr)}/10 vs ${fmt1(drop.prev)}/10 la semaine précédente, charge hebdo « ${drop.tier} » (semaine du ${fmtDayMonth(drop.week)})`,
        });
      }
    }
  }

  return alerts.sort((a, b) =>
    a.level === b.level ? b.date.localeCompare(a.date) : (a.level === 'red' ? -1 : 1));
}

// ── Épisodes médicaux pour surimpression graphique ────────────────────────────

export interface InjuryEpisode { from: string; to: string; label: string }

/** Blessures d'un joueur converties en intervalles [début, fin] bornés à la période */
export function injuryEpisodes(medical: MedicalRecord[], from: string, to: string): InjuryEpisode[] {
  return medical
    .filter(m => m.type === 'injury')
    .map(m => {
      const end = m.resolvedDate ?? m.rtpDate ?? to;
      return { from: m.date, to: end < to ? end : to, label: m.location || m.description || 'Blessure' };
    })
    .filter(ep => ep.to >= from && ep.from <= to)
    .map(ep => ({ ...ep, from: ep.from > from ? ep.from : from }));
}
