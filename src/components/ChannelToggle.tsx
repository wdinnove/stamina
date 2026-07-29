/** Interrupteur de canal de notification, partagé par les réglages équipe et le profil. */
export function ChannelToggle({ on, disabled, title, onClick }: {
  on: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 38, height: 22, borderRadius: 11, padding: 2,
        backgroundColor: on && !disabled ? 'rgba(0,229,160,0.25)' : '#1E2229',
        border: `1px solid ${on && !disabled ? 'rgba(0,229,160,0.5)' : '#2A2F3A'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center',
        justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'all 0.15s',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        backgroundColor: on && !disabled ? '#00E5A0' : '#475569',
        transition: 'all 0.15s',
      }} />
    </button>
  );
}
