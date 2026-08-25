import { MUTED, FAINT, LINE, SOFT, INK } from './ReportKit';
import { PlayerAvatar } from './PlayerAvatar';
import { playerStatusLabel } from './PlayerHero';
import { getAge } from '../data';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

/** L'état civil, dans l'ordre où un lecteur le cherche. */
function facts(player: Player): string[] {
  return [
    player.number ? `#${player.number}` : null,
    player.position,
    player.birthDate ? `${getAge(player.birthDate)} ans` : null,
    player.height && player.weight ? `${player.height} cm · ${player.weight} kg` : null,
    player.nationality,
  ].filter(Boolean) as string[];
}

/** L'état civil du joueur en grand, tel qu'il ouvre un rapport individuel. */
export function PlayerIdentity({ player }: { player: Player }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: 14, marginBottom: 22,
      backgroundColor: SOFT, border: `1px solid ${LINE}`, borderRadius: 4,
    }}>
      <PlayerAvatar player={player} size={64} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>{playerNameFull(player)}</p>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: MUTED }}>{facts(player).join(' · ')}</p>
        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: MUTED }}>
          Statut à ce jour : <strong style={{ color: INK }}>{playerStatusLabel[player.status]}</strong>
        </p>
      </div>
    </div>
  );
}

/**
 * Le même état civil en bandeau compact, répété en tête de chaque bloc individuel.
 *
 * Un rapport couvrant plusieurs joueurs alterne les pages : sans la photo et le nom en haut de
 * chacune, une page arrachée du document ne dit plus de qui elle parle.
 */
export function PlayerStrip({ player }: { player: Player }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 12, marginBottom: 16,
      borderBottom: `1px solid ${LINE}`,
    }}>
      <PlayerAvatar player={player} size={40} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>{playerNameFull(player)}</p>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: MUTED }}>{facts(player).join(' · ')}</p>
      </div>
      <span style={{ fontSize: 9.5, color: FAINT, whiteSpace: 'nowrap' }}>
        {playerStatusLabel[player.status]}
      </span>
    </div>
  );
}
