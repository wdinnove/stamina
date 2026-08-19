import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search, ListOrdered } from 'lucide-react';
import { tacticalSystemsApi } from '../api/tacticalSystems';
import { teamCategoriesApi } from '../api/categories';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Badge, DropzoneEmptyState, EmptyState, DiagramThumb, Spinner, AddButton } from '../components';
import type { TacticalSystem, TeamCategory } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const TH: React.CSSProperties = {
  paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8',
  fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
};

/** La vignette du système : son premier schéma, ou un cadre vide s'il n'en a pas encore. */
function Cover({ system }: { system: TacticalSystem }) {
  if (system.coverScene && system.coverScene.elements.length > 0) {
    return <DiagramThumb scene={system.coverScene} radius={6} style={{ width: 60, maxWidth: 60 }} />;
  }
  return (
    <div style={{
      width: 60, height: 56, borderRadius: 6, border: '1px dashed #2A2F3A', backgroundColor: '#0D0F14',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <ListOrdered size={14} color="#2A2F3A" />
    </div>
  );
}

export default function TacticalSystemsPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate = useNavigate();
  const [systems,        setSystems]        = useState<TacticalSystem[]>([]);
  const [categories,     setCategories]     = useState<TeamCategory[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setSystems([]);
    tacticalSystemsApi.list(selected.team.id)
      .then(setSystems)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  useEffect(() => {
    if (!selected) return;
    teamCategoriesApi.list(selected.team.id, 'system').then(setCategories).catch(() => {});
  }, [selected?.team.id]);

  const needle = search.toLowerCase();
  const filtered = systems.filter(sys =>
    (categoryFilter === '' || sys.categoryId === categoryFilter) &&
    (
      sys.name.toLowerCase().includes(needle) ||
      (sys.categoryName ?? '').toLowerCase().includes(needle)
    )
  );

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Systèmes</h1>
        {canEditTeamData && (
          <AddButton label="Ajouter un système" onClick={() => navigate('/systemes/nouveau')} />
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row" style={{ gap: 10, marginBottom: 20, width: '100%' }}>
        <div className="w-full sm:flex-[2_1_240px]" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input type="text" placeholder="Rechercher…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32 }} />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="w-full sm:flex-[1_1_180px]" style={inputStyle}>
          <option value="">Toutes les catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && <Spinner centered />}

      {error && <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

      {!loading && filtered.length === 0 && (
        canEditTeamData ? (
          <DropzoneEmptyState
            label={search ? 'Aucun système trouvé' : 'Cliquer pour ajouter un système'}
            icon={search ? null : undefined}
            onClick={search ? undefined : () => navigate('/systemes/nouveau')}
          />
        ) : (
          <EmptyState message={search ? 'Aucun système trouvé.' : 'Aucun système. Seuls les rôles Admin et Éditeur peuvent en ajouter.'} size="lg" />
        )
      )}

      {filtered.length > 0 && (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 320 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th className="pl-3 sm:pl-5 w-[76px]" style={TH}></th>
                <th className="px-3 sm:px-5" style={TH}>Nom</th>
                <th className="px-3 sm:px-5 w-[110px] sm:w-[150px]" style={TH}>Catégorie</th>
                <th className="hidden sm:table-cell sm:px-5 sm:w-[90px]" style={TH}>Phases</th>
                <th className="pr-2 sm:px-5" style={{ ...TH, width: 24 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sys, i) => (
                <tr key={sys.id}
                  onClick={() => navigate(`/systemes/${sys.id}`)}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1E2229' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1E26'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  <td className="pl-3 sm:pl-5" style={{ paddingTop: 10, paddingBottom: 10 }}>
                    <Cover system={sys} />
                  </td>
                  <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, overflow: 'hidden' }}>
                    <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {sys.name}
                    </span>
                  </td>
                  <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, overflow: 'hidden' }}>
                    {sys.categoryName && (
                      <Badge color={sys.categoryColor ?? '#475569'} bg={(sys.categoryColor ?? '#475569') + '18'}
                        label={sys.categoryName} size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
                    )}
                  </td>
                  <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12 }}>
                    <span style={{
                      color: sys.phaseCount > 0 ? '#94A3B8' : '#334155',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 700,
                    }}>
                      {sys.phaseCount}
                    </span>
                  </td>
                  <td className="pr-2 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M5 3l4 4-4 4" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
