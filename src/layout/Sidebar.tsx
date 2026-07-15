import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard, Activity, Heart, Stethoscope,
  CheckSquare, ClipboardList, Calendar, CalendarCheck, Dumbbell, BookOpen, Trophy, BarChart2, UserSearch,
} from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';

export const navGroups = [
  {
    title: undefined,
    items: [
      { path: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard'    },
    ],
  },
  {
    title: 'Staff',
    items: [
      { path: '/roster',            icon: ClipboardList,   label: 'Effectif'     },
      { path: '/meetings',          icon: Calendar,        label: 'Réunions'     },
      { path: '/actions',           icon: CheckSquare,     label: 'Tâches'       },
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
    title: 'Charge physique',
    items: [
      { path: '/rpe/new',           icon: Activity,        label: 'RPE'                 },
      { path: '/wellness/new',      icon: Heart,           label: 'Bien-être'           },
      { path: '/medical/infirmary', icon: Stethoscope,     label: 'Médical'             },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { path: '/performance-collective/vue-ensemble', icon: BarChart2,  label: 'Analyse collective'  },
      { path: '/performance-individuelle',             icon: UserSearch, label: 'Analyse individuelle' },
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
  const location = useLocation();

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
    </aside>
  );
}
