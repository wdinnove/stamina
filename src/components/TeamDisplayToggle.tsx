export type TeamDisplayMode = 'chart' | 'table' | 'ranking';

interface TeamDisplayToggleProps {
  value:    TeamDisplayMode;
  onChange: (v: TeamDisplayMode) => void;
}

const TABS = [
  { key: 'chart',   label: 'Graphique'  },
  { key: 'table',   label: 'Tableau'    },
  { key: 'ranking', label: 'Liste joueurs' },
] as const;

export function TeamDisplayToggle({ value, onChange }: TeamDisplayToggleProps) {
  return (
    <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
      {TABS.map(({ key, label }) => {
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{ flex: 1, padding: '6px 12px', borderRadius: 4, border: 'none',
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
              backgroundColor: active ? '#1E2229' : 'transparent',
              color: active ? '#F1F5F9' : '#94A3B8' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
