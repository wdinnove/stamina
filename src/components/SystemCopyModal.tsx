import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { tacticalSystemsApi } from '../api/tacticalSystems';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useCopyTargetTeams } from './ExerciseCopyModal';
import { Modal } from './Modal';
import type { TacticalSystem } from '../data/types';

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/**
 * Copie d'un système vers une autre équipe : le système, sa description et toutes ses phases
 * sont recopiés à l'identique, puis vivent leur vie de leur côté (aucun lien conservé avec
 * l'original) — même logique que `ExerciseCopyModal`, dont on réutilise `useCopyTargetTeams`
 * (la liste des équipes cibles ne dépend d'aucun détail propre à l'exercice ou au système).
 */
export function SystemCopyModal({ system, phaseCount, onClose }: {
  system: TacticalSystem;
  phaseCount: number;
  onClose: () => void;
}) {
  const { options, selectAndGo } = useTeamSeason();
  const teams = useCopyTargetTeams(system.teamId);

  const [targetId, setTargetId] = useState('');
  const [copying,  setCopying]  = useState(false);
  const [error,    setError]    = useState('');
  const [copyId,   setCopyId]   = useState<string | null>(null);

  const target = teams.find(t => t.id === targetId);

  async function handleCopy() {
    if (!targetId) return;
    setCopying(true);
    setError('');
    try {
      const copy = await tacticalSystemsApi.copyToTeam(system.id, targetId);
      setCopyId(copy.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCopying(false);
    }
  }

  /** Ouvrir la copie, c'est changer d'équipe : on part sur sa saison en cours, sinon la première. */
  function openCopy() {
    if (!copyId || !target) return;
    const forTeam = options.filter(o => o.team.id === target.id);
    const opt = forTeam.find(o => o.season.isCurrent) ?? forTeam[0];
    if (opt) selectAndGo(opt, `/systemes/${copyId}`);
  }

  return (
    <Modal maxWidth={420} overlayOpacity={0.8} style={{ padding: 24 }} onClose={onClose}>
      <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Copier vers une autre équipe</h3>

      {copyId && target ? (
        <>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={15} color="#00E5A0" style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ color: '#F1F5F9' }}>{system.name}</strong> est maintenant dans la bibliothèque de{' '}
              <strong style={{ color: '#F1F5F9' }}>{target.name}</strong>.
            </span>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Fermer
            </button>
            <button onClick={openCopy}
              style={{ flex: 1, padding: '10px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700 }}>
              Ouvrir la copie
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 16px' }}>
            Le système et ses {phaseCount} phase{phaseCount > 1 ? 's' : ''} sont recopiés dans l'équipe choisie.
            La copie est indépendante : la modifier ne touche pas l'original.
          </p>

          {teams.length === 0 ? (
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px' }}>
              Aucune autre équipe où vous pouvez écrire. Il faut y être Admin ou Éditeur.
            </p>
          ) : (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              style={{ ...selectStyle, marginBottom: 16 }}>
              <option value="">Choisir une équipe…</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.category ? ` — ${t.category}` : ''}</option>
              ))}
            </select>
          )}

          {error && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={handleCopy} disabled={!targetId || copying}
              style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 6, fontWeight: 700,
                backgroundColor: !targetId || copying ? '#1E2229' : '#00E5A0',
                color: !targetId || copying ? '#475569' : '#0D0F14',
                cursor: !targetId || copying ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {copying ? 'Copie…' : <><Copy size={13} /> Copier</>}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
