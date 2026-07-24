import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, AlertCircle } from 'lucide-react';
import { tacticalEventsApi } from '../api/tacticalEvents';
import type { TacticalMatchRef } from './TacticalReport';

interface Props {
  matches: TacticalMatchRef[];
  onDeleted: () => void;
}

/** Liste repliable des matchs ayant des données tactiques dans la période/les filtres actifs de
 *  "Tendances tactiques", avec suppression par match — permet de corriger un import erroné
 *  repéré directement depuis les tendances saison, sans devoir ouvrir la fiche du match. */
export function TacticalMatchManager({ matches, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(matchId: string) {
    setDeletingId(matchId);
    setError('');
    try {
      await tacticalEventsApi.deleteForMatch(matchId);
      setConfirmingId(null);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDeletingId(null);
    }
  }

  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left' }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Gérer les imports tactiques par match ({sorted.length})
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #2A2F3A', maxHeight: 260, overflowY: 'auto' }}>
          {error && (
            <p style={{ color: '#EF4444', fontSize: '0.76rem', margin: 0, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} />{error}
            </p>
          )}
          {sorted.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 12px', borderBottom: '1px solid #1E2229', fontSize: '0.78rem' }}>
              <span style={{ color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.label} <span style={{ color: '#475569' }}>· {m.date}</span>
              </span>
              {confirmingId === m.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ color: '#EF4444', fontSize: '0.7rem' }}>Supprimer ?</span>
                  <button onClick={() => handleDelete(m.id)} disabled={deletingId === m.id}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: deletingId === m.id ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.72rem', padding: 2 }}>
                    {deletingId === m.id ? '…' : 'Oui'}
                  </button>
                  <button onClick={() => setConfirmingId(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem', padding: 2 }}>
                    Annuler
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmingId(m.id)} title="Supprimer les données tactiques de ce match"
                  style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
