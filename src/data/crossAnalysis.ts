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
  TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption,
} from './types';
import { VARIABLES, type IndicatorSense } from './pca';
import { calcPlayerAdvancedForMatch, calcPlayerAdvancedForPeriod, perMatchPtsProd, type PlayerAdvancedStats } from './playerAdvanced';
import { computeAcwr, acwrZone, computePmcSeries, tsbZone, rpeColor, type LoadEntry } from '../utils/rpe';
import { getWeekTier, mondayIso } from '../utils/weeklyLoad';
import { presenceRate } from '../utils/attendance';
import { WELLNESS_DIMENSIONS, wellnessScoreColor, aggregateTeamWellnessDaily } from '../utils/wellness';
import { correlatePairs, MIN_CORRELATION_PAIRS, type CorrelationPair, type CorrelationResult } from '../utils/correlation';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import { fmt1 } from '../utils/format';
import { findValueDimension, buildValueByEvent } from './tacticalAnalysis';
import { normalizeTacticalName } from '../utils/tacticalCsvParser';

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

/** Données tactiques de l'équipe pour la saison — facultatif : absent tant que non chargé,
 *  les attributs "Rentabilité de ..." dynamiques n'apparaissent alors simplement pas. */
export interface TeamTacticalCrossData {
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
}

export interface TeamCrossData {
  players: PlayerCrossData[];
  teamMatchStats: TeamMatchStat[];
  tactical?: TeamTacticalCrossData;
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
  /**
   * Valeur de l'indicateur sur une PÉRIODE ENTIÈRE — hook unique de toute agrégation de période
   * (classement joueurs, objectifs).
   *
   * À ne PAS confondre avec `playerSeries` : la série par match est juste et reste utilisée telle
   * quelle par les graphiques et les corrélations. Seule son agrégation posait problème, à deux
   * titres — les ratios doivent sommer numérateur et dénominateur avant de diviser, et les
   * volumes doivent se moyenner sur les MATCHS alors que la série est indexée par DATE (deux
   * matchs le même jour n'y forment qu'un point).
   */
  periodValue?: (d: PlayerCrossData, from: string, to: string) => number | null;
  /** Décimales à l'affichage. Défaut 1. Les % de tir sont affichés en entier, comme dans les tableaux. */
  decimals?: number;
  /**
   * Une phrase en langage de terrain : ce que le chiffre DIT, pas comment il est calculé.
   * Alimente le tooltip `<StatInfo>` et le glossaire de la page d'aide. Source unique : ne pas
   * dupliquer ces textes dans les composants.
   */
  explain?: string;
  /** Formule, quand elle éclaire (ratios, stats avancées). Inutile pour un total brut. */
  formula?: string;
  /** Sens de lecture — `context` pour ce qui n'est ni bon ni mauvais (titulaire, domicile…). */
  sense?: IndicatorSense;
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
    const rate = presenceRate(win);
    if (rate === null) continue;
    points.push({ date, value: rate });
  }
  return points;
}

const presenceColor = (v: number) => v >= 85 ? '#00E5A0' : v >= 70 ? '#F59E0B' : '#EF4444';

/** Série de stats avancées individuelles — nécessite la stat collective du même match pour usage%/%PD/%REB/ptsProd */
function advSeries(d: PlayerCrossData, from: string, to: string, pick: (a: PlayerAdvancedStats) => number | null): SeriesPoint[] {
  return matchSeries(d.matchStats, from, to, m =>
    pick(calcPlayerAdvancedForMatch(m, d.teamStatsByMatchId?.get(m.matchId ?? '') ?? null)));
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
    // Moyenne sur les MATCHS, pas sur les dates : `matchSeries` fusionne deux matchs joués le
    // même jour en un seul point, ce qui ferait diverger le classement des tableaux (somme/nb de
    // matchs) dès qu'il y a un plateau ou un tournoi. Les % de tir surchargent ce défaut.
    periodValue: (d, f, t) => {
      const vals = d.matchStats
        .filter(m => m.date >= f && m.date <= t)
        .map(get)
        .filter((v): v is number => v !== null && v !== undefined && !Number.isNaN(v));
      return vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    },
  };
}

/** Ratio de sommes sur la période — pour les % de tir : Σréussis / Σtentés, jamais la moyenne des
 *  % par match, qui sur-pondère les matchs à faible volume de tirs. */
function shootingPctPeriod(counts: (m: MatchStat) => { made: number; att: number }) {
  return (d: PlayerCrossData, from: string, to: string): number | null => {
    const totals = d.matchStats
      .filter(m => m.date >= from && m.date <= to)
      .reduce((acc, m) => {
        const { made, att } = counts(m);
        return { made: acc.made + made, att: acc.att + att };
      }, { made: 0, att: 0 });
    return totals.att > 0 ? round2(totals.made / totals.att * 100) : null;
  };
}

/**
 * Indicateur de match avancé individuel. La série reste par match (`advSeries`) ; la valeur de
 * période passe par `calcPlayerAdvancedForPeriod`, qui somme numérateur et dénominateur.
 * `isVolume` : pour « Points générés », seul champ avancé qui n'est pas un ratio — sa valeur de
 * période est une moyenne par match, homogène avec les autres colonnes de volume.
 */
function playerAdvStat(
  key: string, label: string, shortLabel: string, color: string,
  pick: (a: PlayerAdvancedStats) => number | null, unit = '%', isVolume = false,
): IndicatorDef {
  return {
    key, label, shortLabel, domain: 'match', group: 'Match — Statistiques avancées', unit, color,
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    playerSeries: (d, f, t) => advSeries(d, f, t, pick),
    periodValue: (d, f, t) => {
      const period = calcPlayerAdvancedForPeriod(
        d.matchStats.filter(m => m.date >= f && m.date <= t),
        d.teamStatsByMatchId,
      );
      return isVolume ? perMatchPtsProd(period) : pick(period.stats);
    },
  };
}

const TEAM_COLORS = ['#60A5FA', '#00E5A0', '#F59E0B', '#EC4899', '#8B5CF6', '#38BDF8', '#F97316', '#EAB308', '#2DD4BF', '#A78BFA'];

/**
 * Un attribut dynamique par (catégorie, dimension, option) réellement observée dans les
 * événements tactiques de l'équipe — contrairement aux attributs de `INDICATORS` ci-dessous
 * (liste statique connue à la compilation), ceux-ci dépendent des données propres à chaque
 * équipe et sont donc reconstruits à la volée, jamais mémorisés dans `INDICATORS`. Seules les
 * catégories ayant une dimension "Valeur" produisent des attributs (rentabilité incalculable
 * sinon). Valeur = rentabilité de CETTE option précise (valeur/nb occurrences), pas de toute
 * la dimension ni de toute la catégorie — même calcul que la ligne `DimensionOptionRow`
 * correspondante dans `buildDimensionTable` (tacticalAnalysis.ts), mais un match à la fois.
 */
export function buildTacticalIndicators(tactical: TeamTacticalCrossData | undefined): IndicatorDef[] {
  if (!tactical) return [];
  const { categories, dimensions } = tactical;
  const defs: IndicatorDef[] = [];

  for (const category of categories) {
    const categoryDimensions = dimensions.filter(d => d.categoryId === category.id);
    const valueDimension = findValueDimension(categoryDimensions, category.id);
    if (!valueDimension) continue;

    for (const dimension of categoryDimensions) {
      if (dimension.id === valueDimension.id) continue;

      // Regroupées par libellé NORMALISÉ (accents/casse/espaces), pas par libellé brut : deux
      // variantes du même libellé réel observées dans des exports CSV différents (ex. "Panier" /
      // "panier") doivent fusionner en un seul attribut — sinon la clé générée (elle-même
      // normalisée, cf. ci-dessous) entrerait en collision entre les deux variantes, et
      // `indicatorByKey` ne renverrait toujours que la première rencontrée, avec des chiffres
      // ne comptant qu'une des deux variantes au lieu des deux réunies.
      const byNormalizedLabel = new Map<string, string>(); // normalisé -> libellé d'affichage (1er observé)
      for (const event of tactical.events) {
        if (event.categoryId !== category.id) continue;
        const v = event.values.find(vv => vv.dimensionId === dimension.id);
        if (!v) continue;
        const normalized = normalizeTacticalName(v.label);
        if (!byNormalizedLabel.has(normalized)) byNormalizedLabel.set(normalized, v.label);
      }

      for (const [normalizedLabel, displayLabel] of byNormalizedLabel) {
        defs.push({
          key: `tactical_${category.id}_${dimension.id}_${normalizedLabel}`,
          label: `Rentabilité de ${category.name} / ${dimension.name} / ${displayLabel}`,
          shortLabel: `${displayLabel} (${dimension.name})`,
          domain: 'match',
          group: 'Tactique',
          unit: '',
          color: '#00E5A0',
          chart: 'dots',
          anchor: { window: 1, agg: 'last' },
          weeklyAgg: 'mean',
          teamSeries: (d, from, to) => {
            if (!d.tactical) return [];
            const matchIdToDate = new Map(d.teamMatchStats.filter(t => t.matchId).map(t => [t.matchId as string, t.date]));
            const catDims = d.tactical.dimensions.filter(dd => dd.categoryId === category.id);
            const valDim = findValueDimension(catDims, category.id);
            const valueByEvent = buildValueByEvent(d.tactical.events, category.id, valDim);
            const byMatch = new Map<string, { sum: number; count: number }>();
            for (const event of d.tactical.events) {
              if (event.categoryId !== category.id) continue;
              const val = event.values.find(vv => vv.dimensionId === dimension.id);
              if (!val || normalizeTacticalName(val.label) !== normalizedLabel) continue;
              const date = matchIdToDate.get(event.matchId);
              if (!date || date < from || date > to) continue;
              const numeric = valueByEvent.get(event.id);
              if (numeric === undefined) continue;
              if (!byMatch.has(date)) byMatch.set(date, { sum: 0, count: 0 });
              const agg = byMatch.get(date)!;
              agg.sum += numeric;
              agg.count += 1;
            }
            return [...byMatch.entries()]
              .map(([date, { sum, count }]) => ({ date, value: round2(sum / count) }))
              .sort((a, b) => a.date.localeCompare(b.date));
          },
        });
      }
    }
  }

  return defs;
}


/**
 * Documentation des indicateurs — SOURCE UNIQUE des textes affichés au staff (tooltips `StatInfo`,
 * glossaire de la page d'aide).
 *
 * Séparée des déclarations pour garder celles-ci lisibles, et pour que la prose vive au même
 * endroit : c'est ce qui permet de la relire d'un bloc quand on doute d'un libellé.
 *
 * Règle de rédaction : `explain` dit ce que le chiffre SIGNIFIE en langage de terrain, pas comment
 * il est calculé. La formule va dans `formula`, et seulement quand elle éclaire — un total de
 * rebonds n'a pas besoin de formule.
 *
 * Les indicateurs `team_*` et `well_*` ne sont pas listés ici : ils héritent leur documentation de
 * `VARIABLES` (pca.ts) et de `WELLNESS_DIMENSIONS` (utils/wellness.ts).
 */
const INDICATOR_DOCS: Record<string, { explain: string; formula?: string; sense: IndicatorSense }> = {
  // ── Contexte ──
  starter:  { explain: 'La joueuse était-elle dans le cinq de départ. Sert de filtre de contexte, pas de mesure de performance.', sense: 'context' },
  homeAway: { explain: 'Match à domicile ou à l\'extérieur. Utile pour croiser une performance avec le lieu.', sense: 'context' },
  result:   { explain: 'Victoire ou défaite. Encodé 1/0 pour pouvoir être corrélé aux autres indicateurs.', sense: 'context' },

  // ── Match — brutes ──
  eval:      { explain: 'Évaluation officielle de la feuille de match : une note synthétique qui additionne les actions positives et retire les négatives.', sense: 'higher' },
  plusMinus: { explain: "Différence de score pendant que la joueuse est sur le terrain. Dépend fortement des coéquipières présentes : à lire sur beaucoup de matchs.", formula: 'points_équipe − points_adversaire, sur son temps de jeu', sense: 'higher' },
  min:       { explain: 'Temps de jeu. À regarder avant tout indicateur de volume : 12 points en 10 minutes et en 35 minutes ne disent pas la même chose.', sense: 'context' },
  pts:       { explain: 'Points marqués sur le match.', sense: 'higher' },
  fg2Pct:    { explain: 'Part des tirs à 2 points réussis.', formula: 'Σ réussis / Σ tentés sur la période (jamais la moyenne des % par match)', sense: 'higher' },
  fg3Pct:    { explain: 'Part des tirs à 3 points réussis. Très variable d\'un match à l\'autre : à lire sur plusieurs matchs.', formula: 'Σ réussis / Σ tentés sur la période', sense: 'higher' },
  ftPct:     { explain: 'Part des lancers francs réussis. Se travaille à l\'entraînement, peu dépendant de l\'adversaire.', formula: 'Σ réussis / Σ tentés sur la période', sense: 'higher' },
  ro:        { explain: 'Rebonds pris après un tir manqué de son équipe : autant de secondes chances.', sense: 'higher' },
  rd:        { explain: "Rebonds pris après un tir manqué de l'adversaire : la possession change de camp.", sense: 'higher' },
  reb:       { explain: 'Total des rebonds, offensifs et défensifs.', sense: 'higher' },
  pd:        { explain: 'Passes ayant directement mené à un panier.', sense: 'higher' },
  ct:        { explain: 'Tirs adverses contrés. Mesure la protection du cercle, pas la qualité défensive globale.', sense: 'higher' },
  intercepts:{ explain: "Ballons volés à l'adversaire. Défense active, mais un excès peut signaler des prises de risque.", sense: 'higher' },
  bp:        { explain: 'Possessions perdues sans tir. À rapporter au rythme de jeu via %BP.', sense: 'lower' },
  fte:       { explain: "Fautes subies : autant d'occasions de lancers francs et de fautes accumulées côté adverse.", sense: 'higher' },
  fpr:       { explain: "Fautes sifflées contre la joueuse. Trop de fautes l'expose à sortir et envoie l'adversaire sur la ligne.", sense: 'lower' },

  // ── Match — avancées ──
  adv_offRating:   { explain: "Points produits pour 100 possessions utilisées par la joueuse. Mesure l'efficacité, pas le volume.", formula: 'points × 100 / possessions utilisées', sense: 'higher' },
  adv_efgPct:      { explain: "Réussite au tir en tenant compte du fait qu'un 3 points vaut plus qu'un 2 points. Meilleure mesure d'adresse qu'un pourcentage brut.", formula: '(tirs réussis + 0,5 × 3 pts réussis) / tirs tentés × 100', sense: 'higher' },
  adv_ftRate:      { explain: "Lancers francs obtenus pour chaque tir tenté. Mesure l'agressivité vers le cercle.", formula: 'lancers tentés / tirs tentés', sense: 'higher' },
  adv_usagePctRaw: { explain: "Part des possessions de l'équipe que la joueuse a utilisées. Dépend mécaniquement de son temps de jeu : une remplaçante très sollicitée sur 8 minutes reste basse.", formula: 'possessions utilisées / possessions équipe × 100', sense: 'context' },
  adv_usagePct:    { explain: "La même part, mais rapportée aux minutes réellement jouées : « quand elle est sur le terrain, combien de possessions prend-elle ? ». C'est cette colonne qui répond à la question du volume de jeu, pas %USG.", formula: 'possessions × (minutes équipe / 5) / (minutes joueuse × possessions équipe) × 100', sense: 'context' },
  adv_astPct:      { explain: "Part des paniers de l'équipe que la joueuse a créés par une passe, hors ses propres paniers.", formula: 'passes décisives / (paniers équipe − ses paniers) × 100', sense: 'higher' },
  adv_tovPct:      { explain: 'Part de ses possessions terminées par une perte de balle. Plus juste que le total brut, qui grandit avec le volume de jeu.', formula: 'ballons perdus / possessions utilisées × 100', sense: 'lower' },
  adv_trebPct:     { explain: 'Part des rebonds disponibles pendant son temps de jeu qu\'elle a captés.', sense: 'higher' },
  adv_orebPct:     { explain: 'Part des rebonds offensifs disponibles qu\'elle a captés. Indépendant du nombre de tirs manqués, contrairement au total de RO.', sense: 'higher' },
  adv_drebPct:     { explain: 'Part des rebonds défensifs disponibles qu\'elle a captés.', sense: 'higher' },
  adv_ptsProd:     { explain: 'Points marqués plus ceux créés par ses passes décisives. Donne le crédit de la création, pas seulement de la finition.', formula: 'points + passes × (points au tir équipe / paniers équipe)', sense: 'higher' },

  // ── Match — équipe (les autres héritent de VARIABLES) ──
  team_homeAway:    { explain: 'Match à domicile ou à l\'extérieur.', sense: 'context' },
  team_result:      { explain: 'Victoire ou défaite, encodé 1/0 pour la corrélation.', sense: 'context' },
  team_scorediff:   { explain: 'Écart final. Positif = victoire.', formula: 'points marqués − points encaissés', sense: 'higher' },
  team_ptsFor:      { explain: 'Points marqués par l\'équipe sur le match.', sense: 'higher' },
  team_ptsAgainst:  { explain: 'Points encaissés sur le match.', sense: 'lower' },
  team_possessions: { explain: "Nombre de possessions jouées : mesure le RYTHME, ni bon ni mauvais. Sert à comparer attaque et défense indépendamment du tempo (ORtg, DRtg).", sense: 'context' },

  // ── Charge ──
  loadUa: { explain: "Charge d'une séance selon la méthode de Foster : l'effort ressenti multiplié par la durée. En unités arbitraires (UA), l'unité standard de la méthode.", formula: 'RPE (0-10) × durée réelle en minutes', sense: 'context' },
  rpe:    { explain: "Effort ressenti déclaré par la joueuse après la séance, de 0 à 10. Subjectif par construction — c'est ce qui en fait un bon indicateur de vécu.", sense: 'context' },
  acwr:   { explain: "Charge des 7 derniers jours comparée à celle des 28 derniers. Autour de 1, la charge est habituelle ; nettement au-dessus, elle a augmenté vite — c'est ce que la littérature associe à un risque accru de blessure.", formula: 'charge aiguë (7 j) / charge chronique (28 j)', sense: 'context' },
  tsb:    { explain: "Fraîcheur : écart entre la forme construite sur le long terme et la fatigue accumulée récemment. Positif = frais, très négatif = surmené.", formula: 'CTL (forme, 42 j) − ATL (fatigue, 7 j)', sense: 'context' },

  // ── Bien-être ──
  well_score: { explain: "Moyenne des 6 axes de bien-être, tous redressés dans le sens « plus haut = mieux ». Un seul chiffre pour repérer une joueuse à surveiller.", formula: '((11 − fatigue) + humeur + (11 − stress) + motivation + sommeil + (11 − douleurs)) / 6', sense: 'higher' },

  // ── Assiduité ──
  presence: { explain: 'Part des séances où la joueuse était présente, sur les 28 derniers jours. Une joueuse en retard compte comme présente.', formula: 'présences / séances attendues × 100', sense: 'higher' },
};

/** Attache sa documentation à un indicateur, sans écraser celle qu'il porte déjà. */
function withDocs(def: IndicatorDef): IndicatorDef {
  const doc = INDICATOR_DOCS[def.key];
  if (!doc) return def;
  return {
    ...def,
    explain: def.explain ?? doc.explain,
    formula: def.formula ?? doc.formula,
    sense:   def.sense   ?? doc.sense,
  };
}

const RAW_INDICATORS: IndicatorDef[] = [
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
  { ...playerMatchStat('fg2Pct', 'Réussite 2 pts (%)',          '2%',  '#00E5A0', '%', m => m.fg2a > 0 ? m.fg2m / m.fg2a * 100 : null), periodValue: shootingPctPeriod(m => ({ made: m.fg2m, att: m.fg2a })), decimals: 0 },
  { ...playerMatchStat('fg3Pct', 'Réussite 3 pts (%)',          '3%',  '#2DD4BF', '%', m => m.fg3a > 0 ? m.fg3m / m.fg3a * 100 : null), periodValue: shootingPctPeriod(m => ({ made: m.fg3m, att: m.fg3a })), decimals: 0 },
  { ...playerMatchStat('ftPct',  'Réussite lancers francs (%)', 'LF%', '#EAB308', '%', m => m.fta  > 0 ? m.ftm  / m.fta  * 100 : null), periodValue: shootingPctPeriod(m => ({ made: m.ftm, att: m.fta })), decimals: 0 },
  playerMatchStat('ro',         'Rebonds offensifs',            'RO',  '#F97316', '',  m => m.ro),
  playerMatchStat('rd',         'Rebonds défensifs',            'RD',  '#F59E0B', '',  m => m.rd),
  playerMatchStat('reb',        'Rebonds totaux',               'Reb', '#FB923C', '',  m => m.ro + m.rd),
  playerMatchStat('pd',         'Passes décisives',             'Pd',  '#8B5CF6', '',  m => m.pd),
  playerMatchStat('ct',         'Contres',                      'Ct',  '#A78BFA', '',  m => m.ct),
  playerMatchStat('intercepts', 'Interceptions',                'Int', '#EC4899', '',  m => m.intercepts),
  playerMatchStat('bp',         'Ballons perdus',               'Bp',  '#EF4444', '',  m => m.bp),
  // `fte` = fautes REÇUES (provoquées), `fpr` = fautes COMMISES — cf. schema.sql, le formulaire
  // d'import et featureRegistry, qui concordent tous. Les deux libellés étaient inversés ici :
  // choisir « Fautes commises » dans le classement, un objectif ou une corrélation affichait en
  // réalité les fautes provoquées, et inversement.
  playerMatchStat('fte',        'Fautes provoquées',            'Fp',  '#4ADE80', '',  m => m.fte),
  playerMatchStat('fpr',        'Fautes commises',              'Fte', '#F87171', '',  m => m.fpr),
  // ── Match — Statistiques avancées ──
  playerAdvStat('adv_offRating', 'ORtg individuel (pts × 100 / possessions utilisées)', 'ORtg', '#00E5A0', a => a.offRating, ''),
  playerAdvStat('adv_efgPct',   'eFG% individuel',                  'eFG%',   '#EAB308', a => a.efgPct),
  // `decimals: 2` : FT Rate est un RATIO (0,28), affiché à 2 décimales dans les tableaux de stats
  // avancées et stocké ainsi en base (`ft_rate NUMERIC(4,2)`). Sans ça, le classement l'arrondissait
  // à 0,3 — le même défaut que celui corrigé pour les % de tir.
  { ...playerAdvStat('adv_ftRate', 'FT Rate individuel (LF tentés / tirs)', 'FTr', '#2DD4BF', a => a.ftRate, ''), decimals: 2 },
  // Deux lectures de l'usage, comme dans les tableaux de stats avancées (cf. playerAdvanced.ts) :
  // la part brute dépend du temps de jeu, la version /min ne dépend que de ce qui se passe sur le
  // terrain. Les deux sont proposées au classement, aux objectifs et aux corrélations — le libellé
  // doit dire laquelle, sinon un remplaçant très sollicité sur peu de minutes ressort premier
  // « à l'usage » sans qu'on comprenne pourquoi.
  playerAdvStat('adv_usagePctRaw', '%USG — part des possessions de l\'équipe utilisées', '%USG', '#60A5FA', a => a.usagePctRaw),
  playerAdvStat('adv_usagePct',    '%USG/min — usage rapporté aux minutes jouées',       '%USG/min', '#818CF8', a => a.usagePct),
  playerAdvStat('adv_astPct',   '% Passes décisives (paniers créés)', '%PD',  '#8B5CF6', a => a.astPct),
  playerAdvStat('adv_tovPct',   '% Ballons perdus par possession',  '%BP',    '#EF4444', a => a.tovPct),
  playerAdvStat('adv_trebPct',  '% Rebonds totaux captés',          '%TREB',  '#FB923C', a => a.trebPct),
  playerAdvStat('adv_orebPct',  '% Rebonds offensifs captés',       '%OREB',  '#F97316', a => a.orebPct),
  playerAdvStat('adv_drebPct',  '% Rebonds défensifs captés',       '%DREB',  '#F59E0B', a => a.drebPct),
  playerAdvStat('adv_ptsProd',  'Points générés (pts + passes converties)', 'PtsGén', '#38BDF8', a => a.ptsProd, 'pts', true),
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
  // Les indicateurs d'équipe héritent leur documentation de `VARIABLES` (pca.ts) : une seule
  // source pour les facteurs de victoire, le biplot, le classement, les objectifs et le glossaire.
  ...VARIABLES.map((v, i): IndicatorDef => ({
    key: `team_${v.key}`,
    label: v.longLabel,
    shortLabel: v.label,
    domain: 'match', group: 'Match — équipe',
    unit: v.key.includes('Pct') ? '%' : '',
    color: TEAM_COLORS[i % TEAM_COLORS.length],
    chart: 'dots', anchor: { window: 1, agg: 'last' }, weeklyAgg: 'mean',
    explain: v.explain,
    sense: v.sense,
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
    // Documentation dérivée de WELLNESS_DIMENSIONS, seule source du sens de chaque axe.
    explain: dim.inverted
      ? `Saisi de 1 à 10 dans le sens « ${dim.desc} », puis REDRESSÉ pour l'affichage : ici, 10 = au mieux. Sans ce redressement, les axes inversés annuleraient les autres dans une moyenne.`
      : `Saisi de 1 à 10 dans le sens « ${dim.desc} ». 10 = au mieux.`,
    formula: dim.inverted ? 'valeur_affichée = 11 − valeur_saisie' : undefined,
    sense: 'higher',
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

const INDICATORS: IndicatorDef[] = RAW_INDICATORS.map(withDocs);


/**
 * Valeur d'un indicateur sur une période, pour UN joueur — point d'entrée unique du classement
 * joueurs et des objectifs, qui avaient chacun leur propre logique d'agrégation.
 *
 * Ordre de résolution :
 *  1. `periodValue` quand l'indicateur en définit un — tous les indicateurs du domaine match le
 *     font : ratio de sommes pour les ratios, moyenne sur les matchs pour les volumes ;
 *  2. sinon, moyenne de la série — correct pour les domaines charge / bien-être / assiduité, dont
 *     chaque point est déjà une observation quotidienne.
 */
export function periodValueOf(
  def: IndicatorDef, d: PlayerCrossData, from: string, to: string,
): number | null {
  if (def.periodValue) return def.periodValue(d, from, to);
  if (!def.playerSeries) return null;
  const pts = def.playerSeries(d, from, to);
  return pts.length ? round2(pts.reduce((sum, x) => sum + x.value, 0) / pts.length) : null;
}

export const teamIndicators   = () => INDICATORS.filter(i => i.teamSeries || i.playerSeries);

/** `extraTeamIndicators` : attributs dynamiques par équipe (ex. `buildTacticalIndicators`),
 *  absents de la liste statique `INDICATORS` — cherchés en second, jamais prioritaires. */
export const indicatorByKey = (key: string, extraTeamIndicators: IndicatorDef[] = []) =>
  INDICATORS.find(i => i.key === key) ?? extraTeamIndicators.find(i => i.key === key);

/** Attributs propres à UN joueur (stats de match individuelles, charge, bien-être, assiduité — sa valeur à lui) */
export const playerAttributeIndicators = () => INDICATORS.filter(i => i.playerSeries);
/**
 * Attributs de L'ÉQUIPE : stats collectives dédiées (groupe « Match — équipe ») + moyenne d'équipe
 * pour les indicateurs non-match (charge/bien-être/assiduité), + attributs tactiques dynamiques de
 * cette équipe (`extraTeamIndicators`, ex. `buildTacticalIndicators`). Les stats de match
 * individuelles (éval, +/-…) sont exclues : leur équivalent collectif existe déjà comme attribut
 * équipe dédié.
 */
export const teamAttributeIndicators = (extraTeamIndicators: IndicatorDef[] = []) => [
  ...INDICATORS.filter(i => i.teamSeries || (i.domain !== 'match' && i.playerSeries)),
  ...extraTeamIndicators,
];

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
  playerNameShort: string;
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
    const playerShortName = playerNameShort(p.player);

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
        playerId: p.player.id, playerName, playerNameShort: playerShortName, level: 'red', date: episode.end,
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
          playerId: p.player.id, playerName, playerNameShort: playerShortName, level: 'amber', date: hit.date,
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
          playerId: p.player.id, playerName, playerNameShort: playerShortName, level: 'red', date: rec.date,
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
          playerId: p.player.id, playerName, playerNameShort: playerShortName, level: 'amber', date: drop.week,
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
