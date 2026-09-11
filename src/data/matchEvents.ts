/**
 * Agrégation du flux d'événements de match — fonctions pures, même convention que
 * `liveTrackingAnalysis.ts` et `tacticalAnalysis.ts`.
 *
 * C'est le point d'ancrage de toute la prise de stats en direct : `boxscoreFromEvents` produit
 * exactement la forme attendue par `statsApi.bulkUpsertForMatch`, donc un match pointé action par
 * action alimente `match_stats` — et derrière, sans une ligne de code supplémentaire, les stats
 * avancées, les Four Factors, la PCA, les archétypes, les objectifs et les rapports.
 *
 * Voir docs/STATS_LIVE.md.
 */
import { playingTime, lineupIntervals } from './liveTrackingAnalysis';
import { shotEventValue } from './shotChart';
import type { MatchEvent, MatchLineupEvent, LineupSide } from './types';

/**
 * Une ligne de boxscore par joueur. Structurellement identique à `BulkStatRow` (api/stats.ts) —
 * volontairement redéfinie ici plutôt qu'importée : `src/data` ne dépend d'aucun module `src/api`,
 * et l'inverser pour un type ferait entrer la couche réseau dans le domaine.
 */
export interface PlayerBoxscoreRow {
  /** Id de le joueur (`players.id` côté nous, `match_opponent_players.id` côté adverse). */
  playerId: string;
  starter: boolean;
  min: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number; fpr: number;
  pts: number;
  eval: number;
  plusMinus: number;
}

/** Points rapportés par un événement — 0 pour tout ce qui n'est pas un tir réussi. */
export function eventPoints(event: MatchEvent): number {
  if (!event.made) return 0;
  if (event.type === 'ft') return 1;
  return shotEventValue(event) ?? 0;
}

/** Le score n'est jamais saisi : il se lit sur les événements. */
export function scoreFromEvents(events: MatchEvent[]): { us: number; them: number } {
  const score = { us: 0, them: 0 };
  for (const e of events) score[e.side] += eventPoints(e);
  return score;
}

/**
 * +/- par joueur, AU POINT PRÈS — là où `playerPlusMinus` (suivi live) travaille à la
 * possession. Chaque point marqué ou encaissé est crédité aux joueurs du camp `side` présents
 * sur le terrain au moment de l'action, d'après l'instantané porté par l'événement.
 *
 * Côté adverse, le résultat est vide tant que les rotations adverses ne sont pas pointées
 * (`onCourtThem`) — un +/- sans cinq connu n'existe pas, et 0 se lirait comme « neutre ».
 */
export function plusMinusFromEvents(events: MatchEvent[], side: LineupSide = 'us'): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of events) {
    const points = eventPoints(e);
    if (points === 0) continue;
    const delta = e.side === side ? points : -points;
    for (const playerId of (side === 'us' ? e.onCourt : e.onCourtThem)) {
      totals.set(playerId, (totals.get(playerId) ?? 0) + delta);
    }
  }
  return totals;
}

function emptyRow(playerId: string): PlayerBoxscoreRow {
  return {
    playerId, starter: false, min: 0,
    fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
    pts: 0, eval: 0, plusMinus: 0,
  };
}

/**
 * Évaluation FFBB : ce qu'on apporte moins ce qu'on gâche.
 *
 * VÉRIFIÉE sur 457 lignes importées de l'eMarque, à la ligne près — c'est cette confrontation qui
 * a révélé que les deux colonnes de fautes étaient lues à l'envers dans toute l'application.
 *
 * Deux pièges qu'elle contient :
 *   • `fpr` sont les fautes PROVOQUÉES, donc un CRÉDIT, malgré son nom.
 *   • Les fautes commises (`fte`) ne sont PAS retranchées. L'index d'efficacité FIBA les
 *     retranche, l'évaluation FFBB non — et c'est l'évaluation FFBB que lit le staff.
 */
export function evaluation(r: PlayerBoxscoreRow): number {
  const missedFg = (r.fg2a - r.fg2m) + (r.fg3a - r.fg3m);
  const missedFt = r.fta - r.ftm;
  return (r.pts + r.ro + r.rd + r.pd + r.ct + r.intercepts + r.fpr)
       - (missedFg + missedFt + r.bp);
}

/**
 * Boxscore d'un camp. Une ligne par joueur ayant une action pointée OU du temps de jeu : un
 * joueur entré 4 minutes sans rien faire a bien joué le match, l'omettre fausserait les minutes
 * d'effectif (dénominateur du %USG/min).
 *
 * `side` sélectionne le camp : `'us'` alimente `match_stats`, `'them'` alimente
 * `opponent_match_stats`. Côté adverse, les événements sans auteur (pointage en agrégé, le cas
 * courant) sont ignorés ici — ils comptent au score et aux totaux collectifs, mais n'ont aucune
 * ligne de boxscore à alimenter.
 *
 * `nowQuarter` / `nowElapsedSeconds` sont le repère « maintenant » du chrono, comme
 * `playingTime` — c'est ce qui permet d'afficher un boxscore juste pendant que le match tourne.
 */
export function boxscoreFromEvents(
  events: MatchEvent[],
  lineupEvents: MatchLineupEvent[],
  periodDurationSeconds: number,
  nowQuarter: number,
  nowElapsedSeconds: number,
  side: LineupSide = 'us',
): PlayerBoxscoreRow[] {
  const rows = new Map<string, PlayerBoxscoreRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) { r = emptyRow(id); rows.set(id, r); }
    return r;
  };

  const seconds = playingTime(lineupEvents, side, nowQuarter, nowElapsedSeconds, periodDurationSeconds);
  for (const [playerId, s] of seconds) row(playerId).min = Math.round(s / 6) / 10;

  // Cinq de départ : le premier changement enregistré du camp EST sa composition de départ
  // (cf. `confirmStarters` du suivi live, qui l'écrit sans joueur sortant).
  const first = lineupEvents
    .filter(e => e.side === side)
    .sort((a, b) => a.seq - b.seq)[0];
  for (const playerId of first?.onCourt ?? []) row(playerId).starter = true;

  for (const e of events) {
    const authorId = side === 'us' ? e.playerId : e.opponentPlayerId;
    if (e.side !== side || !authorId) continue;
    const r = row(authorId);
    switch (e.type) {
      case 'shot': {
        const value = shotEventValue(e);
        if (value === 3) { r.fg3a += 1; if (e.made) r.fg3m += 1; }
        else             { r.fg2a += 1; if (e.made) r.fg2m += 1; }
        break;
      }
      case 'ft':         r.fta += 1; if (e.made) r.ftm += 1; break;
      case 'reb_off':    r.ro += 1;  break;
      case 'reb_def':    r.rd += 1;  break;
      case 'ast':        r.pd += 1;  break;
      case 'stl':        r.intercepts += 1; break;
      case 'blk':        r.ct += 1;  break;
      case 'tov':        r.bp += 1;  break;
      // `fte` = fautes COMMISES, `fpr` = fautes PROVOQUÉES. Les noms disent l'inverse, la base
      // fait foi (cf. schema.sql). C'était inversé ici, donc un match publié depuis la saisie
      // comptait les fautes à l'envers de tous les matchs importés.
      case 'foul':       r.fte += 1; break;
      case 'foul_drawn': r.fpr += 1; break;
    }
  }

  const plusMinus = plusMinusFromEvents(events, side);
  for (const r of rows.values()) {
    r.pts = r.fg2m * 2 + r.fg3m * 3 + r.ftm;
    r.eval = evaluation(r);
    r.plusMinus = plusMinus.get(r.playerId) ?? 0;
  }

  return [...rows.values()].sort((a, b) => b.min - a.min || b.pts - a.pts);
}

/**
 * Totaux collectifs d'un camp, prêts pour `team_match_stats`.
 *
 * À la différence du boxscore, ils comptent TOUTES les actions du camp, y compris celles sans
 * auteur : un panier encaissé pointé en anonyme doit peser sur l'eFG% adverse même s'il n'a aucune
 * ligne individuelle. Somme des boxscores ≠ totaux d'équipe, et c'est voulu.
 */
export function teamTotalsFromEvents(events: MatchEvent[], side: LineupSide): TeamTotals {
  const t: TeamTotals = {
    fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    ro: 0, rd: 0, pd: 0, ct: 0, intercepts: 0, bp: 0, fte: 0, fpr: 0,
    possessions: 0,
  };
  for (const e of events) {
    if (e.side !== side) continue;
    switch (e.type) {
      case 'shot': {
        if (shotEventValue(e) === 3) { t.fg3a += 1; if (e.made) t.fg3m += 1; }
        else                         { t.fg2a += 1; if (e.made) t.fg2m += 1; }
        break;
      }
      case 'ft':         t.fta += 1; if (e.made) t.ftm += 1; break;
      case 'reb_off':    t.ro += 1;  break;
      case 'reb_def':    t.rd += 1;  break;
      case 'ast':        t.pd += 1;  break;
      case 'stl':        t.intercepts += 1; break;
      case 'blk':        t.ct += 1;  break;
      case 'tov':        t.bp += 1;  break;
      case 'foul':       t.fte += 1; break;
      case 'foul_drawn': t.fpr += 1; break;
    }
  }
  t.possessions = Math.round(possessionsFromEvents(events, side) * 10) / 10;
  return t;
}

/**
 * Possessions au sens RYTHME (`fga − rebonds offensifs + ballons perdus + 0,44 × LF tentés`),
 * pour un camp — la formule de `computePossessions`, pas celle du %USG. Les deux comptages
 * coexistent volontairement, cf. docs/CALCULS.md § 4.
 */
export function possessionsFromEvents(events: MatchEvent[], side: MatchEvent['side']): number {
  let fga = 0, fta = 0, ro = 0, tov = 0;
  for (const e of events) {
    if (e.side !== side) continue;
    if (e.type === 'shot') fga += 1;
    else if (e.type === 'ft') fta += 1;
    else if (e.type === 'reb_off') ro += 1;
    else if (e.type === 'tov') tov += 1;
  }
  return fga - ro + tov + 0.44 * fta;
}

/** Totaux d'équipe — mêmes champs que `CollectiveStatInput` (api/stats.ts), redéfinis ici pour
 *  que `src/data` ne dépende d'aucun module `src/api`. */
export interface TeamTotals {
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number;
  intercepts: number; bp: number;
  fte: number; fpr: number;
  possessions: number;
}

export interface EventLineupRow {
  /** Ids joueurs, triés — clé de regroupement stable, indépendante de l'ordre d'entrée. */
  players: string[];
  /** Temps passé ensemble sur le terrain, en secondes. */
  seconds: number;
  /** Possessions du camp observé pendant que ce cinq était en jeu (formule du rythme). */
  possessions: number;
  oppPossessions: number;
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
  /** Points marqués par possession — null tant qu'aucune possession n'est mesurée. */
  pointsPerPossession: number | null;
  oppPointsPerPossession: number | null;
}

function lineupKey(onCourt: string[]): string {
  return [...onCourt].sort().join(',');
}

/**
 * Statistiques par combinaison de cinq, dérivées du flux d'événements — l'équivalent de
 * `lineupStats` (suivi live), mais mesuré à l'action près plutôt qu'à la possession, et avec le
 * TEMPS de chaque cinq : « ce cinq a joué 6:20 pour un +8 » dit bien plus que « +8 ».
 *
 * `pointsFor` est toujours du point de vue du camp observé : côté 'them', ce sont leurs points à
 * eux. Un cinq n'apparaît que s'il a réellement été relevé — un instantané vide ne dit rien d'une
 * rotation en particulier.
 */
export function lineupStatsFromEvents(
  events: MatchEvent[],
  lineupEvents: MatchLineupEvent[],
  side: LineupSide,
  periodDurationSeconds: number,
  nowQuarter: number,
  nowElapsedSeconds: number,
): EventLineupRow[] {
  const rows = new Map<string, EventLineupRow>();
  const row = (onCourt: string[]) => {
    const key = lineupKey(onCourt);
    let r = rows.get(key);
    if (!r) {
      r = {
        players: [...onCourt].sort(), seconds: 0, possessions: 0, oppPossessions: 0,
        pointsFor: 0, pointsAgainst: 0, plusMinus: 0,
        pointsPerPossession: null, oppPointsPerPossession: null,
      };
      rows.set(key, r);
    }
    return r;
  };

  for (const interval of lineupIntervals(lineupEvents, side, nowQuarter, nowElapsedSeconds, periodDurationSeconds)) {
    if (interval.onCourt.length === 0) continue;
    row(interval.onCourt).seconds += interval.seconds;
  }

  // Possessions comptées à la volée sur les mêmes composantes que `possessionsFromEvents` :
  // tirs − rebonds offensifs + ballons perdus + 0,44 × lancers francs.
  const weight = (e: MatchEvent) =>
    e.type === 'shot' ? 1 : e.type === 'ft' ? 0.44 : e.type === 'reb_off' ? -1 : e.type === 'tov' ? 1 : 0;

  for (const e of events) {
    const onCourt = side === 'us' ? e.onCourt : e.onCourtThem;
    if (onCourt.length === 0) continue;
    const r = row(onCourt);
    const points = eventPoints(e);
    if (e.side === side) { r.pointsFor += points;     r.possessions    += weight(e); }
    else                 { r.pointsAgainst += points; r.oppPossessions += weight(e); }
  }

  for (const r of rows.values()) {
    r.plusMinus = r.pointsFor - r.pointsAgainst;
    r.possessions = Math.round(r.possessions * 100) / 100;
    r.oppPossessions = Math.round(r.oppPossessions * 100) / 100;
    r.pointsPerPossession    = r.possessions > 0 ? r.pointsFor / r.possessions : null;
    r.oppPointsPerPossession = r.oppPossessions > 0 ? r.pointsAgainst / r.oppPossessions : null;
  }

  return [...rows.values()].sort((a, b) => b.seconds - a.seconds || b.plusMinus - a.plusMinus);
}
