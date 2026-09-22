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
import { periodSeconds, absoluteSeconds } from './matchClock';
import { shotEventValue } from './shotChart';
import type { MatchEvent, MatchEventType, MatchLineupEvent, LineupSide } from './types';

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

/** Nom court de chaque type d'action, en français — la seule liste, partagée par l'écran de saisie
 *  et l'export. Court volontairement : elle s'affiche dans des puces d'historique. */
export const EVENT_LABELS: Record<MatchEventType, string> = {
  shot: 'Tir', ft: 'LF', reb_off: 'Rebond off.', reb_def: 'Rebond déf.', ast: 'Passe déc.',
  stl: 'Interception', blk: 'Contre', tov: 'Ballon perdu', foul: 'Faute', foul_drawn: 'Faute provoquée',
  period_end: 'Fin de quart-temps', match_end: 'Fin de match',
};

/**
 * `period_end`/`match_end` : des repères posés par le coach, jamais des statistiques.
 *
 * Personne n'a besoin de ce garde-fou pour les CALCULS : aucun `switch`/`if` d'agrégation
 * (boxscore, totaux, possessions, +/-) n'a de cas pour ces deux types, donc ils y tombent déjà à
 * zéro sans qu'on ait à les exclure explicitement. Cette fonction sert à deux endroits qui, eux,
 * ont vraiment besoin de LE SAVOIR : l'affichage du libellé dans l'historique (`eventText`, pas de
 * suffixe auteur pour un repère) et `useMatchTracking`/`LiveTrackingPanel`, qui filtrent les
 * repères des écrans de LECTURE (courbe, QT par QT, grille de tir, lineups, compteurs d'actions) —
 * le play-by-play CSV, lui, les affiche volontairement (testé exprès dans playByPlay.test.ts).
 */
export function isMilestoneEvent(type: MatchEventType): boolean {
  return type === 'period_end' || type === 'match_end';
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

export type TrackerHistoryEntry =
  | { kind: 'event';  quarter: number; gameTimeSeconds: number; event: MatchEvent }
  | { kind: 'lineup'; quarter: number; gameTimeSeconds: number; lineup: MatchLineupEvent };

/**
 * Historique de l'écran de saisie : actions ET changements de banc, mêlés, le plus récent d'abord.
 *
 * Les deux flux vivent dans deux tables et ont chacun leur propre `seq` : seul le repère de jeu
 * (quart-temps, temps écoulé) permet de les ordonner l'un par rapport à l'autre. Un changement
 * enregistré au même instant qu'une action passe AVANT elle — un changement se fait sur ballon
 * mort, le jeu reprend ensuite. C'est une convention, pas une déduction : rien dans les données ne
 * tranche, et l'inverse ferait lire « panier puis changement » là où le coach a vu l'inverse.
 */
export function trackerHistory(events: MatchEvent[], lineupEvents: MatchLineupEvent[]): TrackerHistoryEntry[] {
  const entries: TrackerHistoryEntry[] = [
    ...lineupEvents.map(l => ({ kind: 'lineup' as const, quarter: l.quarter, gameTimeSeconds: l.gameTimeSeconds, lineup: l })),
    ...events.map(e => ({ kind: 'event' as const, quarter: e.quarter, gameTimeSeconds: e.gameTimeSeconds, event: e })),
  ];

  return entries.sort((a, b) => {
    if (a.quarter !== b.quarter) return b.quarter - a.quarter;
    if (a.gameTimeSeconds !== b.gameTimeSeconds) return b.gameTimeSeconds - a.gameTimeSeconds;
    if (a.kind !== b.kind) return a.kind === 'lineup' ? 1 : -1;   // à égalité, le changement dessous
    return a.kind === 'event' && b.kind === 'event'
      ? b.event.seq - a.event.seq
      : (a as { lineup: MatchLineupEvent }).lineup.seq - (b as { lineup: MatchLineupEvent }).lineup.seq;
  });
}

/**
 * Ordre CHRONOLOGIQUE d'un flux d'actions : quart-temps, puis temps, puis rang de saisie.
 *
 * Ce n'est pas l'ordre de saisie. Les deux coïncidaient tant que le temps d'une action ne pouvait
 * pas être corrigé ; depuis qu'il le peut (`editableActionTimeWindow`), trier par rang ferait repartir
 * la courbe d'écart en arrière, terminer une série avant qu'elle ne commence, et sortir un CSV
 * dont les temps ne se suivent plus. Le rang ne sert plus qu'à départager deux actions du même
 * instant — fréquent quand le chrono est à l'arrêt.
 */
export function byGameTime(a: MatchEvent, b: MatchEvent): number {
  return a.quarter - b.quarter || a.gameTimeSeconds - b.gameTimeSeconds || a.seq - b.seq;
}

export interface TimeWindow {
  /** Bornes INCLUSIVES, en secondes écoulées depuis le début du quart-temps. */
  min: number;
  max: number;
}

/**
 * Bornes dans lesquelles le temps d'une ACTION peut être corrigé — n'importe lesquelles dans le
 * quart-temps choisi (`quarter`, celui de la correction candidate, pas forcément le quart-temps
 * d'origine). Son instantané de cinq (`onCourt`/`onCourtThem`) est recalculé à chaque correction
 * (`onCourtAt`), pas figé — elle peut donc changer de temps ET de quart-temps librement.
 */
export function editableActionTimeWindow(quarter: number, regulationSeconds: number): TimeWindow {
  return { min: 0, max: periodSeconds(quarter, regulationSeconds) };
}

/**
 * Bornes dans lesquelles le temps d'un CHANGEMENT DE BANC peut être corrigé sans rendre faux ce
 * qui est déjà enregistré — entre les deux saisies qui l'encadrent DANS SON PROPRE quart-temps
 * (actions comprises) : ce sont D'AUTRES lignes, jamais recalculées, qui portent son effet — le
 * déplacer au-delà les invaliderait en silence. Son quart-temps, lui, ne se corrige pas ici : il
 * détermine les scores par quart-temps publiés, et le réparer est une autre opération.
 *
 * À temps ÉGAL, la convention de `trackerHistory` tranche : le changement précède l'action. Un
 * changement posé au même instant borne donc l'action par le bas, et une action au même instant
 * borne le changement par le haut. C'est ce qui laisse de la place quand le chrono est à l'arrêt
 * et que toute une série de saisies porte le même temps.
 */
export function editableLineupTimeWindow(
  target: Extract<TrackerHistoryEntry, { kind: 'lineup' }>,
  events: MatchEvent[],
  lineupEvents: MatchLineupEvent[],
  regulationSeconds: number,
): TimeWindow {
  const t = target.gameTimeSeconds;
  const neighbours: number[] = [
    ...lineupEvents
      .filter(l => l.quarter === target.quarter && !(l.side === target.lineup.side && l.seq === target.lineup.seq))
      .map(l => l.gameTimeSeconds),
    ...events.filter(e => e.quarter === target.quarter).map(e => e.gameTimeSeconds),
  ];
  const before = neighbours.filter(s => s < t);
  const after  = neighbours.filter(s => s >= t);

  return {
    min: before.length > 0 ? Math.max(...before) : 0,
    max: after.length  > 0 ? Math.min(...after)  : periodSeconds(target.quarter, regulationSeconds),
  };
}

/**
 * Cinq sur le terrain à un instant donné — le dernier changement de banc à cet instant ou avant,
 * y compris à travers un changement de quart-temps. Sert à recalculer l'instantané d'une action
 * déplacée par `editableActionTimeWindow`.
 *
 * Implémentation partagée avec `recomputeOnCourtSnapshots` (même question posée là pour une autre
 * raison : reconstituer l'historique après une suppression) — une seule réponse à « qui était sur
 * le terrain à cet instant », pas deux qui pourraient un jour diverger. Prend une liste DÉJÀ
 * ramenée à un seul banc : filtrer par `side` reste à la charge de l'appelant.
 */
export { onCourtAt } from './liveTrackingAnalysis';

export interface BackwardsLineupChange {
  side: LineupSide;
  /** Le changement précédent, puis celui qui est daté avant lui — les objets `MatchLineupEvent`
   *  EUX-MÊMES (mêmes références que dans `lineupEvents`), pas un sous-ensemble : l'écran en a
   *  besoin en entier (joueurs entrés/sortis) pour les nommer, et les comparer par référence évite
   *  de les re-rechercher par `seq` une seconde fois. */
  previous: MatchLineupEvent;
  current:  MatchLineupEvent;
}

/**
 * Premier changement de banc daté AVANT celui qui le précède — le seul cas où du temps de jeu
 * disparaît vraiment.
 *
 * `lineupIntervals` mesure chaque intervalle entre deux changements consécutifs et borne à zéro un
 * résultat négatif : le cinq concerné est alors crédité de zéro seconde, en silence. La cause
 * habituelle est un quart-temps qu'on a oublié d'avancer avant de poser le temps du suivant.
 *
 * Ne regarde QUE les changements, et délibérément pas les actions. Le temps d'une action ne sert
 * à aucun calcul de durée : deux actions dans le désordre ne coûtent rien, et les signaler
 * faisait apparaître une alerte permanente au premier recalage du chrono en arrière — ou à la
 * première correction de temps, qui est justement là pour ça.
 *
 * La comparaison se fait sur l'axe ABSOLU, comme `lineupIntervals` : c'est la définition exacte
 * du dégât, pas une approximation.
 */
export function backwardsLineupChange(
  lineupEvents: MatchLineupEvent[],
  regulationSeconds: number,
): BackwardsLineupChange | null {
  const at = (e: MatchLineupEvent) => absoluteSeconds(e.quarter, e.gameTimeSeconds, regulationSeconds);

  for (const side of ['us', 'them'] as LineupSide[]) {
    const stream = lineupEvents.filter(l => l.side === side).sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < stream.length; i++) {
      if (at(stream[i]) < at(stream[i - 1])) {
        return { side, previous: stream[i - 1], current: stream[i] };
      }
    }
  }
  return null;
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

/** Colonnes triables d'un tableau de combinaisons. `players` trie sur les NOMS affichés, pas sur
 *  les identifiants — c'est ce que lit l'utilisateur. */
export const LINEUP_SORT_KEYS = [
  'players', 'seconds', 'possessions', 'pointsPerPossession',
  'oppPointsPerPossession', 'pointsFor', 'pointsAgainst', 'plusMinus',
] as const;
export type LineupSortKey = typeof LINEUP_SORT_KEYS[number];

/**
 * Tri d'un tableau de combinaisons, partagé par l'écran de saisie et l'onglet Lineups — deux
 * tableaux des mêmes lignes ne peuvent pas se trier différemment.
 *
 * Un ratio `null` n'est pas zéro : c'est « aucune possession mesurée ». Il tombe en bas du tableau
 * dans les DEUX sens, plutôt que de se faire passer pour la pire performance de la soirée.
 */
export function sortLineupRows(
  rows: EventLineupRow[],
  key: LineupSortKey,
  dir: 'asc' | 'desc',
  nameOf: (id: string) => string,
): EventLineupRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'players') {
      return sign * a.players.map(nameOf).join(', ').localeCompare(b.players.map(nameOf).join(', '));
    }
    const va = a[key];
    const vb = b[key];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return sign * (va - vb) || b.seconds - a.seconds;
  });
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
