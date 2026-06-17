import { Link, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard, Activity, Heart, Stethoscope,
  CheckSquare, LogOut, ClipboardList, Users, CalendarCheck, Dumbbell, BookOpen, Building2 as Building2Icon, Shield, Settings,
} from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { authApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';

export const navItems = [
  { path: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard'    },
  { path: '/roster',            icon: ClipboardList,   label: 'Effectif'     },
  { path: '/staff',             icon: Users,           label: 'Staff'        },
  { path: '/attendance',        icon: CalendarCheck,   label: 'Présences'    },
  { path: '/sessions',          icon: Dumbbell,        label: 'Séances'      },
  { path: '/exercises',         icon: BookOpen,        label: 'Exercices'    },
  { path: '/rpe/new',           icon: Activity,        label: 'RPE Effort'   },
  { path: '/wellness/new',      icon: Heart,           label: 'Bien-être'    },
  { path: '/medical/infirmary', icon: Stethoscope,     label: 'Médical'      },
  { path: '/actions',           icon: CheckSquare,     label: 'Actions'      },
];

interface SidebarProps {
  collapsed: boolean;
}

export function isNavActive(itemPath: string, currentPath: string): boolean {
  if (currentPath === itemPath) return true;
  if (currentPath.startsWith(itemPath + '/')) return true;
  const itemRoot = '/' + itemPath.split('/').filter(Boolean)[0];
  if (itemPath !== itemRoot && currentPath.startsWith(itemRoot + '/')) return true;
  return false;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { orgId, orgRole, selected } = useTeamSeason();

  return (
    <aside style={{
      width: collapsed ? 64 : 220, backgroundColor: '#161920',
      borderRight: '1px solid #2A2F3A', display: 'flex', flexDirection: 'column',
      flexShrink: 0, transition: 'width 0.2s ease', position: 'relative', zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '0' : '0 16px',
        borderBottom: '1px solid #2A2F3A', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        height: 56,
      }}>
        <StaminaLogo size={28} />
        {!collapsed && (
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.12em', lineHeight: 1.1 }}>STAMINA</div>
            <div style={{ color: '#00E5A080', fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {(() => {
          const teamPath = selected ? `/team/${selected.team.id}` : '#';
          const teamActive = location.pathname.startsWith('/team/');
          const navStyle = (active: boolean): React.CSSProperties => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '10px 0' : '10px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: active ? '#00E5A0' : '#94A3B8',
            backgroundColor: active ? 'rgba(0,229,160,0.08)' : 'transparent',
            borderLeft: active ? '2px solid #00E5A0' : '2px solid transparent',
            textDecoration: 'none', fontSize: '0.85rem',
            fontWeight: active ? 600 : 400, transition: 'all 0.15s',
            whiteSpace: 'nowrap', overflow: 'hidden',
          });
          return (
            <>
              {/* Dashboard */}
              {navItems.slice(0, 1).map(item => {
                const active = isNavActive(item.path, location.pathname);
                return (
                  <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined} style={navStyle(active)}>
                    <item.icon size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
              {/* Équipe — dynamique /team/:id */}
              <Link to={teamPath} title={collapsed ? 'Équipe' : undefined} style={navStyle(teamActive)}>
                <Shield size={18} style={{ flexShrink: 0 }} />
                {!collapsed && 'Équipe'}
              </Link>
              {/* Reste des items */}
              {navItems.slice(1).map(item => {
                const active = isNavActive(item.path, location.pathname);
                return (
                  <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined} style={navStyle(active)}>
                    <item.icon size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && item.label}
                  </Link>
                );
              })}
            </>
          );
        })()}
      </nav>

      {/* Club + Config + Logout */}
      <div style={{ padding: collapsed ? '8px 0' : '8px 0' }}>
        {orgRole === 'admin' && (() => {
          const clubPath = orgId ? `/organization/${orgId}` : '#';
          const active = location.pathname.startsWith('/organization');
          return (
            <Link to={clubPath} title={collapsed ? 'Configuration club' : undefined}
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
              <Settings size={18} style={{ flexShrink: 0 }} />
              {!collapsed && 'Configuration club'}
            </Link>
          );
        })()}
        <div style={{ height: 1, margin: '4px 8px', backgroundColor: '#2A2F3A' }} />

        <div style={{ padding: collapsed ? '4px 0' : '4px 16px' }}>
        <button
          onClick={async () => { await authApi.signOut(); navigate('/login', { replace: true }); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start', width: '100%', padding: '8px 0', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem', transition: 'color 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
          <LogOut size={16} />
          {!collapsed && 'Déconnexion'}
        </button>
        </div>
      </div>
    </aside>
  );
}
