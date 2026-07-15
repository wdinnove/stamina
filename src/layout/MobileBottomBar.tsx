import { Menu, Bell, Search } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';

interface MobileBottomBarProps {
  onMenuOpen: () => void;
  onOpenSearch: () => void;
}

const barButtonStyle: React.CSSProperties = {
  flex: 1, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
  padding: '6px 0',
};

const labelStyle: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 500 };

/** Barre de navigation mobile fixe en bas d'écran : recherche, menu, notifications. */
export function MobileBottomBar({ onMenuOpen, onOpenSearch }: MobileBottomBarProps) {
  const { unreadCount, openCenter } = useNotifications();

  return (
    <nav
      className="flex md:hidden"
      style={{
        height: 56, backgroundColor: '#161920', borderTop: '1px solid #2A2F3A',
        alignItems: 'stretch', justifyContent: 'space-around', flexShrink: 0, zIndex: 200,
      }}
    >
      <button onClick={onOpenSearch} style={barButtonStyle}>
        <Search size={20} />
        <span style={labelStyle}>Rechercher</span>
      </button>

      <button onClick={onMenuOpen} style={barButtonStyle}>
        <Menu size={20} />
        <span style={labelStyle}>Menu</span>
      </button>

      <button onClick={openCenter} style={barButtonStyle}>
        <div style={{ position: 'relative' }}>
          <Bell size={20} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -8, minWidth: 15, height: 15, borderRadius: 8,
              backgroundColor: '#EF4444', color: '#fff', fontSize: '0.58rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              border: '2px solid #161920', lineHeight: 1,
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span style={labelStyle}>Notifications</span>
      </button>
    </nav>
  );
}
