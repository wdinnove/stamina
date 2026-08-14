import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { ArrowLeft, Pencil, Trash2, CalendarClock, ChevronRight } from 'lucide-react';
import { exercisesApi } from '../api/exercises';
import { exercisePhasesApi } from '../api/exercisePhases';
import { sessionBlocksApi, type DrillUsage } from '../api/sessionBlocks';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  Card, CardTitle, ExerciseView, Modal, Badge, CATEGORY_FALLBACK_COLOR,
  AccessRestricted, Spinner, EmptyState,
} from '../components';
import { fmtDate } from '../utils/dateFormat';
import { COURT_LABEL, type CourtVariant } from '../utils/diagram';
import type { Exercise, ExercisePhase } from '../data/types';

/** Petite pastille de méta du hero — même traitement que la fiche match. */
function MetaPill({ children, color = '#64748B', bg = '#1E2229' }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, color, backgroundColor: bg }}>
      {children}
    </span>
  );
}

/** Le terrain de l'exercice, tel qu'il se résume : un format, ou les deux. */
function courtSummary(phases: ExercisePhase[]): string | null {
  const courts = [...new Set(phases.map(p => p.scene.court))] as CourtVariant[];
  if (courts.length === 0) return null;
  if (courts.length === 1) return COURT_LABEL[courts[0]];
  return 'Demi-terrain et terrain entier';
}

export default function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selected, canEditTeamData } = useTeamSeason();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [phases,   setPhases]   = useState<ExercisePhase[]>([]);
  const [usage,    setUsage]    = useState<DrillUsage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delError,   setDelError]   = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([exercisesApi.getById(id), exercisePhasesApi.list(id)])
      .then(([ex, ph]) => {
        if (!ex) return;
        setExercise(ex);
        setPhases(ph);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [id]);

  // Les séances liées sont secondaires : elles arrivent quand elles arrivent, sans retarder la fiche.
  useEffect(() => {
    if (!id) return;
    sessionBlocksApi.listUsage(id).then(setUsage).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (exercise && selected && exercise.teamId !== selected.team.id) navigate('/exercices', { replace: true });
  }, [exercise, selected?.team.id]);

  async function handleDelete() {
    if (!exercise) return;
    setDeleting(true);
    setDelError('');
    try {
      await exercisesApi.remove(exercise.id);
      navigate('/exercices');
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Erreur');
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-4 md:p-6"><Spinner centered /></div>;

  if (error || !exercise) return (
    <div className="p-4 md:p-6">
      {error
        ? <p style={{ color: '#EF4444', fontSize: '0.85rem' }}>{error}</p>
        : <AccessRestricted message="Cet exercice n'existe pas ou vous n'avez pas accès à l'équipe concernée." />}
    </div>
  );

  const accent = exercise.categoryColor ?? CATEGORY_FALLBACK_COLOR;
  const court  = courtSummary(phases);

  return (
    <div className="p-4 md:p-6">
      {/* Retour + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/exercices')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
          <ArrowLeft size={15} /> Exercices
        </button>
        {canEditTeamData && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate(`/exercices/${exercise.id}/modifier`)}
              style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pencil size={13} /> Modifier
            </button>
            <button onClick={() => { setDelError(''); setShowDelete(true); }}
              style={{ padding: '7px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={13} /> Supprimer
            </button>
          </div>
        )}
      </div>

      {/* Hero */}
      <div className="p-4 sm:p-6" style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `4px solid ${accent}`, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h1 className="text-xl sm:text-2xl" style={{ color: '#F1F5F9', margin: 0, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.5px' }}>
            {exercise.name}
          </h1>
          {exercise.categoryName && (
            <Badge color={accent} bg={accent + '18'} label={exercise.categoryName}
              style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', flexShrink: 0 }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <MetaPill color={phases.length > 0 ? '#00E5A0' : '#64748B'} bg={phases.length > 0 ? '#00E5A012' : '#1E2229'}>
            {phases.length} phase{phases.length > 1 ? 's' : ''}
          </MetaPill>
          {court && <MetaPill>{court}</MetaPill>}
          {exercise.videoUrl && <MetaPill color="#A855F7" bg="#A855F712">Vidéo</MetaPill>}
        </div>
      </div>

      {/* Objectifs + phases + vidéo — la même vue que dans la séance */}
      <ExerciseView exercise={exercise} phases={phases} />

      {/* Utilisé dans */}
      <div style={{ marginTop: 16 }}>
        <Card style={{ padding: 16 }}>
          <CardTitle
            icon={<CalendarClock size={13} color="#00E5A0" />}
            info={usage.length > 0 ? `${usage.length} bloc${usage.length > 1 ? 's' : ''}` : undefined}
          >
            Utilisé dans
          </CardTitle>
          {usage.length === 0 ? (
            <EmptyState message="Cet exercice n'est encore dans aucune séance." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {usage.map(u => (
                <Link key={u.blockId} to={`/seances/${u.sessionId}`}
                  className="hover:!bg-white/5"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 6, textDecoration: 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}>
                      {u.date ? fmtDate(u.date) : '—'}
                    </span>
                    <span style={{ color: '#475569', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.blockLabel}
                    </span>
                  </span>
                  <ChevronRight size={14} color="#334155" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Confirmation suppression */}
      {showDelete && (
        <Modal maxWidth={380} overlayOpacity={0.8} style={{ padding: '24px' }} onClose={() => setShowDelete(false)}>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer cet exercice ?</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
            <strong style={{ color: '#F1F5F9' }}>{exercise.name}</strong> et ses {phases.length} phase{phases.length > 1 ? 's' : ''} seront supprimés.
          </p>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 16px' }}>
            Les blocs de séances liés conserveront leur libellé mais perdront le lien.
          </p>
          {delError && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 12 }}>{delError}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowDelete(false)}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={handleDelete} disabled={deleting} className="btn-danger"
              style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
