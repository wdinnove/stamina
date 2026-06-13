import { Link, NavLink, useNavigate, useLocation } from 'react-router';
import {
  LayoutDashboard, Activity, Heart, Stethoscope,
  CheckSquare, BarChart2, FileText, Trophy, LogOut, ClipboardList, Users,
} from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { authApi } from '../api';

export const navItems = [
  { path: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard'     },
  { path: '/roster',        icon: ClipboardList,   label: 'Mon Roster'    },
  { path: '/staff',         icon: Users,           label: 'Mon Staff'     },
  { path: '/rpe',           icon: Activity,        label: 'RPE Effort'    },
  { path: '/wellness',      icon: Heart,           label: 'Bien-être'     },
  { path: '/medical',       icon: Stethoscope,     label: 'Médical'       },
  { path: '/actions',       icon: CheckSquare,     label: 'Actions'       },
  { path: '/stats',         icon: BarChart2,       label: 'Statistiques'  },
  { path: '/reports/player',icon: FileText,        label: 'Bilan Joueur' },
  { path: '/reports/team',  icon: Trophy,          label: 'Bilan Équipe'  },
];

interface SidebarProps {
  collapsed: boolean;
}

function isNavActive(itemPath: string, currentPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
}

export function Sidebar({ collapsed }: SidebarProps) {
  const navigate  = useNavigate();
  const location  = useLocation();

  return (
    <aside style={{
      width: collapsed ? 64 : 220, backgroundColor: '#161920',
      borderRight: '1px solid #2A2F3A', display: 'flex', flexDirection: 'column',
      flexShrink: 0, transition: 'width 0.2s ease', position: 'relative', zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 16px', borderBottom: '1px solid #2A2F3A',
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: collapsed ? 'center' : 'flex-start', minHeight: 64,
      }}>
        <StaminaLogo size={32} />
        {!collapsed && (
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '1rem', letterSpacing: '0.12em', lineHeight: 1.1 }}>STAMINA</div>
            <div style={{ color: '#00E5A080', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {navItems.map(item => {
          const active = isNavActive(item.path, location.pathname);
          return (
            <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 0' : '10px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: active ? '#00E5A0' : '#94A3B8',
                backgroundColor: active ? 'rgba(0,229,160,0.08)' : 'transparent',
                borderLeft: active ? '2px solid #00E5A0' : '2px solid transparent',
                textDecoration: 'none', fontSize: '0.85rem',
                fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
              <item.icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile + logout */}
      <div style={{ borderTop: '1px solid #2A2F3A', padding: collapsed ? '12px 0' : '12px 16px' }}>
<button onClick={async () => { await authApi.signOut(); navigate('/login', { replace: true }); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start', width: '100%', padding: '8px 0', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
          <LogOut size={16} />
          {!collapsed && 'Déconnexion'}
        </button>
      </div>
    </aside>
  );
}
