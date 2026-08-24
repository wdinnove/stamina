import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search, Video, Pencil, Trash2 } from 'lucide-react';
import { exercisesApi } from '../api/exercises';
import { teamCategoriesApi, NEW_CATEGORY_PALETTE } from '../api/categories';
import { teamFoldersApi, countByFolder } from '../api/folders';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Badge, DropzoneEmptyState, EmptyState, DiagramThumb, Spinner, AddButton, FolderCard, NewFolderCard, FolderBreadcrumb, FolderRenameModal, FolderDeleteModal } from '../components';
import { createScene } from '../utils/diagram';
import type { Exercise, TeamCategory, TeamFolder } from '../data/types';

/** Terrain vide pour la couverture d'un exercice sans phase — un diagramme vierge, plutôt
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

// Même gabarit que Modifier/Supprimer sur la fiche exercice (ExerciseDetailPage) — fin,
// pas le style plein des boutons AddButton.
const modifyHeaderBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem',
};
const deleteHeaderBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 6,
  backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer', fontSize: '0.82rem',
};

/** La vignette de l'exercice : son premier schéma, ou un terrain vierge s'il n'en a pas encore.
 *  Toujours carrée — un ratio fixe, indépendant du terrain de la scène, pour que toutes les
 *  cards d'une rangée fassent la même taille. */
function Cover({ exercise }: { exercise: Exercise }) {
  const scene = exercise.coverScene && exercise.coverScene.elements.length > 0 ? exercise.coverScene : BLANK_SCENE;
  return <DiagramThumb scene={scene} radius={0} style={{ aspectRatio: '1 / 1' }} />;
}

export default function ExercisesPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate = useNavigate();
  const [exercises,      setExercises]      = useState<Exercise[]>([]);
  const [categories,     setCategories]     = useState<TeamCategory[]>([]);
  const [folders,        setFolders]        = useState<TeamFolder[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFolder,   setActiveFolder]   = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderEditing,  setFolderEditing]  = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);

  // Un dossier quitté ou changé referme toute édition en cours sur l'ancien.
  useEffect(() => { setFolderEditing(false); setFolderDeleting(false); }, [activeFolder]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setExercises([]);
    exercisesApi.list(selected.team.id)
      .then(setExercises)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  useEffect(() => {
    if (!selected) return;
    teamCategoriesApi.list(selected.team.id, 'exercise').then(setCategories).catch(() => {});
    teamFoldersApi.list(selected.team.id, 'exercise').then(setFolders).catch(() => {});
  }, [selected?.team.id]);

  const needle = search.trim().toLowerCase();
  const searching = needle.length > 0;
  // Recherche texte ou filtre catégorie : les deux sont des filtres globaux qui aplatissent
  // la vue sur tous les exercices correspondants, dossier ou pas — comme Drive. Sans ça, on
  // navigue : dossiers + exercices sans dossier à la racine, seulement le contenu du dossier
  // une fois dedans.
  const filtering = searching || categoryFilter !== '';
  const currentFolder = activeFolder ? folders.find(f => f.id === activeFolder) : undefined;

  const displayedFolders = filtering || activeFolder ? [] : folders;
  const displayedExercises = exercises.filter(ex =>
    (categoryFilter === '' || ex.categoryId === categoryFilter) &&
    (filtering
      ? (needle === '' || ex.name.toLowerCase().includes(needle) || (ex.categoryName ?? '').toLowerCase().includes(needle))
      : (activeFolder ? ex.folderId === activeFolder : !ex.folderId))
  );

  const counts = countByFolder(exercises);

  async function handleCreateFolder(name: string) {
    if (!selected) return;
    const color = NEW_CATEGORY_PALETTE[folders.length % NEW_CATEGORY_PALETTE.length];
    const created = await teamFoldersApi.create(selected.team.id, 'exercise', name, color);
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
    setExercises(prev => prev.map(ex => ex.folderId === folder.id ? { ...ex, folderId: undefined } : ex));
    setActiveFolder(prev => prev === folder.id ? null : prev);
  }

  async function moveToFolder(itemId: string, folderId: string | null) {
    const ex = exercises.find(e => e.id === itemId);
    if (!ex || (ex.folderId ?? null) === folderId) return;
    const prevFolderId = ex.folderId;
    setExercises(prev => prev.map(e => e.id === itemId ? { ...e, folderId: folderId ?? undefined } : e));
    try {
      await exercisesApi.update(itemId, { folderId });
    } catch {
      setExercises(prev => prev.map(e => e.id === itemId ? { ...e, folderId: prevFolderId } : e));
    }
  }

  const nothingToShow = !loading && displayedFolders.length === 0 && displayedExercises.length === 0 && !creatingFolder;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Exercices</h1>
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
              <AddButton label="Ajouter un dossier" variant="soft" onClick={() => { setSearch(''); setCategoryFilter(''); setCreatingFolder(true); }} />
            )}
            <AddButton label="Ajouter un exercice"
              onClick={() => navigate('/exercices/nouveau', activeFolder ? { state: { folderId: activeFolder } } : undefined)} />
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
            label={filtering ? 'Aucun exercice trouvé' : activeFolder ? 'Dossier vide' : 'Cliquer pour ajouter un exercice'}
            icon={filtering || activeFolder ? null : undefined}
            onClick={filtering || activeFolder ? undefined : () => navigate('/exercices/nouveau')}
          />
        ) : (
          <EmptyState message={filtering ? 'Aucun exercice trouvé.' : activeFolder ? 'Ce dossier est vide.' : 'Aucun exercice. Seuls les rôles Admin et Éditeur peuvent en ajouter.'} size="lg" />
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

      {displayedExercises.length > 0 && (
        <div style={GRID}>
          {displayedExercises.map(ex => (
            <div key={ex.id}
              draggable={canEditTeamData}
              onDragStart={e => e.dataTransfer.setData('text/plain', ex.id)}
              onClick={() => navigate(`/exercices/${ex.id}`)}
              style={{
                backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10,
                overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#3A4152'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2A2F3A'; }}
            >
              <Cover exercise={ex} />
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <span style={{
                  color: '#F1F5F9', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', minHeight: 'calc(0.85rem * 1.3 * 2)',
                }}>
                  {ex.name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
                  {ex.categoryName ? (
                    <Badge color={ex.categoryColor ?? '#475569'} bg={(ex.categoryColor ?? '#475569') + '18'}
                      label={ex.categoryName} size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
                  ) : (
                    <Badge color="#94A3B8" bg="#2A2F3A" label="Aucune catégorie" size="sm" style={{ fontWeight: 600, padding: '2px 8px', flexShrink: 0 }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      color: ex.phaseCount > 0 ? '#94A3B8' : '#334155',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 700,
                    }}>
                      {ex.phaseCount}
                    </span>
                    <Video size={13} color={ex.videoUrl ? '#00E5A0' : '#2A2F3A'} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
