import { Link, useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard, Activity, Heart, Stethoscope,
  CheckSquare, LogOut, ClipboardList, Calendar, CalendarCheck, Dumbbell, BookOpen, Building2 as Building2Icon, Settings, Trophy, BarChart2, UserSearch, GitCompare, TrendingUp,
} from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { authApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';

export const navGroups = [
  {
    title: undefined,
    items: [
      { path: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard'    },
    ],
  },
  {
    title: 'Entraînement',
    items: [
      { path: '/sessions',          icon: Dumbbell,        label: 'Séances'      },
      { path: '/attendance',        icon: CalendarCheck,   label: 'Présences'    },
      { path: '/exercises',         icon: BookOpen,        label: 'Exercices'    },
    ],
  },
  {
    title: 'Compétition',
    items: [
      { path: '/matches',             icon: Trophy,     label: 'Matchs'             },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { path: '/collective-analyze',  icon: BarChart2,   label: 'Statistiques collectives' },
      { path: '/individual-analyze',  icon: UserSearch,  label: 'Statistiques individuelles' },
      { path: '/team-performance',    icon: TrendingUp,  label: 'Performance équipe'  },
      { path: '/player-performance',  icon: GitCompare,  label: 'Performance joueuse' },
    ],
  },
  {
    title: 'Joueurs',
    items: [
      { path: '/roster',            icon: ClipboardList,   label: 'Effectif'            },
      { path: '/rpe/new',           icon: Activity,        label: 'RPE'                 },
      { path: '/wellness/new',      icon: Heart,           label: 'Bien-être'           },
      { path: '/medical/infirmary', icon: Stethoscope,     label: 'Médical'             },
    ],
  },
  {
    title: 'Organisation',
    items: [
      { path: '/meetings',          icon: Calendar,        label: 'Réunions'     },
      { path: '/actions',           icon: CheckSquare,     label: 'Tâches'       },
    ],
  },
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
  const { orgRole } = useTeamSeason();

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
              {navGroups.map((group, gi) => (
                <div key={gi}>
                  {group.title && !collapsed && (
                    <div style={{ padding: '10px 16px 4px', color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {group.title}
                    </div>
                  )}
                  {group.items.map(item => {
                    const active = isNavActive(item.path, location.pathname);
                    return (
                      <Link key={item.path} to={item.path} title={collapsed ? item.label : undefined} style={navStyle(active)}>
                        <item.icon size={18} style={{ flexShrink: 0 }} />
                        {!collapsed && item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </>
          );
        })()}
      </nav>

      {/* Configuration + Logout */}
      <div style={{ padding: collapsed ? '8px 0' : '8px 0' }}>
        {orgRole === 'admin' && (() => {
          const active = location.pathname.startsWith('/configuration');
          return (
            <Link to="/configuration" title={collapsed ? 'Configuration' : undefined}
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
              {!collapsed && 'Configuration'}
            </Link>
          );
        })()}
        <div style={{ height: 1, margin: '4px 8px', backgroundColor: '#2A2F3A' }} />

        <div style={{ padding: collapsed ? '4px 0' : '4px 16px' }}>
        <button
          onClick={async () => { await authApi.signOut(); navigate('/login', { replace: true }); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start', width: '100%', padding: '8px 0', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.82rem' }}>
          <LogOut size={16} />
          {!collapsed && 'Déconnexion'}
        </button>
        </div>
      </div>
    </aside>
  );
}
