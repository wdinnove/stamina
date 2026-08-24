import { useState } from 'react';
import { Folder, ChevronLeft, X } from 'lucide-react';
import { Modal } from './Modal';
import type { TeamFolder } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/**
 * Une carte-dossier dans la grille façon Drive : ouvre le dossier au clic, cible de
 * glisser-déposer pour y ranger un exercice/système. Pas de renommer/supprimer ici — ces
 * actions ne vivent que dans le dossier lui-même, via `FolderBreadcrumb`.
 */
export function FolderCard({ folder, count, onOpen, onDrop }: {
  folder: TeamFolder;
  count: number;
  onOpen: () => void;
  onDrop: (itemId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onClick={onOpen}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(e.dataTransfer.getData('text/plain')); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
        backgroundColor: dragOver ? folder.color + '18' : '#161920',
        border: `1px solid ${dragOver ? folder.color : '#2A2F3A'}`,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 8, backgroundColor: folder.color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Folder size={17} color={folder.color} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </div>
        <div style={{ color: '#475569', fontSize: '0.72rem' }}>{count} élément{count > 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}

/** La carte de création — même gabarit qu'une carte-dossier, mais avec un champ nom à saisir. */
export function NewFolderCard({ color, onCreate, onCancel }: {
  color: string;
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    setBusy(true);
    try { await onCreate(trimmed); } finally { setBusy(false); }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
      backgroundColor: '#161920', border: `1px dashed ${color}`,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 8, backgroundColor: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Folder size={17} color={color} />
      </div>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Nom du dossier…" disabled={busy}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        onBlur={submit}
        style={{ background: 'none', border: 'none', outline: 'none', color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 700, flex: 1, minWidth: 0, padding: 0 }} />
    </div>
  );
}

/**
 * Le fil d'ariane affiché une fois dans un dossier : retour à la racine et nom du dossier.
 * Renommer/supprimer se font via des modales (`FolderRenameModal`/`FolderDeleteModal`),
 * ouvertes par les boutons « Modifier »/« Supprimer » de l'en-tête — rien d'inline ici.
 */
export function FolderBreadcrumb({ folder, onBack, onDropUnassign }: {
  folder: TeamFolder;
  onBack: () => void;
  /** Glisser un exercice jusqu'ici le sort du dossier — seul moyen de « remonter » un élément. */
  onDropUnassign: (itemId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button type="button" onClick={onBack}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onDropUnassign(e.dataTransfer.getData('text/plain')); }}
        title="Glisser un élément ici pour le sortir du dossier"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 14,
          background: dragOver ? '#2A2F3A' : 'none', border: `1px solid ${dragOver ? '#94A3B8' : 'transparent'}`,
          cursor: 'pointer', color: dragOver ? '#F1F5F9' : '#94A3B8', fontSize: '0.82rem',
        }}>
        <ChevronLeft size={14} />
        <span>Tous</span>
      </button>
      <span style={{ color: '#334155' }}>/</span>
      <Folder size={13} color={folder.color} />
      <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem' }}>{folder.name}</span>
    </div>
  );
}

/** Modale de renommage d'un dossier. */
export function FolderRenameModal({ folder, onSave, onClose }: {
  folder: TeamFolder;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={400} scrollOverlay={false} style={{ padding: 24 }} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Renommer le dossier</h2>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={submit}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        {error && <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
            Annuler
          </button>
          <button type="submit" disabled={saving || !name.trim()}
            style={{ flex: 1, padding: '10px', backgroundColor: saving || !name.trim() ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving || !name.trim() ? '#475569' : '#0D0F14', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Modale de suppression d'un dossier — les éléments qu'il contenait remontent à la racine. */
export function FolderDeleteModal({ folder, count, onConfirm, onClose }: {
  folder: TeamFolder;
  /** Nombre d'éléments actuellement dans ce dossier, pour prévenir où ils vont atterrir. */
  count: number;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal maxWidth={400} scrollOverlay={false} style={{ padding: 24 }} onClose={onClose}>
      <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Supprimer « {folder.name} » ?</h2>
      <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px' }}>
        {count > 0
          ? `Le dossier sera supprimé. ${count} élément${count > 1 ? 's' : ''} qu'il contenait ${count > 1 ? 'repasseront' : 'repassera'} à la racine, sans être supprimé${count > 1 ? 's' : ''}.`
          : 'Le dossier sera supprimé.'}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onClose}
          style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
          Annuler
        </button>
        <button type="button" onClick={confirm} disabled={deleting}
          style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
          {deleting ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>
    </Modal>
  );
}
