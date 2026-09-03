import { useState, useEffect, useMemo } from 'react';
import { X, ChevronUp, ChevronDown, Settings2, AlertCircle, Pencil, Copy } from 'lucide-react';
import { tacticalDashboardApi } from '../api/tacticalDashboard';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption, TacticalDashboardWidget } from '../data/types';
import type { TacticalMatchRef } from './TacticalReport';
import { TacticalWidgetContent, tacticalWidgetTitle, EmptyNote } from './tacticalWidgetRenderer';
import type { WidgetLike } from './tacticalWidgetRenderer';
import { TacticalWidgetEditorModal } from './TacticalWidgetEditorModal';
import { AddButton } from './AddButton';

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2,
};

interface Props {
  teamId: string;
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options?: TacticalDimensionOption[];
  matches: TacticalMatchRef[];
}

type EditorState =
  | { mode: 'create'; initialWidget?: WidgetLike }
  | { mode: 'edit'; initialWidget: TacticalDashboardWidget };

/**
 * Tableau de bord tactique personnalisé — en complément du rapport automatique
 * (`TacticalReport`). L'équipe compose ses propres blocs (tableau par dimension,
 * évolution, matrice croisée, camembert, comparaison de périodes), persistés
 * partagés pour toute l'équipe.
 */
export function TacticalDashboard({ teamId, events, categories, dimensions, options = [], matches }: Props) {
  const { canEditTeamData } = useTeamSeason();
  const [widgets, setWidgets] = useState<TacticalDashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    tacticalDashboardApi.listWidgets(teamId)
      .then(setWidgets)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [teamId]);

  async function handleDelete(id: string) {
    const prevWidgets = widgets;
    setWidgets(prev => prev.filter(w => w.id !== id));
    try { await tacticalDashboardApi.deleteWidget(id); } catch (e) { setWidgets(prevWidgets); setError(e instanceof Error ? e.message : 'Erreur'); }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= widgets.length) return;
    const prevWidgets = widgets;
    const reordered = [...widgets];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setWidgets(reordered);
    try { await tacticalDashboardApi.reorderWidgets(reordered.map(w => w.id)); } catch (e) { setWidgets(prevWidgets); setError(e instanceof Error ? e.message : 'Erreur'); }
  }

  /** Glisser-déposer (en plus des boutons haut/bas) : déplace le bloc `fromIndex` à la position
   *  `toIndex`, pas juste un échange avec le voisin immédiat. */
  async function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const prevWidgets = widgets;
    const reordered = [...widgets];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setWidgets(reordered);
    try { await tacticalDashboardApi.reorderWidgets(reordered.map(w => w.id)); } catch (e) { setWidgets(prevWidgets); setError(e instanceof Error ? e.message : 'Erreur'); }
  }

  function handleSaved(saved: TacticalDashboardWidget) {
    setWidgets(prev => {
      const exists = prev.some(w => w.id === saved.id);
      return exists ? prev.map(w => w.id === saved.id ? saved : w) : [...prev, saved];
    });
    setEditor(null);
  }

  // Référence stable : c'est elle qui rend `TacticalWidgetContent` réellement mémoïsable — un
  // objet recréé à chaque rendu invaliderait tous les blocs à chaque frappe ou déplacement.
  const renderContext = useMemo(
    () => ({ events, categories, dimensions, options, matches }),
    [events, categories, dimensions, options, matches],
  );

  return (
    <div>
      <style>{`@media (max-width: 640px) { .tactical-dashboard-grid { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95rem' }}>Mon tableau de bord</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {canEditTeamData && (
          <button type="button" onClick={() => setEditing(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: editing ? '#1E2229' : 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: editing ? '#00E5A0' : '#94A3B8', cursor: 'pointer', fontSize: '0.78rem' }}>
            <Settings2 size={13} /> {editing ? 'Terminer' : 'Personnaliser'}
          </button>
          )}
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: 16 }}>
          <AddButton label="Ajouter un bloc" onClick={() => setEditor({ mode: 'create' })} />
          {error && (
            <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <EmptyNote>Chargement…</EmptyNote>
      ) : widgets.length === 0 ? (
        !editing && <EmptyNote>Aucun bloc personnalisé — cliquez "Personnaliser" pour en ajouter.</EmptyNote>
      ) : (
        <div className="tactical-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          {widgets.map((widget, i) => {
            const widthSpan = widget.config.widthSpan === 2 ? 2 : 1;
            return (
              <div key={widget.id}
                draggable={editing}
                onDragStart={() => setDragIndex(i)}
                onDragOver={e => { if (editing && dragIndex !== null) e.preventDefault(); }}
                onDrop={e => { e.preventDefault(); if (dragIndex !== null) handleReorder(dragIndex, i); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                style={{
                  backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16,
                  gridColumn: `span ${widthSpan}`, opacity: dragIndex === i ? 0.4 : 1,
                  cursor: editing ? 'grab' : 'default', transition: 'opacity 0.1s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
                  <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.82rem' }}>{tacticalWidgetTitle(widget, categories, dimensions)}</span>
                  {editing && (
                    <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button type="button" onClick={() => setEditor({ mode: 'edit', initialWidget: widget })} style={iconBtnStyle} title="Modifier"><Pencil size={13} /></button>
                      <button type="button" onClick={() => setEditor({ mode: 'create', initialWidget: { type: widget.type, categoryId: widget.categoryId, title: widget.title, config: widget.config } })} style={iconBtnStyle} title="Dupliquer"><Copy size={13} /></button>
                      <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0} style={{ ...iconBtnStyle, color: i === 0 ? '#2A2F3A' : '#94A3B8' }} title="Monter"><ChevronUp size={13} /></button>
                      <button type="button" onClick={() => handleMove(i, 1)} disabled={i === widgets.length - 1} style={{ ...iconBtnStyle, color: i === widgets.length - 1 ? '#2A2F3A' : '#94A3B8' }} title="Descendre"><ChevronDown size={13} /></button>
                      <button type="button" onClick={() => handleDelete(widget.id)} style={iconBtnStyle} title="Supprimer"><X size={13} /></button>
                    </span>
                  )}
                </div>
                <TacticalWidgetContent widget={widget} context={renderContext} />
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <TacticalWidgetEditorModal
          mode={editor.mode}
          teamId={teamId}
          initialWidget={editor.initialWidget}
          sortOrder={widgets.length}
          events={events}
          categories={categories}
          dimensions={dimensions}
          options={options}
          matches={matches}
          onSaved={handleSaved}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
