import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Pencil, Trash2, Copy } from 'lucide-react';
import { tacticalSystemsApi } from '../api/tacticalSystems';
import { tacticalSystemPhasesApi } from '../api/tacticalSystemPhases';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  TacticalSystemView, Modal, Badge, CATEGORY_FALLBACK_COLOR, AccessRestricted, Spinner,
  SystemCopyModal, useCopyTargetTeams,
} from '../components';
import { COURT_LABEL, type CourtVariant } from '../utils/diagram';
import type { TacticalSystem, TacticalSystemPhase } from '../data/types';

/** Petite pastille de méta du hero — même traitement que la fiche exercice. */
function MetaPill({ children, color = '#64748B', bg = '#1E2229' }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, color, backgroundColor: bg }}>
      {children}
    </span>
  );
}

/** Le terrain du système, tel qu'il se résume : un format, ou les deux. */
function courtSummary(phases: TacticalSystemPhase[]): string | null {
  const courts = [...new Set(phases.map(p => p.scene.court))] as CourtVariant[];
  if (courts.length === 0) return null;
  if (courts.length === 1) return COURT_LABEL[courts[0]];
  return 'Demi-terrain et terrain entier';
}

export default function TacticalSystemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selected, canEditTeamData } = useTeamSeason();

  const [system, setSystem] = useState<TacticalSystem | null>(null);
  const [phases, setPhases] = useState<TacticalSystemPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [delError,   setDelError]   = useState('');
  const [showCopy,   setShowCopy]   = useState(false);

  // Copier ne demande rien sur l'équipe courante, seulement le droit d'écrire ailleurs :
  // un simple lecteur ici peut emporter le système dans une équipe où il est éditeur.
  const copyTargets = useCopyTargetTeams(system?.teamId);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([tacticalSystemsApi.getById(id), tacticalSystemPhasesApi.list(id)])
      .then(([sys, ph]) => {
        if (!sys) return;
        setSystem(sys);
        setPhases(ph);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (system && selected && system.teamId !== selected.team.id) navigate('/systemes', { replace: true });
  }, [system, selected?.team.id]);

  async function handleDelete() {
    if (!system) return;
    setDeleting(true);
    setDelError('');
    try {
      await tacticalSystemsApi.remove(system.id);
      navigate('/systemes');
    } catch (err: unknown) {
      setDelError(err instanceof Error ? err.message : 'Erreur');
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-4 md:p-6"><Spinner centered /></div>;

  if (error || !system) return (
    <div className="p-4 md:p-6">
      {error
        ? <p style={{ color: '#EF4444', fontSize: '0.85rem' }}>{error}</p>
        : <AccessRestricted message="Ce système n'existe pas ou vous n'avez pas accès à l'équipe concernée." />}
    </div>
  );

  const accent = system.categoryColor ?? CATEGORY_FALLBACK_COLOR;
  const court  = courtSummary(phases);

  return (
    <div className="p-4 md:p-6">
      {/* Retour + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/systemes')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
          <ArrowLeft size={15} /> Systèmes
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {copyTargets.length > 0 && (
            <button onClick={() => setShowCopy(true)}
              style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Copy size={13} /> Copier vers…
            </button>
          )}
          {canEditTeamData && (
            <>
              <button onClick={() => navigate(`/systemes/${system.id}/modifier`)}
                style={{ padding: '7px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pencil size={13} /> Modifier
              </button>
              <button onClick={() => { setDelError(''); setShowDelete(true); }}
                style={{ padding: '7px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={13} /> Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="p-4 sm:p-6" style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `4px solid ${accent}`, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h1 className="text-xl sm:text-2xl" style={{ color: '#F1F5F9', margin: 0, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.5px' }}>
            {system.name}
          </h1>
          {system.categoryName && (
            <Badge color={accent} bg={accent + '18'} label={system.categoryName}
              style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 10px', flexShrink: 0 }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <MetaPill color={phases.length > 0 ? '#00E5A0' : '#64748B'} bg={phases.length > 0 ? '#00E5A012' : '#1E2229'}>
            {phases.length} phase{phases.length > 1 ? 's' : ''}
          </MetaPill>
          {court && <MetaPill>{court}</MetaPill>}
        </div>
      </div>

      {/* Description + phases */}
      <TacticalSystemView system={system} phases={phases} />

      {/* Copie vers une autre équipe */}
      {showCopy && (
        <SystemCopyModal system={system} phaseCount={phases.length} onClose={() => setShowCopy(false)} />
      )}

      {/* Confirmation suppression */}
      {showDelete && (
        <Modal maxWidth={380} overlayOpacity={0.8} style={{ padding: '24px' }} onClose={() => setShowDelete(false)}>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer ce système ?</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px' }}>
            <strong style={{ color: '#F1F5F9' }}>{system.name}</strong> et ses {phases.length} phase{phases.length > 1 ? 's' : ''} seront supprimés.
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
