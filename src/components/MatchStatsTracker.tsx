import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Undo2, Trash2, ChevronDown, Repeat2, ClipboardList, Settings, Upload, Download, AlertTriangle, X, Maximize2, Minimize2, Film } from 'lucide-react';
import { DiagramCourt } from './DiagramCourt';
import { ShotGrid, SHOT_COLORS } from './ShotChart';
import { Modal } from './Modal';
import { LAYER } from '../styles/layers';
import { MatchScoreboard, scoreboardBtn } from './MatchScoreboard';
import { matchEventsApi } from '../api/matchEvents';
import { enqueueInsert, enqueueDelete, enqueueUpdateTime, flushQueue, pendingCount, queueError, subscribeQueue, takeResyncFlag } from '../api/matchEventQueue';
import { matchLiveApi } from '../api/matchLive';
import { statsApi, type BulkStatRow, type OpponentStatInput } from '../api/stats';
import { matchesApi } from '../api/matches';
import { useMatchClock, PERIOD_PRESETS_MIN, parseClockInput } from '../hooks/useMatchClock';
import { periodSeconds } from '../data/matchClock';
import { useClockHotkey } from '../hooks/useClockHotkey';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { COURT_SIZE } from '../utils/diagram';
import { periodLabel, formatClock, formatGameClock } from '../data/liveTrackingAnalysis';
import { boxscoreFromEvents, scoreFromEvents, eventPoints, lineupStatsFromEvents, teamTotalsFromEvents, EVENT_LABELS, trackerHistory, editableTimeWindow, backwardsTime, type TrackerHistoryEntry } from '../data/matchEvents';
import { quarterSplits } from '../data/matchFlow';
import { playByPlayRows, PLAY_BY_PLAY_HEADER } from '../data/playByPlay';
import { toCsv, downloadCsv, csvFilename } from '../utils/csv';
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
 *   joueur → terrain → ✓/✗        (on sait déjà qui)
 *   terrain → joueur → ✓/✗        (on fige l'endroit, on attribue ensuite)
 * Les autres actions restent à deux taps : joueur → bouton de la palette.
 *
 * Les CHANGEMENTS sont derrière un mode explicite : la sélection sert à saisir des stats, et une
 * rotation déclenchée par le même tap sortait du terrain le joueur simplement « armé » pour la
 * prochaine action — un tap silencieux qui corrompait minutes, +/- et instantanés `onCourt`.
 */

export interface MatchStatsTrackerProps {
  match: Match;
  players: Player[];
  canEdit: boolean;
}

/** Joueuse armée pour la prochaine action. `id: null` n'existe que côté adverse (pointage anonyme). */
type Selection = { side: LineupSide; id: string | null };

/** Confirmation en attente : ce qu'on s'apprête à détruire, et le geste qui le fera. */
type PendingConfirm = {
  title: string;
  detail?: string;
  confirmLabel: string;
  /** Posée AU-DESSUS d'une autre modale (feuille adverse) ; défaut : plan des modales. */
  overModal?: boolean;
  run: () => void;
} | null;
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
 * Que fait un tap sur un joueur EN MODE CHANGEMENT — pure, donc testable sans DOM.
 *
 * Geste à deux taps qui marche dans les deux sens (sortante d'abord ou entrante d'abord) :
 * imposer un ordre obligeait à faire l'aller-retour entre le haut et le bas de la colonne à
 * chaque rotation. Retaper la même joueur annule ; taper une autre du même côté déplace
 * simplement la désignation.
 *
 * Les deux bancs passent par ici, d'où le paramètre `side` : une désignation en attente sur un
 * banc ne peut pas se conclure sur l'autre — taper un joueur adverse après avoir désigné une
 * des nôtres recommence simplement de ce côté-là, plutôt que de fabriquer un changement croisé.
 *
 * C'est le SEUL endroit qui décide qui sort et qui entre, et il est isolé pour cette raison : la
 * version précédente prenait comme sortant le joueur « armé pour la saisie », si bien qu'un
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

/**
 * Hauteur du cadre vidéo, en pixels — redimensionnable à la souris (`resize: vertical`) et
 * retenue d'une séance à l'autre : régler la taille de sa vidéo à chaque ouverture de match est
 * exactement le genre de geste qu'on ne refait pas deux fois sans râler.
 */
const VIDEO_HEIGHT_KEY = 'stamina.trackerVideoHeight';
const VIDEO_HEIGHT_DEFAULT = 320;
/** En dessous, l'image ne montre plus rien d'utile ; au-delà, la saisie passe sous la ligne de
 *  flottaison et on pointe à l'aveugle. */
const VIDEO_HEIGHT_MIN = 140;
const VIDEO_HEIGHT_MAX = 900;

function readVideoHeight(): number {
  try {
    const raw = Number(localStorage.getItem(VIDEO_HEIGHT_KEY));
    if (!Number.isFinite(raw) || raw <= 0) return VIDEO_HEIGHT_DEFAULT;
    return Math.min(VIDEO_HEIGHT_MAX, Math.max(VIDEO_HEIGHT_MIN, Math.round(raw)));
  } catch {
    return VIDEO_HEIGHT_DEFAULT;
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

/**
 * Gabarit des boutons de la barre de commandes. Un seul, pour les quatre : côte à côte, des
 * boutons qui ne se ressemblent pas se lisent comme quatre choses de natures différentes.
 *
 * `disabled` se voit — texte éteint, curseur barré — parce qu'un bouton mort qui garde son air
 * de bouton fait cliquer trois fois avant qu'on cherche pourquoi. L'infobulle dit alors ce qui
 * manque, plutôt que de décrire une action impossible.
 */
function topBtnStyle({ disabled, active }: { disabled?: boolean; active?: boolean } = {}): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 36, padding: '0 12px', borderRadius: 6, flexShrink: 0,
    border: `1px solid ${active && !disabled ? '#00E5A0' : '#2A2F3A'}`,
    backgroundColor: active && !disabled ? '#00E5A01F' : '#1E2229',
    color: disabled ? '#475569' : active ? '#00E5A0' : '#CBD5E1',
    fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

const INPUT: React.CSSProperties = {
  height: TAP, padding: '0 8px', backgroundColor: '#0D0F14', border: '1px dashed #2A2F3A',
  borderRadius: 6, color: '#F1F5F9', fontSize: '0.8rem',
};

/**
 * Palette de saisie, identique pour les deux camps : DEUX boutons par ligne, groupés par thème.
 * Chercher « Faute provoquée » dans une grille de dix cases sans repère coûte une seconde à chaque
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
    { type: 'foul_drawn', label: 'Faute provoquée' },
  ]},
];

/**
 * Actions que la règle crédite à l'ÉQUIPE et non à un joueur : rebond d'équipe (ballon sorti ou
 * récupéré sans capteur désigné) et perte de balle d'équipe (24 secondes, retour en zone). Elles
 * comptent au score, aux totaux collectifs et aux possessions, jamais au boxscore individuel.
 *
 * La liste reste courte de NOTRE côté : un « sans joueur » ouvert à tout deviendrait le raccourci
 * du soir de match, et notre propre boxscore individuel se viderait sans que rien ne l'annonce.
 * Côté adverse il est au contraire ouvert à tout — on suit l'adversaire en agrégé.
 */
const TEAM_EVENT_TYPES: MatchEventType[] = ['reb_def', 'reb_off', 'tov'];

/** Vrai si l'action peut s'écrire avec cet auteur — le seul garde-fou du « sans joueur ». */
export const allowsAuthor = (sel: Selection, type: MatchEventType) =>
  sel.side === 'them' || sel.id !== null || TEAM_EVENT_TYPES.includes(type);

/** Repli sous le terrain : un tir dont on n'a pas eu le temps de prendre la position. La valeur
 *  est figée ici plutôt que déduite de la géométrie — c'est le seul cas où elle l'est. */
const NO_POSITION_SHOTS: { label: string; made: boolean; value: 2 | 3 }[] = [
  { label: '2 ✓', made: true,  value: 2 },
  { label: '2 ✗', made: false, value: 2 },
  { label: '3 ✓', made: true,  value: 3 },
  { label: '3 ✗', made: false, value: 3 },
];

export function MatchStatsTracker({ match, players, canEdit }: MatchStatsTrackerProps) {
  const clock = useMatchClock(match.id, match.periodDurationSeconds);
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
  /** Geste destructeur en attente de confirmation. Une seule boîte pour les trois cas de cet
   *  écran : supprimer une action, retirer un joueur adverse, annuler le dernier geste. */
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** Vidéo du match, lue depuis le disque. Jamais envoyée nulle part : c'est une URL d'objet
   *  locale, valable le temps de l'onglet — d'où l'absence de toute persistance. */
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  /** Correction du temps d'une ligne d'historique : sa clé, la saisie en cours, et le refus
   *  éventuel. `null` = aucune ligne en cours de correction. */
  const [timeEdit, setTimeEdit] = useState<
    { key: string; quarter: number; value: string; min: number; max: number; refused: boolean } | null
  >(null);
  const [videoHeight] = useState(readVideoHeight);
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

  /** La durée d'un quart-temps appartient au match : elle doit valoir la même chose sur la
   *  tablette du club et sur l'ordinateur de l'analyste, sans quoi les minutes publiées changent
   *  selon qui publie. L'écran suit tout de suite, la base derrière. */
  function setPeriodDuration(seconds: number) {
    clock.setPeriodDuration(seconds);
    persist(() => matchesApi.update(match.id, { periodDurationSeconds: seconds }));
  }

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
  /** Panne d'écriture avérée — pas « une action est en vol », qui est le cas normal. */
  const [queueFailed, setQueueFailed] = useState(false);
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
    setQueueFailed(queueError() !== null);
    if (takeResyncFlag()) void load();
  }), [load]);

  useEffect(() => {
    // Un arriéré d'une session précédente part ici. Sans le rechargement qui suit, ces actions
    // rejoignaient bien la base mais restaient INVISIBLES à l'écran jusqu'au prochain F5 — un
    // opérateur voyait son arriéré s'évanouir, exactement l'inverse de ce qu'on lui promet.
    const hadBacklog = pendingCount() > 0;
    flushQueue().then(err => {
      if (err) setError(err.message);
      else if (hadBacklog) void load();
    });
  }, [load]);

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
   * Un joueur est armable s'il est sur le terrain — OU si aucun cinq n'a encore été posé de
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
   * Repère « maintenant » pour le boxscore : la valeur ARRONDIE du chrono, qui ne change que
   * toutes les cinq secondes (cf. `useMatchClock`). Les minutes affichées accusent donc jusqu'à
   * cinq secondes de retard — invisible à l'usage, et la publication prend la valeur exacte.
   */
  const coarseElapsed = clock.elapsedSeconds;

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
      ? (selection.id ? (opponentById.get(selection.id)?.name ?? '?') : `${opponentName} (sans joueur)`)
      : (selection.id ? playerNameShort(playerById.get(selection.id)!) : `${ourTeamName} (sans joueur)`);

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
      gameTimeSeconds: clockRef.current.getElapsedSeconds(),
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
   *  joueur adverse s'écrit dans `opponentPlayerId` et pas dans `playerId`. */
  function authorFields(sel: Selection): Partial<MatchEvent> {
    return sel.side === 'us'
      ? { side: 'us', playerId: sel.id ?? undefined }
      : { side: 'them', opponentPlayerId: sel.id ?? undefined };
  }

  /**
   * Le SEUL chemin d'écriture d'une action : il applique le garde-fou du « sans joueur » et arme
   * l'enchaînement. Les trois gestes qui mènent ici (tir posé sur le terrain, bouton de palette
   * joueur déjà armé, joueur tapé sur une action déjà armée) produisent le même événement ; les
   * laisser recopier la même suite d'appels, c'est trois occasions de la faire diverger.
   */
  function record(sel: Selection, a: { type: MatchEventType; made?: boolean; value?: 2 | 3; x?: number; y?: number }) {
    if (!allowsAuthor(sel, a.type)) return;
    pushEvent({ ...a, ...authorFields(sel) });
    setChain(
      (a.type === 'ft' || a.type === 'shot') && a.made === false ? 'reb'
        : a.type === 'shot' && a.made ? 'ast'
        : null,
    );
    setPendingAction(null);
  }

  /**
   * Plein écran sur l'écran de saisie seul — il n'y a rien d'autre à regarder pendant un match, et
   * la barre de navigation et le menu d'onglets ne font qu'y prendre la place du terrain.
   *
   * L'état ne se déduit pas du bouton mais de `fullscreenchange` : on en sort aussi par Échap, par
   * le geste du système ou par le bouton du navigateur, et une icône qui mentirait sur l'état en
   * cours est pire que pas d'icône.
   */
  const rootRef = useRef<HTMLDivElement>(null);

  /** L'URL d'objet survit au démontage du composant : sans cette libération, quitter l'onglet du
   *  match garde le fichier entier en mémoire jusqu'au rechargement de la page. */
  const videoUrlRef = useRef<string | null>(null);
  videoUrlRef.current = video?.url ?? null;
  useEffect(() => () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current); }, []);

  /**
   * Hauteur du cadre vidéo : c'est le navigateur qui la change (poignée `resize`), on ne fait que
   * la retenir. Volontairement écrite en direct dans `localStorage` sans repasser par l'état :
   * un `setState` ici redéfinirait la hauteur du cadre en plein glissement, et le
   * redimensionnement se battrait contre le rendu.
   */
  const videoBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = videoBoxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      try { localStorage.setItem(VIDEO_HEIGHT_KEY, String(Math.round(el.getBoundingClientRect().height))); }
      catch { /* navigation privée */ }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [video, showVideo]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else rootRef.current?.requestFullscreen().catch(() => setError('Le plein écran a été refusé par le navigateur.'));
  }

  /** Vidéo lue depuis le disque. L'URL d'objet précédente est révoquée : sans ça, chaque fichier
   *  ouvert garde sa copie en mémoire jusqu'au rechargement de l'onglet. */
  function openVideo(file: File | undefined) {
    if (!file) return;
    setVideo(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url: URL.createObjectURL(file), name: file.name };
    });
    setShowVideo(true);
  }

  function closeVideo() {
    setVideo(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
  }

  function handleCourtClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!canEdit || subMode) return;
    // Un tir a toujours un auteur : avec « sans joueur » armé, poser un point n'aboutirait à rien.
    if (selection !== null && !allowsAuthor(selection, 'shot')) return;
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
    record(selection, {
      type: 'shot', made,
      x: +pendingShot.x.toFixed(2), y: +pendingShot.y.toFixed(2),
    });
    setPendingShot(null);
  }

  /**
   * Tap sur un bouton de la palette. Comme pour les tirs, L'ORDRE EST LIBRE : si un joueur est
   * déjà armée, l'action part tout de suite ; sinon l'action s'arme et attend son auteur. Les deux
   * chemins produisent le même événement en deux taps.
   */
  function handleActionTap(type: MatchEventType, made: boolean | undefined, label: string, value?: 2 | 3) {
    if (!canEdit) return;
    if (selection) {
      record(selection, { type, made, value });
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
      record(sel, { type, made, value });
      return;
    }
    setSelection(prev => prev?.side === sel.side && prev.id === sel.id ? null : sel);
  }

  const removeEvent = useCallback((seq: number) => {
    setEvents(prev => prev.filter(e => e.seq !== seq));
    enqueueDelete(match.id, seq);
  }, [match.id]);

  /**
   * Tout geste qui DÉTRUIT une donnée passe par une confirmation — supprimer une action, retirer
   * un joueur adverse, annuler le dernier geste. Une action pointée ne se retrouve pas : il n'y a
   * pas de corbeille, et la feuille de marque papier est déjà repartie avec l'arbitre.
   *
   * La boîte dit CE QU'ELLE VA DÉTRUIRE, en toutes lettres. Une confirmation qui demande juste
   * « êtes-vous sûr ? » ne fait que rajouter un clic : on la valide sans lire, et on découvre
   * après coup qu'on visait la ligne du dessus.
   */
  const ask = useCallback((c: NonNullable<PendingConfirm>) => setPendingConfirm(c), []);

  /** Actions ET changements de banc, mêlés. Un changement ne laissait aucune trace ici : on ne
   *  pouvait ni vérifier qu'il était parti, ni s'apercevoir qu'on en avait fait un de trop. */
  const history = useMemo(() => trackerHistory(events, lineupEvents), [events, lineupEvents]);

  /**
   * Annule le DERNIER GESTE, quel qu'il soit — depuis que les changements figurent dans
   * l'historique, un bouton qui n'annulerait que les actions mentirait.
   *
   * Un changement n'est défaisable que s'il est réellement le dernier : une fois qu'une action a
   * été enregistrée derrière lui, la retirer laisserait cette action avec un cinq qui n'a jamais
   * existé sur le terrain. Dans ce cas l'annulation retombe sur la dernière action, et l'infobulle
   * le dit.
   */
  const lastEntry = history[0];
  const undoTarget: 'lineup' | 'event' | null =
    lastEntry?.kind === 'lineup' ? 'lineup' : events.length > 0 ? 'event' : null;

  const undo = useCallback(() => {
    if (lastEntry?.kind === 'lineup') {
      const { side, seq } = lastEntry.lineup;
      setLineupEvents(prev => prev.filter(e => !(e.side === side && e.seq === seq)));
      setPendingSub(null);
      persist(() => matchLiveApi.deleteLineupEvent(match.id, side, seq));
      return;
    }
    const last = events.at(-1);
    if (last) removeEvent(last.seq);
  }, [lastEntry, events, removeEvent, match.id, persist]);

  /* ── Rotations ─────────────────────────────────────────────────────────── */

  /** `seq` est propre à chaque banc — clé naturelle `(match, side, seq)` de `match_lineup_events`. */
  function pushLineup(side: LineupSide, nextOnCourt: string[], playersIn: string[], playersOut: string[]) {
    const event: MatchLineupEvent = {
      matchId: match.id,
      seq: lineupEvents.filter(e => e.side === side).reduce((m, e) => Math.max(m, e.seq), 0) + 1,
      side, quarter: clock.quarter, gameTimeSeconds: clock.getElapsedSeconds(),
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
        // Le joueur armé vient de sortir : le désarmer plutôt que de laisser pointer ses actions.
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
   * Toute frappe est ignorée dès qu'un champ a le focus : le formulaire d'ajout de joueur
   * adverse est sur le même écran, taper « Dupont » ne doit rien déclencher.
   *
   * Et rien n'écoute tant qu'une MODALE est ouverte : `c` basculait le mode changement pendant
   * qu'on cochait la feuille de match ou qu'on lisait la confirmation de publication, et on
   * revenait sur un écran qui n'était plus dans l'état qu'on avait quitté.
   */
  const modalOpen = showRosterModal || showOpponentSheet || showKeys || publishTarget !== null || pendingConfirm !== null;

  useClockHotkey(clock, canEdit && !modalOpen);

  useEffect(() => {
    if (!canEdit || modalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;

      if (e.key === 'c') {
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
  }, [canEdit, modalOpen, pendingAction, pendingShot, pendingSub]);

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
      const nowSeconds = clock.getElapsedSeconds();
      const rowsUs   = boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, nowSeconds, 'us');
      const rowsThem = boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, nowSeconds, 'them');
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

      // Les scores par quart-temps sont déjà calculés pour l'onglet Play-by-play ; la fiche du
      // match les affichait vides pour un match pourtant saisi de bout en bout.
      const quarterScores = quarterSplits(events).map(q => ({ us: q.pointsUs, them: q.pointsThem }));

      if (isFinal && (finalScore.us !== match.scoreUs || finalScore.them !== match.scoreThem)) {
        await matchesApi.update(match.id, { scoreUs: finalScore.us, scoreThem: finalScore.them, result, quarterScores });
      } else if (isFinal) {
        await matchesApi.update(match.id, { quarterScores });
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

  const recent = history.slice(0, RECENT_COUNT);

  const isSelected = (side: LineupSide, id: string | null) => selection?.side === side && selection?.id === id;

  /** Le « sans joueur » de NOTRE côté n'accepte que les actions d'équipe : plutôt que d'avaler
   *  silencieusement un tap impossible, l'écran éteint ce qu'il refusera — dans les deux sens,
   *  selon qu'on a armé l'auteur ou l'action en premier. */
  const teamAuthorBlocked = pendingAction !== null && !allowsAuthor({ side: 'us', id: null }, pendingAction.type);
  const actionBlocked = (type: MatchEventType) => selection !== null && !allowsAuthor(selection, type);
  const shotBlocked = actionBlocked('shot');

  const rosterName = (side: LineupSide, id: string) => side === 'us'
    ? (playerById.has(id) ? playerNameShort(playerById.get(id)!) : '?')
    : (opponentById.get(id)?.name ?? '?');

  /** Ce que le bouton Annuler va réellement défaire — l'écrire évite l'annulation à l'aveugle,
   *  qui est le geste où l'on se trompe le plus : la dernière ligne n'est pas toujours celle
   *  qu'on croit quand elle vient d'être poussée par une autre. */
  const undoDetail = undoTarget === 'lineup' && lastEntry?.kind === 'lineup'
    ? `${periodLabel(lastEntry.quarter)} ${gameClock(lastEntry.quarter, lastEntry.gameTimeSeconds)} — ${lineupText(lastEntry.lineup)}`
    : (() => {
        const last = events.at(-1);
        return last ? `${periodLabel(last.quarter)} ${gameClock(last.quarter, last.gameTimeSeconds)} — ${eventText(last)}` : '';
      })();

  /**
   * Play-by-play en CSV. C'est la seule sortie qui rend la saisie exploitable ailleurs : tableur,
   * archive, et surtout arbitrage d'un désaccord avec la feuille de marque officielle — sans elle,
   * un écart de deux points en fin de match n'a aucun moyen d'être retracé.
   */
  function exportPlayByPlay() {
    const rows = playByPlayRows(events, {
      us: ourTeamName,
      them: opponentName,
      player:   id => (playerById.has(id) ? playerNameFull(playerById.get(id)!) : '?'),
      opponent: id => opponentById.get(id)?.name ?? '?',
    }, clock.periodDurationSeconds);
    downloadCsv(toCsv([[...PLAY_BY_PLAY_HEADER], ...rows]), csvFilename('play-by-play', opponentName, match.date));
  }

  /** Libellé d'un changement. Le premier d'un banc n'a pas de sortant : c'est la composition de
   *  départ, pas un échange, et l'écrire « → X » se lirait comme une entrée en cours de match. */
  function lineupText(l: MatchLineupEvent): string {
    const name = (id: string) => rosterName(l.side, id);
    if (l.playersOut.length === 0) {
      return l.playersIn.length > 1
        ? `Cinq de départ · ${l.playersIn.map(name).join(', ')}`
        : `Entrée · ${l.playersIn.map(name).join(', ')}`;
    }
    return `${l.playersOut.map(name).join(', ')} → ${l.playersIn.map(name).join(', ')}`;
  }

  /** Temps d'une saisie, tel qu'on le lit sur la table de marque — en décompte.
   *  Déclarée en `function` et non en const : elle est appelée par des valeurs d'affichage
   *  calculées plus haut, et une const y serait lue avant son initialisation. */
  function gameClock(quarter: number, gameTimeSeconds: number) {
    return formatGameClock(quarter, gameTimeSeconds, clock.periodDurationSeconds);
  }

  const entryKey = (h: TrackerHistoryEntry) =>
    h.kind === 'event' ? `e${h.event.seq}` : `l${h.lineup.side}${h.lineup.seq}`;

  /**
   * Corrige le temps d'une ligne d'historique. Le quart-temps, lui, ne bouge pas : il détermine
   * les scores par quart-temps publiés, et le corriger est une autre réparation.
   *
   * La correction est REFUSÉE hors de la fenêtre autorisée plutôt que rabotée en silence : un
   * temps ramené tout seul à la borne serait faux sans que personne l'ait demandé, et la raison
   * du refus (« ce changement est là ») est justement ce qu'il faut lire pour corriger.
   */
  function commitTimeEdit(h: TrackerHistoryEntry, raw: string) {
    const remaining = parseClockInput(raw);
    // Saisi en décompte comme la table de marque, stocké en temps écoulé comme le reste de la base.
    const seconds = remaining === null
      ? null
      : periodSeconds(h.quarter, clock.periodDurationSeconds) - remaining;
    const window = editableTimeWindow(h, events, lineupEvents, clock.periodDurationSeconds);
    if (seconds === null || seconds < window.min || seconds > window.max) {
      setTimeEdit(prev => prev && { ...prev, refused: true });
      return;
    }

    if (h.kind === 'event') {
      setEvents(prev => prev.map(e => e.seq === h.event.seq ? { ...e, gameTimeSeconds: seconds } : e));
      enqueueUpdateTime(match.id, h.event.seq, seconds);
    } else {
      const { side, seq } = h.lineup;
      setLineupEvents(prev => prev.map(e => e.side === side && e.seq === seq ? { ...e, gameTimeSeconds: seconds } : e));
      persist(() => matchLiveApi.updateLineupEventTime(match.id, side, seq, seconds));
    }
    setTimeEdit(null);
  }

  /** Ouvre la correction en affichant d'emblée la fenêtre autorisée : la lire avant de taper vaut
   *  mieux que se faire refuser après. */
  function openTimeEdit(h: TrackerHistoryEntry) {
    if (!canEdit) return;
    const { min, max } = editableTimeWindow(h, events, lineupEvents, clock.periodDurationSeconds);
    setTimeEdit({ key: entryKey(h), quarter: h.quarter, value: gameClock(h.quarter, h.gameTimeSeconds), min, max, refused: false });
  }

  /**
   * Un temps qui RECULE dans un quart-temps est impossible : le chrono ne remonte pas. C'est
   * presque toujours le même geste manqué — poser le temps du quart-temps suivant sans avoir
   * changé de quart-temps — et son symptôme est muet : l'intervalle devient négatif, il est borné
   * à zéro, et le temps de jeu de tout un cinq disparaît sans un mot.
   */
  const backwards = useMemo(() => backwardsTime(events, lineupEvents), [events, lineupEvents]);
  const entrySide = (h: TrackerHistoryEntry) => (h.kind === 'event' ? h.event.side : h.lineup.side);

  function eventText(e: MatchEvent): string {
    const author = e.side === 'us'
      ? (e.playerId ? playerNameShort(playerById.get(e.playerId)!) : 'équipe')
      : (e.opponentPlayerId ? (opponentById.get(e.opponentPlayerId)?.name ?? '?') : 'adv');
    const what = e.type === 'shot' || e.type === 'ft'
      ? `${e.made ? '✓' : '✗'} ${e.type === 'ft' ? 'LF' : `${shotEventValue(e)} pts`}`
      : EVENT_LABELS[e.type];
    return `${what}${author ? ` · ${author}` : ''}`;
  }

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;

  return (
    <div ref={rootRef} className="tracker" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1500, marginInline: 'auto', width: '100%' }}>
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
        /* En plein écran l'élément est seul à l'écran : il porte lui-même le fond et la marge que
           la page lui donnait, et défile pour son propre compte. Sans ça, le fond est noir et le
           contenu colle aux bords. */
        .tracker:fullscreen { background: #0D0F14; padding: 14px; overflow-y: auto; }
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

      {/* Barre de commandes — tout ce qui n'est pas un geste de match : plein écran, publier,
          exporter, réglages. Posée au-dessus de la table de marque plutôt que dispersée dedans
          et dans le bandeau d'historique : mêlés aux boutons du chrono et au bouton Annuler, ils
          encombraient les deux zones qu'on regarde en pointant.

          Les quatre partagent UN gabarit (`topBtnStyle`) : quatre boutons côte à côte qui ne se
          ressemblent pas se lisent comme quatre choses de natures différentes. Le plein écran est
          seul à gauche — il agit sur l'écran, les trois autres sur le match. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {document.fullscreenEnabled && (
          <button onClick={toggleFullscreen} aria-pressed={fullscreen}
            title="Ne garder que l'écran de saisie"
            style={topBtnStyle({ active: fullscreen })}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {fullscreen ? 'Quitter le plein écran' : 'Passer en plein écran'}
          </button>
        )}

        {/* Le plein écran change l'écran, les trois autres agissent sur le match : cet écart les
            sépare, il n'est pas décoratif. */}
        <div style={{ flex: 1 }} />

        {canEdit && (() => {
          const disabled = publishState !== 'idle' || events.length === 0;
          return (
            <button onClick={openPublish} disabled={disabled} style={topBtnStyle({ disabled })}
              title={events.length === 0
                ? 'Rien à publier : aucune action enregistrée'
                : 'Publier le boxscore dans les statistiques du match'}>
              <Upload size={14} />{publishState === 'checking' ? 'Vérification…' : 'Publier'}
            </button>
          );
        })()}

        <button onClick={exportPlayByPlay} disabled={events.length === 0}
          style={topBtnStyle({ disabled: events.length === 0 })}
          title={events.length === 0
            ? 'Rien à exporter : aucune action enregistrée'
            : 'Exporter le play-by-play en CSV'}>
          <Download size={14} />Exporter
        </button>

        <button onClick={() => setShowKeys(true)} style={topBtnStyle()} title="Réglages et raccourcis">
          <Settings size={14} />Réglages
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '8px 12px', color: '#EF4444', fontSize: '0.78rem' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} aria-label="Masquer" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bandeau d'écriture : il ne parle QUE quand l'enregistrement est réellement en panne.
          Il s'affichait dès qu'une action était en vol — deux cents millisecondes, à chaque tap —
          et faisait sauter la mise en page du haut de l'écran en continu. */}
      {queueFailed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '8px 12px', color: '#F59E0B', fontSize: '0.78rem' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {pending} action{pending > 1 ? 's' : ''} n'{pending > 1 ? 'ont' : 'a'} pas pu être enregistrée{pending > 1 ? 's' : ''}. Elle{pending > 1 ? 's repartiront' : ' repartira'} au retour du réseau — ne fermez pas l'onglet.
          </span>
          <button onClick={() => { flushQueue().then(err => setError(err ? err.message : '')); }}
            style={{ ...SMALL_BTN, height: 28, borderColor: '#F59E0B', color: '#F59E0B' }}>
            Réessayer
          </button>
        </div>
      )}

      {/* Un chrono ne remonte jamais dans un quart-temps. Le bandeau n'est pas masquable : tant
          que la saisie est dans cet état, des minutes sont perdues à chaque lecture. */}
      {backwards && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 6, padding: '8px 12px', color: '#F59E0B', fontSize: '0.78rem', lineHeight: 1.5 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Le temps recule en {periodLabel(backwards.quarter)} : {gameClock(backwards.quarter, backwards.previous)} puis {gameClock(backwards.quarter, backwards.current)}.
            Un chrono ne remonte pas — avez-vous oublié de passer au quart-temps suivant&nbsp;?{' '}
            <strong style={{ color: '#FBBF24' }}>Tant que c'est le cas, le temps de jeu du cinq concerné est compté zéro.</strong>{' '}
            Corrigez le temps dans l'historique, ou refaites le changement dans le bon quart-temps.
          </span>
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
      />

      {/* Accusé de réception : la dernière action enregistrée s'allume ici, juste sous le score,
          au centre du regard. Trois suffisent à vérifier ce qu'on vient de faire ; le reste est de
          la relecture et vit dans le dépliant. */}
      <div style={{ ...PANEL, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ ...SECTION_TITLE, margin: 0, flexShrink: 0 }}>Dernières actions</span>

          <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
            {recent.length === 0 && <span style={{ color: '#475569', fontSize: '0.75rem' }}>Aucune action enregistrée.</span>}
            {recent.map((h, i) => (
              <span key={entryKey(h)} className={i === 0 ? 'tracker-flash' : undefined}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  padding: '6px 10px', borderRadius: 999,
                  border: `1px solid ${h.kind === 'lineup' ? '#F59E0B55' : '#2A2F3A'}`,
                  backgroundColor: h.kind === 'lineup' ? '#F59E0B0F' : '#0D0F14',
                  color: entrySide(h) === 'us' ? '#CBD5E1' : '#64748B',
                  fontSize: '0.75rem', whiteSpace: 'nowrap',
                }}>
                <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '0.68rem' }}>{periodLabel(h.quarter)} {gameClock(h.quarter, h.gameTimeSeconds)}</span>
                {h.kind === 'lineup'
                  ? <><Repeat2 size={12} style={{ color: '#F59E0B' }} />{lineupText(h.lineup)}</>
                  : eventText(h.event)}
              </span>
            ))}
          </div>

          {canEdit && (
            <button disabled={undoTarget === null}
              onClick={() => ask({
                title: undoTarget === 'lineup' ? 'Annuler ce changement ?' : 'Annuler cette action ?',
                detail: undoDetail,
                confirmLabel: undoTarget === 'lineup' ? 'Annuler le changement' : "Annuler l'action",
                run: undo,
              })}
              title={
                undoTarget === 'lineup' ? 'Annuler le dernier changement'
                : undoTarget === 'event' ? (lastEntry?.kind === 'lineup' ? 'Annuler la dernière action' : 'Annuler la dernière action')
                : 'Rien à annuler'
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 6, flexShrink: 0,
                border: `1px solid ${undoTarget === 'lineup' ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.45)'}`,
                backgroundColor: undoTarget === 'lineup' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
                color: undoTarget === 'lineup' ? '#F59E0B' : '#EF4444', fontSize: '0.78rem', fontWeight: 600,
                cursor: undoTarget ? 'pointer' : 'not-allowed', opacity: undoTarget ? 1 : 0.35,
              }}>
              <Undo2 size={14} />{undoTarget === 'lineup' ? 'Annuler le changement' : 'Annuler'}
            </button>
          )}

          <button onClick={() => setShowFullHistory(v => !v)} aria-expanded={showFullHistory}
            title="Voir tout l'historique"
            style={{ ...SMALL_BTN, flexShrink: 0 }}>
            <ChevronDown size={14} style={{ transform: showFullHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', marginRight: 5 }} />
            {history.length}
          </button>
        </div>

        {showFullHistory && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto', marginTop: 10, paddingTop: 10, borderTop: '1px solid #1E2229' }}>
            {history.map(h => (
              <div key={entryKey(h)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem' }}>
                {/* Le temps se corrige sur place — c'est la seule donnée d'une ligne déjà
                    enregistrée qu'on puisse avoir tapée de travers sans s'en apercevoir, et pour
                    qui pose le temps à la main à chaque changement, c'est le geste le plus
                    fréquent. La fenêtre autorisée est calculée à l'ouverture, pas à la validation :
                    autant la lire avant de taper. */}
                {canEdit && timeEdit?.key === entryKey(h) ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ color: '#475569', fontFamily: 'monospace' }}>{periodLabel(h.quarter)}</span>
                    <input
                      autoFocus value={timeEdit.value}
                      onChange={e => setTimeEdit(prev => prev && { ...prev, value: e.target.value, refused: false })}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); commitTimeEdit(h, timeEdit.value); }
                        if (e.key === 'Escape') { e.preventDefault(); setTimeEdit(null); }
                      }}
                      onBlur={() => setTimeEdit(null)}
                      aria-label="Corriger le temps de cette ligne"
                      style={{ width: 62, height: 26, padding: '0 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.76rem', textAlign: 'center', backgroundColor: '#0D0F14', border: `1px solid ${timeEdit.refused ? '#EF4444' : '#00E5A0'}`, color: '#F1F5F9' }}
                    />
                    <span title="Au-delà, la ligne franchirait un changement de banc et son cinq ne serait plus le bon"
                      style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: timeEdit.refused ? '#EF4444' : '#475569' }}>
                      {gameClock(timeEdit.quarter, timeEdit.min)}–{gameClock(timeEdit.quarter, timeEdit.max)}
                    </span>
                  </span>
                ) : (
                  <button
                    onClick={() => openTimeEdit(h)}
                    disabled={!canEdit}
                    title={canEdit ? 'Corriger le temps' : undefined}
                    style={{ background: 'none', border: 'none', padding: 0, flexShrink: 0, fontFamily: 'monospace', fontSize: '0.76rem', color: '#475569', cursor: canEdit ? 'pointer' : 'default' }}>
                    {periodLabel(h.quarter)} {gameClock(h.quarter, h.gameTimeSeconds)}
                  </button>
                )}
                {h.kind === 'lineup' ? (
                  <>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Repeat2 size={12} style={{ flexShrink: 0 }} />{lineupText(h.lineup)}
                    </span>
                    {/* Pas de suppression : retirer un changement fausserait le cinq mémorisé sur
                        toutes les actions déjà enregistrées après lui. Pour corriger, refaire le
                        changement inverse — c'est aussi le geste réel. */}
                    {canEdit && <span style={{ width: 23, flexShrink: 0 }} />}
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 0, color: h.event.side === 'us' ? '#CBD5E1' : '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {eventText(h.event)}
                      {eventPoints(h.event) > 0 && <span style={{ color: h.event.side === 'us' ? teamColor : '#94A3B8' }}> +{eventPoints(h.event)}</span>}
                    </span>
                    {canEdit && (
                      <button onClick={() => ask({
                        title: 'Supprimer cette action ?',
                        detail: `${periodLabel(h.quarter)} ${gameClock(h.quarter, h.gameTimeSeconds)} — ${eventText(h.event)}. Elle ne sera pas récupérable.`,
                        confirmLabel: 'Supprimer',
                        run: () => removeEvent(h.event.seq),
                      })} aria-label="Supprimer cette action"
                        style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 5, flexShrink: 0 }} title="Supprimer">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vidéo du match, lue depuis le DISQUE — rien n'est envoyé ni stocké, c'est une URL d'objet
          locale valable le temps de l'onglet. Volontairement indépendante du chrono : la caler
          sur l'axe de temps du match demande un point de repère que seule la table de marque
          donne, et une vidéo mal calée date faux TOUTES les actions pointées derrière.
          Repliée par défaut : en direct on ne la veut pas, elle sert à pointer après match. */}
      <div style={{ ...PANEL, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowVideo(v => !v)} aria-expanded={showVideo} disabled={!video}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, ...SECTION_TITLE, margin: 0, cursor: video ? 'pointer' : 'default' }}>
            <ChevronDown size={14} style={{ transform: showVideo && video ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            Vidéo
          </button>

          <span style={{ flex: 1, minWidth: 0, color: '#475569', fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {video ? video.name : 'Aucune vidéo ouverte. Le fichier reste sur cet appareil.'}
          </span>

          <label style={{ ...SMALL_BTN, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <Film size={13} />{video ? 'Changer' : 'Ouvrir une vidéo'}
            <input type="file" accept="video/*" style={{ display: 'none' }}
              onChange={e => { openVideo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>

          {video && (
            <button onClick={closeVideo} style={{ ...SMALL_BTN, flexShrink: 0 }}>Retirer</button>
          )}
        </div>

        {/* Cadre redimensionnable à la poignée, en bas à droite — `resize` du navigateur, pas une
            poignée maison : elle gère déjà le glissement, le tactile et le clavier. La vidéo
            occupe le cadre sans se déformer. */}
        {video && showVideo && (
          <div ref={videoBoxRef} style={{
            height: videoHeight, minHeight: VIDEO_HEIGHT_MIN, maxHeight: VIDEO_HEIGHT_MAX,
            resize: 'vertical', overflow: 'hidden',
            // Une bande sous la vidéo pour la poignée : sans elle, elle se pose exactement sur le
            // bouton plein écran du lecteur, et un clic sur deux redimensionne au lieu de lire.
            paddingBottom: 14,
            marginTop: 10, borderRadius: 8, backgroundColor: '#000',
          }}>
            <video src={video.url} controls playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
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
              return (
                <RosterRow key={id} number={player.number} name={playerNameShort(player)} accent={teamColor}
                  active={isSelected('us', id)}
                  marked={subMode && pendingSub?.side === 'us' && pendingSub.id === id}
                  canEdit={canEdit}
                  onClick={() => handleRosterTap('us', id, 'court')} />
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
            {bench.map(p => (
              <RosterRow key={p.id} number={p.number} name={playerNameShort(p)} accent={teamColor}
                active={isSelected('us', p.id)}
                marked={subMode && pendingSub?.side === 'us' && pendingSub.id === p.id}
                dimmed={!subMode && !isSelectable('us', p.id)}
                canEdit={canEdit}
                title={subMode ? `Faire entrer ${playerNameShort(p)}` : undefined}
                onClick={() => handleRosterTap('us', p.id, 'bench')} />
            ))}
          </div>

          {/* « Sans joueur » — les actions que la règle crédite à l'équipe se pointent comme
              n'importe quelle autre : on arme cet auteur, puis on tape l'action. Trois boutons
              dédiés vivaient ici ; ils dupliquaient des intitulés déjà présents dans la palette
              et n'obéissaient pas au même geste que tout le reste de l'écran. */}
          {canEdit && (
            <div style={{ marginTop: 8 }}>
              <RosterRow number={null} name="Sans joueur" accent="#94A3B8" canEdit
                active={isSelected('us', null)}
                dimmed={teamAuthorBlocked}
                title="Action d'équipe : rebond ou ballon perdu sans joueur désigné. Elle compte aux totaux et aux possessions, jamais au boxscore individuel."
                onClick={() => selectPlayer({ side: 'us', id: null })} />
            </div>
          )}
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
               prennent toute la colonne.

               C'est le RÉGLAGE qui décide, et lui seul. Ces mêmes boutons ont d'abord vécu sous
               le terrain, en secours du tir qu'on n'a pas eu le temps de placer : posés là, ils
               se prenaient pour le chemin normal, et on pointait au bouton un match entier sans
               s'apercevoir qu'on perdait toutes les positions — donc la grille de tir du match. */
            <div>
              <p style={SECTION_TITLE}>Tirs</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                {NO_POSITION_SHOTS.map(b => (
                  <button key={b.label} onClick={() => handleActionTap('shot', b.made, b.label, b.value)} disabled={!canEdit || shotBlocked}
                    aria-pressed={pendingAction?.label === b.label}
                    aria-label={`${b.value} points ${b.made ? 'réussi' : 'manqué'}`}
                    style={{
                      ...paletteStyle(
                        !shotBlocked && pendingAction?.label === b.label, !shotBlocked, b.made ? '#00E5A0' : '#EF4444',
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
                style={{ width: '100%', display: 'block', borderRadius: 8, opacity: shotBlocked ? 0.45 : 1,
                  cursor: canEdit && !subMode && !shotBlocked ? 'crosshair' : 'default' }}
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
                    {group.buttons.map(b => {
                      const blocked = actionBlocked(b.type);
                      return (
                        <button key={b.label} onClick={() => handleActionTap(b.type, b.made, b.label)}
                          disabled={!canEdit || blocked}
                          title={blocked ? "Sans joueur, seuls un rebond ou un ballon perdu se créditent à l'équipe" : undefined}
                          aria-pressed={pendingAction?.label === b.label}
                          style={paletteStyle(
                            !blocked && (pendingAction?.label === b.label || (chain !== null && b.chain === chain)),
                            !blocked, b.tone, pendingAction?.label === b.label ? '#F59E0B' : '#00E5A0',
                          )}>
                          <span className="tracker-action-label">{b.label}</span>
                        </button>
                      );
                    })}
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
              <RosterRow key={p.id} number={p.number ?? null} name={p.name} accent="#94A3B8" canEdit={canEdit}
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
                  <RosterRow key={p.id} number={p.number ?? null} name={p.name} accent="#94A3B8" canEdit={canEdit}
                    active={isSelected('them', p.id)}
                    marked={subMode && pendingSub?.side === 'them' && pendingSub.id === p.id}
                    dimmed={!subMode && !isSelectable('them', p.id)}
                    title={subMode ? `Faire entrer ${p.name}` : undefined}
                    onClick={() => handleRosterTap('them', p.id, 'bench')} />
                ))}
              </div>
            </>
          )}

          {/* Le pointage anonyme reste toujours à portée : on ne saisit pas un panier encaissé
              moins bien parce qu'on n'a pas eu le numéro. Contrairement au nôtre, il accepte
              TOUTES les actions — suivre l'adversaire en agrégé est le cas normal. */}
          <div style={{ marginTop: 8 }}>
            <RosterRow number={null} name="Sans joueur" accent="#94A3B8" canEdit={canEdit}
              active={isSelected('them', null)}
              title="Enregistrer une action adverse sans l'attribuer : elle compte au score et aux totaux, pas au boxscore individuel"
              onClick={() => selectPlayer({ side: 'them', id: null })} />
          </div>
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
          noMinutes={boxscore.length > 0 && boxscore.every(r => r.min === 0)}
          noLineup={lineupEvents.length === 0}
          opponents={boxscoreFromEvents(events, lineupEvents, clock.periodDurationSeconds, clock.quarter, coarseElapsed, 'them').length}
          score={score} saving={publishState === 'saving'}
          matchScoreUs={match.scoreUs} matchScoreThem={match.scoreThem}
          onConfirm={confirmPublish} onCancel={() => setPublishTarget(null)}
        />
      )}

      {showKeys && (
        <SettingsModal
          periodDurationSeconds={clock.periodDurationSeconds}
          onPeriodDurationChange={setPeriodDuration}
          shotInput={shotInput}
          onShotInputChange={setShotInput}
          canEdit={canEdit}
          onClose={() => setShowKeys(false)}
        />
      )}

      {showOpponentSheet && (
        <OpponentSheetModal
          opponentName={opponentName} opponents={opponents} usedIds={usedOpponentIds}
          onAdd={addOpponent}
          onRemove={id => ask({
            title: 'Retirer ce joueur de la feuille adverse ?',
            detail: `${opponents.find(p => p.id === id)?.name ?? ''} sera retiré de la feuille. Les joueurs déjà pointés ou sur le terrain ne peuvent pas l'être.`,
            confirmLabel: 'Retirer',
            overModal: true,
            run: () => removeOpponent(id),
          })}
          onClose={() => setShowOpponentSheet(false)}
        />
      )}

      {pendingConfirm && (
        <ConfirmModal
          {...pendingConfirm}
          onConfirm={() => { pendingConfirm.run(); setPendingConfirm(null); }}
          onCancel={() => setPendingConfirm(null)}
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
    ['s',      'Lancer / arrêter le chrono'],
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
 * Un joueur déjà référencé par une action pointée ou présent sur le terrain ne peut plus être
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
function PublishModal({ existing, players, opponents, score, saving, matchScoreUs, matchScoreThem, noMinutes, noLineup, onConfirm, onCancel }: {
  existing: ExistingStats;
  players: number;
  opponents: number;
  score: { us: number; them: number };
  saving: boolean;
  matchScoreUs: number;
  matchScoreThem: number;
  /** Aucune minute mesurée : le chrono n'a jamais tourné. */
  noMinutes: boolean;
  /** Aucun cinq composé : ni titulaires, ni +/-. */
  noLineup: boolean;
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

      {/* Ce qui va être publié À VIDE. Ces colonnes partent dans `match_stats` et divisent
          ensuite le %USG/min, les statistiques par 36 minutes, les archétypes et la PCA : des
          zéros y font plus de dégâts qu'une ligne absente, et rien ne les signalait. */}
      {(noMinutes || noLineup) && (
        <div style={{ display: 'flex', gap: 10, backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0, marginTop: 1 }} />
          <div style={{ color: '#FCD34D', fontSize: '0.8rem', lineHeight: 1.45 }}>
            <strong style={{ color: '#F59E0B' }}>Ce boxscore sera publié incomplet.</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {noMinutes && <li>Aucune minute : le chrono n'a pas tourné. Les statistiques par 36 minutes, le %USG/min, les archétypes et la PCA reposent dessus.</li>}
              {noLineup && <li>Aucun cinq composé : ni titulaires, ni +/-.</li>}
            </ul>
            <p style={{ margin: '8px 0 0' }}>Publier reste possible — ces colonnes seront simplement à zéro.</p>
          </div>
        </div>
      )}

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

/**
 * Ligne d'effectif — MÊME gabarit des deux côtés, terrain, banc et « sans joueur » compris. Les
 * deux colonnes avaient divergé : la nôtre grisait son banc en permanence alors qu'il restait
 * cliquable, et affichait une photo là où l'autre affichait un numéro. En plein match, deux
 * colonnes qui ne se lisent pas pareil se lisent mal.
 */
function RosterRow({ number, name, accent, active, marked, dimmed, canEdit, title, onClick }: {
  number: number | null; name: string; accent: string;
  active: boolean; marked?: boolean; dimmed?: boolean; canEdit: boolean;
  title?: string; onClick: () => void;
}) {
  const on = active || !!marked;
  const tone = marked ? '#F59E0B' : accent;
  return (
    <button onClick={onClick} disabled={!canEdit || dimmed} aria-pressed={on} title={title}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 9, minHeight: TAP, padding: '4px 10px', borderRadius: 8,
        border: `1px solid ${on ? tone : '#2A2F3A'}`,
        backgroundColor: on ? `${tone}1F` : dimmed ? 'transparent' : '#0D0F14',
        color: on ? '#F1F5F9' : '#CBD5E1', cursor: canEdit && !dimmed ? 'pointer' : 'default',
        fontSize: '0.85rem', fontWeight: on ? 700 : 400, textAlign: 'left',
        opacity: dimmed ? 0.5 : 1,
      }}>
      <NumberBadge number={number} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
    </button>
  );
}

/**
 * Confirmation d'un geste qui détruit une donnée. Le bouton de retour s'appelle « Retour » et non
 * « Annuler » : sur cet écran, « Annuler » est justement le nom du geste destructeur, et deux
 * boutons « Annuler » côte à côte dans la même boîte ne veulent plus rien dire.
 */
function ConfirmModal({ title, detail, confirmLabel, overModal, onConfirm, onCancel }: {
  title: string; detail?: string; confirmLabel: string; overModal?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal maxWidth={400} scrollOverlay={false} onClose={onCancel} closeOnBackdropClick
      zIndex={overModal ? LAYER.modalOverModal : undefined} style={{ padding: 24 }}>
      <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
      {detail && <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.5 }}>{detail}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
          Retour
        </button>
        <button type="button" onClick={onConfirm} autoFocus
          style={{ flex: 1, padding: 10, backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
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
