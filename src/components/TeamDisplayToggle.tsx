import { BarChart2, List, Users } from 'lucide-react';

export type TeamDisplayMode = 'chart' | 'table' | 'ranking';

interface TeamDisplayToggleProps {
  value:    TeamDisplayMode;
  onChange: (v: TeamDisplayMode) => void;
}

const TABS = [
  { key: 'chart',   label: 'Graphique',  icon: BarChart2 },
  { key: 'table',   label: 'Tableau',    icon: List      },
  { key: 'ranking', label: 'Classement', icon: Users     },
] as const;

export function TeamDisplayToggle({ value, onChange }: TeamDisplayToggleProps) {
  return (
    <div style={{ display: 'flex', gap: 8, backgroundColor: '#1A1E26', border: '1px solid #2A2F3A', borderRadius: 10, padding: 4 }}>
      {TABS.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 0', borderRadius: 7, border: active ? '1px solid #2A2F3A' : '1px solid transparent',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
              backgroundColor: active ? '#242830' : 'transparent',
              color: active ? '#F1F5F9' : '#475569',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.4)' : 'none' }}>
            <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
