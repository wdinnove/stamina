import { useState, useEffect } from 'react';
import { Plus, X, ChevronUp, ChevronDown, Settings2, AlertCircle, LayoutGrid, Pencil, Copy } from 'lucide-react';
import { tacticalDashboardApi } from '../api/tacticalDashboard';
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption, TacticalDashboardWidget } from '../data/types';
import type { TacticalMatchRef } from './TacticalReport';
import { renderTacticalWidgetContent, tacticalWidgetTitle, EmptyNote } from './tacticalWidgetRenderer';
import type { WidgetLike } from './tacticalWidgetRenderer';
import { TacticalWidgetEditorModal } from './TacticalWidgetEditorModal';

const iconBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 2,
};

type ColumnCount = 1 | 2 | 3;
const COLUMN_OPTIONS: ColumnCount[] = [1, 2, 3];

function columnsStorageKey(teamId: string) {
  return `tactical-dashboard-columns-${teamId}`;
}

function loadColumnPreference(teamId: string): ColumnCount {
  const raw = localStorage.getItem(columnsStorageKey(teamId));
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return (COLUMN_OPTIONS as number[]).includes(parsed) ? (parsed as ColumnCount) : 2;
}

function ColumnPicker({ value, onChange }: { value: ColumnCount; onChange: (v: ColumnCount) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <LayoutGrid size={13} color="#475569" />
      <div style={{ display: 'flex', backgroundColor: '#0D0F14', borderRadius: 6, padding: 2, gap: 2 }}>
        {COLUMN_OPTIONS.map(n => (
          <button key={n} type="button" onClick={() => onChange(n)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: '0.75rem', fontWeight: value === n ? 700 : 400,
              backgroundColor: value === n ? '#1E2229' : 'transparent',
              color: value === n ? '#00E5A0' : '#475569',
            }}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [widgets, setWidgets] = useState<TacticalDashboardWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [columns, setColumns] = useState<ColumnCount>(() => loadColumnPreference(teamId));
  const [editor, setEditor] = useState<EditorState | null>(null);

  useEffect(() => {
    setColumns(loadColumnPreference(teamId));
  }, [teamId]);

  function handleColumnsChange(n: ColumnCount) {
    setColumns(n);
    localStorage.setItem(columnsStorageKey(teamId), String(n));
  }

  useEffect(() => {
    setLoading(true);
    tacticalDashboardApi.listWidgets(teamId)
      .then(setWidgets)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [teamId]);

  async function handleDelete(id: string) {
    setWidgets(prev => prev.filter(w => w.id !== id));
    try { await tacticalDashboardApi.deleteWidget(id); } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= widgets.length) return;
    const reordered = [...widgets];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setWidgets(reordered);
    try { await tacticalDashboardApi.reorderWidgets(reordered.map(w => w.id)); } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); }
  }

  function handleSaved(saved: TacticalDashboardWidget) {
    setWidgets(prev => {
      const exists = prev.some(w => w.id === saved.id);
      return exists ? prev.map(w => w.id === saved.id ? saved : w) : [...prev, saved];
    });
    setEditor(null);
  }

  const renderContext = { events, categories, dimensions, options, matches };

  return (
    <div>
      <style>{`@media (max-width: 640px) { .tactical-dashboard-grid { grid-template-columns: 1fr !important; } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95rem' }}>Mon tableau de bord</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ColumnPicker value={columns} onChange={handleColumnsChange} />
          <button type="button" onClick={() => setEditing(e => !e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: editing ? '#1E2229' : 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: editing ? '#00E5A0' : '#94A3B8', cursor: 'pointer', fontSize: '0.78rem' }}>
            <Settings2 size={13} /> {editing ? 'Terminer' : 'Personnaliser'}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: 16 }}>
          <button type="button" onClick={() => setEditor({ mode: 'create' })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
            <Plus size={14} /> Ajouter un bloc
          </button>
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
        <div className="tactical-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 16 }}>
          {widgets.map((widget, i) => (
            <div key={widget.id} style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
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
              {renderTacticalWidgetContent(widget, renderContext)}
            </div>
          ))}
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
