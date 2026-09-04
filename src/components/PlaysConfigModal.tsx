import { useState } from 'react';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { Modal } from './Modal';
import { playsApi } from '../api/plays';
import { LAYER } from '../styles/layers';
import { playerNameShort } from '../utils/playerName';
import type { Play, LiveSide, Player } from '../data/types';

export interface PlaysConfigModalProps {
  teamId: string;
  plays: Play[];
  periodDurationSeconds: number;
  onPeriodDurationChange: (seconds: number) => void;
  /** Tout l'effectif de la saison — le vivier dans lequel se coche la feuille de match. */
  seasonPlayers: Player[];
  /** Joueuses retenues. Vide = aucune sélection, donc tout l'effectif est disponible. */
  rosterIds: string[];
  /** Joueuses actuellement sur le terrain : décochables interdit, elles sont déjà engagées. */
  lockedPlayerIds: string[];
  onRosterChange: (playerIds: string[]) => Promise<void>;
  /** Nombre de lignes de suivi enregistrées sur ce match — affiché avant l'effacement, pour que
   *  le geste ne soit jamais fait à l'aveugle. */
  recordedCount: number;
  /** Efface tout le suivi de CE match (possessions, rotations, effectif adverse) — le catalogue de
   *  plays, qui appartient à l'équipe, n'est pas concerné. */
  onDeleteAll: () => Promise<void>;
  onClose: () => void;
  /** Le parent recharge depuis l'API après chaque mutation — source de vérité unique. */
  onChanged: () => void | Promise<void>;
}

/** Durées de quart-temps usuelles en club (FFBB) — 8 min pour les jeunes catégories, 10 min en
 *  senior, 12 en municipal/loisir. Purement indicatif : le vrai chrono de table de marque fait foi. */
const PERIOD_PRESETS_MIN = [8, 10, 12] as const;

/** Vocabulaire basket courant, proposé en un clic plutôt qu'une liste vide à remplir à la main —
 *  déjà utilisé comme nom de catégorie dans le module tactique (ex. "Offense M2M"). */
const PRESETS: Record<LiveSide, string[]> = {
  offense: ['Contre-attaque', 'Jeu placé', 'Pick and roll', 'Post up', 'Isolation'],
  defense: ['Homme à homme', 'Zone 2-3', 'Zone 3-2', 'Box and one', 'Press tout terrain'],
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
  borderRadius: 6, backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
};

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  display: 'flex', alignItems: 'center', color: '#64748B', flexShrink: 0,
};

/**
 * Catalogue des plays attaque/défense d'une équipe — deux listes indépendantes. La suppression
 * échoue avec une violation de clé étrangère si le play a déjà été pointé sur un match
 * (`match_live_actions.play_id` sans cascade) : on catche et on propose la désactivation à la
 * place, plutôt que de bloquer la suppression en amont sur un simple comptage.
 */
export function PlaysConfigModal({
  teamId, plays, periodDurationSeconds, onPeriodDurationChange,
  seasonPlayers, rosterIds, lockedPlayerIds, onRosterChange,
  recordedCount, onDeleteAll, onClose, onChanged,
}: PlaysConfigModalProps) {
  const [newOffense, setNewOffense] = useState('');
  const [newDefense, setNewDefense] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Aucune sélection enregistrée = tout l'effectif est retenu : on part donc de la liste complète
  // cochée, ce qui rend le premier décochage immédiat au lieu d'exiger de tout cocher d'abord.
  const selectedIds = rosterIds.length > 0 ? new Set(rosterIds) : new Set(seasonPlayers.map(p => p.id));
  const locked = new Set(lockedPlayerIds);

  async function toggleRosterPlayer(playerId: string) {
    if (locked.has(playerId)) return;
    const next = new Set(selectedIds);
    if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
    setError('');
    try {
      // Tout coché = on efface la sélection plutôt que de figer une liste qui ne filtre rien :
      // l'effectif suivra ainsi les arrivées ultérieures dans la saison.
      const ids = next.size === seasonPlayers.length ? [] : [...next];
      await onRosterChange(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour de la feuille de match');
    }
  }

  async function deleteAll() {
    setDeleting(true);
    setError('');
    try {
      await onDeleteAll();
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'effacement");
    } finally {
      setDeleting(false);
    }
  }

  const offense = plays.filter(p => p.side === 'offense');
  const defense = plays.filter(p => p.side === 'defense');

  async function addPlay(side: LiveSide, name: string) {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const sidePlays = plays.filter(p => p.side === side);
      const nextOrder = sidePlays.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      await playsApi.create(teamId, side, name.trim(), nextOrder);
      if (side === 'offense') setNewOffense(''); else setNewDefense('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    if (!editing || !editing.name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await playsApi.rename(editing.id, editing.name.trim());
      setEditing(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du renommage');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(play: Play) {
    setBusy(true);
    setError('');
    try {
      await playsApi.setActive(play.id, !play.active);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function remove(play: Play) {
    setBusy(true);
    setError('');
    try {
      await playsApi.delete(play.id);
      await onChanged();
    } catch {
      setError(`« ${play.name} » a déjà été pointé sur au moins un match — désactivez-le plutôt que de le supprimer.`);
    } finally {
      setBusy(false);
    }
  }

  function renderList(side: LiveSide, list: Play[], newValue: string, setNewValue: (v: string) => void) {
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
          {side === 'offense' ? 'Attaque' : 'Défense'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map(play => (
            <div key={play.id} style={{ ...rowStyle, opacity: play.active ? 1 : 0.5 }}>
              {editing?.id === play.id ? (
                <>
                  <input autoFocus value={editing.name} onChange={e => setEditing({ id: play.id, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEditing(null); }}
                    style={{ flex: 1, minWidth: 0, padding: '4px 6px', backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', borderRadius: 4, color: '#F1F5F9', fontSize: '0.82rem' }} />
                  <button style={iconBtn} onClick={rename} title="Valider"><Check size={14} color="#00E5A0" /></button>
                  <button style={iconBtn} onClick={() => setEditing(null)} title="Annuler"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, color: '#E2E8F0', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {play.name}
                  </span>
                  <button style={iconBtn} onClick={() => toggleActive(play)} title={play.active ? 'Désactiver' : 'Activer'}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: play.active ? '#00E5A0' : '#64748B' }}>
                      {play.active ? 'Actif' : 'Inactif'}
                    </span>
                  </button>
                  <button style={iconBtn} onClick={() => setEditing({ id: play.id, name: play.name })} title="Renommer"><Pencil size={13} /></button>
                  <button style={iconBtn} onClick={() => remove(play)} title="Supprimer"><Trash2 size={13} color="#EF4444" /></button>
                </>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newValue} onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPlay(side, newValue); }}
              placeholder="Nouveau play…"
              style={{ flex: 1, minWidth: 0, padding: '7px 8px', backgroundColor: '#0D0F14', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.82rem', outline: 'none' }} />
            <button onClick={() => addPlay(side, newValue)} disabled={busy || !newValue.trim()}
              style={{ padding: '0 12px', borderRadius: 6, border: 'none', backgroundColor: '#00E5A0', color: '#0D0F14', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: busy || !newValue.trim() ? 0.5 : 1 }}>
              Ajouter
            </button>
          </div>

          {(() => {
            const existing = new Set(list.map(p => p.name.toLowerCase()));
            const suggestions = PRESETS[side].filter(name => !existing.has(name.toLowerCase()));
            if (suggestions.length === 0) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                {suggestions.map(name => (
                  <button key={name} type="button" onClick={() => addPlay(side, name)} disabled={busy}
                    style={{ padding: '4px 8px', borderRadius: 20, border: '1px dashed #2A2F3A', backgroundColor: 'transparent', color: '#64748B', fontSize: '0.72rem', cursor: busy ? 'not-allowed' : 'pointer' }}>
                    + {name}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <Modal onClose={onClose} maxWidth={620} zIndex={LAYER.modal} style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Réglages du direct</h2>
        <button onClick={onClose} style={iconBtn}><X size={18} /></button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
          Durée du quart-temps
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIOD_PRESETS_MIN.map(m => {
            const active = periodDurationSeconds === m * 60;
            return (
              <button key={m} type="button" onClick={() => onPeriodDurationChange(m * 60)}
                style={{
                  padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: active ? 700 : 400,
                  border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
                  backgroundColor: active ? '#00E5A018' : 'transparent',
                  color: active ? '#00E5A0' : '#94A3B8',
                }}>
                {m} min
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Joueuses du match
          </p>
          <span style={{ color: '#64748B', fontSize: '0.72rem' }}>{selectedIds.size} / {seasonPlayers.length}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {seasonPlayers.map(p => {
            const on = selectedIds.has(p.id);
            const isLocked = locked.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggleRosterPlayer(p.id)} disabled={isLocked}
                title={isLocked ? 'Sur le terrain — à sortir avant de la retirer de la feuille de match' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 20,
                  border: `1px solid ${on ? '#00E5A0' : '#2A2F3A'}`,
                  backgroundColor: on ? '#00E5A018' : 'transparent',
                  color: on ? '#00E5A0' : '#64748B',
                  fontSize: '0.78rem', fontWeight: on ? 600 : 400,
                  cursor: isLocked ? 'not-allowed' : 'pointer', opacity: isLocked ? 0.6 : 1,
                }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.number}</span>
                {playerNameShort(p)}
              </button>
            );
          })}
          {seasonPlayers.length === 0 && (
            <p style={{ color: '#475569', fontSize: '0.78rem', margin: 0 }}>Aucune joueuse dans l'effectif de la saison.</p>
          )}
        </div>
      </div>

      <p style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
        Plays
      </p>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {renderList('offense', offense, newOffense, setNewOffense)}
        {renderList('defense', defense, newDefense, setNewDefense)}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #2A2F3A' }}>
        <p style={{ color: '#EF4444', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
          Effacer le suivi
        </p>
        {confirmingDelete ? (
          <>
            <p style={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.5, margin: '0 0 12px' }}>
              Effacer <strong style={{ color: '#F1F5F9' }}>{recordedCount}</strong> ligne{recordedCount > 1 ? 's' : ''} de suivi
              (possessions, rotations, joueuses adverses) pour ce match ? Les plays configurés ci-dessus sont conservés.
              <br />Cette action est définitive.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmingDelete(false)} disabled={deleting}
                style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem' }}>
                Annuler
              </button>
              <button onClick={deleteAll} disabled={deleting} className="btn-danger"
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {deleting ? 'Effacement…' : 'Effacer définitivement'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '0 0 10px' }}>
              {recordedCount === 0
                ? 'Rien à effacer pour ce match.'
                : `${recordedCount} ligne${recordedCount > 1 ? 's' : ''} enregistrée${recordedCount > 1 ? 's' : ''} sur ce match.`}
            </p>
            <button onClick={() => setConfirmingDelete(true)} disabled={recordedCount === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6,
                backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
                color: recordedCount === 0 ? '#475569' : '#EF4444',
                cursor: recordedCount === 0 ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600,
                opacity: recordedCount === 0 ? 0.5 : 1,
              }}>
              <Trash2 size={13} />Effacer les données de ce match
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 16, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
