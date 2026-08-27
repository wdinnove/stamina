import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { NotebookPen, Pencil, Trash2, X, User, Search } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { AddButton } from './AddButton';
import { useUrlState } from '../hooks/useUrlState';
import RichTextEditor from './RichTextEditor';
import { notesApi } from '../api';
import { notify } from '../api/notifications';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePlayerNotes } from '../hooks/usePlayerNotes';
import { noteCategoryConfig } from '../data/config';
import { filterNotes, hasNoteFilter } from '../utils/notes';
import { sanitizeHtml } from '../utils/sanitize';
import { fmtDateWithDay } from '../utils/dateFormat';
import { playerNameFull } from '../utils/playerName';
import { LAYER } from '../styles/layers';
import type { NoteCategory, Player, PlayerNote } from '../data/types';

interface PlayerNotesPanelProps {
  /** Fourni en vue individuelle : la liste et le formulaire sont verrouillés sur ce joueur. */
  playerId?: string;
  /** Effectif de la saison — sert au sélecteur de joueur et à l'affichage des noms. */
  roster: Player[];
  teamId?: string;
  seasonId?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const ACCENT = '#A78BFA';

function todayIso() { return new Date().toLocaleDateString('sv'); }

type FormState = { playerId: string; date: string; category: NoteCategory; content: string };

const emptyForm = (playerId = ''): FormState => ({
  playerId, date: todayIso(), category: 'entretien', content: '',
});

/** Valeurs acceptées dans l'URL pour le filtre de catégorie — une autre y ramène « toutes ». */
const NOTE_CATEGORY_FILTERS = ['', 'entretien', 'comportement', 'perso', 'match', 'autre'] as const;

export function PlayerNotesPanel({ playerId, roster, teamId, seasonId }: PlayerNotesPanelProps) {
  const { canEditTeamData } = useTeamSeason();
  const { notes, loading, reload } = usePlayerNotes({ seasonId, playerId });

  // Filtres — vue collective uniquement : en vue individuelle le joueur est déjà fixé.
  // Portés par l'URL comme partout ailleurs (cf. useUrlState) : un suivi filtré se partage.
  const [playerFilter, setPlayerFilter] = useUrlState('joueur', '');
  const [categoryFilter, setCategoryFilter] = useUrlState<NoteCategory | ''>('categorie', '', { allowed: NOTE_CATEGORY_FILTERS });
  const [search, setSearch] = useUrlState('recherche', '');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerNote | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<PlayerNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  // En vue individuelle, `playerId` fait déjà le tri côté requête : seuls la catégorie et la
  // recherche s'appliquent ici.
  const filters = { playerId: playerId ? '' : playerFilter, category: categoryFilter, search };
  const visible = useMemo(
    () => filterNotes(notes, filters),
    [notes, playerId, playerFilter, categoryFilter, search],
  );

  const nameOf = useMemo(
    () => new Map(roster.map(p => [p.id, playerNameFull(p)])),
    [roster],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(playerId ?? playerFilter));
    setFormError('');
    setShowForm(true);
  }

  function openEdit(note: PlayerNote) {
    setEditing(note);
    setForm({ playerId: note.playerId, date: note.date, category: note.category, content: note.content });
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !seasonId) return;
    if (!form.playerId)   { setFormError('Choisis un joueur.'); return; }
    if (!form.content.trim()) { setFormError('La note est vide.'); return; }

    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await notesApi.update(editing.id, {
          playerId: form.playerId, date: form.date, category: form.category, content: form.content,
        });
      } else {
        await notesApi.create({
          playerId: form.playerId, teamId, seasonId,
          date: form.date, category: form.category, content: form.content,
        });
        // Le contenu de la note ne sort pas d'ici : la notification ne porte que le joueur
        // et la catégorie (cf. shared/notifications.js).
        notify(teamId, 'note_added', `Note de suivi — ${nameOf.get(form.playerId) ?? 'joueur'}`, {
          body: noteCategoryConfig[form.category].label,
          entityType: 'player', entityId: form.playerId,
        });
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur à l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await notesApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  const filtered = hasNoteFilter(filters);

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        {/* Le bouton d'ajout est plus haut que le libellé : sans align="flex-start", le titre se
            centrerait sur cette hauteur et retomberait plus bas que celui des cartes voisines. */}
        <CardTitle
          icon={<NotebookPen size={13} style={{ color: ACCENT }} />}
          mb={12}
          align="flex-start"
          info={`${notes.length} note${notes.length > 1 ? 's' : ''} cette saison`}
          right={canEditTeamData && <AddButton label="Ajouter une note" onClick={openCreate} />}
        >
          Suivi
        </CardTitle>

        {/* Barre de filtres — même facture que celle de la page Tâches : recherche avec sa loupe,
            et une croix de remise à zéro dans chaque select actif. Le filtre joueur n'apparaît
            qu'en vue collective : sur une fiche joueur, il est déjà choisi. */}
        <style>{`@media (max-width: 639px) { .note-filters { flex-direction: column !important; } .note-filters > * { flex: none !important; width: 100% !important; } }`}</style>
        <div className="note-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher dans les notes…"
              style={{ ...filterStyle, padding: search ? '8px 30px 8px 30px' : '8px 10px 8px 30px' }} />
            {search && (
              <button onClick={() => setSearch('')} title="Effacer la recherche"
                style={resetStyle(10)}><X size={12} /></button>
            )}
          </div>

          {!playerId && (
            <div style={{ position: 'relative', flex: '0 1 180px' }}>
              <select value={playerFilter} onChange={e => setPlayerFilter(e.target.value)}
                style={{ ...filterStyle, padding: playerFilter ? '8px 52px 8px 10px' : '8px 10px', color: playerFilter ? '#F1F5F9' : '#475569' }}>
                <option value="">Tous les joueurs</option>
                {roster.map(p => <option key={p.id} value={p.id}>{playerNameFull(p)}</option>)}
              </select>
              {playerFilter && (
                <button onClick={() => setPlayerFilter('')} title="Tous les joueurs"
                  style={resetStyle(28)}><X size={11} /></button>
              )}
            </div>
          )}

          <div style={{ position: 'relative', flex: '0 1 170px' }}>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as NoteCategory | '')}
              style={{ ...filterStyle, padding: categoryFilter ? '8px 52px 8px 10px' : '8px 10px', color: categoryFilter ? '#F1F5F9' : '#475569' }}>
              <option value="">Toutes catégories</option>
              {Object.entries(noteCategoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {categoryFilter && (
              <button onClick={() => setCategoryFilter('')} title="Toutes catégories"
                style={resetStyle(28)}><X size={11} /></button>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState message={
            filtered ? 'Aucune note ne correspond à ces filtres.'
              : canEditTeamData ? 'Aucune note de suivi cette saison.'
              : 'Aucune note de suivi. Seuls les rôles Admin et Éditeur peuvent en écrire.'
          } />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(note => {
            const cat = noteCategoryConfig[note.category];
            return (
              <Card key={note.id} accentColor={cat.color}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                    <Badge color={cat.color} label={cat.label} size="sm" />
                    <span style={{ color: '#F1F5F9', fontSize: '0.83rem', fontWeight: 600 }}>
                      {fmtDateWithDay(note.date)}
                    </span>
                    {!playerId && (
                      <span style={{ color: '#94A3B8', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} />{nameOf.get(note.playerId) ?? 'Joueur retiré de l\'effectif'}
                      </span>
                    )}
                    {note.authorName && (
                      <span style={{ color: '#475569', fontSize: '0.72rem' }}>par {note.authorName}</span>
                    )}
                  </div>
                  {canEditTeamData && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openEdit(note)} title="Modifier"
                        style={iconBtn}
                        onMouseEnter={e => (e.currentTarget.style.color = '#3B82F6')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(note)} title="Supprimer"
                        style={iconBtn}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {/* Contenu de l'éditeur riche — assaini avant affichage, comme partout ailleurs. */}
                <div className="rich-display" dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content) }} />
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal maxWidth={520} scrollOverlay={false} onClose={() => setShowForm(false)}>
          <div className="px-4 sm:px-7" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 16, borderBottom: '1px solid #2A2F3A' }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {editing ? 'Modifier la note' : 'Nouvelle note de suivi'}
            </h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
          <form className="px-4 sm:px-7" style={{ paddingTop: 18, paddingBottom: 20 }} onSubmit={handleSubmit}>
            {/* Le joueur n'est modifiable que depuis la vue collective : sur une fiche joueur,
                il est déjà celui qu'on regarde. */}
            {!playerId && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Joueur</label>
                <select value={form.playerId} onChange={e => setForm(f => ({ ...f, playerId: e.target.value }))} style={inputStyle}>
                  <option value="">— Choisir —</option>
                  {roster.map(p => <option key={p.id} value={p.id}>{playerNameFull(p)}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Date de l'échange</label>
                <input type="date" value={form.date} max={todayIso()}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Catégorie</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as NoteCategory }))} style={inputStyle}>
                  {Object.entries(noteCategoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Note</label>
              <RichTextEditor
                value={form.content}
                onChange={html => setForm(f => ({ ...f, content: html }))}
                placeholder="Une phrase, ou le compte rendu de l'entretien…"
                minHeight={140}
              />
            </div>
            {formError && <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 12px' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.88rem' }}>Annuler</button>
              <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal maxWidth={400} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: 24 }} onClose={() => setConfirmDelete(null)}>
          <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Supprimer cette note ?</h2>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
            {nameOf.get(confirmDelete.playerId) ?? 'Joueur'} — {fmtDateWithDay(confirmDelete.date)}
          </p>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 20px' }}>Cette note sera définitivement supprimée.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.88rem' }}>Annuler</button>
            <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#F1F5F9', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Contrôle de la barre de filtres — fond légèrement plus sombre que la carte, comme sur Tâches. */
const filterStyle: React.CSSProperties = {
  width: '100%', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6,
  color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/** Croix de remise à zéro posée dans le champ. `right` s'écarte de la flèche native d'un select. */
function resetStyle(right: number): React.CSSProperties {
  return {
    position: 'absolute', right, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer',
    padding: 2, display: 'flex', lineHeight: 1,
  };
}

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4,
};

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: 2, display: 'flex',
};
