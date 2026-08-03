import { Link, useLocation } from 'react-router';
import { Menu, Dumbbell, Trophy, BarChart2, UserSearch } from 'lucide-react';
import { isNavActive } from './Sidebar';

interface MobileBottomBarProps {
  onMenuOpen: () => void;
}

const LEFT_ITEMS = [
  { path: '/sessions',                             icon: Dumbbell,  label: 'Séances'     },
  { path: '/matches',                              icon: Trophy,    label: 'Matchs'      },
] as const;

const RIGHT_ITEMS = [
  { path: '/performance-collective/vue-ensemble',  icon: BarChart2,  label: 'Collective'  },
  { path: '/performance-individuelle',             icon: UserSearch, label: 'Individuelle' },
] as const;

const navButtonStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, background: 'none', border: 'none', cursor: 'pointer',
  color: active ? '#00E5A0' : '#94A3B8',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
  padding: '6px 0', textDecoration: 'none',
});

const labelStyle: React.CSSProperties = { fontSize: '0.62rem', fontWeight: 500 };

/** Barre de navigation mobile fixe en bas d'écran : Séances, Matchs, Menu (central), Analyse collective, Analyse individuelle. */
export function MobileBottomBar({ onMenuOpen }: MobileBottomBarProps) {
  const location = useLocation();

  return (
    <nav
      className="flex md:hidden"
      style={{
        height: 56, backgroundColor: '#161920', borderTop: '1px solid #2A2F3A',
        alignItems: 'stretch', justifyContent: 'space-around', flexShrink: 0, zIndex: 200,
        position: 'relative',
      }}
    >
      {LEFT_ITEMS.map(item => {
        const active = isNavActive(item.path, location.pathname);
        return (
          <Link key={item.path} to={item.path} style={navButtonStyle(active)}>
            <item.icon size={20} />
            <span style={labelStyle}>{item.label}</span>
          </Link>
        );
      })}

      {/* Menu : bouton central surélevé, distinct des liens de destination */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', position: 'relative' }}>
        <button
          onClick={onMenuOpen}
          title="Menu"
          style={{
            position: 'absolute', top: -18,
            width: 52, height: 52, borderRadius: '50%',
            backgroundColor: '#00E5A0', border: '3px solid #161920',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,229,160,0.35)', cursor: 'pointer',
          }}
        >
          <Menu size={22} color="#0D0F14" />
        </button>
      </div>

      {RIGHT_ITEMS.map(item => {
        const active = isNavActive(item.path, location.pathname);
        return (
          <Link key={item.path} to={item.path} style={navButtonStyle(active)}>
            <item.icon size={20} />
            <span style={labelStyle}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
