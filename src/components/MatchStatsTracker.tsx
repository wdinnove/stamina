import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Undo2, Trash2, ChevronDown, Repeat2, ClipboardList, Settings, Upload, AlertTriangle, X } from 'lucide-react';
import { DiagramCourt } from './DiagramCourt';
import { ShotGrid, SHOT_COLORS } from './ShotChart';
import { PlayerAvatar } from './PlayerAvatar';
import { Modal } from './Modal';
import { MatchScoreboard, scoreboardBtn } from './MatchScoreboard';
import { matchEventsApi } from '../api/matchEvents';
import { enqueueInsert, enqueueDelete, flushQueue, pendingCount, subscribeQueue, takeResyncFlag } from '../api/matchEventQueue';
import { matchLiveApi } from '../api/matchLive';
import { statsApi, type BulkStatRow, type OpponentStatInput } from '../api/stats';
import { matchesApi } from '../api/matches';
import { useMatchClock, PERIOD_PRESETS_MIN } from '../hooks/useMatchClock';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { COURT_SIZE } from '../utils/diagram';
import { periodLabel, formatClock } from '../data/liveTrackingAnalysis';
import { boxscoreFromEvents, scoreFromEvents, eventPoints, lineupStatsFromEvents, teamTotalsFromEvents } from '../data/matchEvents';
import { shotEventValue, shotValue, shotZone, ZONE_LABELS } from '../data/shotChart';
import { playerNameShort, playerNameFull } from '../utils/playerName';
import type {
  Match, Player, MatchEvent, MatchEventType, MatchLineupEvent, MatchOpponentPlayer, LineupSide,
} from '../data/types';

/**
 * Prise de statistiques en direct — l'écran de saisie action par action (docs/STATS_LIVE.md).
 *
 * DEUX NIVEAUX D'ÉCRITURE, et c'est la clé de l'écran. Les actions partent dans `match_events` au
 * fil de l'eau — table que personne d'autre ne lit, donc sans conséquence sur aucun calcul, et qui
 * protège d'un téléphone qui meurt en plein match. `match_stats`, `opponent_match_stats`,
 * `team_match_stats` et le score, eux, ne s'écrivent que sur PUBLICATION explicite : un match en
 * cours y mettrait des demi-vérités, et à la mi-temps un joueur à 4 points ferait chuter sa
 * moyenne de saison.
 *
 * Rotations, feuille de match et effectif adverse sont PARTAGÉS avec le suivi live (mêmes tables) :
 * un cinq posé là-bas est déjà posé ici.
 *
 * L'ORDRE DE SAISIE EST LIBRE, et c'est le principe central de l'écran : la position d'un tir est
 * l'information périssable (on oublie l'endroit exact en deux secondes, jamais qui a tiré), donc
 * poser le point d'abord doit être possible. Les deux chemins mènent au même événement :
 *   joueuse → terrain → ✓/✗        (on sait déjà qui)
 *   terrain → joueuse → ✓/✗        (on fige l'endroit, on attribue ensuite)
 * Les autres actions restent à deux taps : joueuse → bouton de la palette.
 *
 * Les CHANGEMENTS sont derrière un mode explicite : la sélection sert à saisir des stats, et une
 * rotation déclenchée par le même tap sortait du terrain la joueuse simplement « armée » pour la
 * prochaine action — un tap silencieux qui corrompait minutes, +/- et instantanés `onCourt`.
 */

export interface MatchStatsTrackerProps {
  match: Match;
  players: Player[];
  canEdit: boolean;
}

/** Joueuse armée pour la prochaine action. `id: null` n'existe que côté adverse (pointage anonyme). */
type Selection = { side: LineupSide; id: string | null };
/** Joueuse désignée dans un changement, quel que soit le sens du geste (terrain ou banc d'abord). */
export type RosterOrigin = 'court' | 'bench';
type PendingSub = { side: LineupSide; id: string; from: RosterOrigin } | null;

export type SubResolution =
  | { kind: 'mark';  id: string; from: RosterOrigin }
  | { kind: 'clear' }
  | { kind: 'enter'; incoming: string }
  | { kind: 'swap';  incoming: string; outgoing: string }
  | { kind: 'none' };

/**
 * Que fait un tap sur une joueuse EN MODE CHANGEMENT — pure, donc testable sans DOM.
 *
 * Geste à deux taps qui marche dans les deux sens (sortante d'abord ou entrante d'abord) :
 * imposer un ordre obligeait à faire l'aller-retour entre le haut et le bas de la colonne à
 * chaque rotation. Retaper la même joueuse annule ; taper une autre du même côté déplace
 * simplement la désignation.
 *
 * Les deux bancs passent par ici, d'où le paramètre `side` : une désignation en attente sur un
 * banc ne peut pas se conclure sur l'autre — taper une joueuse adverse après avoir désigné une
 * des nôtres recommence simplement de ce côté-là, plutôt que de fabriquer un changement croisé.
 *
 * C'est le SEUL endroit qui décide qui sort et qui entre, et il est isolé pour cette raison : la
 * version précédente prenait comme sortante la joueuse « armée pour la saisie », si bien qu'un
 * tap sur le banc sortait du terrain quelqu'un qui venait juste de prendre un rebond.
 */
export function resolveSubstitution(
  onCourt: string[],
  pending: PendingSub,
  side: LineupSide,
  playerId: string,
  from: RosterOrigin,
): SubResolution {
  // Une désignation faite sur l'autre banc ne compte pas ici : on repart de zéro de ce côté.
  const current = pending && pending.side === side ? pending : null;

  // Cinq incomplet : le banc fait entrer directement, sans second tap.
  if (onCourt.length < 5 && from === 'bench') return { kind: 'enter', incoming: playerId };
  if (!current) return from === 'court' ? { kind: 'mark', id: playerId, from } : { kind: 'none' };
  if (current.id === playerId) return { kind: 'clear' };
  if (current.from === from)   return { kind: 'mark', id: playerId, from };
  return from === 'bench'
    ? { kind: 'swap', incoming: playerId,   outgoing: current.id }
    : { kind: 'swap', incoming: current.id, outgoing: playerId };
}

export type LineupWrite =
  | { kind: 'push';  onCourt: string[] }
  | { kind: 'amend'; seq: number; playersIn: string[]; onCourt: string[] };

/**
 * Que faire quand un joueur entre sur un terrain incomplet — pure, donc testable sans DOM.
 *
 * Tant que le cinq SE COMPOSE, la même ligne de rotation est réécrite au lieu d'en empiler une
 * par joueur. `boxscoreFromEvents` lit les titulaires dans la première ligne du camp : cinq
 * lignes successives ne lui en donnaient qu'un, et l'analyse des lineups affichait en prime
 * quatre combinaisons parasites à 1, 2, 3 et 4 joueurs.
 *
 * `last` est la dernière ligne du banc concerné. Une ligne en composition se reconnaît à trois
 * signes réunis : personne n'en sort, quelqu'un y est déjà, et le cinq n'est pas complet. Après
 * un changement (`playersOut` non vide) on empile toujours.
 */
export function resolveLineupEntry(last: MatchLineupEvent | undefined, playerId: string): LineupWrite {
  const onCourt = [...(last?.onCourt ?? []), playerId];
  const composing = last && last.playersOut.length === 0 && last.onCourt.length > 0 && last.onCourt.length < 5;
  return composing
    ? { kind: 'amend', seq: last.seq, playersIn: [...last.playersIn, playerId], onCourt }
    : { kind: 'push', onCourt };
}

/** Ce que la publication va REMPLACER — relevé juste avant d'ouvrir la confirmation, pour que
 *  l'alerte parle du contenu réel du match et pas d'un cas général. */
interface ExistingStats { players: number; opponents: number; team: boolean; scoreUs: number | null; scoreThem: number | null }

/**
 * Comment les tirs se saisissent. Choix de l'OPÉRATEUR, pas du match : certains posent chaque tir
 * sur le terrain, d'autres suivent un match trop rapide pour ça et veulent deux taps. Conservé par
 * navigateur, jamais en base — c'est une habitude de saisie, pas une donnée du match.
 *
 * En mode `buttons`, les tirs partent avec une valeur FIGÉE et sans position : ils comptent au
 * boxscore, au score et aux totaux, mais pas aux grilles de tir. C'est l'échange assumé.
 */
export type ShotInput = 'court' | 'buttons';

const SHOT_INPUT_KEY = 'stamina.shotInput';

function readShotInput(): ShotInput {
  try {
    return localStorage.getItem(SHOT_INPUT_KEY) === 'buttons' ? 'buttons' : 'court';
  } catch {
    return 'court';
  }
}

/** Cible tactile minimale. Un chip de banc à 22 px était la plus petite cible de l'écran alors
 *  qu'elle déclenche une rotation — petite cible, grosse conséquence. */
const TAP = 44;

/** Actions montrées dans le bandeau sous le score. Trois tiennent sur la ligne sans la faire
 *  défiler ; au-delà, c'est de la relecture et pas du contrôle de saisie, ça vit dans le
 *  dépliant. */
const RECENT_COUNT = 3;

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 12,
};

const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 8px',
};

const SMALL_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 38, height: 36,
  padding: '0 10px', borderRadius: 6,
  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8',
  fontSize: '0.75rem', cursor: 'pointer',
};

const INPUT: React.CSSProperties = {
  height: TAP, padding: '0 8px', backgroundColor: '#0D0F14', border: '1px dashed #2A2F3A',
  borderRadius: 6, color: '#F1F5F9', fontSize: '0.8rem',
};

/**
 * Palette de saisie, identique pour les deux camps : DEUX boutons par ligne, groupés par thème.
 * Chercher « Faute reçue » dans une grille de dix cases sans repère coûte une seconde à chaque
 * fois ; groupées par paires nommées, on vise le groupe puis le côté, sans lire les dix libellés.
 *
 * Les libellés sont écrits en toutes lettres, pas en acronymes : un écran utilisé quelques fois
 * par mois ne peut pas supposer un jargon mémorisé.
 *
 * `chain` marque les boutons mis en avant après un tir : rebond après un raté, passe décisive
 * après un réussi — la suite quasi certaine, jamais imposée par une modale.
 */
const PALETTE_GROUPS: {
  title: string;
  buttons: { type: MatchEventType; label: string; made?: boolean; chain?: 'reb' | 'ast'; tone?: string }[];
}[] = [
  { title: 'Lancers francs', buttons: [
    { type: 'ft', label: 'Réussi', made: true,  tone: '#00E5A0' },
    { type: 'ft', label: 'Manqué', made: false, tone: '#EF4444' },
  ]},
  { title: 'Rebonds', buttons: [
    { type: 'reb_def', label: 'Rebond défensif', chain: 'reb' },
    { type: 'reb_off', label: 'Rebond offensif', chain: 'reb' },
  ]},
  { title: 'Création', buttons: [
    { type: 'ast', label: 'Passe décisive', chain: 'ast' },
    { type: 'tov', label: 'Ballon perdu' },
  ]},
  { title: 'Défense', buttons: [
    { type: 'stl', label: 'Interception' },
    { type: 'blk', label: 'Contre' },
  ]},
  { title: 'Fautes', buttons: [
    { type: 'foul',       label: 'Faute commise' },
    { type: 'foul_drawn', label: 'Faute reçue' },
  ]},
];

/** Repli sous le terrain : un tir dont on n'a pas eu le temps de prendre la position. La valeur
 *  est figée ici plutôt que déduite de la géométrie — c'est le seul cas où elle l'est. */
const NO_POSITION_SHOTS: { label: string; made: boolean; value: 2 | 3 }[] = [
  { label: '2 ✓', made: true,  value: 2 },
  { label: '2 ✗', made: false, value: 2 },
  { label: '3 ✓', made: true,  value: 3 },
  { label: '3 ✗', made: false, value: 3 },
];

const EVENT_LABELS: Record<MatchEventType, string> = {
  shot: 'Tir', ft: 'LF', reb_off: 'Rebond off.', reb_def: 'Rebond déf.', ast: 'Passe déc.',
  stl: 'Interception', blk: 'Contre', tov: 'Ballon perdu', foul: 'Faute', foul_drawn: 'Faute reçue',
};

export function MatchStatsTracker({ match, players, canEdit }: MatchStatsTrackerProps) {
  const clock = useMatchClock(match.id);
  const { selected } = useTeamSeason();
  const teamColor    = selected?.team.color ?? '#00E5A0';
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineupEvents, setLineupEvents] = useState<MatchLineupEvent[]>([]);
  const [opponents, setOpponents] = useState<MatchOpponentPlayer[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  /** Tir posé sur le terrain, en attente de son auteur et/ou de son ✓/✗. */
  const [pendingShot, setPendingShot] = useState<{ x: number; y: number } | null>(null);
  /** Action choisie avant son auteur — le pendant exact de `pendingShot` pour la palette. */
  const [pendingAction, setPendingAction] = useState<{ type: MatchEventType; made?: boolean; label: string; value?: 2 | 3 } | null>(null);
  const [chain, setChain] = useState<'reb' | 'ast' | null>(null);
  const [subMode, setSubMode] = useState(false);
  const [pendingSub, setPendingSub] = useState<PendingSub>(null);
  /**
   * Joueurs RETENUS pour ce match — la feuille de match, vide au départ : on compose le groupe du
   * jour plutôt que d'écarter les absents d'un effectif de saison entier. C'est le geste réel du
   * coach, et c'est aussi exactement ce qui sera écrit dans `match_roster`.
   */
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showOpponentSheet, setShowOpponentSheet] = useState(false);
  const [boxscoreSide, setBoxscoreSide] = useState<LineupSide>('us');
  const [showBoxscore, setShowBoxscore] = useState(false);
  const [showLineups, setShowLineups] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [lineupSide, setLineupSide] = useState<LineupSide>('us');
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [shotInput, setShotInputState] = useState<ShotInput>(readShotInput);

  function setShotInput(mode: ShotInput) {
    setShotInputState(mode);
    setPendingShot(null);   // un point posé n'a plus d'endroit où s'afficher
    try { localStorage.setItem(SHOT_INPUT_KEY, mode); } catch { /* navigation privée */ }
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publishState, setPublishState] = useState<'idle' | 'checking' | 'saving'>('idle');
  const [publishTarget, setPublishTarget] = useState<ExistingStats | null>(null);
  const [publishedAt, setPublishedAt] = useState<Date | null>(null);
  /** Actions saisies mais pas encore enregistrées — réseau coupé, ou serveur qui refuse. */
  const [pending, setPending] = useState(pendingCount());
  const courtRef = useRef<SVGSVGElement>(null);

  /**
   * Chargement du match. Les rotations, la feuille et l'effectif adverse sont PARTAGÉS avec le
   * suivi live (mêmes tables) : un cinq posé là-bas est déjà posé ici, et inversement.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [evts, lineups, opps, roster] = await Promise.all([
        matchEventsApi.getByMatchId(match.id),
        matchLiveApi.getLineupEvents(match.id),
        matchLiveApi.getOpponentPlayers(match.id),
        matchLiveApi.getRoster(match.id),
      ]);
      setEvents(evts);
      setLineupEvents(lineups);
      setOpponents(opps);
      setRosterIds(new Set(roster));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [match.id]);

  useEffect(() => { load(); }, [load]);

  /**
   * File d'attente : l'écran affiche ce qui n'est pas encore parti, et se recharge si un rang a dû
   * être réattribué (deux saisisseurs sur le même match). Un `flushQueue` au montage reprend ce
   * qu'une session précédente aurait laissé en plan.
   */
  useEffect(() => subscribeQueue(() => {
    setPending(pendingCount());
    if (takeResyncFlag()) void load();
  }), [load]);

  useEffect(() => {
    flushQueue().then(err => { if (err) setError(err.message); });
  }, []);

  /**
   * Écriture au fil de l'eau : l'écran applique le geste tout de suite et enregistre derrière.
   * En cas d'échec, un bandeau le dit et l'état local est CONSERVÉ — perdre une action déjà
   * affichée en plein match serait pire que la divergence, et le rechargement de la page
   * repartira de ce que la base contient réellement. La file d'attente hors-ligne est l'étape
   * suivante (docs/STATS_LIVE.md, phase 2).
   */
  const persist = useCallback((run: () => Promise<unknown>) => {
    run().catch(err => setError(err instanceof Error ? err.message : "Erreur d'enregistrement"));
  }, []);

  /** Le fil d'Ariane s'éteint tout seul : sans réponse en 6 s, la séquence est passée. */
  useEffect(() => {
    if (!chain) return;
    const t = setTimeout(() => setChain(null), 6000);
    return () => clearTimeout(t);
  }, [chain]);

  /** Le cinq courant de CHAQUE banc : le dernier instantané enregistré de ce côté. */
  const onCourtBySide: Record<LineupSide, string[]> = useMemo(() => ({
    us:   lineupEvents.filter(e => e.side === 'us').at(-1)?.onCourt ?? [],
    them: lineupEvents.filter(e => e.side === 'them').at(-1)?.onCourt ?? [],
  }), [lineupEvents]);
  const onCourt = onCourtBySide.us;

  /**
   * Une joueuse est armable si elle est sur le terrain — OU si aucun cinq n'a encore été posé de
   * son côté. Ce second cas n'est pas un trou : il permet de pointer des statistiques sans tenir
   * les rotations du tout (usage plus léger, assumé, cf. docs/STATS_LIVE.md). Dès qu'un cinq
   * existe, le banc se verrouille et on ne peut plus attribuer une action à quelqu'un d'assis.
   */
  const isSelectable = (side: LineupSide, id: string) =>
    onCourtBySide[side].length === 0 || onCourtBySide[side].includes(id);

  /** Un joueur déjà sur le terrain reste affiché même s'il vient d'être retiré de la feuille : le
   *  masquer laisserait un « ? » sur le terrain et dans l'historique déjà enregistré. */
  const availablePlayers = useMemo(
    () => players.filter(p => rosterIds.has(p.id) || onCourt.includes(p.id)),
    [players, rosterIds, onCourt],
  );
  const bench = useMemo(
    () => availablePlayers.filter(p => !onCourt.includes(p.id)),
    [availablePlayers, onCourt],
  );
  const opponentsOnCourt = useMemo(
    () => onCourtBySide.them.map(id => opponents.find(p => p.id === id)).filter((p): p is MatchOpponentPlayer => !!p),
    [onCourtBySide.them, opponents],
  );
  /** Adverses qu'on ne peut plus retirer de la feuille : une action pointée ou une présence sur le
   *  terrain les référence déjà, les effacer laisserait un « ? » dans l'historique. */
  const usedOpponentIds = useMemo(() => {
    const used = new Set(onCourtBySide.them);
    for (const e of events) if (e.opponentPlayerId) used.add(e.opponentPlayerId);
    return used;
  }, [events, onCourtBySide.them]);
  const opponentsBench = useMemo(
    () => opponents.filter(p => !onCourtBySide.them.includes(p.id)),
    [opponents, onCourtBySide.them],
  );
  const score = useMemo(() => scoreFromEvents(events), [events]);
  const playerById = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const opponentById = useMemo(() => new Map(opponents.map(p => [p.id, p])), [opponents]);

  /**
   * Repère « maintenant » ARRONDI À 20 s pour le boxscore. Le chrono avance à la seconde ; brancher
   * les minutes dessus relançait l'agrégation complète et le rendu du tableau 60 fois par minute,
   * sous le doigt de qui saisit. Les minutes affichées accusent donc jusqu'à 20 s de retard —
   * invisible à l'usage, et la publication utilisera la valeur exacte.
   */
  const coarseElapsed = Math.floor(clock.elapsedSeconds / 20) * 20;

  const boxscore = useMemo(
    () => boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, coarseElapsed, boxscoreSide),
    [events, lineupEvents, clock.periodDurationSeconds, clock.quarter, coarseElapsed, boxscoreSide],
  );

  const lineupRows = useMemo(
    () => lineupStatsFromEvents(events, lineupEvents, lineupSide, clock.periodDurationSeconds, clock.quarter, coarseElapsed),
    [events, lineupEvents, lineupSide, clock.periodDurationSeconds, clock.quarter, coarseElapsed],
  );

  const shotsUs = useMemo(
    () => events.filter(e => e.side === 'us' && e.type === 'shot' && e.x !== undefined),
    [events],
  );
  const shotsThem = useMemo(
    () => events.filter(e => e.side === 'them' && e.type === 'shot' && e.x !== undefined),
    [events],
  );

  const selectionLabel = !selection ? null
    : selection.side === 'them'
      ? (selection.id ? (opponentById.get(selection.id)?.name ?? '?') : `${opponentName} (sans joueuse)`)
      : playerNameShort(playerById.get(selection.id!)!);

  /* ── Saisie ────────────────────────────────────────────────────────────── */

  /** Le chrono avance à la seconde : le lire par ref plutôt qu'en dépendance évite de recréer
   *  `pushEvent` — et donc de réabonner l'écouteur clavier — soixante fois par minute. */
  const clockRef = useRef(clock);
  clockRef.current = clock;

  /** `seq` est calculé ICI et pas dans le setter d'état : React rejoue les updaters en mode
   *  strict, ce qui insérerait deux fois la même action en base.
   *
   *  Enregistrer une action DÉSARME le joueur sélectionné, quel que soit le chemin emprunté : deux
   *  actions d'affilée sont presque toujours le fait de deux joueurs différents, et une sélection
   *  qui survit fait attribuer la suivante au mauvais. */
  const pushEvent = useCallback((over: Partial<MatchEvent> & { type: MatchEventType }) => {
    const event: MatchEvent = {
      matchId: match.id,
      seq: events.reduce((m, e) => Math.max(m, e.seq), 0) + 1,
      quarter: clockRef.current.quarter,
      gameTimeSeconds: clockRef.current.elapsedSeconds,
      side: 'us',
      onCourt: onCourtBySide.us,
      onCourtThem: onCourtBySide.them,
      ...over,
    };
    setEvents(prev => [...prev, event]);
    setSelection(null);
    // Passe par la file : une salle sans réseau ne doit pas faire perdre une action (api/matchEventQueue.ts).
    enqueueInsert(event);
  }, [match.id, events, onCourtBySide.us, onCourtBySide.them]);

  /** Traduit la sélection courante en champs d'événement — le seul endroit qui sait qu'une
   *  joueuse adverse s'écrit dans `opponentPlayerId` et pas dans `playerId`. */
  function authorFields(sel: Selection): Partial<MatchEvent> {
    return sel.side === 'us'
      ? { side: 'us', playerId: sel.id! }
      : { side: 'them', opponentPlayerId: sel.id ?? undefined };
  }

  function handleCourtClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!canEdit || subMode) return;
    const rect = courtRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Le viewBox couvre exactement le demi-terrain : la conversion pixel → mètre est un simple
    // rapport, et les coordonnées stockées restent indépendantes de la taille d'affichage.
    setPendingAction(null);
    setPendingShot({
      x: ((e.clientX - rect.left) / rect.width) * COURT_SIZE.half.w,
      y: ((e.clientY - rect.top) / rect.height) * COURT_SIZE.half.h,
    });
  }

  function confirmShot(made: boolean) {
    if (!pendingShot || !selection) return;
    pushEvent({
      type: 'shot', made, ...authorFields(selection),
      x: +pendingShot.x.toFixed(2), y: +pendingShot.y.toFixed(2),
    });
    setPendingShot(null);
    setChain(made ? 'ast' : 'reb');
  }

  /**
   * Tap sur un bouton de la palette. Comme pour les tirs, L'ORDRE EST LIBRE : si une joueuse est
   * déjà armée, l'action part tout de suite ; sinon l'action s'arme et attend son auteur. Les deux
   * chemins produisent le même événement en deux taps.
   */
  function handleActionTap(type: MatchEventType, made: boolean | undefined, label: string, value?: 2 | 3) {
    if (!canEdit) return;
    if (selection) {
      pushEvent({ type, made, value, ...authorFields(selection) });
      setChain((type === 'ft' || type === 'shot') && made === false ? 'reb' : type === 'shot' && made ? 'ast' : null);
      setPendingAction(null);
      return;
    }
    // Une action armée et un tir posé ne peuvent pas attendre le même tap : le second annule le premier.
    setPendingShot(null);
    setPendingAction(prev => prev?.label === label ? null : { type, made, label, value });
  }

  /**
   * Tap sur un joueur hors mode changement. Si une action attend son auteur, elle part ici, et
   * `pushEvent` remet la sélection à zéro dans la foulée.
   */
  function selectPlayer(sel: Selection) {
    if (pendingAction) {
      const { type, made, value } = pendingAction;
      pushEvent({ type, made, value, ...authorFields(sel) });
      setChain((type === 'ft' || type === 'shot') && made === false ? 'reb' : type === 'shot' && made ? 'ast' : null);
      setPendingAction(null);
      return;
    }
    setSelection(prev => prev?.side === sel.side && prev.id === sel.id ? null : sel);
  }

  const removeEvent = useCallback((seq: number) => {
    setEvents(prev => prev.filter(e => e.seq !== seq));
    enqueueDelete(match.id, seq);
  }, [match.id]);

  const undo = useCallback(() => {
    const last = events.at(-1);
    if (last) removeEvent(last.seq);
  }, [events, removeEvent]);

  /* ── Rotations ─────────────────────────────────────────────────────────── */

  /** `seq` est propre à chaque banc — clé naturelle `(match, side, seq)` de `match_lineup_events`. */
  function pushLineup(side: LineupSide, nextOnCourt: string[], playersIn: string[], playersOut: string[]) {
    const event: MatchLineupEvent = {
      matchId: match.id,
      seq: lineupEvents.filter(e => e.side === side).reduce((m, e) => Math.max(m, e.seq), 0) + 1,
      side, quarter: clock.quarter, gameTimeSeconds: clock.elapsedSeconds,
      playersIn, playersOut, onCourt: nextOnCourt,
    };
    setLineupEvents(prev => [...prev, event]);
    persist(() => matchLiveApi.insertLineupEvent(event));
  }

  /** Applique la décision de `resolveLineupEntry` — cette fonction ne décide rien. L'heure de la
   *  ligne amendée n'est pas rafraîchie : le cinq a commencé au premier tap. */
  function enterPlayer(side: LineupSide, playerId: string) {
    const last = lineupEvents.filter(e => e.side === side).sort((a, b) => a.seq - b.seq).at(-1);
    const write = resolveLineupEntry(last, playerId);

    if (write.kind === 'push') {
      pushLineup(side, write.onCourt, [playerId], []);
    } else {
      const { seq, playersIn, onCourt } = write;
      setLineupEvents(prev => prev.map(e => e.side === side && e.seq === seq ? { ...e, playersIn, onCourt } : e));
      persist(() => matchLiveApi.updateLineupEventRoster(match.id, side, seq, playersIn, onCourt));
    }

    // Le cinq est complet : le mode changement a fini son travail. Y rester est la porte ouverte
    // au geste de trop — un tap destiné à armer un joueur sort quelqu'un du terrain.
    if (write.onCourt.length === 5) {
      setSubMode(false);
      setPendingSub(null);
    }
  }

  /** Applique au terrain la décision de `resolveSubstitution` — cette fonction ne décide rien. */
  function handleRosterTap(side: LineupSide, playerId: string, from: RosterOrigin) {
    if (!canEdit) return;
    const sideOnCourt = onCourtBySide[side];

    if (!subMode) {
      if (!isSelectable(side, playerId)) return;
      selectPlayer({ side, id: playerId });
      return;
    }

    const move = resolveSubstitution(sideOnCourt, pendingSub, side, playerId, from);
    switch (move.kind) {
      case 'mark':  setPendingSub({ side, id: move.id, from: move.from }); break;
      case 'clear': setPendingSub(null); break;
      case 'enter': enterPlayer(side, move.incoming); break;
      case 'swap':
        pushLineup(side, sideOnCourt.map(id => id === move.outgoing ? move.incoming : id), [move.incoming], [move.outgoing]);
        setPendingSub(null);
        // La joueuse armée vient de sortir : la désarmer plutôt que de laisser pointer ses actions.
        setSelection(prev => prev?.side === side && prev.id === move.outgoing ? null : prev);
        break;
      case 'none': break;
    }
  }

  /* ── Effectif adverse, saisi à la volée ────────────────────────────────── */

  /** L'identifiant vient de la base : les actions le référencent par clé étrangère, on ne peut pas
   *  en inventer un côté client puis espérer que l'insertion suive. */
  async function addOpponent(name: string, rawNumber: string) {
    const parsed = Number(rawNumber.trim());
    const number = rawNumber.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined;
    try {
      const player = await matchLiveApi.addOpponentPlayer(match.id, name.trim(), number);
      setOpponents(prev => [...prev, player].sort((a, b) => (a.number ?? 99) - (b.number ?? 99)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'enregistrement");
    }
  }

  function removeOpponent(id: string) {
    if (usedOpponentIds.has(id)) return;
    setOpponents(prev => prev.filter(p => p.id !== id));
    setSelection(prev => prev?.side === 'them' && prev.id === id ? null : prev);
    persist(() => matchLiveApi.deleteOpponentPlayer(id));
  }

  /* ── Clavier ───────────────────────────────────────────────────────────── */

  /**
   * Trois raccourcis, pas trente : ceux qu'on retient sans les relire. Les dix lettres d'action
   * ont été retirées — autant de mnémoniques à mémoriser, c'est une charge, pas un gain.
   *
   * Toute frappe est ignorée dès qu'un champ a le focus : le formulaire d'ajout de joueuse
   * adverse est sur le même écran, taper « Dupont » ne doit rien déclencher.
   */
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;

      if (e.code === 'Space') {
        if (tag === 'BUTTON') return;  // ne pas voler l'activation clavier native du bouton
        e.preventDefault();
        if (clock.running) clock.pause(); else clock.start();
      } else if (e.key === 'c') {
        e.preventDefault();
        setSubMode(v => !v);
        setPendingSub(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (pendingAction) setPendingAction(null);
        else if (pendingShot) setPendingShot(null);
        else if (pendingSub) setPendingSub(null);
        else setSelection(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `clock` entier changerait à chaque seconde : seuls les trois membres réellement lus en font
    // partie, et `pause`/`start` sont stables (useCallback vide).
  }, [canEdit, clock.running, clock.pause, clock.start, pendingAction, pendingShot, pendingSub]);

  /* ── Publication ───────────────────────────────────────────────────────── */

  /**
   * Publier écrit `match_stats`, `opponent_match_stats`, `team_match_stats` et le score du match —
   * les tables que lit TOUT le reste de l'application. C'est un geste explicite, jamais automatique :
   * un match en cours y mettrait des demi-vérités, et à la mi-temps un joueur à 4 points ferait
   * chuter sa moyenne de saison.
   *
   * Ces écritures sont les MÊMES que celles de l'import CSV, et elles remplacent en bloc
   * (`bulkUpsertForMatch` fait DELETE puis INSERT). Le dernier geste fait donc foi — d'où le
   * relevé de l'existant avant confirmation, pour que l'alerte annonce ce qui va disparaître.
   */
  async function openPublish() {
    setPublishState('checking');
    setError('');
    try {
      const [rows, oppRows, teamRow] = await Promise.all([
        statsApi.listByMatchId(match.id),
        statsApi.listOpponentStatsByMatchId(match.id),
        statsApi.getTeamStatsByMatchId(match.id),
      ]);
      setPublishTarget({
        players: rows.length, opponents: oppRows.length, team: !!teamRow,
        scoreUs: match.scoreUs ?? null, scoreThem: match.scoreThem ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de lecture des statistiques existantes');
    } finally {
      setPublishState('idle');
    }
  }

  async function confirmPublish(isFinal: boolean) {
    setPublishState('saving');
    setError('');
    try {
      // Chrono exact ici, pas l'arrondi d'affichage : les minutes publiées font autorité.
      const rowsUs   = boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, clock.elapsedSeconds, 'us');
      const rowsThem = boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, clock.elapsedSeconds, 'them');
      const finalScore = scoreFromEvents(events);
      // `matches.result` n'a pas de nul, et le basket non plus : à égalité, le match n'est pas
      // fini. On garde alors le résultat déjà enregistré — l'inscrire en défaite faussait le
      // bilan de saison à chaque publication d'étape, mi-temps comprise.
      const result: 'win' | 'loss' = finalScore.us === finalScore.them
        ? match.result
        : finalScore.us > finalScore.them ? 'win' : 'loss';
      // Publication d'étape : les statistiques partent, la fiche du match ne bouge pas. Écrire le
      // score à la mi-temps le fait remonter tel quel dans le bilan de saison et le classement.
      const matchWithScore = isFinal
        ? { ...match, scoreUs: finalScore.us, scoreThem: finalScore.them, result }
        : match;

      if (rowsUs.length > 0) {
        await statsApi.bulkUpsertForMatch(match.id, rowsUs as BulkStatRow[], matchWithScore);
      }

      const oppInputs: OpponentStatInput[] = rowsThem.map(r => ({
        playerName: opponentById.get(r.playerId)?.name ?? '?',
        min: r.min,
        fg2m: r.fg2m, fg2a: r.fg2a,
        fg3m: r.fg3m, fg3a: r.fg3a,
        ftm: r.ftm, fta: r.fta,
        ro: r.ro, rd: r.rd,
        pd: r.pd, ct: r.ct,
        intercepts: r.intercepts, bp: r.bp,
        fte: r.fte, fpr: r.fpr,
        eval: r.eval, plusMinus: r.plusMinus,
      }));
      await statsApi.bulkUpsertOpponentStatsForMatch(match.id, oppInputs);

      await statsApi.upsertTeamStats(match.id, teamTotalsFromEvents(events, 'us'), teamTotalsFromEvents(events, 'them'));

      if (isFinal && (finalScore.us !== match.scoreUs || finalScore.them !== match.scoreThem)) {
        await matchesApi.update(match.id, { scoreUs: finalScore.us, scoreThem: finalScore.them, result });
      }

      setPublishedAt(new Date());
      setPublishTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de publication');
    } finally {
      setPublishState('idle');
    }
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  const history = [...events].reverse();
  const recent  = history.slice(0, RECENT_COUNT);
  const isSelected = (side: LineupSide, id: string | null) => selection?.side === side && selection?.id === id;

  const rosterName = (side: LineupSide, id: string) => side === 'us'
    ? (playerById.has(id) ? playerNameShort(playerById.get(id)!) : '?')
    : (opponentById.get(id)?.name ?? '?');

  function eventText(e: MatchEvent): string {
    const author = e.side === 'us'
      ? (e.playerId ? playerNameShort(playerById.get(e.playerId)!) : '')
      : (e.opponentPlayerId ? (opponentById.get(e.opponentPlayerId)?.name ?? '?') : 'adv');
    const what = e.type === 'shot' || e.type === 'ft'
      ? `${e.made ? '✓' : '✗'} ${e.type === 'ft' ? 'LF' : `${shotEventValue(e)} pts`}`
      : EVENT_LABELS[e.type];
    return `${what}${author ? ` · ${author}` : ''}`;
  }

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;

  return (
    <div className="tracker" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1500, marginInline: 'auto', width: '100%' }}>
      <style>{`
        /* Largeurs mesurées, pas devinées. Le terrain est la seule pièce de l'écran dont la
           hauteur suit la largeur (ratio 15:14) : sans plancher il rétrécit avec la fenêtre
           jusqu'à devenir impointable, sans plafond il grossit pour rien sur un grand écran.
           D'où un terrain BORNÉ des deux côtés, et une palette qui prend ce qui reste.
           Seuils calculés à partir du terrain à 340px, pas choisis : en trois colonnes le centre
           ne vaut que 56% de la largeur utile, il faut 1400px de fenêtre pour que la palette
           garde 230px à côté du terrain. En une colonne elle tient jusqu'à 800px, en dessous le
           terrain passe au-dessus. */
        .tracker-top  { display: grid; grid-template-columns: 22% minmax(0, 1fr) 22%; gap: 12px; align-items: start; }
        .tracker-play { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 14px; align-items: start; }
        .tracker-court { max-width: 340px; margin-inline: auto; }
        @media (max-width: 1399px) { .tracker-top  { grid-template-columns: minmax(0, 1fr); } }
        @media (max-width: 799px)  { .tracker-play { grid-template-columns: minmax(0, 1fr); } }
        .tracker-shotgrids { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
        .tracker-shotgrids > div { max-width: 420px; }
        @media (max-width: 700px) { .tracker-shotgrids { grid-template-columns: minmax(0, 1fr); } }
        /* Boutons d'action à hauteur FIXE : la palette ne doit pas se réorganiser sous le doigt
           parce qu'un libellé tient sur deux lignes. Deux lignes au plus, puis les points de
           suspension ; un mot seul trop long est coupé net plutôt que cassé en deux. */
        .tracker-action-label { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; text-overflow: ellipsis; text-align: center; }
        .tracker button:focus-visible { outline: 2px solid #00E5A0; outline-offset: 2px; }
        .tracker-cell { padding: 5px 6px; font-size: 0.72rem; text-align: right; color: #CBD5E1; }
        .tracker-cell:first-child { text-align: left; color: #F1F5F9; }
        .tracker-head { padding: 5px 6px; font-size: 0.6rem; text-align: right; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .tracker-head:first-child { text-align: left; }
        .tracker-key { font-family: monospace; background: #0D0F14; border: 1px solid #2A2F3A;
          border-radius: 3px; padding: 0 4px; color: #94A3B8; }
        /* Accusé de réception d'une action : le chip le plus récent s'allume puis retombe. Il se
           rejoue tout seul à chaque ajout, la clé React du premier chip changeant avec le seq. */
        @keyframes tracker-flash {
          0%   { background: #00E5A0; color: #0D0F14; border-color: #00E5A0; transform: scale(1.05); }
          65%  { background: #00E5A033; color: #F1F5F9; border-color: #00E5A0; transform: scale(1); }
          100% { background: #0D0F14; color: #CBD5E1; border-color: #2A2F3A; }
        }
        .tracker-flash { animation: tracker-flash 900ms ease-out; }
        @media (prefers-reduced-motion: reduce) { .tracker-flash { animation-duration: 1ms; } }
      `}</style>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '8px 12px', color: '#EF4444', fontSize: '0.78rem' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} aria-label="Masquer" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {pending > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '8px 12px', color: '#F59E0B', fontSize: '0.78rem' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {pending} action{pending > 1 ? 's' : ''} en attente d'enregistrement. Elle{pending > 1 ? 's partiront' : ' partira'} au retour du réseau — ne fermez pas l'onglet.
          </span>
          <button onClick={() => { flushQueue().then(err => setError(err ? err.message : '')); }}
            style={{ ...SMALL_BTN, height: 28, borderColor: '#F59E0B', color: '#F59E0B' }}>
            Réessayer
          </button>
        </div>
      )}

      {publishedAt && (
        <div style={{ backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 6, padding: '7px 12px', color: '#00E5A0', fontSize: '0.76rem' }}>
          Boxscore publié à {publishedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}. Les actions enregistrées ensuite ne le seront qu'à la prochaine publication.
        </div>
      )}

      {/* Table de marque + chrono : le bloc PARTAGÉ avec le suivi live (`MatchScoreboard`) — deux
          écrans du même produit ouverts pendant le même match ne peuvent pas afficher deux tables
          de marque différentes. Le chrono s'y corrige au clic, comme là-bas. */}
      <MatchScoreboard
        ourTeamName={ourTeamName} teamColor={teamColor} opponentName={opponentName}
        scoreUs={score.us} scoreThem={score.them} clock={clock} canEdit={canEdit}
        extraControls={
          <>
            <button onClick={openPublish} disabled={publishState !== 'idle' || events.length === 0}
              title="Publier le boxscore dans les statistiques du match"
              style={{
                ...scoreboardBtn, gap: 6,
                borderColor: events.length > 0 ? '#00E5A0' : '#2A2F3A',
                color: events.length > 0 ? '#00E5A0' : '#475569',
                cursor: events.length > 0 && publishState === 'idle' ? 'pointer' : 'not-allowed',
              }}>
              <Upload size={14} />{publishState === 'checking' ? 'Vérification…' : 'Publier'}
            </button>
            <button onClick={() => setShowKeys(true)} aria-label="Réglages et raccourcis" title="Réglages et raccourcis"
              style={{ ...scoreboardBtn, width: 34, justifyContent: 'center' }}>
              <Settings size={15} />
            </button>
          </>
        }
      />

      {/* Accusé de réception : la dernière action enregistrée s'allume ici, juste sous le score,
          au centre du regard. Trois suffisent à vérifier ce qu'on vient de faire ; le reste est de
          la relecture et vit dans le dépliant. */}
      <div style={{ ...PANEL, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...SECTION_TITLE, margin: 0, flexShrink: 0 }}>Dernières actions</span>

          <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
            {recent.length === 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>Aucune action enregistrée.</span>}
            {recent.map((e, i) => (
              <span key={e.seq} className={i === 0 ? 'tracker-flash' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  padding: '6px 10px', borderRadius: 999, border: '1px solid #2A2F3A',
                  backgroundColor: '#0D0F14', color: e.side === 'us' ? '#CBD5E1' : '#64748B',
                  fontSize: '0.75rem', whiteSpace: 'nowrap',
                }}>
                <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '0.68rem' }}>{periodLabel(e.quarter)} {formatClock(e.gameTimeSeconds)}</span>
                {eventText(e)}
              </span>
            ))}
          </div>

          {canEdit && (
            <button onClick={undo} disabled={events.length === 0}
              title="Annuler la dernière action"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 6, flexShrink: 0,
                border: '1px solid rgba(239,68,68,0.45)', backgroundColor: 'rgba(239,68,68,0.08)',
                color: '#EF4444', fontSize: '0.78rem', fontWeight: 600,
                cursor: events.length ? 'pointer' : 'not-allowed', opacity: events.length ? 1 : 0.35,
              }}>
              <Undo2 size={14} />Annuler
            </button>
          )}

          <button onClick={() => setShowFullHistory(v => !v)} aria-expanded={showFullHistory}
            title="Voir tout l'historique"
            style={{ ...SMALL_BTN, flexShrink: 0 }}>
            <ChevronDown size={14} style={{ transform: showFullHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', marginRight: 5 }} />
            {events.length}
          </button>
        </div>

        {showFullHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto', marginTop: 10, paddingTop: 10, borderTop: '1px solid #1E2229' }}>
            {history.map(e => (
              <div key={e.seq} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
                <span style={{ color: '#475569', flexShrink: 0, fontFamily: 'monospace' }}>{periodLabel(e.quarter)} {formatClock(e.gameTimeSeconds)}</span>
                <span style={{ flex: 1, minWidth: 0, color: e.side === 'us' ? '#CBD5E1' : '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {eventText(e)}
                  {eventPoints(e) > 0 && <span style={{ color: e.side === 'us' ? teamColor : '#94A3B8' }}> +{eventPoints(e)}</span>}
                </span>
                {canEdit && (
                  <button onClick={() => removeEvent(e.seq)} aria-label="Supprimer cette action"
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 5, flexShrink: 0 }} title="Supprimer">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tracker-top">

        {/* Notre effectif. Le mode changement est explicite et visible : hors mode, aucun tap ne
            peut modifier la composition. */}
        <div style={{ ...PANEL, borderColor: subMode ? '#F59E0B' : '#2A2F3A' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <RosterTitle name={ourTeamName} count={onCourt.length} />
            {canEdit && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => setShowRosterModal(true)} title="Feuille de match : joueurs disponibles"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, padding: '0 9px', borderRadius: 6, border: `1px solid ${rosterIds.size === 0 ? '#F59E0B' : '#2A2F3A'}`, backgroundColor: '#0D0F14', color: rosterIds.size === 0 ? '#F59E0B' : '#94A3B8', fontSize: '0.7rem', cursor: 'pointer' }}>
                  <ClipboardList size={12} />Feuille{rosterIds.size > 0 ? ` (${rosterIds.size})` : ''}
                </button>
              </div>
            )}
          </div>

          <p style={SECTION_TITLE}>Sur le terrain</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {onCourt.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.76rem', margin: 0 }}>
                Aucun joueur sur le terrain. Activez le mode changement pour composer le cinq de départ.
              </p>
            )}
            {onCourt.map(id => {
              const player = playerById.get(id);
              if (!player) return null;
              const active = isSelected('us', id);
              const marked = subMode && pendingSub?.side === 'us' && pendingSub.id === id;
              const accent = marked ? '#F59E0B' : teamColor;
              return (
                <button key={id} onClick={() => handleRosterTap('us', id, 'court')} disabled={!canEdit} aria-pressed={active || marked}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, minHeight: TAP, padding: '4px 10px', borderRadius: 8,
                    border: `1px solid ${active || marked ? accent : '#2A2F3A'}`,
                    backgroundColor: active || marked ? `${accent}1F` : '#0D0F14',
                    color: active || marked ? '#F1F5F9' : '#CBD5E1', cursor: canEdit ? 'pointer' : 'default',
                    fontSize: '0.85rem', fontWeight: active || marked ? 700 : 400, textAlign: 'left',
                  }}>
                  <PlayerAvatar player={player} size={30} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerNameShort(player)}</span>
                </button>
              );
            })}
          </div>

          <p style={{ ...SECTION_TITLE, marginTop: 12 }}>Banc</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {bench.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.76rem', margin: 0 }}>
                {rosterIds.size === 0
                  ? 'Aucun joueur retenu. Ouvrez la feuille de match pour composer le groupe.'
                  : 'Aucun joueur sur le banc.'}
              </p>
            )}
            {bench.map(p => {
              const marked = subMode && pendingSub?.side === 'us' && pendingSub.id === p.id;
              return (
                <button key={p.id} onClick={() => handleRosterTap('us', p.id, 'bench')} disabled={!canEdit || (!subMode && !isSelectable('us', p.id))}
                  title={subMode ? `Faire entrer ${playerNameShort(p)}` : 'Activez le mode changement pour le faire entrer'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, minHeight: TAP, padding: '4px 10px', borderRadius: 8,
                    border: `1px solid ${marked ? '#F59E0B' : '#2A2F3A'}`,
                    backgroundColor: marked ? '#F59E0B1F' : 'transparent',
                    color: subMode ? '#CBD5E1' : '#64748B', cursor: subMode ? 'pointer' : 'default',
                    fontSize: '0.83rem', textAlign: 'left', opacity: subMode ? 1 : 0.65,
                  }}>
                  <NumberBadge number={p.number} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerNameShort(p)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Terrain et palette côte à côte : le terrain ne sert qu'une seconde par tir, il n'a
            aucune raison de repousser la palette plus bas. Sa colonne se resserre avant celle des
            boutons — un intitulé tronqué ne se lit plus, un terrain un peu plus petit reste
            cliquable. Les deux colonnes sont à parts égales, le terrain plafonné : au-delà de
            340px il ne gagne aucune précision de clic et écrase la palette ; en dessous de 280px
            il n'est plus assez précis pour distinguer deux zones voisines. */}
        <div className="tracker-play" style={PANEL}>
          {/* Mode changement : UN seul interrupteur pour les deux bancs, posé au milieu, à
              distance égale des deux effectifs. Il occupe la première rangée du panneau plutôt
              qu'une boîte à lui : la colonne du milieu a ainsi une bordure et un padding, comme
              les deux colonnes d'effectif. */}
          {canEdit && (
            <button onClick={() => { setSubMode(v => !v); setPendingSub(null); }} aria-pressed={subMode}
              title="Mode changement (c) : hors de ce mode, sélectionner un joueur ne fait que l'armer pour la saisie"
              style={{
                gridColumn: '1 / -1',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', minHeight: TAP, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${subMode ? '#F59E0B' : '#2A2F3A'}`,
                backgroundColor: subMode ? '#F59E0B1F' : '#0D0F14',
                color: subMode ? '#F59E0B' : '#64748B', fontSize: '0.82rem', fontWeight: subMode ? 700 : 500,
              }}>
              <Repeat2 size={16} />
              {subMode
                ? (pendingSub ? 'Changement — sélectionnez le joueur de l\'autre côté' : 'Changement — sélectionnez le sortant, puis l\'entrant')
                : 'Mode changement'}
            </button>
          )}

          {shotInput === 'buttons' ? (
            /* Saisie aux boutons : pas de terrain, donc pas de position. Les quatre boutons
               prennent la place de la colonne et gagnent la taille qu'ils n'avaient pas en
               repli sous le terrain. */
            <div>
              <p style={SECTION_TITLE}>Tirs</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {NO_POSITION_SHOTS.map(b => (
                  <button key={b.label} onClick={() => handleActionTap('shot', b.made, b.label, b.value)} disabled={!canEdit}
                    aria-pressed={pendingAction?.label === b.label}
                    aria-label={`${b.value} points ${b.made ? 'réussi' : 'manqué'}`}
                    style={{
                      ...paletteStyle(
                        pendingAction?.label === b.label, true, b.made ? '#00E5A0' : '#EF4444',
                        pendingAction?.label === b.label ? '#F59E0B' : '#00E5A0',
                      ),
                      height: 56, fontSize: '0.95rem', fontWeight: 700,
                    }}>
                    <span className="tracker-action-label">{b.label}</span>
                  </button>
                ))}
              </div>
              <p style={{ color: '#475569', fontSize: '0.73rem', margin: '8px 0 0', textAlign: 'center' }}>
                Sans position : ces tirs comptent au boxscore, pas aux grilles de tir.
              </p>
            </div>
          ) : (
          <div className="tracker-court">
            <p style={SECTION_TITLE}>Tirs</p>

            <div style={{ position: 'relative' }}>
              <svg
                ref={courtRef}
                viewBox={`0 0 ${COURT_SIZE.half.w} ${COURT_SIZE.half.h}`}
                onClick={handleCourtClick}
                style={{ width: '100%', display: 'block', borderRadius: 8, cursor: canEdit && !subMode ? 'crosshair' : 'default' }}
              >
                {/* Terrain de SAISIE : il ne montre que le tir en cours. Les tirs déjà
                    enregistrés sont dans les grilles du bas — les empiler ici finissait par
                    masquer le point qu'on vient de poser. */}
                <DiagramCourt court="half" />
                {pendingShot && (
                  <circle cx={pendingShot.x} cy={pendingShot.y} r={0.42} fill="none" stroke="#F1F5F9" strokeWidth={0.1} strokeDasharray="0.2 0.15" />
                )}
              </svg>

              {/* ✓/✗ posés SUR le point du tir — mais seulement une fois l'auteur connu : quand le
                  point est posé en premier, la question à l'écran est « qui ? », pas « dedans ? ». */}
              {pendingShot && selection && (
                <div style={{
                  position: 'absolute',
                  left: `${(pendingShot.x / COURT_SIZE.half.w) * 100}%`,
                  top:  `${(pendingShot.y / COURT_SIZE.half.h) * 100}%`,
                  transform: 'translate(-50%, -50%)', display: 'flex', gap: 6,
                }}>
                  <button onClick={() => confirmShot(true)}  aria-label="Tir réussi" style={shotChoiceStyle('#00E5A0')}>✓</button>
                  <button onClick={() => confirmShot(false)} aria-label="Tir manqué"   style={shotChoiceStyle('#EF4444')}>✗</button>
                </div>
              )}
            </div>

            <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '8px 0 0', textAlign: 'center', minHeight: 18 }}>
              {pendingShot && !selection ? (
                <span style={{ color: '#F59E0B', fontWeight: 700 }}>Qui a tiré ? Sélectionnez un joueur.</span>
              ) : pendingShot ? (
                <>
                  {ZONE_LABELS[shotZone(pendingShot.x, pendingShot.y)]} · {shotValue(pendingShot.x, pendingShot.y)} pts —{' '}
                  <button onClick={() => setPendingShot(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem', padding: 0 }}>annuler</button>
                </>
              ) : selection ? (
                <>Indiquez la position du tir de <span style={{ color: selection.side === 'us' ? teamColor : '#94A3B8' }}>{selectionLabel}</span></>
              ) : `${shotsUs.length} tir${shotsUs.length > 1 ? 's' : ''} · ${shotsThem.length} adverse${shotsThem.length > 1 ? 's' : ''}`}
            </p>

            {/* Repli quand la position n'a pas pu être prise : un tir dans la confusion ne doit
                pas être perdu. La valeur est alors FIGÉE en base (colonne `value`) au lieu d'être
                déduite de la géométrie, et ces tirs comptent au boxscore mais restent hors des
                grilles de tir — c'est le prix de la rapidité, pas un oubli. Volontairement
                discret et sous le terrain : le chemin normal reste le clic sur le terrain. */}
            <div style={{ marginTop: 10 }}>
              <p style={{ ...SECTION_TITLE, fontSize: '0.6rem', margin: '0 0 4px', color: '#475569' }}>Tir sans position</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {NO_POSITION_SHOTS.map(b => (
                  <button key={b.label} onClick={() => handleActionTap('shot', b.made, b.label, b.value)} disabled={!canEdit}
                    aria-pressed={pendingAction?.label === b.label}
                    aria-label={`${b.value} points ${b.made ? 'réussi' : 'manqué'}, sans position`}
                    style={paletteStyle(
                      pendingAction?.label === b.label, true, b.made ? '#00E5A0' : '#EF4444',
                      pendingAction?.label === b.label ? '#F59E0B' : '#00E5A0',
                    )}>
                    <span className="tracker-action-label">{b.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          <div>
            {/* Une seule ligne, jamais deux : ce titre change à chaque tap, et un libellé qui
                passe à la ligne décale toute la palette sous le doigt. Le nom de l'action n'y est
                pas répété — son bouton est déjà allumé juste en dessous. */}
            <p style={{ ...SECTION_TITLE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pendingAction
                ? <span style={{ color: '#F59E0B' }}>Sélectionnez un joueur</span>
                : selection
                  ? <>Action de <span style={{ color: selection.side === 'us' ? teamColor : '#94A3B8' }}>{selectionLabel}</span></>
                  : 'Action'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PALETTE_GROUPS.map(group => (
                <div key={group.title}>
                  <p style={{ ...SECTION_TITLE, fontSize: '0.6rem', margin: '0 0 4px', color: '#475569' }}>{group.title}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                    {group.buttons.map(b => (
                      <button key={b.label} onClick={() => handleActionTap(b.type, b.made, b.label)} disabled={!canEdit}
                        aria-pressed={pendingAction?.label === b.label}
                        style={paletteStyle(
                          pendingAction?.label === b.label || (chain !== null && b.chain === chain),
                          true, b.tone, pendingAction?.label === b.label ? '#F59E0B' : '#00E5A0',
                        )}>
                        <span className="tracker-action-label">{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Effectif adverse : aucun n'existe en base, ils se saisissent à la volée — d'où le
            formulaire en tête de colonne plutôt qu'un écran de configuration préalable. Une fois
            saisis, ils se gèrent exactement comme les nôtres, rotations comprises : c'est ce qui
            donne leurs minutes, leur cinq de départ et leur +/-. */}
        <div style={{ ...PANEL, borderColor: subMode ? '#F59E0B' : '#2A2F3A' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <RosterTitle name={opponentName} count={onCourtBySide.them.length} />
            {canEdit && (
              <button onClick={() => setShowOpponentSheet(true)} title="Feuille adverse : effectif de l'équipe"
                style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, padding: '0 9px', borderRadius: 6, border: '1px solid #2A2F3A', backgroundColor: '#0D0F14', color: opponents.length > 0 ? '#94A3B8' : '#64748B', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }}>
                <ClipboardList size={12} />Feuille{opponents.length > 0 ? ` (${opponents.length})` : ''}
              </button>
            )}
          </div>

          <p style={SECTION_TITLE}>Sur le terrain</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {opponentsOnCourt.length === 0 && (
              <p style={{ color: '#475569', fontSize: '0.76rem', margin: 0 }}>
                {opponents.length === 0
                  ? 'Aucun joueur renseigné. La feuille est facultative : avec « Sans joueur », le score et les totaux d\'équipe restent justes — seul leur boxscore individuel manque.'
                  : 'Aucun joueur sur le terrain. Activez le mode changement pour composer leur cinq.'}
              </p>
            )}
            {opponentsOnCourt.map(p => (
              <OpponentRow key={p.id} player={p} canEdit={canEdit}
                active={isSelected('them', p.id)}
                marked={subMode && pendingSub?.side === 'them' && pendingSub.id === p.id}
                onClick={() => handleRosterTap('them', p.id, 'court')} />
            ))}
          </div>

          {opponentsBench.length > 0 && (
            <>
              <p style={{ ...SECTION_TITLE, marginTop: 12 }}>Banc</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {opponentsBench.map(p => (
                  <OpponentRow key={p.id} player={p} canEdit={canEdit}
                    active={isSelected('them', p.id)}
                    marked={subMode && pendingSub?.side === 'them' && pendingSub.id === p.id}
                    dimmed={!subMode && !isSelectable('them', p.id)}
                    onClick={() => handleRosterTap('them', p.id, 'bench')} />
                ))}
              </div>
            </>
          )}

          {/* Le pointage anonyme reste toujours à portée : on ne saisit pas un panier encaissé
              moins bien parce qu'on n'a pas eu le numéro. */}
          <button onClick={() => selectPlayer({ side: 'them', id: null })} disabled={!canEdit} aria-pressed={isSelected('them', null)}
            title="Enregistrer une action adverse sans l'attribuer : elle compte au score et aux totaux, pas au boxscore individuel"
            style={{
              width: '100%', minHeight: TAP, padding: '4px 10px', borderRadius: 8, marginTop: 8, textAlign: 'left',
              border: `1px dashed ${isSelected('them', null) ? '#94A3B8' : '#2A2F3A'}`,
              backgroundColor: isSelected('them', null) ? '#94A3B81F' : 'transparent',
              color: isSelected('them', null) ? '#F1F5F9' : '#64748B',
              cursor: canEdit ? 'pointer' : 'default', fontSize: '0.81rem',
            }}>
            Sans joueur
          </button>
        </div>
      </div>

      {/* Boxscore replié par défaut : personne ne lit 15 colonnes en pointant un match. */}
      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowBoxscore(v => !v)} aria-expanded={showBoxscore}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...SECTION_TITLE, margin: 0 }}>
            <ChevronDown size={14} style={{ transform: showBoxscore ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            Boxscore
          </button>
          {showBoxscore && (
            <div style={{ display: 'flex', gap: 4 }}>
              {([['us', ourTeamName], ['them', opponentName]] as const).map(([side, label]) => (
                <button key={side} onClick={() => setBoxscoreSide(side)} aria-pressed={boxscoreSide === side}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
                    border: `1px solid ${boxscoreSide === side ? '#00E5A0' : '#2A2F3A'}`,
                    backgroundColor: boxscoreSide === side ? '#00E5A01F' : '#0D0F14',
                    color: boxscoreSide === side ? '#00E5A0' : '#94A3B8',
                    maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showBoxscore && (
          boxscore.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.78rem', margin: '10px 0 0' }}>
              {boxscoreSide === 'us'
                ? 'Le boxscore se remplit dès la première action enregistrée.'
                : 'Renseignez l\'effectif adverse et attribuez-leur des actions pour remplir ce boxscore.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                    {['Joueur', 'MIN', 'PTS', '2 PTS', '3 PTS', 'LF', 'RO', 'RD', 'PD', 'INT', 'CT', 'BP', 'F', 'EVAL', '+/-'].map(h => (
                      <th key={h} className="tracker-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {boxscore.map(r => {
                    const name = boxscoreSide === 'us'
                      ? (playerById.has(r.playerId) ? playerNameShort(playerById.get(r.playerId)!) : '?')
                      : (opponentById.get(r.playerId)?.name ?? '?');
                    return (
                      <tr key={r.playerId} style={{ borderBottom: '1px solid #1E2229' }}>
                        <td className="tracker-cell">{name}{r.starter && <span style={{ color: '#475569' }}> ★</span>}</td>
                        <td className="tracker-cell">{r.min > 0 ? r.min.toFixed(1) : '—'}</td>
                        <td className="tracker-cell" style={{ fontWeight: 700, color: '#F1F5F9' }}>{r.pts}</td>
                        <td className="tracker-cell">{r.fg2m}/{r.fg2a}</td>
                        <td className="tracker-cell">{r.fg3m}/{r.fg3a}</td>
                        <td className="tracker-cell">{r.ftm}/{r.fta}</td>
                        <td className="tracker-cell">{r.ro}</td>
                        <td className="tracker-cell">{r.rd}</td>
                        <td className="tracker-cell">{r.pd}</td>
                        <td className="tracker-cell">{r.intercepts}</td>
                        <td className="tracker-cell">{r.ct}</td>
                        <td className="tracker-cell">{r.bp}</td>
                        <td className="tracker-cell">{r.fpr}</td>
                        <td className="tracker-cell">{r.eval}</td>
                        <td className="tracker-cell" style={{ color: r.plusMinus > 0 ? '#00E5A0' : r.plusMinus < 0 ? '#EF4444' : '#64748B' }}>
                          {r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Cinq sur le terrain — l'équivalent de « Cinq les plus vues » du suivi live, mesuré à
          l'action près et daté : le temps d'un cinq donne son poids à son +/-, un +8 en deux
          minutes et un +8 sur un quart-temps entier ne se lisent pas pareil. */}
      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowLineups(v => !v)} aria-expanded={showLineups}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...SECTION_TITLE, margin: 0 }}>
            <ChevronDown size={14} style={{ transform: showLineups ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            Analyse des lineups
          </button>
          {showLineups && (
            <div style={{ display: 'flex', gap: 4 }}>
              {([['us', ourTeamName], ['them', opponentName]] as const).map(([side, label]) => (
                <button key={side} onClick={() => setLineupSide(side)} aria-pressed={lineupSide === side}
                  style={{
                    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
                    border: `1px solid ${lineupSide === side ? '#00E5A0' : '#2A2F3A'}`,
                    backgroundColor: lineupSide === side ? '#00E5A01F' : '#0D0F14',
                    color: lineupSide === side ? '#00E5A0' : '#94A3B8',
                    maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showLineups && (
          lineupRows.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '0.78rem', margin: '10px 0 0' }}>
              Les combinaisons apparaissent dès qu'un cinq est composé et qu'une action est enregistrée.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                    {['Cinq', 'Temps', 'Poss.', 'Pts/poss.', 'Pour', 'Contre', '+/-'].map(h => (
                      <th key={h} className="tracker-head">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineupRows.map(r => (
                    <tr key={r.players.join(',')} style={{ borderBottom: '1px solid #1E2229' }}>
                      <td className="tracker-cell">{r.players.map(id => rosterName(lineupSide, id)).join(', ')}</td>
                      <td className="tracker-cell" style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{formatClock(r.seconds)}</td>
                      <td className="tracker-cell">{r.possessions.toFixed(1)}</td>
                      <td className="tracker-cell">{r.pointsPerPossession !== null ? r.pointsPerPossession.toFixed(2) : '—'}</td>
                      <td className="tracker-cell">{r.pointsFor}</td>
                      <td className="tracker-cell">{r.pointsAgainst}</td>
                      <td className="tracker-cell" style={{ fontWeight: 700, color: r.plusMinus > 0 ? '#00E5A0' : r.plusMinus < 0 ? '#EF4444' : '#64748B' }}>
                        {r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Grilles de tir — la lecture, séparée de la saisie : sur le terrain du haut les deux camps
          se superposent pour donner un retour immédiat, ici chaque équipe a sa carte propre. */}
      <div style={PANEL}>
        <button onClick={() => setShowCharts(v => !v)} aria-expanded={showCharts}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...SECTION_TITLE, margin: 0 }}>
          <ChevronDown size={14} style={{ transform: showCharts ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          Grilles de tir
        </button>

        {showCharts && (
          <div className="tracker-shotgrids">
            <ShotGrid title={ourTeamName} shots={shotsUs}   colors={{ made: teamColor, miss: SHOT_COLORS.us.miss }} />
            <ShotGrid title={opponentName} shots={shotsThem} colors={SHOT_COLORS.them} />
          </div>
        )}
      </div>

      {publishTarget && (
        <PublishModal
          existing={publishTarget}
          players={boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, coarseElapsed, 'us').length}
          opponents={boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, coarseElapsed, 'them').length}
          score={score} saving={publishState === 'saving'}
          matchScoreUs={match.scoreUs} matchScoreThem={match.scoreThem}
          onConfirm={confirmPublish} onCancel={() => setPublishTarget(null)}
        />
      )}

      {showKeys && (
        <SettingsModal
          periodDurationSeconds={clock.periodDurationSeconds}
          onPeriodDurationChange={clock.setPeriodDuration}
          shotInput={shotInput}
          onShotInputChange={setShotInput}
          canEdit={canEdit}
          onClose={() => setShowKeys(false)}
        />
      )}

      {showOpponentSheet && (
        <OpponentSheetModal
          opponentName={opponentName} opponents={opponents} usedIds={usedOpponentIds}
          onAdd={addOpponent} onRemove={removeOpponent} onClose={() => setShowOpponentSheet(false)}
        />
      )}

      {showRosterModal && (
        <RosterModal
          players={players} rosterIds={rosterIds} onCourt={onCourt}
          onToggle={id => setRosterIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onToggleAll={() => setRosterIds(prev => prev.size === players.length ? new Set(onCourt) : new Set(players.map(p => p.id)))}
          onClose={() => {
            setShowRosterModal(false);
            persist(() => matchLiveApi.setRoster(match.id, [...rosterIds]));
          }}
        />
      )}
    </div>
  );
}

/**
 * Raccourcis clavier. En modale et non en légende permanente : trois lignes de rappel occupaient
 * la barre de commandes en continu et en déportaient les boutons du chrono hors du centre, pour
 * une information qu'on lit une fois.
 */
/** Réglages de l'écran. La durée de quart-temps n'est pas un détail d'affichage : c'est elle qui
 *  convertit (quart-temps, temps écoulé) en axe de temps continu, donc elle détermine les minutes
 *  publiées dans `match_stats`. Une catégorie jeune à 8 min pointée à 10 fausse tout le temps de
 *  jeu. Le réglage est partagé avec le suivi live, comme le chrono lui-même. */
function SettingsModal({ periodDurationSeconds, onPeriodDurationChange, shotInput, onShotInputChange, canEdit, onClose }: {
  periodDurationSeconds: number;
  onPeriodDurationChange: (seconds: number) => void;
  shotInput: ShotInput;
  onShotInputChange: (mode: ShotInput) => void;
  canEdit: boolean;
  onClose: () => void;
}) {
  const rows: [string, string][] = [
    ['espace', 'Lancer / arrêter le chrono'],
    ['c',      'Basculer le mode changement'],
    ['échap',  'Annuler le tir en cours, le changement en attente ou la sélection'],
  ];
  return (
    <Modal onClose={onClose} closeOnBackdropClick maxWidth={420} style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Réglages</h2>
        <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {canEdit && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ ...SECTION_TITLE, margin: '0 0 4px' }}>Saisie des tirs</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {([
              ['court',   'Sur le terrain',   "Un tap sur le terrain, puis ✓ ou ✗. La position est enregistrée : c'est ce qui alimente les grilles de tir."],
              ['buttons', 'Boutons seulement', 'Deux taps, sans position. Plus rapide à suivre, mais aucune grille de tir — les paniers comptent au boxscore et au score.'],
            ] as const).map(([mode, label, help]) => (
              <button key={mode} onClick={() => onShotInputChange(mode)} aria-pressed={shotInput === mode}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${shotInput === mode ? '#00E5A0' : '#2A2F3A'}`,
                  backgroundColor: shotInput === mode ? '#00E5A012' : '#0D0F14',
                }}>
                <span style={{ display: 'block', color: shotInput === mode ? '#00E5A0' : '#CBD5E1', fontSize: '0.84rem', fontWeight: 700 }}>{label}</span>
                <span style={{ display: 'block', color: '#64748B', fontSize: '0.76rem', lineHeight: 1.4, marginTop: 2 }}>{help}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ ...SECTION_TITLE, margin: '0 0 4px' }}>Durée d'un quart-temps</p>
          <p style={{ color: '#64748B', fontSize: '0.76rem', margin: '0 0 8px' }}>
            Sert au calcul des minutes de chaque joueur.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {PERIOD_PRESETS_MIN.map(m => {
              const active = periodDurationSeconds === m * 60;
              return (
                <button key={m} type="button" onClick={() => onPeriodDurationChange(m * 60)}
                  aria-pressed={active}
                  style={{
                    minHeight: TAP, padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
                    fontSize: '0.82rem', fontWeight: active ? 700 : 400,
                    border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
                    backgroundColor: active ? '#00E5A018' : 'transparent',
                    color: active ? '#00E5A0' : '#94A3B8',
                  }}>
                  {m} min
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ ...SECTION_TITLE, margin: '0 0 10px' }}>Raccourcis clavier</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(([key, label]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="tracker-key" style={{ minWidth: 62, textAlign: 'center', padding: '4px 8px', flexShrink: 0 }}>{key}</span>
            <span style={{ color: '#CBD5E1', fontSize: '0.82rem' }}>{label}</span>
          </div>
        ))}
      </div>

      <button onClick={onClose}
        style={{ width: '100%', minHeight: TAP, marginTop: 16, borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Fermer
      </button>
    </Modal>
  );
}

/**
 * Feuille adverse — l'équivalent de notre feuille de match, à ceci près qu'aucun effectif adverse
 * n'existe en base : il se saisit ici, à la chaîne. Entrée valide et rend la main au champ numéro,
 * de sorte qu'on tape la feuille de l'autre banc d'une traite, sans quitter le clavier.
 *
 * Une joueuse déjà référencée par une action pointée ou présente sur le terrain ne peut plus être
 * retirée : l'effacer laisserait un « ? » dans l'historique.
 */
function OpponentSheetModal({ opponentName, opponents, usedIds, onAdd, onRemove, onClose }: {
  opponentName: string;
  opponents: MatchOpponentPlayer[];
  usedIds: Set<string>;
  onAdd: (name: string, number: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const numberRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!name.trim()) return;
    onAdd(name, number);
    setName('');
    setNumber('');
    numberRef.current?.focus();
  }

  return (
    <Modal onClose={onClose} closeOnBackdropClick maxWidth={460} style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Feuille — {opponentName}</h2>
        <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 14px' }}>
        Numéro et nom, puis Entrée : la saisie s'enchaîne. {opponents.length} joueur{opponents.length > 1 ? 's' : ''}.
      </p>

      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        <input ref={numberRef} autoFocus value={number} onChange={e => setNumber(e.target.value)}
          placeholder="N°" inputMode="numeric" aria-label="Numéro"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...INPUT, width: 52, textAlign: 'center', padding: 0 }} />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" aria-label="Nom"
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          style={{ ...INPUT, flex: 1, minWidth: 0 }} />
        <button onClick={submit} disabled={!name.trim()} aria-label="Ajouter"
          style={{ width: 44, height: TAP, borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', opacity: name.trim() ? 1 : 0.4, flexShrink: 0 }}>
          +
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: '40vh', overflowY: 'auto' }}>
        {opponents.length === 0 && <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>Aucun joueur renseigné.</p>}
        {opponents.map(p => {
          const locked = usedIds.has(p.id);
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: TAP, padding: '4px 10px', borderRadius: 8, border: '1px solid #2A2F3A', backgroundColor: '#0D0F14' }}>
              <NumberBadge number={p.number ?? null} />
              <span style={{ flex: 1, minWidth: 0, color: '#F1F5F9', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <button onClick={() => onRemove(p.id)} disabled={locked}
                aria-label={`Retirer ${p.name}`}
                title={locked ? 'Déjà impliqué dans le match : impossible de le retirer' : 'Retirer'}
                style={{ background: 'none', border: 'none', color: locked ? '#2A2F3A' : '#64748B', cursor: locked ? 'not-allowed' : 'pointer', padding: 6, flexShrink: 0 }}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button onClick={onClose}
        style={{ width: '100%', minHeight: TAP, marginTop: 16, borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Terminé
      </button>
    </Modal>
  );
}

/**
 * Confirmation de publication. Elle existe parce que l'écriture REMPLACE en bloc : c'est le même
 * chemin que l'import CSV, et le dernier geste fait foi. L'alerte annonce donc ce qui va
 * disparaître, chiffres à l'appui, plutôt qu'un avertissement générique.
 */
function PublishModal({ existing, players, opponents, score, saving, matchScoreUs, matchScoreThem, onConfirm, onCancel }: {
  existing: ExistingStats;
  players: number;
  opponents: number;
  score: { us: number; them: number };
  saving: boolean;
  matchScoreUs: number;
  matchScoreThem: number;
  onConfirm: (isFinal: boolean) => void;
  onCancel: () => void;
}) {
  /**
   * Publication d'étape par défaut. Publier à la mi-temps est un usage normal — on veut voir le
   * boxscore — mais ça ne doit pas inscrire un score de mi-temps dans le bilan de saison et le
   * classement. Cocher est le geste de fin de match, il se fait une fois.
   */
  const [isFinal, setIsFinal] = useState(false);
  // Une catégorie n'est annoncée supprimée que si la publication a réellement de quoi la
  // remplacer : sans ligne à écrire, `bulkUpsert…` ne touche à rien (cf. api/stats.ts).
  const replacesPlayers   = existing.players > 0 && players > 0;
  const replacesOpponents = existing.opponents > 0 && opponents > 0;
  const replaces = replacesPlayers || replacesOpponents || existing.team;
  return (
    <Modal onClose={saving ? undefined : onCancel} maxWidth={480} style={{ padding: 20 }}>
      <h2 style={{ color: '#F1F5F9', margin: '0 0 14px', fontSize: '1rem', fontWeight: 700 }}>Publier le boxscore</h2>

      <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '0 0 12px' }}>
        Ce match sera enregistré avec <strong style={{ color: '#F1F5F9' }}>{players} joueur{players > 1 ? 's' : ''}</strong>,
        {' '}<strong style={{ color: '#F1F5F9' }}>{opponents} adverse{opponents > 1 ? 's' : ''}</strong> et les totaux d'équipe.
      </p>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: 12, borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${isFinal ? '#00E5A0' : '#2A2F3A'}`, backgroundColor: isFinal ? '#00E5A012' : '#0D0F14',
      }}>
        <input type="checkbox" checked={isFinal} onChange={e => setIsFinal(e.target.checked)} disabled={saving}
          style={{ marginTop: 2, width: 16, height: 16, accentColor: '#00E5A0', cursor: 'pointer' }} />
        <span style={{ color: isFinal ? '#F1F5F9' : '#94A3B8', fontSize: '0.82rem', lineHeight: 1.45 }}>
          <strong>Le match est terminé</strong> — enregistre aussi le score{' '}
          <strong style={{ color: '#F1F5F9' }}>{score.us} — {score.them}</strong> et le résultat sur la fiche du match.
          <br />
          <span style={{ color: '#64748B', fontSize: '0.76rem' }}>
            {isFinal
              ? `Le score actuellement enregistré (${matchScoreUs} — ${matchScoreThem}) sera remplacé. Le bilan de saison et le classement suivront.`
              : 'Décoché, la fiche du match et le bilan de saison ne bougent pas : seules les statistiques sont publiées.'}
          </span>
        </span>
      </label>

      {replaces && (
        <div style={{ display: 'flex', gap: 10, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
          <div style={{ color: '#FCA5A5', fontSize: '0.8rem', lineHeight: 1.45 }}>
            <strong style={{ color: '#EF4444' }}>Des statistiques existent déjà pour ce match et seront supprimées :</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {replacesPlayers && <li>{existing.players} ligne{existing.players > 1 ? 's' : ''} de boxscore</li>}
              {replacesOpponents && <li>{existing.opponents} ligne{existing.opponents > 1 ? 's' : ''} adverse{existing.opponents > 1 ? 's' : ''}</li>}
              {existing.team && <li>les totaux d'équipe</li>}
              {isFinal && existing.scoreUs !== null && (
                <li>le score enregistré ({existing.scoreUs} — {existing.scoreThem})</li>
              )}
            </ul>
            <p style={{ margin: '8px 0 0' }}>
              Si elles viennent d'un import de feuille de marque, elles seront perdues.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} disabled={saving}
          style={{ flex: 1, minHeight: TAP, borderRadius: 6, border: '1px solid #2A2F3A', backgroundColor: '#1E2229', color: '#94A3B8', fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
          Annuler
        </button>
        <button onClick={() => onConfirm(isFinal)} disabled={saving}
          style={{ flex: 1, minHeight: TAP, borderRadius: 6, border: 'none', backgroundColor: replaces ? '#EF4444' : '#00E5A0', color: replaces ? '#FFFFFF' : '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Publication…' : replaces ? 'Remplacer' : 'Publier'}
        </button>
      </div>
    </Modal>
  );
}

/** Titre d'une colonne d'effectif : SEUL le nom d'équipe se tronque, jamais le compteur — il
 *  disparaissait derrière l'ellipsis dès que la colonne se resserrait. */
function RosterTitle({ name, count }: { name: string; count: number }) {
  return (
    <p style={{ ...SECTION_TITLE, margin: 0, display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ flexShrink: 0, color: count === 5 ? '#94A3B8' : '#F59E0B', fontFamily: 'monospace' }}>{count}/5</span>
    </p>
  );
}

/** Ligne d'une joueuse adverse — même gabarit sur le terrain et au banc, comme pour les nôtres. */
function OpponentRow({ player, active, marked, dimmed, canEdit, onClick }: {
  player: MatchOpponentPlayer; active: boolean; marked: boolean; dimmed?: boolean;
  canEdit: boolean; onClick: () => void;
}) {
  const accent = marked ? '#F59E0B' : '#94A3B8';
  const on = active || marked;
  return (
    <button onClick={onClick} disabled={!canEdit || dimmed} aria-pressed={on}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, minHeight: TAP, padding: '4px 10px', borderRadius: 8,
        border: `1px solid ${on ? accent : '#2A2F3A'}`,
        backgroundColor: on ? `${accent}1F` : dimmed ? 'transparent' : '#0D0F14',
        color: on ? '#F1F5F9' : '#CBD5E1', cursor: canEdit && !dimmed ? 'pointer' : 'default',
        fontSize: '0.85rem', fontWeight: on ? 700 : 400, textAlign: 'left',
        opacity: dimmed ? 0.65 : 1,
      }}>
      <NumberBadge number={player.number ?? null} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
    </button>
  );
}

/** Numéro de maillot — même gabarit partout où un numéro est affiché (cf. `LiveTrackingPanel`). */
function NumberBadge({ number }: { number: number | null }) {
  return (
    <span style={{
      minWidth: 24, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 4, backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', flexShrink: 0,
      color: '#94A3B8', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace',
    }}>
      {number ?? '–'}
    </span>
  );
}

/**
 * Feuille de match : le groupe retenu pour ce match, vide au départ. Cochée = retenue ; seuls les
 * joueurs cochés apparaissent au banc et peuvent entrer en jeu.
 *
 * Un joueur DÉJÀ sur le terrain ne peut pas être décoché — le sortir par ce biais laisserait un
 * « ? » sur le terrain et dans l'historique déjà enregistré ; il faut un vrai changement.
 */
function RosterModal({ players, rosterIds, onCourt, onToggle, onToggleAll, onClose }: {
  players: Player[];
  rosterIds: Set<string>;
  onCourt: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onClose: () => void;
}) {
  const allSelected = rosterIds.size === players.length;
  return (
    <Modal onClose={onClose} closeOnBackdropClick maxWidth={460} style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Feuille de match</h2>
        <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
        <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
          Sélectionnez les joueurs retenus. {rosterIds.size} sur {players.length}.
        </p>
        <button onClick={onToggleAll}
          style={{ height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid #2A2F3A', backgroundColor: '#0D0F14', color: '#94A3B8', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0 }}>
          {allSelected ? 'Tout décocher' : 'Tout sélectionner'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: '50vh', overflowY: 'auto' }}>
        {players.map(p => {
          const selected = rosterIds.has(p.id);
          const locked = onCourt.includes(p.id);
          return (
            <button key={p.id} onClick={() => !locked && onToggle(p.id)} disabled={locked} aria-pressed={selected}
              title={locked ? 'Sur le terrain : passez par un changement pour le sortir' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, minHeight: TAP, padding: '4px 10px', borderRadius: 8,
                border: `1px solid ${selected ? '#00E5A055' : '#2A2F3A'}`,
                backgroundColor: selected ? '#00E5A00F' : 'transparent',
                color: selected ? '#F1F5F9' : '#475569', textAlign: 'left',
                cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.6 : 1,
              }}>
              <span style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800,
                border: `1px solid ${selected ? '#00E5A0' : '#2A2F3A'}`,
                backgroundColor: selected ? '#00E5A0' : 'transparent', color: '#0D0F14',
              }}>{selected ? '✓' : ''}</span>
              <NumberBadge number={p.number} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerNameFull(p)}</span>
              {locked && <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.68rem', flexShrink: 0 }}>sur le terrain</span>}
            </button>
          );
        })}
      </div>

      <button onClick={onClose}
        style={{ width: '100%', minHeight: TAP, marginTop: 16, borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
        Terminé
      </button>
    </Modal>
  );
}

function shotChoiceStyle(color: string): React.CSSProperties {
  return {
    width: TAP, height: TAP, borderRadius: '50%', border: `2px solid ${color}`,
    backgroundColor: '#0D0F14EE', color, fontSize: '1.15rem', fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  };
}

/** `accent` distingue l'action ARMÉE (ambre, elle attend son auteur) du simple chaînage après un
 *  tir (vert, c'est une suggestion). Deux états différents ne peuvent pas avoir la même couleur. */
function paletteStyle(highlighted: boolean, enabled: boolean, color = '#CBD5E1', accent = '#00E5A0'): React.CSSProperties {
  return {
    height: TAP, padding: '6px 8px', borderRadius: 6, cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    border: `1px solid ${highlighted ? accent : '#2A2F3A'}`,
    backgroundColor: highlighted ? `${accent}1F` : '#0D0F14',
    color: highlighted ? accent : color,
    opacity: enabled ? 1 : 0.4,
    fontSize: '0.8rem', fontWeight: highlighted ? 700 : 500, lineHeight: 1.2,
  };
}
