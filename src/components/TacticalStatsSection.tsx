import { useState } from 'react';
import { List, LayoutDashboard } from 'lucide-react';
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import type { TacticalMatchRef } from './TacticalReport';
import { TacticalReport } from './TacticalReport';
import { TacticalDashboard } from './TacticalDashboard';
import { EmptyState } from './EmptyState';

const SUB_TABS = [
  { key: 'brutes',    label: 'Brutes',         icon: List },
  { key: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
] as const;
type SubTab = typeof SUB_TABS[number]['key'];

interface TacticalStatsSectionProps {
  teamId: string;
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options?: TacticalDimensionOption[];
  matches: TacticalMatchRef[];
  emptyMessage?: string;
}

/**
 * Section "Statistiques tactiques" — rapport automatique ("Brutes") et tableau de
 * bord personnalisé regroupés sous deux onglets pour donner de l'air. Composant
 * unique utilisé à la fois par la page match (`MatchDetailPage`) et la page
 * d'analyse collective (`PerformanceCollectivePage`) : toute évolution de mise en
 * page se fait ici une seule fois et s'applique aux deux écrans.
 */
export function TacticalStatsSection({
  teamId, events, categories, dimensions, options = [], matches, emptyMessage = 'Aucune donnée tactique.',
}: TacticalStatsSectionProps) {
  const [tab, setTab] = useState<SubTab>('brutes');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {events.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 3, width: 'fit-content' }}>
            {SUB_TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1, backgroundColor: tab === t.key ? '#1E2229' : 'transparent', color: tab === t.key ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
                <t.icon size={13} color={tab === t.key ? '#00E5A0' : 'currentColor'} style={{ flexShrink: 0, display: 'block' }} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {tab === 'brutes' ? (
            <TacticalReport events={events} categories={categories} dimensions={dimensions} options={options} />
          ) : (
            <TacticalDashboard teamId={teamId} events={events} categories={categories} dimensions={dimensions} options={options} matches={matches} />
          )}
        </>
      )}
    </div>
  );
}
