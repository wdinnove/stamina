import { useState, useMemo } from 'react';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useMatchClock } from '../hooks/useMatchClock';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { lineupStatsFromEvents, plusMinusFromEvents } from '../data/matchEvents';
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

export function MatchLineupsPanel({ match, players }: MatchLineupsPanelProps) {
  const { selected } = useTeamSeason();
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';
  const clock = useMatchClock(match.id);

  const { events, lineupEvents, opponents, lastQuarter, lastElapsedSeconds, hasData, loading, error } =
    useMatchTracking(match.id);

  const [side, setSide] = useState<LineupSide>('us');
  const [minSeconds, setMinSeconds] = useState<number>(30);

  const nameById = useMemo(() => new Map(players.map(p => [p.id, playerNameShort(p)])), [players]);
  const oppNameById = useMemo(() => new Map(opponents.map(p => [p.id, p.name])), [opponents]);
  const nameOf = (id: string) => (side === 'us' ? nameById.get(id) : oppNameById.get(id)) ?? '?';

  const rows = useMemo(
    () => lineupStatsFromEvents(events, lineupEvents, side, clock.periodDurationSeconds, lastQuarter, lastElapsedSeconds),
    [events, lineupEvents, side, clock.periodDurationSeconds, lastQuarter, lastElapsedSeconds],
  );
  const shown = rows.filter(r => r.seconds >= minSeconds);

  /** Temps de jeu et +/- individuels, à côté des combinaisons : ce sont les deux lectures d'une
   *  même rotation, et les séparer sur deux écrans oblige à faire l'aller-retour. */
  const playerRows = useMemo(() => {
    const minutes = playingTime(lineupEvents, side, lastQuarter, lastElapsedSeconds, clock.periodDurationSeconds);
    const pm = plusMinusFromEvents(events, side);
    return [...minutes.entries()]
      .map(([id, seconds]) => ({ id, seconds, plusMinus: pm.get(id) ?? 0 }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [events, lineupEvents, side, lastQuarter, lastElapsedSeconds, clock.periodDurationSeconds]);

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (!hasData) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune saisie en direct pour ce match.</p>
        <p style={{ margin: '8px 0 0' }}>
          Cette analyse se construit depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Saisie des stats</strong>,
          qui enregistre chaque action avec le cinq présent sur le terrain. Un match importé par feuille de marque
          n'en contient pas : la feuille ne dit pas qui était sur le terrain à chaque action.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        .lineup-cell { padding: 7px 8px; font-size: 0.76rem; text-align: right; color: #CBD5E1; }
        .lineup-cell:first-child { text-align: left; color: #F1F5F9; }
        .lineup-head { padding: 6px 8px; font-size: 0.62rem; text-align: right; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .lineup-head:first-child { text-align: left; }
      `}</style>

      <div style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['us', ourTeamName], ['them', opponentName]] as const).map(([s, label]) => (
            <button key={s} onClick={() => setSide(s)} aria-pressed={side === s}
              style={toggleStyle(side === s)}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#64748B', fontSize: '0.74rem' }}>Au moins</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {MIN_SECONDS_PRESETS.map(s => (
              <button key={s} onClick={() => setMinSeconds(s)} aria-pressed={minSeconds === s}
                style={toggleStyle(minSeconds === s)}>
                {s === 0 ? 'Tout' : formatClock(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Combinaisons de cinq</p>
        {shown.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
            {rows.length === 0
              ? "Aucun cinq relevé de ce côté : les rotations n'ont pas été suivies."
              : `Aucune combinaison n'atteint ${formatClock(minSeconds)}.`}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  {['Cinq', 'Temps', 'Poss.', 'Pts/poss.', 'Encaissé/poss.', 'Pour', 'Contre', '+/-'].map(h => (
                    <th key={h} className="lineup-head">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.players.join(',')} style={{ borderBottom: '1px solid #1E2229' }}>
                    <td className="lineup-cell">{r.players.map(nameOf).join(', ')}</td>
                    <td className="lineup-cell" style={{ fontFamily: 'monospace', color: '#94A3B8' }}>{formatClock(r.seconds)}</td>
                    <td className="lineup-cell">{r.possessions.toFixed(1)}</td>
                    <td className="lineup-cell">{r.pointsPerPossession !== null ? r.pointsPerPossession.toFixed(2) : '—'}</td>
                    <td className="lineup-cell">{r.oppPointsPerPossession !== null ? r.oppPointsPerPossession.toFixed(2) : '—'}</td>
                    <td className="lineup-cell">{r.pointsFor}</td>
                    <td className="lineup-cell">{r.pointsAgainst}</td>
                    <td className="lineup-cell" style={{ fontWeight: 700, color: plusMinusColor(r.plusMinus) }}>
                      {signed(r.plusMinus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Par joueur</p>
        {playerRows.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>Aucune rotation suivie de ce côté.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  {['Joueur', 'Temps', '+/-'].map(h => <th key={h} className="lineup-head">{h}</th>)}
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

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
    border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
    backgroundColor: active ? '#00E5A01F' : '#0D0F14',
    color: active ? '#00E5A0' : '#94A3B8',
    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const plusMinusColor = (n: number) => (n > 0 ? '#00E5A0' : n < 0 ? '#EF4444' : '#64748B');
