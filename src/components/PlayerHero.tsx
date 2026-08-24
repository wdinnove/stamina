import { PlayerAvatar } from './PlayerAvatar';
import { getAge } from '../data';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

const flagEmoji: Record<string, string> = { FR: '🇫🇷', ES: '🇪🇸', CI: '🇨🇮', MA: '🇲🇦', IT: '🇮🇹' };

export const playerStatusLabel: Record<Player['status'], string> = {
  active: 'Actif', injured: 'Blessé', limited: 'Limité', suspended: 'Suspendu', unavailable: 'Indispo.',
};

export const playerStatusColor: Record<Player['status'], string> = {
  active: '#00E5A0', injured: '#EF4444', limited: '#F59E0B', suspended: '#8B5CF6', unavailable: '#475569',
};

/**
 * Taille de la photo par palier — `PlayerAvatar` prend un `size` en pixels fixe (pas de valeur
 * CSS responsive), donc on rend un avatar par palier et on bascule leur visibilité en CSS,
 * plutôt que de faire porter la réactivité à un composant partagé utilisé ailleurs tel quel.
 */
function ResponsiveAvatar({ player }: { player: Player }) {
  return (
    <>
      <span className="block sm:hidden"><PlayerAvatar player={player} size={52} /></span>
      <span className="hidden sm:block lg:hidden"><PlayerAvatar player={player} size={60} /></span>
      <span className="hidden lg:block"><PlayerAvatar player={player} size={68} /></span>
    </>
  );
}

export function PlayerHero({ player, marginBottom = 14 }: { player: Player; marginBottom?: number }) {
  const color = playerStatusColor[player.status];
  return (
    <div style={{ backgroundColor: `${color}10`, border: `1px solid ${color}50`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '14px 16px', marginBottom, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <ResponsiveAvatar player={player} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px 10px', flexWrap: 'wrap' }}>
          <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.05rem' }}>{playerNameFull(player)}</span>
          <span style={{ color: '#94A3B8', fontWeight: 700, fontSize: '1.05rem' }}>#{player.number} · {player.position}</span>
        </div>
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>
          {flagEmoji[player.nationality] ?? ''}
          {player.birthDate ? ` · ${getAge(player.birthDate)} ans` : ''}
          {player.height && player.weight ? ` · ${player.height} cm / ${player.weight} kg` : ''}
        </p>
      </div>
      <span style={{
        color, backgroundColor: `${color}18`, border: `1px solid ${color}40`,
        fontWeight: 700, fontSize: '0.82rem', borderRadius: 20, padding: '5px 14px', flexShrink: 0,
      }}>{playerStatusLabel[player.status]}</span>
    </div>
  );
}
