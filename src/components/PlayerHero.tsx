import { PlayerAvatar } from './PlayerAvatar';
import { getAge, formatDate } from '../data';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

const flagEmoji: Record<string, string> = { FR: '🇫🇷', ES: '🇪🇸', CI: '🇨🇮', MA: '🇲🇦', IT: '🇮🇹' };

export const playerStatusLabel: Record<Player['status'], string> = {
  active: 'Actif', injured: 'Blessé', limited: 'Limité', suspended: 'Suspendu', unavailable: 'Indispo.',
};

export const playerStatusColor: Record<Player['status'], string> = {
  active: '#00E5A0', injured: '#EF4444', limited: '#F59E0B', suspended: '#8B5CF6', unavailable: '#475569',
};

export function PlayerHero({ player, marginBottom = 14 }: { player: Player; marginBottom?: number }) {
  const color = playerStatusColor[player.status];
  return (
    <div style={{ backgroundColor: `${color}10`, border: `1px solid ${color}50`, borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '14px 4px 14px 16px', marginBottom, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <PlayerAvatar player={player} size={44} />
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>{playerNameFull(player)}</span>
          <span style={{ color: '#94A3B8', fontWeight: 700, fontSize: '1rem' }}>#{player.number} · {player.position}</span>
        </div>
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0' }}>
          {flagEmoji[player.nationality] ?? ''}
          {player.birthDate ? ` · ${getAge(player.birthDate)} ans` : ''}
          {player.height && player.weight ? ` · ${player.height} cm / ${player.weight} kg` : ''}
          {player.contractEnd ? ` · Contrat → ${formatDate(player.contractEnd)}` : ''}
        </p>
      </div>

      <div className="flex items-stretch gap-3 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#2A2F3A]">
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 20 }}>
          <div style={{
            color,
            backgroundColor: `${color}18`,
            border: `1px solid ${color}40`,
            fontWeight: 700, fontSize: '0.82rem',
            borderRadius: 20, padding: '5px 14px',
          }}>{playerStatusLabel[player.status]}</div>
        </div>
      </div>
    </div>
  );
}
