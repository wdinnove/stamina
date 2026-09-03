/**
 * Agrégation du suivi live (rotations & plays) — fonctions pures, même convention que
 * `tacticalAnalysis.ts`. Domaine séparé : ici pas de dimensions configurables, juste deux flux
 * (possessions attaque/défense, changements de joueuses) à croiser par play, par cinq et par
 * joueuse.
 */
import type { MatchLiveAction, MatchLineupEvent, Play, LineupSide } from './types';
import { rentabiliteColor, type RentabiliteThresholds } from './tacticalAnalysis';

export { rentabiliteColor };
export type { RentabiliteThresholds };

/** Seuils par défaut : rentabilité en points par possession (attaque : plus haut = meilleur ;
 *  défense : plus bas = meilleur, d'où `inversee`). À affiner par équipe plus tard, comme pour le
 *  tactique — pas de configuration dédiée en v1. */
export const OFFENSE_THRESHOLDS: RentabiliteThresholds = { vert: 1, bleu: 0.8, ambre: 0.5 };
export const DEFENSE_THRESHOLDS: RentabiliteThresholds  = { vert: 0.5, bleu: 0.8, ambre: 1, inversee: true };

export interface PlayStatRow {
  playId: string | null;
  playName: string;
  count: number;
  /** Possessions ayant marqué au moins 1 point (0 = ratée, peu importe la raison). */
  successCount: number;
  successRate: number;
  totalPoints: number;
  /** Points par possession — null si aucune action. */
  rentabilite: number | null;
}

/** Une ligne par play utilisé, plus une ligne "Sans play" pour les actions non rattachées —
 *  jamais écartée : une action sans play reste une possession réelle dans le dénominateur. */
export function playStats(actions: MatchLiveAction[], plays: Play[]): PlayStatRow[] {
  const nameById = new Map(plays.map(p => [p.id, p.name]));
  const rows = new Map<string, PlayStatRow>();

  for (const a of actions) {
    const key = a.playId ?? '__none__';
    let row = rows.get(key);
    if (!row) {
      row = {
        playId: a.playId ?? null,
        playName: a.playId ? (nameById.get(a.playId) ?? 'Play supprimé') : 'Sans play',
        count: 0, successCount: 0, successRate: 0, totalPoints: 0, rentabilite: null,
      };
      rows.set(key, row);
    }
    row.count += 1;
    if (a.points > 0) row.successCount += 1;
    row.totalPoints += a.points;
  }

  for (const row of rows.values()) {
    row.successRate = row.count > 0 ? row.successCount / row.count : 0;
    row.rentabilite = row.count > 0 ? row.totalPoints / row.count : null;
  }

  return [...rows.values()].sort((a, b) => b.count - a.count);
}

export interface LineupStatRow {
  /** Ids joueuses, triés — sert de clé de regroupement stable indépendamment de l'ordre d'entrée. */
  players: string[];
  possessionsOffense: number;
  possessionsDefense: number;
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
}

function lineupKey(onCourt: string[]): string {
  return [...onCourt].sort().join(',');
}

/** Une ligne par combinaison de cinq réellement vue sur le terrain — jamais affichée pour une
 *  action sans cinq renseigné (`onCourt` vide), qui ne dit rien d'une rotation en particulier. */
export function lineupStats(actions: MatchLiveAction[]): LineupStatRow[] {
  const rows = new Map<string, LineupStatRow>();

  for (const a of actions) {
    if (a.onCourt.length === 0) continue;
    const key = lineupKey(a.onCourt);
    let row = rows.get(key);
    if (!row) {
      row = {
        players: [...a.onCourt].sort(),
        possessionsOffense: 0, possessionsDefense: 0, pointsFor: 0, pointsAgainst: 0, plusMinus: 0,
      };
      rows.set(key, row);
    }
    if (a.side === 'offense') {
      row.possessionsOffense += 1;
      row.pointsFor += a.points;
    } else {
      row.possessionsDefense += 1;
      row.pointsAgainst += a.points;
    }
  }

  for (const row of rows.values()) {
    row.plusMinus = row.pointsFor - row.pointsAgainst;
  }

  return [...rows.values()].sort((a, b) => (b.possessionsOffense + b.possessionsDefense) - (a.possessionsOffense + a.possessionsDefense));
}

/** +/- par joueuse (nous uniquement) : points marqués moins points encaissés pendant qu'elle
 *  était sur le terrain, tous cinq confondus — la même mécanique que `lineupStats`, mais
 *  répartie joueuse par joueuse plutôt que par combinaison exacte. */
export function playerPlusMinus(actions: MatchLiveAction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of actions) {
    const delta = a.side === 'offense' ? a.points : -a.points;
    for (const playerId of a.onCourt) {
      totals.set(playerId, (totals.get(playerId) ?? 0) + delta);
    }
  }
  return totals;
}

/**
 * Temps de jeu par joueuse, en secondes (un seul banc à la fois : appeler séparément pour 'us' et
 * 'them' si besoin). Dérivé des changements de banc, jamais stocké : chaque écart entre deux
 * changements consécutifs (ou entre le dernier changement et `nowQuarter`/`nowElapsedSeconds`, le
 * repère "maintenant" pour un match en cours) est crédité à chaque joueuse du cinq de l'intervalle.
 *
 * `periodDurationSeconds` est supposé constant sur tout le match, prolongations comprises — même
 * simplification que `useMatchClock` — pour convertir (quarter, gameTimeSeconds) en un axe de
 * temps continu et ainsi compter juste un intervalle qui chevauche une fin de quart-temps.
 */
export function playingTime(
  lineupEvents: MatchLineupEvent[],
  side: LineupSide,
  nowQuarter: number,
  nowElapsedSeconds: number,
  periodDurationSeconds: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  const events = lineupEvents.filter(e => e.side === side).sort((a, b) => a.seq - b.seq);
  const toAbsolute = (quarter: number, elapsed: number) => (quarter - 1) * periodDurationSeconds + elapsed;

  for (let i = 0; i < events.length; i++) {
    const start = toAbsolute(events[i].quarter, events[i].gameTimeSeconds);
    const end = i + 1 < events.length
      ? toAbsolute(events[i + 1].quarter, events[i + 1].gameTimeSeconds)
      : toAbsolute(nowQuarter, nowElapsedSeconds);
    const duration = Math.max(0, end - start);
    for (const playerId of events[i].onCourt) {
      totals.set(playerId, (totals.get(playerId) ?? 0) + duration);
    }
  }

  return totals;
}

/**
 * Recalcule les instantanés `onCourt` après la suppression d'un changement de banc — seul cas où
 * une suppression a un effet en cascade (une action, elle, ne détermine jamais l'état d'une autre
 * ligne). Rejoue chaque banc séparément dans l'ordre de rang (`seq`), puis retrouve pour chaque
 * action le dernier cinq connu de chaque banc à son (quarter, gameTimeSeconds).
 *
 * Pure — ne touche pas la base : à l'appelant de comparer avant/après et de persister les seules
 * lignes dont `onCourt` a réellement changé.
 */
export function recomputeOnCourtSnapshots(
  lineupEvents: MatchLineupEvent[],
  actions: MatchLiveAction[],
): { lineupEvents: MatchLineupEvent[]; actions: MatchLiveAction[] } {
  const bySide: Record<LineupSide, MatchLineupEvent[]> = { us: [], them: [] };
  for (const e of lineupEvents) bySide[e.side].push(e);
  (Object.keys(bySide) as LineupSide[]).forEach(side => bySide[side].sort((a, b) => a.seq - b.seq));

  const recomputedEvents: MatchLineupEvent[] = [];
  const snapshotsBySide: Record<LineupSide, { quarter: number; time: number; onCourt: string[] }[]> = { us: [], them: [] };

  for (const side of Object.keys(bySide) as LineupSide[]) {
    let current: string[] = [];
    for (const e of bySide[side]) {
      current = current.filter(id => !e.playersOut.includes(id));
      for (const id of e.playersIn) if (!current.includes(id)) current.push(id);
      recomputedEvents.push({ ...e, onCourt: current });
      snapshotsBySide[side].push({ quarter: e.quarter, time: e.gameTimeSeconds, onCourt: current });
    }
  }

  function onCourtAt(side: LineupSide, quarter: number, time: number): string[] {
    let result: string[] = [];
    for (const snap of snapshotsBySide[side]) {
      if (snap.quarter < quarter || (snap.quarter === quarter && snap.time <= time)) result = snap.onCourt;
      else break;
    }
    return result;
  }

  const recomputedActions = actions.map(a => ({
    ...a,
    onCourt: onCourtAt('us', a.quarter, a.gameTimeSeconds),
    onCourtThem: onCourtAt('them', a.quarter, a.gameTimeSeconds),
  }));

  return { lineupEvents: recomputedEvents, actions: recomputedActions };
}

/** Libellé d'un quart-temps — au-delà de 4, prolongations numérotées à partir de 1. Même
 *  convention d'affichage que `matches.quarterScores` (`Q{i+1}` puis `P{i-3}`, cf.
 *  `MatchFormModal`) : un même match ne doit pas afficher deux vocabulaires différents pour
 *  le même quart-temps selon l'écran consulté. */
export function periodLabel(quarter: number): string {
  return quarter <= 4 ? `Q${quarter}` : `P${quarter - 4}`;
}

/** Formate des secondes en mm:ss, pour l'affichage du chrono interne. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
