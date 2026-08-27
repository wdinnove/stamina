import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search, Pencil, Trash2 } from 'lucide-react';
import { tacticalSystemsApi } from '../api/tacticalSystems';
import { teamCategoriesApi, NEW_CATEGORY_PALETTE } from '../api/categories';
import { teamFoldersApi, countByFolder } from '../api/folders';
import { useFolderParam } from '../hooks/useFolderParam';
import { useUrlState, useUrlPatch } from '../hooks/useUrlState';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Badge, DropzoneEmptyState, EmptyState, DiagramThumb, Spinner, AddButton, FolderCard, NewFolderCard, FolderBreadcrumb, FolderRenameModal, FolderDeleteModal } from '../components';
import { createScene } from '../utils/diagram';
import type { TacticalSystem, TeamCategory, TeamFolder } from '../data/types';

/** Terrain vide pour la couverture d'un système sans phase — un diagramme vierge, plutôt
 *  qu'un cadre noir avec une icône. */
const BLANK_SCENE = createScene('half');

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12,
};

// Même gabarit que Modifier/Supprimer sur la fiche système (TacticalSystemDetailPage) — fin,
// pas le style plein des boutons AddButton.
const modifyHeaderBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem',
};
const deleteHeaderBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
  backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', fontSize: '0.82rem',
};

/** La vignette du système : son premier schéma, ou un terrain vierge s'il n'en a pas encore.
 *  Toujours carrée — un ratio fixe, indépendant du terrain de la scène, pour que toutes les
 *  cards d'une rangée fassent la même taille. */
function Cover({ system }: { system: TacticalSystem }) {
  const scene = system.coverScene && system.coverScene.elements.length > 0 ? system.coverScene : BLANK_SCENE;
  return <DiagramThumb scene={scene} radius={0} style={{ aspectRatio: '1 / 1' }} />;
}

export default function TacticalSystemsPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate = useNavigate();
  const [systems,        setSystems]        = useState<TacticalSystem[]>([]);
  const [categories,     setCategories]     = useState<TeamCategory[]>([]);
  const [folders,        setFolders]        = useState<TeamFolder[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useUrlState('recherche', '');
  const [categoryFilter, setCategoryFilter] = useUrlState('categorie', '');
  const clearFilters = useUrlPatch();
  const [foldersLoaded,  setFoldersLoaded]  = useState(false);
  const [activeFolder,   setActiveFolder]   = useFolderParam(folders, foldersLoaded);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderEditing,  setFolderEditing]  = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);

  // Un dossier quitté ou changé referme toute édition en cours sur l'ancien.
  useEffect(() => { setFolderEditing(false); setFolderDeleting(false); }, [activeFolder]);

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
    setFoldersLoaded(false);
    teamFoldersApi.list(selected.team.id, 'system')
      .then(setFolders)
      .catch(() => setFolders([]))
      // Chargés — ou en échec : dans les deux cas l'identifiant de l'URL devient vérifiable.
      .finally(() => setFoldersLoaded(true));
  }, [selected?.team.id]);

  const needle = search.trim().toLowerCase();
  const searching = needle.length > 0;
  // Recherche texte ou filtre catégorie : les deux sont des filtres globaux qui aplatissent
  // la vue sur tous les systèmes correspondants, dossier ou pas — comme Drive. Sans ça, on
  // navigue : dossiers + systèmes sans dossier à la racine, seulement le contenu du dossier
  // une fois dedans.
  const filtering = searching || categoryFilter !== '';
  const currentFolder = activeFolder ? folders.find(f => f.id === activeFolder) : undefined;

  const displayedFolders = filtering || activeFolder ? [] : folders;
  const displayedSystems = systems.filter(sys =>
    (categoryFilter === '' || sys.categoryId === categoryFilter) &&
    (filtering
      ? (needle === '' || sys.name.toLowerCase().includes(needle) || (sys.categoryName ?? '').toLowerCase().includes(needle))
      : (activeFolder ? sys.folderId === activeFolder : !sys.folderId))
  );

  const counts = countByFolder(systems);

  async function handleCreateFolder(name: string) {
    if (!selected) return;
    const color = NEW_CATEGORY_PALETTE[folders.length % NEW_CATEGORY_PALETTE.length];
    const created = await teamFoldersApi.create(selected.team.id, 'system', name, color);
    setFolders(prev => [...prev, created]);
    setCreatingFolder(false);
  }

  async function handleRenameFolder(folder: TeamFolder) {
    const updated = await teamFoldersApi.update(folder.id, { name: folder.name });
    setFolders(prev => prev.map(f => f.id === updated.id ? updated : f));
  }

  async function handleDeleteFolder(folder: TeamFolder) {
    await teamFoldersApi.remove(folder.id);
    setFolders(prev => prev.filter(f => f.id !== folder.id));
    setSystems(prev => prev.map(sys => sys.folderId === folder.id ? { ...sys, folderId: undefined } : sys));
    if (activeFolder === folder.id) setActiveFolder(null, { replace: true });
  }

  async function moveToFolder(itemId: string, folderId: string | null) {
    const sys = systems.find(s => s.id === itemId);
    if (!sys || (sys.folderId ?? null) === folderId) return;
    const prevFolderId = sys.folderId;
    setSystems(prev => prev.map(s => s.id === itemId ? { ...s, folderId: folderId ?? undefined } : s));
    try {
      await tacticalSystemsApi.update(itemId, { folderId });
    } catch {
      setSystems(prev => prev.map(s => s.id === itemId ? { ...s, folderId: prevFolderId } : s));
    }
  }

  const nothingToShow = !loading && displayedFolders.length === 0 && displayedSystems.length === 0 && !creatingFolder;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Systèmes</h1>
        {canEditTeamData && (
          <div style={{ display: 'flex', gap: 8 }}>
            {currentFolder ? (
              <>
                <button type="button" onClick={() => setFolderEditing(true)} style={modifyHeaderBtn}>
                  <Pencil size={13} /><span className="hidden sm:inline">Modifier le dossier</span>
                </button>
                <button type="button" onClick={() => setFolderDeleting(true)} style={deleteHeaderBtn}>
                  <Trash2 size={13} /><span className="hidden sm:inline">Supprimer le dossier</span>
                </button>
              </>
            ) : (
              <AddButton label="Ajouter un dossier" variant="soft" onClick={() => { clearFilters({ recherche: null, categorie: null }); setCreatingFolder(true); }} />
            )}
            <AddButton label="Ajouter un système"
              onClick={() => navigate('/systemes/nouveau', activeFolder ? { state: { folderId: activeFolder } } : undefined)} />
          </div>
        )}
      </div>

      {/* Recherche + catégorie */}
      <div className="flex flex-col sm:flex-row" style={{ gap: 10, marginBottom: 16, width: '100%' }}>
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

      {/* Fil d'ariane — dedans un dossier, hors filtre global. Renommer/supprimer n'existe qu'ici. */}
      {!filtering && currentFolder && (
        <FolderBreadcrumb folder={currentFolder}
          onBack={() => setActiveFolder(null)}
          onDropUnassign={itemId => moveToFolder(itemId, null)}
        />
      )}

      {folderEditing && currentFolder && (
        <FolderRenameModal folder={currentFolder}
          onSave={name => handleRenameFolder({ ...currentFolder, name })}
          onClose={() => setFolderEditing(false)}
        />
      )}

      {folderDeleting && currentFolder && (
        <FolderDeleteModal folder={currentFolder} count={counts[currentFolder.id] ?? 0}
          onConfirm={() => handleDeleteFolder(currentFolder)}
          onClose={() => setFolderDeleting(false)}
        />
      )}

      {loading && <Spinner centered />}

      {error && <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>}

      {nothingToShow && (
        canEditTeamData ? (
          <DropzoneEmptyState
            label={filtering ? 'Aucun système trouvé' : activeFolder ? 'Dossier vide' : 'Cliquer pour ajouter un système'}
            icon={filtering || activeFolder ? null : undefined}
            onClick={filtering || activeFolder ? undefined : () => navigate('/systemes/nouveau')}
          />
        ) : (
          <EmptyState message={filtering ? 'Aucun système trouvé.' : activeFolder ? 'Ce dossier est vide.' : 'Aucun système. Seuls les rôles Admin et Éditeur peuvent en ajouter.'} size="lg" />
        )
      )}

      {(displayedFolders.length > 0 || creatingFolder) && (
        <div style={{ ...GRID, marginBottom: 22 }}>
          {creatingFolder && (
            <NewFolderCard
              color={NEW_CATEGORY_PALETTE[folders.length % NEW_CATEGORY_PALETTE.length]}
              onCreate={handleCreateFolder}
              onCancel={() => setCreatingFolder(false)}
            />
          )}
          {displayedFolders.map(f => (
            <FolderCard key={f.id} folder={f} count={counts[f.id] ?? 0}
              onOpen={() => setActiveFolder(f.id)}
              onDrop={itemId => moveToFolder(itemId, f.id)}
            />
          ))}
        </div>
      )}

      {displayedSystems.length > 0 && (
        <div style={GRID}>
          {displayedSystems.map(sys => (
            <div key={sys.id}
              draggable={canEditTeamData}
              onDragStart={e => e.dataTransfer.setData('text/plain', sys.id)}
              onClick={() => navigate(`/systemes/${sys.id}`)}
              style={{
                backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10,
                overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A4152'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; }}
            >
              <Cover system={sys} />
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <span style={{
                  color: '#F1F5F9', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', minHeight: 'calc(0.85rem * 1.3 * 2)',
                }}>
                  {sys.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
                  {sys.categoryName ? (
                    <Badge color={sys.categoryColor ?? '#475569'} bg={(sys.categoryColor ?? '#475569') + '18'}
                      label={sys.categoryName} size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
                  ) : (
                    <Badge color="#94A3B8" bg="#2A2F3A" label="Aucune catégorie" size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
                  )}
                  <span style={{
                    color: sys.phaseCount > 0 ? '#94A3B8' : '#334155',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {sys.phaseCount}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
