import { useState, useMemo, useCallback } from 'react';
import { useUrlSort } from '../hooks/useUrlState';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { lineupStatsFromEvents, combosAcrossMatches, lineupRowView, COMBO_SIZES, COMBO_LABEL, type ComboSize, plusMinusFromEvents, sortLineupRows, LINEUP_SORT_KEYS, type LineupSortKey, type LineupMode, type EventLineupRow } from '../data/matchEvents';
import { playingTime, formatClock } from '../data/liveTrackingAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player, LineupSide } from '../data/types';

/**
 * Analyse des combinaisons de cinq d'un match, dérivée du flux de saisie (`match_events`).
 *
 * Le même tableau existe replié en bas de l'écran de saisie ; il a son onglet ici parce qu'on le
 * lit APRÈS le match, et qu'ouvrir l'écran de saisie pour ça, c'est ouvrir un écran qui écrit.
 *
 * Deux mesures y sont jointes que le suivi live n'a pas : le TEMPS de chaque cinq, et les points
 * par possession. Un +8 en deux minutes et un +8 sur un quart-temps entier ne se lisent pas
 * pareil, et sans le temps rien ne les distingue.
 */

export interface MatchLineupsPanelProps {
  match: Match;
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 8px',
};

/** Sous ce seuil, un cinq n'a pas joué : c'est une rotation en cours de composition ou une erreur
 *  de saisie, et ses ratios n'ont aucun sens. Le filtre est ajustable, pas imposé. */
const MIN_SECONDS_PRESETS = [0, 30, 60, 180] as const;

const PLAYER_SORT_KEYS = ['id', 'seconds', 'plusMinus'] as const;
type PlayerSortKey = typeof PLAYER_SORT_KEYS[number];

export function MatchLineupsPanel({ match, players }: MatchLineupsPanelProps) {
  const { selected } = useTeamSeason();
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';
  /** La durée d'un quart-temps appartient au match, plus au navigateur : ces écrans la lisent
   *  donc directement, sans instancier un chrono dont ils n'ont aucun usage. */
  const period = match.periodDurationSeconds;

  const { events, lineupEvents, opponents, lastQuarter, lastElapsedSeconds, hasData, loading, error } =
    useMatchTracking(match.id);

  const [side, setSide] = useState<LineupSide>('us');

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const oppNameById = useMemo(() => new Map(opponents.map(p => [p.id, p.name])), [opponents]);
  const nameOf = useCallback(
    (id: string) => (side === 'us' ? nameById.get(id) : oppNameById.get(id)) ?? '?',
    [side, nameById, oppNameById],
  );

  const rows = useMemo(
    () => lineupStatsFromEvents(events, lineupEvents, side, period, lastQuarter, lastElapsedSeconds),
    [events, lineupEvents, side, period, lastQuarter, lastElapsedSeconds],
  );

  const matchFives = useMemo(() => [rows], [rows]);

  /** Temps de jeu et +/- individuels, à côté des combinaisons : ce sont les deux lectures d'une
   *  même rotation, et les séparer sur deux écrans oblige à faire l'aller-retour. */
  const playerSort = useUrlSort<PlayerSortKey>(
    { key: 'seconds', dir: 'desc' }, { ns: 'joueurs', allowed: PLAYER_SORT_KEYS },
  );

  const playerRows = useMemo(() => {
    const minutes = playingTime(lineupEvents, side, lastQuarter, lastElapsedSeconds, period);
    const pm = plusMinusFromEvents(events, side);
    const dir = playerSort.sortDir === 'asc' ? 1 : -1;
    return [...minutes.entries()]
      .map(([id, seconds]) => ({ id, seconds, plusMinus: pm.get(id) ?? 0 }))
      .sort((a, b) => playerSort.sortKey === 'id'
        ? dir * nameOf(a.id).localeCompare(nameOf(b.id))
        : dir * (a[playerSort.sortKey] - b[playerSort.sortKey]) || b.seconds - a.seconds);
  }, [events, lineupEvents, side, lastQuarter, lastElapsedSeconds, period, playerSort.sortKey, playerSort.sortDir, nameOf]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (!hasData) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune saisie en direct pour ce match.</p>
        <p style={{ margin: '8px 0 0' }}>
          Cette analyse se construit depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Prise statistiques</strong>,
          qui enregistre chaque action avec le cinq présent sur le terrain. Un match importé par feuille de marque
          n'en contient pas : la feuille ne dit pas qui était sur le terrain à chaque action.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{LINEUP_TABLE_CSS}</style>

      <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['us', ourTeamName], ['them', opponentName]] as const).map(([s, label]) => (
            <button key={s} onClick={() => setSide(s)} aria-pressed={side === s}
              style={toggleStyle(side === s)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <LineupComboTable matchFives={matchFives} nameOf={nameOf} />

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Par joueur</p>
        {playerRows.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>Aucune rotation suivie de ce côté.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  {([['Joueur', 'id'], ['Temps', 'seconds'], ['+/-', 'plusMinus']] as [string, PlayerSortKey][]).map(([label, key]) => (
                    <th key={key} className="lineup-head">
                      <button onClick={() => playerSort.toggleSort(key)} className="lineup-sort"
                        aria-label={`Trier par ${label}`}
                        style={{ color: playerSort.sortKey === key ? '#CBD5E1' : undefined }}>
                        {label}{sortArrow(playerSort.sortKey === key, playerSort.sortDir)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerRows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #1E2229' }}>
                    <td className="lineup-cell">{nameOf(r.id)}</td>
                    <td className="lineup-cell" style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{formatClock(r.seconds)}</td>
                    <td className="lineup-cell" style={{ fontWeight: 700, color: plusMinusColor(r.plusMinus) }}>{signed(r.plusMinus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ color: '#475569', fontSize: '0.74rem', margin: 0, lineHeight: 1.5 }}>
        Les durées s'arrêtent à la dernière action enregistrée : le match n'a pas de coup de sifflet
        final en base, le dernier passage sur le terrain est donc légèrement sous-estimé.
      </p>
    </div>
  );
}

/** Sous ce temps réel, une ligne « pour 100 possessions » est une extrapolation trop fragile pour
 *  être lue comme les autres : elle reste affichée, mais grisée. */
const PER100_RELIABLE_SECONDS = 300;

/**
 * Tableau des combinaisons — cinq, trios ou duos — à partir des lignes de cinq de chaque match.
 * Partagé par l'onglet Lineups d'un match (un seul match) et celui de l'analyse collective.
 */
export function LineupComboTable({ matchFives, nameOf, minPresets = MIN_SECONDS_PRESETS }: {
  /** Une liste de cinq par match. Le mode « par match » n'est proposé qu'à partir de deux. */
  matchFives: EventLineupRow[][];
  nameOf: (id: string) => string;
  minPresets?: readonly number[];
}) {
  /** 5 = combinaisons complètes ; 3 / 2 = trios / duos, sommés sur tous les cinq où ils jouaient ensemble. */
  const [comboSize, setComboSize] = useState<ComboSize>(5);
  const [mode, setMode] = useState<LineupMode>('total');
  const multiMatch = matchFives.length > 1;
  const effectiveMode: LineupMode = mode === 'match' && !multiMatch ? 'total' : mode;
  const [minSeconds, setMinSeconds] = useState<number>(minPresets[1] ?? 0);
  /** Joueurs retenus : une ligne n'est gardée que si elle les contient TOUS. Un seul joueur →
   *  toutes ses combinaisons ; deux en mode Cinq → les cinq où ils jouaient ensemble. */
  const [picked, setPicked] = useState<string[]>([]);
  const togglePicked = (id: string) =>
    setPicked(ps => (ps.includes(id) ? ps.filter(p => p !== id) : [...ps, id]));

  const roster = useMemo(
    () => [...new Set(matchFives.flat().flatMap(r => r.players))].sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [matchFives, nameOf],
  );

  /** Le tri vit dans l'URL, comme partout ailleurs (`useUrlSort`) : un tableau trié se partage
   *  avec le tri qu'on avait sous les yeux, et survit à un aller-retour d'onglet. */
  const { sortKey, sortDir, toggleSort } = useUrlSort<LineupSortKey>(
    { key: 'seconds', dir: 'desc' }, { ns: 'cinq', allowed: LINEUP_SORT_KEYS },
  );

  const shown = useMemo(() => {
    const combos = combosAcrossMatches(matchFives, comboSize);
    // Un joueur absent de la liste (changement de camp) ne filtre rien plutôt que de tout vider.
    const active = picked.filter(id => roster.includes(id));
    // Le temps minimum porte sur le temps RÉEL cumulé, quel que soit le mode : c'est l'échantillon.
    const kept = combos.filter(r => r.seconds >= minSeconds && active.every(id => r.players.includes(id)));
    return sortLineupRows(kept.map(r => lineupRowView(r, effectiveMode)), sortKey, sortDir, nameOf);
  }, [matchFives, comboSize, effectiveMode, minSeconds, picked, roster, sortKey, sortDir, nameOf]);

  const per100 = effectiveMode === 'per100';
  const digits = effectiveMode === 'match' ? 1 : 0;
  const columns: [string, LineupSortKey][] = [
    [COMBO_LABEL[comboSize], 'players'],
    ...(multiMatch ? [['Matchs', 'matches'] as [string, LineupSortKey]] : []),
    [effectiveMode === 'match' ? 'Temps/match' : 'Temps', 'seconds'],
    [effectiveMode === 'match' ? 'Poss./match' : 'Poss.', 'possessions'],
    // En mode « pour 100 », Pour/100 EST Pts/poss × 100 : les deux colonnes feraient doublon.
    ...(per100 ? [] : [['Pts/poss.', 'pointsPerPossession'], ['Encaissé/poss.', 'oppPointsPerPossession']] as [string, LineupSortKey][]),
    [per100 ? 'Pour /100' : 'Pour', 'pointsFor'],
    [per100 ? 'Contre /100' : 'Contre', 'pointsAgainst'],
    [per100 ? 'Net /100' : '+/-', 'plusMinus'],
  ];

  return (
    <div style={PANEL}>
      <style>{LINEUP_TABLE_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {COMBO_SIZES.map(([n, label]) => (
            <button key={n} onClick={() => setComboSize(n)} aria-pressed={comboSize === n}
              style={toggleStyle(comboSize === n)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {([['total', 'Total'], ...(multiMatch ? [['match', 'Par match']] : []), ['per100', 'Pour 100 poss.']] as [LineupMode, string][])
            .map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={effectiveMode === m}
                style={toggleStyle(effectiveMode === m)}>
                {label}
              </button>
            ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#64748B', fontSize: '0.74rem' }}>Au moins</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {minPresets.map(s => (
              <button key={s} onClick={() => setMinSeconds(s)} aria-pressed={minSeconds === s}
                style={toggleStyle(minSeconds === s)}>
                {s === 0 ? 'Tout' : formatClock(s)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {roster.map(id => (
          <button key={id} onClick={() => togglePicked(id)} aria-pressed={picked.includes(id)}
            style={{ ...toggleStyle(picked.includes(id)), height: 28, padding: '0 10px' }}>
            {nameOf(id)}
          </button>
        ))}
        {picked.length > 0 && (
          <button onClick={() => setPicked([])} style={{ ...toggleStyle(false), height: 28, padding: '0 10px', color: '#64748B' }}>
            Effacer
          </button>
        )}
      </div>
      <p style={SECTION_TITLE}>{comboSize === 5 ? 'Combinaisons de cinq' : COMBO_LABEL[comboSize]}</p>
      {shown.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
          {matchFives.every(f => f.length === 0)
            ? "Aucun cinq relevé de ce côté : les rotations n'ont pas été suivies."
            : picked.length > comboSize
              ? `${picked.length} joueurs sélectionnés : une combinaison de ${comboSize} ne peut pas tous les contenir.`
              : `Aucune combinaison ne correspond (temps minimum ${formatClock(minSeconds)}, joueurs sélectionnés).`}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                {columns.map(([label, key]) => (
                  <th key={key} className="lineup-head">
                    <button onClick={() => toggleSort(key)} className="lineup-sort"
                      aria-label={`Trier par ${label}`}
                      style={{ color: sortKey === key ? '#CBD5E1' : undefined }}>
                      {label}{sortArrow(sortKey === key, sortDir)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.players.join(',')} style={{
                  borderBottom: '1px solid #1E2229',
                  opacity: per100 && r.seconds < PER100_RELIABLE_SECONDS ? 0.45 : 1,
                }}
                  title={per100 && r.seconds < PER100_RELIABLE_SECONDS ? `Moins de ${formatClock(PER100_RELIABLE_SECONDS)} ensemble : extrapolation fragile` : undefined}>
                  <td className="lineup-cell">{r.players.map(nameOf).join(', ')}</td>
                  {multiMatch && <td className="lineup-cell">{r.matches}</td>}
                  <td className="lineup-cell" style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{formatClock(Math.round(r.seconds))}</td>
                  <td className="lineup-cell">{r.possessions.toFixed(1)}</td>
                  {!per100 && <td className="lineup-cell">{r.pointsPerPossession !== null ? r.pointsPerPossession.toFixed(2) : '—'}</td>}
                  {!per100 && <td className="lineup-cell">{r.oppPointsPerPossession !== null ? r.oppPointsPerPossession.toFixed(2) : '—'}</td>}
                  <td className="lineup-cell">{r.pointsFor !== null ? r.pointsFor.toFixed(digits) : '—'}</td>
                  <td className="lineup-cell">{r.pointsAgainst !== null ? r.pointsAgainst.toFixed(digits) : '—'}</td>
                  <td className="lineup-cell" style={{ fontWeight: 700, color: plusMinusColor(r.plusMinus ?? 0) }}>
                    {r.plusMinus !== null ? signed(Number(r.plusMinus.toFixed(digits))) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const LINEUP_TABLE_CSS = `
  .lineup-cell { padding: 7px 8px; font-size: 0.76rem; text-align: right; color: #CBD5E1; }
  .lineup-cell:first-child { text-align: left; color: #F1F5F9; }
  .lineup-head { padding: 6px 8px; font-size: 0.62rem; text-align: right; color: #64748B;
    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
  .lineup-head:first-child { text-align: left; }
  /* L'en-tête EST le bouton : un tableau où seule une petite flèche est cliquable se
     manque une fois sur deux. Il hérite de la cellule (alignement, couleur, graisse). */
  .lineup-sort { background: none; border: none; padding: 0; cursor: pointer;
    font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit;
    white-space: nowrap; }
  .lineup-sort:hover { color: #94A3B8; }
`;

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
    border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
    backgroundColor: active ? '#00E5A01F' : '#0D0F14',
    color: active ? '#00E5A0' : '#94A3B8',
    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

/** La colonne triée porte son sens ; les autres ne portent rien — une flèche grise sur chaque
 *  en-tête ne dit plus laquelle fait foi. */
const sortArrow = (active: boolean, dir: 'asc' | 'desc') => (active ? (dir === 'asc' ? ' ↑' : ' ↓') : '');

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const plusMinusColor = (n: number) => (n > 0 ? '#00E5A0' : n < 0 ? '#EF4444' : '#64748B');
