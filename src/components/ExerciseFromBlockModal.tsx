import { useEffect, useState } from 'react';
import { BookPlus } from 'lucide-react';
import { exercisesApi } from '../api/exercises';
import { exerciseCategoriesApi } from '../api/exerciseCategories';
import { sessionBlocksApi } from '../api/sessionBlocks';
import { Modal } from './Modal';
import RichTextEditor from './RichTextEditor';
import type { Exercise, ExerciseCategory, SessionBlock } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5,
};

/**
 * Promotion d'une séquence de séance en exercice de la bibliothèque.
 *
 * Le contenu d'une séance s'écrit souvent au fil de l'eau, sans passer par la bibliothèque ;
 * cette modale rattrape le coup une fois que la séquence a fait ses preuves, sans ressaisie.
 *
 * La séquence est rattachée à l'exercice créé (`drillId`) dans la foulée : sans ce lien, la
 * bibliothèque aurait bien l'exercice mais la séance continuerait de l'ignorer, et un second
 * clic créerait un doublon.
 *
 * Les schémas et la vidéo restent l'affaire de la fiche d'exercice — les dessiner demande la
 * pleine page, pas une modale ouverte au milieu d'une séance.
 */
export function ExerciseFromBlockModal({ block, teamId, onClose, onCreated }: {
  block: SessionBlock;
  teamId: string;
  onClose: () => void;
  onCreated: (exercise: Exercise, block: SessionBlock) => void;
}) {
  const [categories, setCategories] = useState<ExerciseCategory[]>([]);
  const [name,        setName]        = useState(block.label);
  const [categoryId,  setCategoryId]  = useState('');
  const [deroulement, setDeroulement] = useState(block.description ?? '');
  const [objectifs,   setObjectifs]   = useState(block.consignes ?? '');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // La catégorie du bloc et celles de la bibliothèque sont deux listes distinctes : on
  // pré-sélectionne quand les noms se recouvrent (« Jeu réduit », « Technique »…), sinon on
  // laisse choisir plutôt que de deviner.
  useEffect(() => {
    exerciseCategoriesApi.list(teamId)
      .then(cats => {
        setCategories(cats);
        const match = cats.find(c => c.name.toLowerCase() === block.category.toLowerCase());
        if (match) setCategoryId(match.id);
      })
      .catch(() => {});
  }, [teamId, block.category]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const exercise = await exercisesApi.create({
        name:        name.trim(),
        teamId,
        deroulement: deroulement || undefined,
        objectifs:   objectifs   || undefined,
        categoryId:  categoryId  || undefined,
      });
      const updated = await sessionBlocksApi.update(block.id, { drillId: exercise.id });
      onCreated(exercise, updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={560} overlayOpacity={0.8} style={{ padding: 24 }} onClose={onClose}>
      <h3 style={{ color: '#F1F5F9', margin: '0 0 6px' }}>Ajouter à la bibliothèque</h3>
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 18px' }}>
        Cette séquence devient un exercice réutilisable dans les prochaines séances. Les schémas
        et la vidéo s'ajoutent ensuite depuis la fiche de l'exercice.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Nom *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Nom de l'exercice…" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Catégorie</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
            <option value="">Sans catégorie</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Déroulement</label>
          <RichTextEditor value={deroulement} onChange={setDeroulement}
            placeholder="Déroulement de l'exercice…" minHeight={70} />
        </div>

        <div>
          <label style={labelStyle}>Objectifs</label>
          <RichTextEditor value={objectifs} onChange={setObjectifs}
            placeholder="Ce que l'exercice cherche à travailler…" minHeight={70} />
        </div>
      </div>

      {error && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginTop: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onClose}
          style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
          Annuler
        </button>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          style={{
            flex: 1, padding: '10px', border: 'none', borderRadius: 6, fontWeight: 700,
            backgroundColor: !name.trim() || saving ? '#1E2229' : '#00E5A0',
            color: !name.trim() || saving ? '#475569' : '#0D0F14',
            cursor: !name.trim() || saving ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          {saving ? 'Ajout…' : <><BookPlus size={14} /> Ajouter</>}
        </button>
      </div>
    </Modal>
  );
}
