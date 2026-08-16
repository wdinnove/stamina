import { useState, useEffect, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { exercisesApi } from '../api/exercises';
import { teamRolesApi } from '../api/teamRoles';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Modal } from './Modal';
import type { Exercise, Team } from '../data/types';

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

/**
 * Équipes où l'utilisateur peut écrire, hors équipe courante — les seules cibles possibles
 * pour une copie, la RLS refusant l'insertion partout ailleurs.
 *
 * Le superadmin n'a pas de ligne `team_roles` : toutes les équipes accessibles lui sont ouvertes.
 */
export function useCopyTargetTeams(currentTeamId: string | undefined) {
  const { options, isSuperadmin, roleLoading } = useTeamSeason();
  const [writableIds, setWritableIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (isSuperadmin) { setWritableIds(null); return; }
    let cancelled = false;
    teamRolesApi.listMyWritableTeamIds()
      .then(ids => { if (!cancelled) setWritableIds(ids); })
      .catch(() => { if (!cancelled) setWritableIds([]); });
    return () => { cancelled = true; };
  }, [isSuperadmin, roleLoading]);

  return useMemo(() => {
    const seen = new Set<string>();
    const teams: Team[] = [];
    for (const o of options) {
      if (o.team.id === currentTeamId || seen.has(o.team.id)) continue;
      if (!isSuperadmin && !(writableIds ?? []).includes(o.team.id)) continue;
      seen.add(o.team.id);
      teams.push(o.team);
    }
    return teams.sort((a, b) => a.name.localeCompare(b.name));
  }, [options, currentTeamId, isSuperadmin, writableIds]);
}

/**
 * Copie d'un exercice vers une autre équipe : l'exercice, ses textes et toutes ses phases sont
 * recopiés à l'identique, puis vivent leur vie de leur côté (aucun lien conservé avec l'original).
 */
export function ExerciseCopyModal({ exercise, phaseCount, onClose }: {
  exercise: Exercise;
  phaseCount: number;
  onClose: () => void;
}) {
  const { options, selectAndGo } = useTeamSeason();
  const teams = useCopyTargetTeams(exercise.teamId);

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
      const copy = await exercisesApi.copyToTeam(exercise.id, targetId);
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
    if (opt) selectAndGo(opt, `/exercices/${copyId}`);
  }

  return (
    <Modal maxWidth={420} overlayOpacity={0.8} style={{ padding: 24 }} onClose={onClose}>
      <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Copier vers une autre équipe</h3>

      {copyId && target ? (
        <>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={15} color="#00E5A0" style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ color: '#F1F5F9' }}>{exercise.name}</strong> est maintenant dans la bibliothèque de{' '}
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
            L'exercice et ses {phaseCount} phase{phaseCount > 1 ? 's' : ''} sont recopiés dans l'équipe choisie.
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
