import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play as PlayIcon, Pause, SkipForward, SkipBack, Settings2, Trash2, Check, X, ChevronRight } from 'lucide-react';
import { matchLiveApi } from '../api/matchLive';
import { playsApi } from '../api/plays';
import { PlayerAvatar } from './PlayerAvatar';
import { LiveActionModal, type LiveActionInput } from './LiveActionModal';
import { PlaysConfigModal } from './PlaysConfigModal';
import { useMatchClock } from '../hooks/useMatchClock';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  playStats, lineupStats, playerPlusMinus, playingTime, recomputeOnCourtSnapshots, periodLabel, formatClock,
  rentabiliteColor, OFFENSE_THRESHOLDS, DEFENSE_THRESHOLDS,
} from '../data/liveTrackingAnalysis';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type {
  Match, Player, Play, MatchOpponentPlayer, MatchLineupEvent, MatchLiveAction, LineupSide, LiveSide,
} from '../data/types';

export interface LiveTrackingPanelProps {
  match: Match;
  /** Effectif de la saison du match — déjà chargé par la fiche match. */
  players: Player[];
  canEdit: boolean;
}

/** Joueuse sélectionnée en attente d'un changement. `from` retient d'où part le geste : on peut
 *  désigner d'abord l'entrante (banc) OU d'abord la sortante (terrain), le second tap complète le
 *  changement dans les deux sens — n'imposer qu'un seul ordre obligeait à faire l'aller-retour
 *  entre le bas et le haut de la colonne à chaque rotation. */
type PendingSub = { side: LineupSide; playerId: string; from: 'court' | 'bench' } | null;
/** Une ligne de l'historique, assez d'info pour être supprimée depuis la liste. */
type HistoryRow = { key: string; kind: 'action'; seq: number } | { key: string; kind: 'lineup'; side: LineupSide; seq: number };

/**
 * Roster affichable, uniforme entre nos joueuses (effectif) et les adverses (saisies à la volée).
 * Deux formats de nom : `fullName` ("Prénom NOM", même convention que le reste de l'app —
 * `playerNameFull`) pour une ligne qui n'affiche qu'une seule joueuse, `shortName`
 * ("Prénom N.") pour les endroits où plusieurs noms se suivent sur la même ligne (pastilles sur
 * le terrain, historique, combinaisons de cinq) et où le nom complet ferait déborder.
 */
interface RosterEntry {
  id: string;
  number: number | null;
  fullName: string;
  shortName: string;
}

const panelSection: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 16,
};

/** Table de marque : les trois colonnes (nous / chrono / eux) tiennent TOUJOURS sur une ligne,
 *  y compris sur un téléphone étroit — d'où les tailles fluides plutôt qu'un retour à la ligne
 *  qui casserait la lecture du score en un coup d'œil. */
const scoreLabel: React.CSSProperties = {
  fontSize: 'clamp(0.6rem, 2.6vw, 0.78rem)', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', margin: '0 0 4px',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const scoreValue: React.CSSProperties = {
  color: '#F1F5F9', fontSize: 'clamp(1.6rem, 9vw, 2.6rem)', fontWeight: 800, margin: 0, lineHeight: 1,
};

/** Numéro de maillot — un vrai badge (fond distinct, monospace) plutôt qu'un "#7 " en texte
 *  brut qui se fondait dans le nom. Même gabarit partout où un numéro est affiché. */
function NumberBadge({ number }: { number: number | null }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 22, height: 18, padding: '0 4px', borderRadius: 4, flexShrink: 0,
      backgroundColor: '#0D0F14', border: '1px solid #2A2F3A',
      color: '#94A3B8', fontSize: '0.68rem', fontWeight: 700, fontFamily: 'monospace',
    }}>
      {number ?? '–'}
    </span>
  );
}

/** Initiale du nom saisi, comme `PlayerAvatar` — le numéro a désormais son propre badge
 *  (`NumberBadge`) partout, l'afficher aussi ici le répéterait à chaque ligne. */
function OpponentAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #47556933, #47556966)', border: '2px solid #47556955',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.4, color: '#94A3B8',
    }}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export function LiveTrackingPanel({ match, players, canEdit }: LiveTrackingPanelProps) {
  const clock = useMatchClock();
  const { selected } = useTeamSeason();
  const teamColor    = selected?.team.color ?? '#00E5A0';
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';

  const [opponentPlayers, setOpponentPlayers] = useState<MatchOpponentPlayer[]>([]);
  const [lineupEvents,    setLineupEvents]    = useState<MatchLineupEvent[]>([]);
  const [actions,         setActions]         = useState<MatchLiveAction[]>([]);
  const [plays,           setPlays]           = useState<Play[]>([]);
  /** Ids des joueuses retenues pour ce match. Vide = aucune sélection enregistrée, donc tout
   *  l'effectif de la saison est disponible (cf. `match_roster` dans schema.sql). */
  const [rosterIds, setRosterIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [pendingSub, setPendingSub]     = useState<PendingSub>(null);
  const [starters, setStarters]         = useState<Record<LineupSide, Set<string>>>({ us: new Set(), them: new Set() });
  const [actionModal, setActionModal]   = useState<LiveSide | null>(null);
  const [savingAction, setSavingAction] = useState(false);
  const [showPlaysConfig, setShowPlaysConfig] = useState(false);
  const [newOpponentName, setNewOpponentName]     = useState('');
  const [newOpponentNumber, setNewOpponentNumber] = useState('');
  const [showSummary, setShowSummary]   = useState(false);
  /** Clé de la ligne d'historique en attente de confirmation de suppression — deux clics valent
   *  mieux qu'une modale pour un geste censé rester rapide en plein match. */
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [opp, events, acts, teamPlays, roster] = await Promise.all([
        matchLiveApi.getOpponentPlayers(match.id),
        matchLiveApi.getLineupEvents(match.id),
        matchLiveApi.getActions(match.id),
        playsApi.getForTeam(match.teamId),
        matchLiveApi.getRoster(match.id),
      ]);
      setOpponentPlayers(opp);
      setLineupEvents(events);
      setActions(acts);
      setPlays(teamPlays);
      setRosterIds(roster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [match.id, match.teamId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Barre espace = lancer/arrêter le chrono, le geste le plus urgent du match (coup de sifflet).
   * Ignorée dès qu'une saisie est en cours (champ de texte, liste déroulante) ou qu'une modale est
   * ouverte, et quand le focus est sur un bouton — sinon on volerait l'activation clavier native
   * de ce bouton. `preventDefault` empêche le défilement de la page, comportement par défaut de
   * l'espace.
   */
  useEffect(() => {
    if (!canEdit || actionModal || showPlaysConfig) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || el?.isContentEditable) return;
      e.preventDefault();
      if (clock.running) clock.pause(); else clock.start();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canEdit, actionModal, showPlaysConfig, clock.running, clock.pause, clock.start]);

  const onCourt = useMemo(() => {
    const last: Record<LineupSide, string[]> = { us: [], them: [] };
    for (const ev of lineupEvents) last[ev.side] = ev.onCourt;
    return last;
  }, [lineupEvents]);

  const nextLineupSeq = useCallback((side: LineupSide) => {
    const max = lineupEvents.filter(e => e.side === side).reduce((m, e) => Math.max(m, e.seq), 0);
    return max + 1;
  }, [lineupEvents]);

  const nextActionSeq = useMemo(() => actions.reduce((m, a) => Math.max(m, a.seq), 0) + 1, [actions]);

  /**
   * Effectif réellement proposé pour ce match. Une joueuse déjà sur le terrain reste incluse même
   * si elle vient d'être décochée dans la config : la retirer de la liste d'affichage laisserait
   * un « ? » sur le terrain et dans l'historique déjà enregistré.
   */
  const matchPlayers = useMemo(() => {
    if (rosterIds.length === 0) return players;
    const kept = new Set([...rosterIds, ...onCourt.us]);
    return players.filter(p => kept.has(p.id));
  }, [players, rosterIds, onCourt.us]);

  const usRoster: RosterEntry[]   = useMemo(() => matchPlayers.map(p => ({ id: p.id, number: p.number, fullName: playerNameFull(p), shortName: playerNameShort(p) })), [matchPlayers]);
  // Nom adverse saisi à la volée, en un seul champ libre : aucun raccourci fiable à en tirer,
  // les deux formats sont donc identiques ici (contrairement à notre effectif prénom/nom séparés).
  const themRoster: RosterEntry[] = useMemo(() => opponentPlayers.map(p => ({ id: p.id, number: p.number ?? null, fullName: p.name, shortName: p.name })), [opponentPlayers]);

  async function confirmStarters(side: LineupSide) {
    const ids = [...starters[side]];
    if (ids.length === 0) return;
    const seq = nextLineupSeq(side);
    const event: MatchLineupEvent = {
      matchId: match.id, seq, side, quarter: clock.quarter, gameTimeSeconds: clock.elapsedSeconds,
      playersIn: ids, playersOut: [], onCourt: ids,
    };
    await matchLiveApi.insertLineupEvent(event);
    setLineupEvents(prev => [...prev, event]);
    setStarters(prev => ({ ...prev, [side]: new Set() }));
  }

  function toggleStarter(side: LineupSide, id: string) {
    setStarters(prev => {
      const next = new Set(prev[side]);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...prev, [side]: next };
    });
  }

  async function performSwap(side: LineupSide, incoming: string, outgoing: string) {
    const current = onCourt[side];
    const nextOnCourt = current.map(id => id === outgoing ? incoming : id);
    const seq = nextLineupSeq(side);
    const event: MatchLineupEvent = {
      matchId: match.id, seq, side, quarter: clock.quarter, gameTimeSeconds: clock.elapsedSeconds,
      playersIn: [incoming], playersOut: [outgoing], onCourt: nextOnCourt,
    };
    await matchLiveApi.insertLineupEvent(event);
    setLineupEvents(prev => [...prev, event]);
    setPendingSub(null);
  }

  /**
   * Un seul geste pour les deux sens : premier tap = la joueuse concernée (entrante depuis le banc
   * ou sortante depuis le terrain), second tap du côté opposé = le changement part. Retaper la
   * même joueuse annule ; taper une autre du même côté déplace simplement la sélection.
   */
  function handleSlotClick(side: LineupSide, id: string, from: 'court' | 'bench') {
    if (!canEdit) return;
    if (onCourt[side].length === 0) { toggleStarter(side, id); return; }

    const pending = pendingSub;
    if (pending && pending.side === side) {
      if (pending.playerId === id) { setPendingSub(null); return; }
      if (pending.from !== from) {
        const incoming = from === 'bench' ? id : pending.playerId;
        const outgoing = from === 'court' ? id : pending.playerId;
        performSwap(side, incoming, outgoing);
        return;
      }
    }
    setPendingSub({ side, playerId: id, from });
  }

  async function addOpponentPlayer() {
    if (!newOpponentName.trim()) return;
    const num = newOpponentNumber.trim() ? Number(newOpponentNumber) : undefined;
    const created = await matchLiveApi.addOpponentPlayer(match.id, newOpponentName.trim(), num);
    setOpponentPlayers(prev => [...prev, created]);
    setNewOpponentName('');
    setNewOpponentNumber('');
  }

  async function confirmAction(input: LiveActionInput) {
    if (!actionModal) return;
    setSavingAction(true);
    try {
      const seq = nextActionSeq;
      const action: MatchLiveAction = {
        matchId: match.id, seq, quarter: clock.quarter, gameTimeSeconds: clock.elapsedSeconds,
        side: actionModal, playId: input.playId, points: input.points,
        onCourt: onCourt.us, onCourtThem: onCourt.them,
      };
      await matchLiveApi.insertAction(action);
      setActions(prev => [...prev, action]);
      setActionModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSavingAction(false);
    }
  }

  /** Supprime n'importe quelle possession de l'historique — toujours sûr, une action ne
   *  détermine jamais l'état d'une autre ligne. */
  async function deleteActionRow(seq: number) {
    try {
      await matchLiveApi.deleteAction(match.id, seq);
      setActions(prev => prev.filter(a => a.seq !== seq));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setConfirmingKey(null);
    }
  }

  /** Supprime un changement de banc à n'importe quel rang, puis rejoue l'historique restant pour
   *  corriger les instantanés `onCourt` des lignes suivantes (même banc) et des actions
   *  concernées — sans ça, une suppression au milieu de la partie laisserait le cinq affiché
   *  désynchronisé du cinq réel pour tout le reste du match. */
  async function deleteLineupRow(side: LineupSide, seq: number) {
    try {
      await matchLiveApi.deleteLineupEvent(match.id, side, seq);
      const remainingEvents = lineupEvents.filter(e => !(e.side === side && e.seq === seq));
      const { lineupEvents: fixedEvents, actions: fixedActions } = recomputeOnCourtSnapshots(remainingEvents, actions);

      const changedEvents = fixedEvents.filter(fe => {
        const before = remainingEvents.find(e => e.side === fe.side && e.seq === fe.seq)!;
        return before.onCourt.join(',') !== fe.onCourt.join(',');
      });
      const changedActions = fixedActions.filter(fa => {
        const before = actions.find(a => a.seq === fa.seq)!;
        return before.onCourt.join(',') !== fa.onCourt.join(',') || before.onCourtThem.join(',') !== fa.onCourtThem.join(',');
      });

      await Promise.all([
        ...changedEvents.map(e => matchLiveApi.updateLineupEventOnCourt(match.id, e.side, e.seq, e.onCourt)),
        ...changedActions.map(a => matchLiveApi.updateActionOnCourt(match.id, a.seq, a.onCourt, a.onCourtThem)),
      ]);

      setLineupEvents(fixedEvents);
      setActions(fixedActions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setConfirmingKey(null);
    }
  }

  function deleteHistoryRow(row: HistoryRow) {
    if (row.kind === 'action') deleteActionRow(row.seq);
    else deleteLineupRow(row.side, row.seq);
  }

  /** Remise à zéro complète du suivi de ce match. L'erreur remonte volontairement à la modale
   *  appelante (qui l'affiche à côté du bouton), plutôt que d'être avalée ici. */
  async function deleteAllData() {
    await matchLiveApi.deleteAllForMatch(match.id);
    setActions([]);
    setLineupEvents([]);
    setOpponentPlayers([]);
    setStarters({ us: new Set(), them: new Set() });
    setPendingSub(null);
    setConfirmingKey(null);
  }

  const nameById = useMemo(() => new Map(usRoster.map(r => [r.id, r.shortName])), [usRoster]);
  const nameByIdThem = useMemo(() => new Map(themRoster.map(r => [r.id, r.shortName])), [themRoster]);

  const offenseRows = useMemo(() => playStats(actions.filter(a => a.side === 'offense'), plays), [actions, plays]);
  const defenseRows = useMemo(() => playStats(actions.filter(a => a.side === 'defense'), plays), [actions, plays]);
  const lineupRows  = useMemo(() => lineupStats(actions), [actions]);
  // "Maintenant" pour clore le dernier passage en cours — le temps de jeu avance donc tout seul
  // pendant que le chrono tourne, comme un vrai compteur de minutes en direct.
  const playingTimeSeconds = useMemo(
    () => playingTime(lineupEvents, 'us', clock.quarter, clock.elapsedSeconds, clock.periodDurationSeconds),
    [lineupEvents, clock.quarter, clock.elapsedSeconds, clock.periodDurationSeconds],
  );
  const playerPMRows = useMemo(() => {
    const plusMinus = playerPlusMinus(actions);
    const everPlayed = new Set([...plusMinus.keys(), ...playingTimeSeconds.keys()]);
    return players
      .filter(p => everPlayed.has(p.id))
      .map(p => ({ player: p, value: plusMinus.get(p.id) ?? 0, seconds: playingTimeSeconds.get(p.id) ?? 0 }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [actions, players, playingTimeSeconds]);

  const scoreUs   = useMemo(() => actions.filter(a => a.side === 'offense').reduce((s, a) => s + a.points, 0), [actions]);
  const scoreThem = useMemo(() => actions.filter(a => a.side === 'defense').reduce((s, a) => s + a.points, 0), [actions]);

  const history = useMemo(() => {
    type Row = HistoryRow & { quarter: number; time: number; label: string };
    const rows: Row[] = [];
    for (const a of actions) {
      const playName = a.playId ? (plays.find(p => p.id === a.playId)?.name ?? 'play supprimé') : null;
      rows.push({
        key: `a-${a.seq}`, kind: 'action', seq: a.seq, quarter: a.quarter, time: a.gameTimeSeconds,
        label: `${a.side === 'offense' ? ourTeamName : opponentName} — ${a.points} pt${a.points > 1 ? 's' : ''}${playName ? ' — ' + playName : ''}`,
      });
    }
    for (const e of lineupEvents) {
      const names = (e.side === 'us' ? nameById : nameByIdThem);
      const teamName = e.side === 'us' ? ourTeamName : opponentName;
      const label = e.playersOut.length === 0
        ? `Cinq de départ (${teamName}) : ${e.playersIn.map(id => names.get(id) ?? '?').join(', ')}`
        : `Changement (${teamName}) : ${e.playersOut.map(id => names.get(id) ?? '?').join(', ')} → ${e.playersIn.map(id => names.get(id) ?? '?').join(', ')}`;
      rows.push({ key: `l-${e.side}-${e.seq}`, kind: 'lineup', side: e.side, seq: e.seq, quarter: e.quarter, time: e.gameTimeSeconds, label });
    }
    rows.sort((a, b) => a.quarter - b.quarter || a.time - b.time);
    return rows.reverse();
  }, [actions, lineupEvents, plays, nameById, nameByIdThem, ourTeamName, opponentName]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => setShowPlaysConfig(true)} style={smallBtn} title="Durée du quart-temps, plays, effacement des données">
            <Settings2 size={14} style={{ marginRight: 6 }} />Configuration
          </button>
        </div>
      )}

      {/* Score — le point le plus visible de l'écran, une table de marque avant tout le reste.
          Le quart-temps/chrono est traité au même gabarit (légende + gros chiffre), au milieu :
          c'est la même information de match que le score, pas un réglage à part. */}
      <div style={{ ...panelSection, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(8px, 3vw, 28px)', padding: 'clamp(14px, 4vw, 22px) 12px', flexWrap: 'nowrap' }}>
        <div style={{ textAlign: 'center', flex: '1 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: teamColor }}>{ourTeamName}</p>
          <p style={scoreValue}>{scoreUs}</p>
        </div>

        {/* Le chrono est en monospace sur 5 caractères : il lui faut un peu plus de place que les
            deux scores, d'où le `flex-grow` supérieur — sinon il se serre le premier. */}
        <div style={{ textAlign: 'center', flex: '1.4 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: '#00E5A0' }}>{periodLabel(clock.quarter)}</p>
          <ClockDisplay
            seconds={clock.remainingSeconds} onSet={clock.setRemainingSeconds} editable={canEdit}
            fontSize="clamp(1.3rem, 7vw, 2.2rem)"
          />
        </div>

        <div style={{ textAlign: 'center', flex: '1 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: '#64748B' }}>{opponentName}</p>
          <p style={scoreValue}>{scoreThem}</p>
        </div>
      </div>

      {/* Contrôles du chrono */}
      {canEdit && (
        <div style={{ ...panelSection, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={clock.previousPeriod} disabled={clock.quarter <= 1} style={{ ...smallBtn, width: 32, justifyContent: 'center', opacity: clock.quarter <= 1 ? 0.4 : 1, cursor: clock.quarter <= 1 ? 'not-allowed' : 'pointer' }} title="Quart-temps précédent">
            <SkipBack size={13} />
          </button>
          <button onClick={() => clock.adjustRemaining(10)} style={smallBtn} title="Rendre 10s au temps affiché — j'ai oublié d'appuyer sur pause">+10s</button>
          <button onClick={clock.running ? clock.pause : clock.start}
            title={`${clock.running ? 'Arrêter' : 'Lancer'} le chrono (barre espace)`}
            style={{ ...smallBtn, backgroundColor: clock.running ? '#EF444422' : '#00E5A022', borderColor: clock.running ? '#EF4444' : '#00E5A0', color: clock.running ? '#EF4444' : '#00E5A0', width: 36, justifyContent: 'center' }}>
            {clock.running ? <Pause size={14} /> : <PlayIcon size={14} />}
          </button>
          <button onClick={() => clock.adjustRemaining(-10)} style={smallBtn} title="Retirer 10s au temps affiché">-10s</button>
          <button onClick={clock.nextPeriod} style={{ ...smallBtn, width: 32, justifyContent: 'center' }} title="Quart-temps / prolongation suivante">
            <SkipForward size={13} />
          </button>
        </div>
      )}

      {/* Fin de possession — au-dessus des rotations : c'est le geste le plus répété du match
          (plusieurs fois par minute), il doit rester à portée sans faire défiler les effectifs. */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setActionModal('offense')} style={{ ...bigActionBtn, backgroundColor: '#EF4444', border: 'none', color: '#FFFFFF' }}>
            Attaque
          </button>
          <button onClick={() => setActionModal('defense')} style={{ ...bigActionBtn, backgroundColor: '#3B82F6', border: 'none', color: '#FFFFFF' }}>
            Défense
          </button>
        </div>
      )}

      {/* Rotations */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <LineupColumn
          title={ourTeamName} accentColor={teamColor} side="us" roster={usRoster} onCourt={onCourt.us}
          starters={starters.us} pendingSub={pendingSub} canEdit={canEdit}
          onSlotClick={handleSlotClick} onConfirmStarters={confirmStarters}
          renderAvatar={id => <PlayerAvatar player={players.find(p => p.id === id)!} size={34} />}
        />
        <LineupColumn
          title={opponentName} accentColor="#64748B" side="them" roster={themRoster} onCourt={onCourt.them}
          starters={starters.them} pendingSub={pendingSub} canEdit={canEdit}
          onSlotClick={handleSlotClick} onConfirmStarters={confirmStarters}
          renderAvatar={id => <OpponentAvatar name={opponentPlayers.find(p => p.id === id)?.name ?? '?'} size={34} />}
          addForm={canEdit ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newOpponentNumber} onChange={e => setNewOpponentNumber(e.target.value)} placeholder="N°"
                style={{ width: 44, padding: '6px 4px', textAlign: 'center', backgroundColor: '#0D0F14', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.8rem' }} />
              <input value={newOpponentName} onChange={e => setNewOpponentName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addOpponentPlayer(); }}
                placeholder="Ajouter une joueuse adverse…"
                style={{ flex: 1, minWidth: 0, padding: '6px 8px', backgroundColor: '#0D0F14', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.8rem' }} />
              <button onClick={addOpponentPlayer} disabled={!newOpponentName.trim()}
                style={{ padding: '0 10px', borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: newOpponentName.trim() ? 1 : 0.5 }}>
                +
              </button>
            </div>
          ) : undefined}
        />
      </div>

      {/* Historique */}
      <div style={panelSection}>
        <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
          Historique ({history.length})
        </p>
        {history.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Rien d'enregistré pour l'instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {history.map(row => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                <span style={{ color: '#475569', width: 90, flexShrink: 0 }}>{periodLabel(row.quarter)} · {formatClock(row.time)}</span>
                <span style={{ color: '#CBD5E1', flex: 1 }}>{row.label}</span>
                {canEdit && (
                  confirmingKey === row.key ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => deleteHistoryRow(row)} style={{ ...iconTextBtn, color: '#EF4444' }} title="Confirmer la suppression">
                        <Check size={13} />Confirmer
                      </button>
                      <button onClick={() => setConfirmingKey(null)} style={{ ...iconTextBtn, color: '#64748B' }} title="Annuler">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingKey(row.key)} style={{ ...iconTextBtn, color: '#64748B', flexShrink: 0 }} title="Supprimer">
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rentabilité */}
      <div style={panelSection}>
        <button onClick={() => setShowSummary(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <ChevronRight size={13} style={{ transform: showSummary ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
          Rentabilité &amp; +/-
        </button>
        {showSummary && (
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <StatCard title="Attaque">
              <StatTable
                rows={offenseRows} keyFn={r => r.playId ?? '__none__'} emptyLabel="Aucune possession encore pointée."
                columns={[
                  { header: 'Play', render: r => r.playName },
                  { header: 'Poss.', align: 'right', render: r => r.count },
                  { header: 'Rentabilité', align: 'right', render: r => (
                    <span style={{ fontWeight: 700, color: r.rentabilite !== null ? rentabiliteColor(r.rentabilite, OFFENSE_THRESHOLDS) : '#475569' }}>
                      {r.rentabilite !== null ? r.rentabilite.toFixed(2) : '—'}
                    </span>
                  ) },
                ]}
              />
            </StatCard>

            <StatCard title="Défense">
              <StatTable
                rows={defenseRows} keyFn={r => r.playId ?? '__none__'} emptyLabel="Aucune possession encore pointée."
                columns={[
                  { header: 'Play', render: r => r.playName },
                  { header: 'Poss.', align: 'right', render: r => r.count },
                  { header: 'Rentabilité', align: 'right', render: r => (
                    <span style={{ fontWeight: 700, color: r.rentabilite !== null ? rentabiliteColor(r.rentabilite, DEFENSE_THRESHOLDS) : '#475569' }}>
                      {r.rentabilite !== null ? r.rentabilite.toFixed(2) : '—'}
                    </span>
                  ) },
                ]}
              />
            </StatCard>

            <StatCard title={`Temps de jeu & +/- (${ourTeamName})`}>
              <StatTable
                rows={playerPMRows} keyFn={r => r.player.id} emptyLabel="Aucune joueuse n'a encore été sur le terrain."
                columns={[
                  { header: 'Joueuse', render: r => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <NumberBadge number={r.player.number} />{playerNameFull(r.player)}
                    </span>
                  ) },
                  { header: 'Temps', align: 'right', render: r => (
                    <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>{formatClock(r.seconds)}</span>
                  ) },
                  { header: '+/-', align: 'right', render: r => (
                    <span style={{ fontWeight: 700, color: r.value > 0 ? '#00E5A0' : r.value < 0 ? '#EF4444' : '#94A3B8' }}>
                      {r.value > 0 ? '+' : ''}{r.value}
                    </span>
                  ) },
                ]}
              />
            </StatCard>

            <StatCard title={`Cinq ${ourTeamName} les plus vues`}>
              <StatTable
                rows={lineupRows.slice(0, 8)} keyFn={r => r.players.join(',')} emptyLabel="Aucune combinaison encore relevée."
                columns={[
                  { header: 'Cinq', render: r => r.players.map(id => nameById.get(id) ?? '?').join(', ') },
                  { header: 'Poss.', align: 'right', render: r => r.possessionsOffense + r.possessionsDefense },
                  { header: '+/-', align: 'right', render: r => (
                    <span style={{ fontWeight: 700, color: r.plusMinus > 0 ? '#00E5A0' : r.plusMinus < 0 ? '#EF4444' : '#94A3B8' }}>
                      {r.plusMinus > 0 ? '+' : ''}{r.plusMinus}
                    </span>
                  ) },
                ]}
              />
            </StatCard>
          </div>
        )}
      </div>

      {actionModal && (
        <LiveActionModal
          teamLabel={actionModal === 'offense' ? ourTeamName : opponentName}
          playsSide={actionModal} plays={plays} saving={savingAction}
          onCancel={() => setActionModal(null)} onConfirm={confirmAction}
        />
      )}

      {showPlaysConfig && (
        <PlaysConfigModal
          teamId={match.teamId} plays={plays}
          periodDurationSeconds={clock.periodDurationSeconds} onPeriodDurationChange={clock.setPeriodDuration}
          seasonPlayers={players} rosterIds={rosterIds} lockedPlayerIds={onCourt.us}
          onRosterChange={async ids => { await matchLiveApi.setRoster(match.id, ids); setRosterIds(ids); }}
          recordedCount={actions.length + lineupEvents.length + opponentPlayers.length}
          onDeleteAll={deleteAllData}
          onClose={() => setShowPlaysConfig(false)}
          onChanged={async () => setPlays(await playsApi.getForTeam(match.teamId))}
        />
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 6,
  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8',
  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
};

const bigActionBtn: React.CSSProperties = {
  flex: 1, padding: '18px', borderRadius: 10, backgroundColor: '#161920',
  border: '2px solid', fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};

const iconTextBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
  fontSize: '0.75rem', cursor: 'pointer', padding: 2, flexShrink: 0,
};

function ClockDisplay({ seconds, onSet, editable, fontSize = '1.3rem' }: { seconds: number; onSet: (s: number) => void; editable: boolean; fontSize?: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState('');

  if (editing) {
    return (
      <input
        autoFocus value={value} onChange={e => setValue(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="mm:ss"
        style={{ width: '4.2em', padding: '4px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize, fontFamily: 'monospace', textAlign: 'center' }}
      />
    );
  }

  function commit() {
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (m) onSet(Number(m[1]) * 60 + Number(m[2]));
    setEditing(false);
  }

  return (
    <span
      onClick={editable ? () => { setValue(formatClock(seconds)); setEditing(true); } : undefined}
      style={{ color: '#F1F5F9', fontSize, fontFamily: 'monospace', fontWeight: 800, lineHeight: 1, cursor: editable ? 'pointer' : 'default' }}
      title={editable ? 'Cliquer pour corriger le temps' : undefined}
    >
      {formatClock(seconds)}
    </span>
  );
}

interface LineupColumnProps {
  title: string;
  /** Couleur d'identité de la colonne — celle de l'équipe pour la nôtre (même convention que le
   *  point coloré du sélecteur d'équipe en TopBar), un gris neutre pour l'adversaire. */
  accentColor: string;
  side: LineupSide;
  roster: RosterEntry[];
  onCourt: string[];
  starters: Set<string>;
  pendingSub: PendingSub;
  canEdit: boolean;
  onSlotClick: (side: LineupSide, id: string, from: 'court' | 'bench') => void;
  onConfirmStarters: (side: LineupSide) => void;
  renderAvatar: (id: string) => React.ReactNode;
  addForm?: React.ReactNode;
}

/** Ligne joueuse — même gabarit sur le terrain et au banc, hauteur de cible confortable au doigt
 *  (44px, le minimum recommandé sur mobile) : c'est le geste le plus répété de l'écran. */
function PlayerRow({ selected, accent, canEdit, onClick, children }: {
  selected: boolean;
  accent: string;
  canEdit: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={!canEdit}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44,
        padding: '6px 10px', borderRadius: 8, textAlign: 'left',
        cursor: canEdit ? 'pointer' : 'default',
        border: `1px solid ${selected ? accent : '#2A2F3A'}`,
        backgroundColor: selected ? `${accent}22` : 'transparent',
      }}>
      {children}
    </button>
  );
}

function LineupColumn({
  title, accentColor, side, roster, onCourt, starters, pendingSub, canEdit,
  onSlotClick, onConfirmStarters, renderAvatar, addForm,
}: LineupColumnProps) {
  const settingStarters = onCourt.length === 0;
  const bench = roster.filter(r => !onCourt.includes(r.id));
  const count = onCourt.length;
  const pending = pendingSub?.side === side ? pendingSub : null;

  return (
    <div style={{ ...panelSection, flex: 1, minWidth: 260, border: `1px solid ${accentColor}40` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: accentColor, flexShrink: 0 }} />
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
        </div>
        {!settingStarters && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: count === 5 ? '#00E5A0' : '#F59E0B', flexShrink: 0 }}>{count} sur le terrain</span>
        )}
      </div>

      {settingStarters ? (
        <>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 8px' }}>Composer le cinq de départ</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {roster.map(r => (
              <PlayerRow key={r.id} selected={starters.has(r.id)} accent="#00E5A0" canEdit={canEdit}
                onClick={() => onSlotClick(side, r.id, 'bench')}>
                {renderAvatar(r.id)}
                <NumberBadge number={r.number} />
                <span style={{ color: starters.has(r.id) ? '#00E5A0' : '#CBD5E1', fontSize: '0.82rem' }}>{r.fullName}</span>
              </PlayerRow>
            ))}
            {roster.length === 0 && <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>Aucune joueuse disponible.</p>}
          </div>
          {addForm}
          {canEdit && (
            <button onClick={() => onConfirmStarters(side)} disabled={starters.size === 0}
              style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 6, border: 'none', backgroundColor: starters.size ? '#00E5A0' : '#1E2229', color: starters.size ? '#0D0F14' : '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: starters.size ? 'pointer' : 'not-allowed' }}>
              Valider le cinq ({starters.size})
            </button>
          )}
        </>
      ) : (
        <>
          {/* Consigne du changement en cours — annonce ce que le prochain tap va faire, et permet
              de faire marche arrière sans avoir à retrouver la joueuse déjà sélectionnée. */}
          {pending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '7px 10px', borderRadius: 6, backgroundColor: '#F59E0B18', border: '1px solid #F59E0B55' }}>
              <span style={{ color: '#F59E0B', fontSize: '0.75rem', fontWeight: 700, flex: 1 }}>
                {pending.from === 'bench' ? 'Touchez la joueuse qui SORT' : 'Touchez la joueuse qui ENTRE'}
              </span>
              <button onClick={() => onSlotClick(side, pending.playerId, pending.from)}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }} title="Annuler le changement">
                <X size={14} />
              </button>
            </div>
          )}

          <p style={{ color: '#64748B', fontSize: '0.72rem', margin: '0 0 6px' }}>Sur le terrain</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {onCourt.map(id => {
              const entry = roster.find(r => r.id === id);
              const selected = pending?.from === 'court' && pending.playerId === id;
              return (
                <PlayerRow key={id} selected={selected} accent="#F59E0B" canEdit={canEdit}
                  onClick={() => onSlotClick(side, id, 'court')}>
                  {renderAvatar(id)}
                  <NumberBadge number={entry?.number ?? null} />
                  <span style={{ color: selected ? '#F59E0B' : '#E2E8F0', fontSize: '0.82rem' }}>{entry?.fullName ?? '?'}</span>
                </PlayerRow>
              );
            })}
          </div>

          <p style={{ color: '#64748B', fontSize: '0.72rem', margin: '0 0 6px' }}>Banc</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {bench.map(r => {
              const selected = pending?.from === 'bench' && pending.playerId === r.id;
              return (
                <PlayerRow key={r.id} selected={selected} accent="#F59E0B" canEdit={canEdit}
                  onClick={() => onSlotClick(side, r.id, 'bench')}>
                  {renderAvatar(r.id)}
                  <NumberBadge number={r.number} />
                  <span style={{ color: selected ? '#F59E0B' : '#CBD5E1', fontSize: '0.82rem' }}>{r.fullName}</span>
                </PlayerRow>
              );
            })}
            {bench.length === 0 && <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>Banc vide.</p>}
          </div>
          {addForm}
        </>
      )}
    </div>
  );
}

/** Carte nommée qui encadre un `StatTable` — sépare visuellement les 4 blocs de la section
 *  Rentabilité, qui se ressemblaient auparavant sans bordure ni fond propre. */
function StatCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 12px' }}>
      <p style={{ color: '#64748B', fontSize: '0.72rem', fontWeight: 600, margin: '0 0 8px' }}>{title}</p>
      {children}
    </div>
  );
}

interface StatColumn<T> {
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

const statTh: React.CSSProperties = {
  padding: '4px 6px', color: '#475569', fontSize: '0.64rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid #2A2F3A', whiteSpace: 'nowrap',
};

const statTd: React.CSSProperties = {
  padding: '6px 6px', color: '#CBD5E1', fontSize: '0.8rem', borderBottom: '1px solid #262B34',
};

/** Table générique des 4 blocs de la section Rentabilité — un vrai `<table>` (en-têtes, lignes au
 *  survol) plutôt que des lignes flex à largeurs devinées au pixel, pour un alignement propre
 *  quel que soit le nombre de colonnes. */
function StatTable<T>({ columns, rows, keyFn, emptyLabel }: {
  columns: StatColumn<T>[];
  rows: T[];
  keyFn: (row: T) => string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>{emptyLabel}</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((c, i) => <th key={i} style={{ ...statTh, textAlign: c.align ?? 'left' }}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={keyFn(row)} className="hover:!bg-white/5">
              {columns.map((c, i) => <td key={i} style={{ ...statTd, textAlign: c.align ?? 'left' }}>{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
