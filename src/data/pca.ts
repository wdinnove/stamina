import { PCA } from 'ml-pca';
import { pearson, hasVariance, pearsonPValue, SIGNIFICANCE_ALPHA } from '../utils/correlation';
import { playerNameFull } from '../utils/playerName';
import { roundedAvg } from '../utils/avg';
import type { TeamMatchStat, MatchStat, Player } from './types';

export interface PCAPoint { x: number; y: number; win: boolean; label: string }
export interface PCAVector { x: number; y: number; label: string }
export interface PCAResult {
  points: PCAPoint[];
  vectors: PCAVector[];
  varPct: [number, number];
  /** Matchs réellement entrés dans l'analyse (stats collectives complètes). */
  matchesUsed: number;
  /** Matchs écartés faute de stats collectives complètes — à afficher, pas à taire. */
  matchesDropped: number;
}
/**
 * Un lien corrélé, avec sa significativité statistique. `MIN_MATCHES` (4) suffit à calculer un `r`
 * mais pas à le croire : sur 4 observations, même r = 0,80 n'est pas significatif. Sans cette
 * information, un lien du hasard s'affichait « Impact majeur » — les corrélations de l'onglet
 * Analyse croisée, elles, exposaient déjà `p` et `significant` via `correlatePairs`.
 */
interface Correlated {
  corr: number;
  n: number;
  /** p-value bilatérale du test H₀ : r = 0 */
  p: number;
  /** p < 0,05 */
  significant: boolean;
}

export interface WinFactor extends Correlated { key: string; label: string }
export interface PlayerImpact extends Correlated { playerId: string; label: string; avgEval: number }

const MIN_MATCHES = 4;
const PLAYER_MIN_MATCHES = 5;

/** Statistiques collectives par match — partagées avec le registre d'indicateurs de crossAnalysis.ts */
/**
 * Sens de lecture d'un indicateur — sert au glossaire et aux légendes.
 * `context` : ni bon ni mauvais en soi (domicile/extérieur, titulaire…).
 */
export type IndicatorSense = 'higher' | 'lower' | 'context';

export interface TeamVariable {
  key: string;
  label: string;
  longLabel: string;
  /** Une phrase, en langage de terrain : ce que le chiffre dit, pas comment il est calculé. */
  explain: string;
  sense: IndicatorSense;
  get: (m: TeamMatchStat) => number | null;
  /**
   * Numérateur et dénominateur BRUTS de la variable, quand c'en est un ratio. Sert à l'agréger sur
   * une période en sommant les deux puis en divisant (§ 4 de docs/CALCULS.md) — et non en moyennant
   * les pourcentages de chaque match, ce qui donnait le même poids à un match à 3 tirs qu'à un
   * match à 60. C'est ce qui manquait pour que les objectifs d'ÉQUIPE portant sur un ratio soient
   * évalués comme ceux d'un joueur.
   *
   * Absent = la variable est un volume (rebonds, passes, contres…), qui se moyenne match par match.
   */
  sums?: {
    num: (m: TeamMatchStat) => number;
    den: (m: TeamMatchStat) => number;
    /** 100 pour un pourcentage (défaut), 1 pour un ratio brut comme FT Rate. */
    factor?: 1 | 100;
  };
}

// Accesseurs partagés par les définitions `sums` ci-dessous.
const fgaOf     = (m: TeamMatchStat) => m.fg2a + m.fg3a;
const oppFgaOf  = (m: TeamMatchStat) => m.opp_fg2a + m.opp_fg3a;
/** Possessions adverses quand elles sont connues, sinon les nôtres (elles s'équilibrent à ±2). */
const oppPossOf = (m: TeamMatchStat) => m.opp_possessions ?? m.possessions;

/**
 * Variables collectives suivies par match. Servent à la fois aux facteurs de victoire, au biplot
 * PCA et — via `crossAnalysis` — aux indicateurs d'équipe `team_*` du classement, des objectifs et
 * des corrélations. `explain` et `sense` alimentent le glossaire de la page d'aide : une seule
 * source, pas une liste parallèle à maintenir.
 *
 * ⚠️ `fte` = fautes REÇUES (provoquées), `fpr` = fautes COMMISES — cf. schema.sql et le formulaire
 * d'import. Les deux libellés étaient inversés ici comme dans crossAnalysis.
 */
export const VARIABLES: TeamVariable[] = [
  { key: 'fg2Pct',     label: '2%',        longLabel: 'Réussite aux tirs à 2 points',
    explain: "Part des tirs à 2 points réussis. Le premier levier d'efficacité intérieure.", sense: 'higher',
    get: m => m.fg2a > 0 ? m.fg2m / m.fg2a * 100 : null,
    sums: { num: m => m.fg2m, den: m => m.fg2a } },
  { key: 'fg3Pct',     label: '3%',        longLabel: 'Réussite aux tirs à 3 points',
    explain: "Part des tirs à 3 points réussis. Très variable d'un match à l'autre : à lire sur plusieurs matchs.", sense: 'higher',
    get: m => m.fg3a > 0 ? m.fg3m / m.fg3a * 100 : null,
    sums: { num: m => m.fg3m, den: m => m.fg3a } },
  { key: 'ftPct',      label: 'LF%',       longLabel: 'Réussite aux lancers francs',
    explain: 'Part des lancers francs réussis. Se travaille à l\'entraînement, peu dépendant de l\'adversaire.', sense: 'higher',
    get: m => m.fta  > 0 ? m.ftm  / m.fta  * 100 : null,
    sums: { num: m => m.ftm, den: m => m.fta } },
  { key: 'efgPct',     label: 'eFG%',      longLabel: 'Efficacité globale aux tirs (eFG%)',
    explain: "Réussite au tir en tenant compte du fait qu'un 3 points vaut plus qu'un 2 points. Meilleure mesure d'adresse qu'un pourcentage brut.", sense: 'higher',
    get: m => m.efgPct,
    sums: { num: m => m.fg2m + 1.5 * m.fg3m, den: fgaOf } },
  { key: 'ftRate',     label: 'FT Rate',   longLabel: 'Taux de lancers francs tentés',
    explain: "Lancers francs obtenus pour chaque tir tenté. Mesure l'agressivité vers le cercle.", sense: 'higher',
    get: m => m.ftRate,
    // factor 1 : FT Rate est un ratio (0,28), pas un pourcentage — comme en base et au boxscore.
    sums: { num: m => m.fta, den: fgaOf, factor: 1 } },
  { key: 'ro',         label: 'RO',        longLabel: 'Rebonds offensifs',
    explain: 'Rebonds pris après un tir manqué de son équipe : autant de secondes chances.', sense: 'higher',
    get: m => m.ro },
  { key: 'rd',         label: 'RD',        longLabel: 'Rebonds défensifs',
    explain: "Rebonds pris après un tir manqué de l'adversaire : la possession change de camp.", sense: 'higher',
    get: m => m.rd },
  { key: 'toPct',      label: '%BP',       longLabel: 'Taux de ballons perdus',
    explain: 'Part des possessions terminées par une perte de balle. Un des quatre facteurs de Dean Oliver.', sense: 'lower',
    get: m => m.toPct,
    sums: { num: m => m.bp, den: m => m.possessions } },
  { key: 'orebPct',    label: '%OREB',     longLabel: '% de rebonds offensifs captés',
    explain: 'Part des rebonds offensifs disponibles effectivement captés. Indépendant du nombre de tirs manqués, contrairement au total de RO.', sense: 'higher',
    get: m => m.orebPct,
    sums: { num: m => m.ro, den: m => m.ro + m.opp_rd } },
  { key: 'drebPct',    label: '%DREB',     longLabel: '% de rebonds défensifs captés',
    explain: "Part des rebonds défensifs disponibles captés. Mesure la capacité à clore la possession adverse.", sense: 'higher',
    get: m => m.drebPct,
    sums: { num: m => m.rd, den: m => m.rd + m.opp_ro } },
  { key: 'pd',         label: 'Pd',        longLabel: 'Passes décisives',
    explain: 'Passes ayant directement mené à un panier. Indice de circulation de balle.', sense: 'higher',
    get: m => m.pd },
  { key: 'ct',         label: 'Ct',        longLabel: 'Contres',
    explain: "Tirs adverses contrés. Mesure la protection du cercle, pas la qualité défensive globale.", sense: 'higher',
    get: m => m.ct },
  { key: 'intercepts', label: 'Int',       longLabel: 'Interceptions',
    explain: 'Ballons volés à l\'adversaire. Défense active, mais un excès peut signaler des prises de risque.', sense: 'higher',
    get: m => m.intercepts },
  { key: 'bp',         label: 'Bp',        longLabel: 'Ballons perdus',
    explain: 'Possessions perdues sans tir. À rapporter au rythme de jeu via %BP.', sense: 'lower',
    get: m => m.bp },
  { key: 'fte',        label: 'Fp',        longLabel: 'Fautes provoquées',
    explain: "Fautes subies : autant d'occasions de lancers francs et de fautes accumulées côté adverse.", sense: 'higher',
    get: m => m.fte },
  { key: 'fpr',        label: 'Fte',       longLabel: 'Fautes commises',
    explain: 'Fautes sifflées contre son équipe. Trop de fautes envoie l\'adversaire sur la ligne et fatigue la rotation.', sense: 'lower',
    get: m => m.fpr },
  { key: 'offRating',  label: 'ORtg',      longLabel: 'Efficacité offensive (ORtg)',
    explain: "Points marqués pour 100 possessions. Compare l'attaque indépendamment du rythme de jeu.", sense: 'higher',
    get: m => m.offRating,
    sums: { num: m => m.scoreUs, den: m => m.possessions } },
  { key: 'defRating',  label: 'DRtg',      longLabel: 'Efficacité défensive (DRtg)',
    explain: 'Points encaissés pour 100 possessions. Plus bas = meilleure défense.', sense: 'lower',
    get: m => m.defRating,
    sums: { num: m => m.scoreThem, den: oppPossOf } },
  { key: 'opp_efgPct', label: 'Adv eFG%',  longLabel: 'Efficacité aux tirs subie (adversaire)',
    explain: "Adresse pondérée laissée à l'adversaire. Le meilleur indicateur de défense sur le tir.", sense: 'lower',
    get: m => m.opp_efgPct,
    sums: { num: m => m.opp_fg2m + 1.5 * m.opp_fg3m, den: oppFgaOf } },
  { key: 'opp_toPct',  label: 'Adv %BP',   longLabel: 'Pertes de balle forcées à l\'adversaire',
    explain: "Part des possessions adverses terminées par une perte de balle. Mesure la pression défensive.", sense: 'higher',
    get: m => m.opp_toPct,
    sums: { num: m => m.opp_bp, den: oppPossOf } },
  { key: 'opp_orebPct',label: 'Adv %OREB', longLabel: 'Rebonds offensifs concédés à l\'adversaire',
    explain: 'Part des rebonds offensifs que l\'adversaire récupère : autant de secondes chances offertes.', sense: 'lower',
    get: m => m.opp_orebPct,
    sums: { num: m => m.opp_ro, den: m => m.opp_ro + m.rd } },
];

/** Corrélation de chaque statistique avec la victoire, exprimée en langage simple pour un coach. */
export function computeWinFactors(teamStats: TeamMatchStat[]): WinFactor[] {
  const rows = teamStats.filter(m => VARIABLES.some(v => v.get(m) !== null));
  if (rows.length < MIN_MATCHES) return [];
  const winVals = rows.map(m => m.result === 'win' ? 1 : 0);

  return VARIABLES
    .map(v => {
      const pairs = rows
        .map((m, i) => [v.get(m), winVals[i]] as const)
        .filter((p): p is [number, 0 | 1] => p[0] !== null);
      if (pairs.length < MIN_MATCHES) return null;
      const xs = pairs.map(p => p[0]);
      if (!hasVariance(xs)) return null;
      const corr = pearson(xs, pairs.map(p => p[1]));
      const pVal = pearsonPValue(corr, pairs.length);
      return { key: v.key, label: v.longLabel, corr, n: pairs.length, p: pVal, significant: pVal < SIGNIFICANCE_ALPHA };
    })
    .filter((f): f is WinFactor => f !== null)
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
}

/**
 * Pour chaque joueur, corrèle son évaluation match par match avec le résultat (victoire/défaite)
 * de ces matchs. Un lien positif = ses bons matchs coïncident avec des victoires de l'équipe.
 * Corrélation, pas causalité : à interpréter avec prudence sur de petits échantillons.
 */
export function computePlayerImpact(players: Player[], allStats: MatchStat[]): PlayerImpact[] {
  const byPlayer = new Map<string, MatchStat[]>();
  for (const s of allStats) {
    if (s.eval === null) continue;
    if (!byPlayer.has(s.playerId)) byPlayer.set(s.playerId, []);
    byPlayer.get(s.playerId)!.push(s);
  }

  return players
    .map(p => {
      const ss = byPlayer.get(p.id) ?? [];
      if (ss.length < PLAYER_MIN_MATCHES) return null;
      const xs = ss.map(s => s.eval as number);
      if (!hasVariance(xs)) return null;
      const ys = ss.map(s => s.result === 'win' ? 1 : 0);
      const corr = pearson(xs, ys);
      const pVal = pearsonPValue(corr, ss.length);
      return {
        playerId: p.id, label: playerNameFull(p),
        corr, n: ss.length, p: pVal, significant: pVal < SIGNIFICANCE_ALPHA,
        avgEval: roundedAvg(xs)!,
      };
    })
    .filter((f): f is PlayerImpact => f !== null)
    .sort((a, b) => b.corr - a.corr);
}

/** Part minimale de matchs sur laquelle une variable doit être renseignée pour entrer dans la PCA. */
const PCA_MIN_COVERAGE = 0.8;

/**
 * PCA des stats collectives, sur données COMPLÈTES uniquement.
 *
 * L'ancien filtre admettait un match dès qu'*au moins une* variable était renseignée
 * (`VARIABLES.some`), puis substituait un zéro à chaque valeur manquante (`v.get(m) ?? 0`). Un match
 * dont seul le score était saisi entrait donc avec un vecteur quasi nul. Sur une matrice
 * centrée-réduite, ces lignes deviennent des points extrêmes qui captent une grande part de la
 * variance : les deux axes finissaient par séparer « match documenté » de « match non documenté »
 * plutôt que deux styles de jeu, et le pourcentage de variance expliquée gonflait sans rien
 * expliquer.
 *
 * On choisit donc d'abord les variables suffisamment couvertes, puis on ne garde que les matchs
 * complets sur celles-là. Aucun zéro n'est fabriqué. `matchesDropped` permet de dire au staff
 * combien de matchs sont sortis, au lieu de réduire l'échantillon en silence.
 */
export function computeMatchPCA(teamStats: TeamMatchStat[]): PCAResult | null {
  if (teamStats.length < MIN_MATCHES) return null;

  // Variables renseignées sur au moins 80 % des matchs : une colonne rarement saisie ferait sinon
  // sortir des matchs entiers de l'analyse à elle seule.
  const covered = VARIABLES.filter(v =>
    teamStats.filter(m => v.get(m) !== null).length >= teamStats.length * PCA_MIN_COVERAGE);
  if (covered.length < 2) return null;

  const rows = teamStats.filter(m => covered.every(v => v.get(m) !== null));
  if (rows.length < MIN_MATCHES) return null;
  const matchesDropped = teamStats.length - rows.length;

  const vars = covered.filter(v => hasVariance(rows.map(m => v.get(m) as number)));
  if (vars.length < 2) return null;

  const matrix = rows.map(m => vars.map(v => v.get(m) as number));

  try {
    const pca = new PCA(matrix, { center: true, scale: true, ignoreZeroVariance: true });
    const scores = pca.predict(matrix, { nComponents: 2 }).to2DArray();
    const eigenvectors = pca.getEigenvectors();
    const [pc1, pc2] = pca.getExplainedVariance();

    const maxAbsScore = Math.max(1e-9, ...scores.flat().map(Math.abs));
    const rawVectors = vars.map((v, i) => ({ x: eigenvectors.get(i, 0), y: eigenvectors.get(i, 1), label: v.label }));
    const maxAbsLoading = Math.max(1e-9, ...rawVectors.flatMap(v => [Math.abs(v.x), Math.abs(v.y)]));
    const scale = (maxAbsScore * 0.85) / maxAbsLoading;

    return {
      points: rows.map((m, i) => ({
        x: scores[i][0], y: scores[i][1], win: m.result === 'win',
        label: `${m.opponent} · ${m.date}`,
      })),
      vectors: rawVectors.map(v => ({ x: v.x * scale, y: v.y * scale, label: v.label })),
      varPct: [Math.round(pc1 * 1000) / 10, Math.round(pc2 * 1000) / 10],
      matchesUsed: rows.length,
      matchesDropped,
    };
  } catch {
    return null;
  }
}
