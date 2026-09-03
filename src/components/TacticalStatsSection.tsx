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
  /** Effectif indexé par id, pour la table par joueuse du rapport. */
  playerNameById?: Map<string, string>;
  emptyMessage?: string;
  /** Fige l'affichage sur une seule vue, sans les onglets internes Brutes/Tableau de bord —
   *  pour les pages qui exposent déjà ce choix comme deux onglets de premier niveau (fiche
   *  match, analyse collective). Omis : comportement historique avec ses propres onglets. */
  view?: SubTab;
}

/**
 * Section "Statistiques tactiques" — rapport automatique ("Brutes") et tableau de
 * bord personnalisé. Composant unique utilisé à la fois par la page match
 * (`MatchDetailPage`) et la page d'analyse collective (`PerformanceCollectivePage`) :
 * toute évolution de mise en page se fait ici une seule fois et s'applique aux deux
 * écrans. Sans `view`, gère ses propres onglets Brutes/Tableau de bord ; avec `view`,
 * n'affiche que la vue demandée (le choix se fait alors en amont, côté page appelante).
 */
export function TacticalStatsSection({
  teamId, events, categories, dimensions, options = [], matches, playerNameById,
  emptyMessage = 'Aucune donnée tactique.', view,
}: TacticalStatsSectionProps) {
  const [tab, setTab] = useState<SubTab>('brutes');
  const activeView = view ?? tab;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {events.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          {!view && (
            <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 3, width: 'fit-content' }}>
              {SUB_TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, lineHeight: 1, backgroundColor: tab === t.key ? '#1E2229' : 'transparent', color: tab === t.key ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
                  <t.icon size={13} color={tab === t.key ? '#00E5A0' : 'currentColor'} style={{ flexShrink: 0, display: 'block' }} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {activeView === 'brutes' ? (
            <TacticalReport events={events} categories={categories} dimensions={dimensions} options={options} playerNameById={playerNameById} />
          ) : (
            <TacticalDashboard teamId={teamId} events={events} categories={categories} dimensions={dimensions} options={options} matches={matches} />
          )}
        </>
      )}
    </div>
  );
}
