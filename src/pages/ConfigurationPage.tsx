import { useState } from 'react';
import { Building2, Shield } from 'lucide-react';
import { TeamConfigTab } from './ConfigPage';
import { ClubConfigTab } from './ClubPage';

const SCOPES = [
  { key: 'club', label: 'Club',   icon: Building2 },
  { key: 'team', label: 'Équipe', icon: Shield    },
] as const;
type Scope = typeof SCOPES[number]['key'];

export default function ConfigurationPage() {
  const [scope, setScope] = useState<Scope>('team');

  return (
    <div className="p-4 md:p-6">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: '0 0 16px' }}>Configuration</h1>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 3, width: 'fit-content' }}>
          {SCOPES.map(s => (
            <button key={s.key} onClick={() => setScope(s.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1, backgroundColor: scope === s.key ? '#1E2229' : 'transparent', color: scope === s.key ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
              <s.icon size={13} color={scope === s.key ? '#00E5A0' : 'currentColor'} style={{ flexShrink: 0, display: 'block' }} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {scope === 'team' ? <TeamConfigTab /> : <ClubConfigTab />}
    </div>
  );
}
