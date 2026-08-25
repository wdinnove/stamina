import { FRIENDLY_COLOR } from './Badge';

interface FriendliesToggleProps {
  include: boolean;
  onChange: (include: boolean) => void;
  /** Nombre d'amicaux disponibles — affiché pour dire ce que le geste ajoute réellement. */
  count: number;
}

/**
 * Interrupteur de périmètre des analyses. N'apparaît que si la saison compte au moins un amical
 * (`count > 0`) : proposer d'inclure ce qui n'existe pas ne ferait qu'ajouter du bruit.
 *
 * Volontairement discret quand il est éteint, et coloré quand il est allumé : tant qu'il est
 * actif, TOUS les chiffres de la page changent de sens, et il faut pouvoir s'en souvenir en
 * arrivant sur la page une semaine plus tard.
 */
export function FriendliesToggle({ include, onChange, count }: FriendliesToggleProps) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onChange(!include)}
      title={include
        ? `Les ${count} amicaux de la saison sont comptés dans les moyennes, le bilan et les analyses.`
        : `Analyses calculées sur les seuls matchs officiels. ${count} amical${count > 1 ? 'aux' : ''} exclu${count > 1 ? 's' : ''}.`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        fontSize: '0.76rem', fontWeight: 600, whiteSpace: 'nowrap',
        border: `1px solid ${include ? FRIENDLY_COLOR : '#2A2F3A'}`,
        backgroundColor: include ? `${FRIENDLY_COLOR}1F` : '#161920',
        color: include ? FRIENDLY_COLOR : '#94A3B8',
      }}>
      <span style={{
        width: 26, height: 15, borderRadius: 999, flexShrink: 0, position: 'relative',
        backgroundColor: include ? FRIENDLY_COLOR : '#2A2F3A',
        transition: 'background-color 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: include ? 13 : 2,
          width: 11, height: 11, borderRadius: '50%', backgroundColor: '#0D0F14',
          transition: 'left 0.15s',
        }} />
      </span>
      Amicaux inclus ({count})
    </button>
  );
}
