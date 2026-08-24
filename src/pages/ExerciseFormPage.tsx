import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useLocation, useParams } from 'react-router';
import { ArrowLeft, AlertCircle, Info, Trash2, Copy, ChevronUp, ChevronDown, ListOrdered, FileText, Video, PencilRuler } from 'lucide-react';
import { exercisesApi } from '../api/exercises';
import { exercisePhasesApi } from '../api/exercisePhases';
import { sessionBlocksApi } from '../api/sessionBlocks';
import { teamCategoriesApi } from '../api/categories';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Card, CardTitle, DiagramEditor, DiagramThumb, Modal, AccessRestricted, Spinner, DropzoneEmptyState, AddButton } from '../components';
import RichTextEditor from '../components/RichTextEditor';
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from '../utils/socialVideo';
import { createScene, newId, nextPhaseScene, cloneScene, type DiagramScene } from '../utils/diagram';
import { MAX_EXERCISE_PHASES } from '../data/config';
import type { Exercise, TeamCategory, ExercisePhase } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 5 };

const ghostBtn: React.CSSProperties = {
  padding: 5, backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6,
  color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center',
};

/**
 * Création et édition d'un exercice.
 *
 * **Un seul enregistrement, pour toute la page** : la description et les phases partent
 * ensemble. Les phases sont donc travaillées en brouillon — ajoutées, dessinées, réordonnées,
 * supprimées sans qu'aucune requête ne soit émise — et c'est « Enregistrer » qui réconcilie le
 * tout avec la base.
 *
 * C'est ce qui impose que l'éditeur de schéma vive **dans** cette page, comme un panneau
 * dépliable, et non derrière une URL à lui : une navigation emporterait le brouillon.
 *
 * Création et édition ne diffèrent donc plus en rien : on peut dessiner ses phases avant même
 * d'avoir nommé l'exercice, et l'enregistrement crée le tout d'un bloc.
 */

/** Une phase en cours de travail. `id` absent = phase encore jamais enregistrée. */
interface DraftPhase {
  id?: string;
  /** Clé stable côté page — l'`id` n'existe pas encore pour une phase neuve. */
  key: string;
  title: string;
  text: string;
  scene: DiagramScene;
}

/** Pré-remplissage venu d'une séquence de séance qu'on promeut en exercice de bibliothèque. */
interface SessionBlockPrefill {
  sessionBlockId: string;
  /** Chemin vers lequel revenir une fois l'exercice créé — la séance qui l'a demandé. */
  returnTo: string;
  name: string;
  deroulement?: string;
  objectifs?: string;
  categoryName?: string;
}

function toDraft(phase: ExercisePhase): DraftPhase {
  return { id: phase.id, key: phase.id, title: phase.title ?? '', text: phase.text ?? '', scene: phase.scene };
}

/** Ce qui est comparé pour savoir si la page a des modifications non enregistrées. */
function snapshot(header: { name: string; categoryId: string; deroulement: string; objectifs: string; videoUrl: string }, phases: DraftPhase[]): string {
  return JSON.stringify([header, phases.map(p => [p.id ?? null, p.title, p.text, p.scene])]);
}

export default function ExerciseFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { selected, canEditTeamData, roleLoading, teamRoleLoading } = useTeamSeason();
  const isNew = !id;
  /** Le rôle d'équipe arrive après un aller-retour réseau : sans cette attente, la page
   *  afficherait un « accès restreint » clignotant à chaque ouverture. */
  const rolesLoading = roleLoading || teamRoleLoading;

  // Une seule lecture, au montage : une fois le formulaire modifié, on ne veut plus retourner
  // au pré-remplissage d'origine si `location.state` change pour une autre raison.
  const [prefill] = useState<SessionBlockPrefill | undefined>(
    () => isNew ? (location.state as { sessionBlockPrefill?: SessionBlockPrefill } | null)?.sessionBlockPrefill : undefined,
  );

  const [exercise,   setExercise]   = useState<Exercise | null>(null);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [loading,    setLoading]    = useState(!isNew);
  const [denied,     setDenied]     = useState(false);

  const [name,       setName]       = useState(prefill?.name ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [deroulement, setDeroulement] = useState(prefill?.deroulement ?? '');
  const [objectifs,  setObjectifs]  = useState(prefill?.objectifs ?? '');
  const [videoUrl,   setVideoUrl]   = useState('');

  const [phases,     setPhases]     = useState<DraftPhase[]>([]);
  /** Phases supprimées du brouillon qui existent en base — à effacer à l'enregistrement. */
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [delKey,     setDelKey]     = useState<string | null>(null);
  /** Phase dont le titre est en cours de saisie — porté par la clé, pour se refermer de
   *  lui-même dès qu'on passe à une autre phase. */
  const [titleKey,   setTitleKey]   = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  /** État de référence, pour ne parler de « modifications » qu'à bon escient. */
  const [baseline, setBaseline] = useState(() => snapshot({ name: '', categoryId: '', deroulement: '', objectifs: '', videoUrl: '' }, []));

  /** Laisse passer notre propre navigation, celle qui suit un enregistrement réussi. */
  const leaving = useRef(false);
  /**
   * Exercice créé par un enregistrement qui a ensuite échoué sur une phase. Le retenir rend le
   * bouton rejouable : sans ça, réessayer créerait un second exercice.
   */
  const createdId = useRef<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    teamCategoriesApi.list(selected.team.id, 'exercise').then(setCategories).catch(() => {});
  }, [selected?.team.id]);

  // La catégorie de la séquence et celles de la bibliothèque sont deux listes distinctes : on
  // pré-sélectionne quand les noms se recouvrent (« Jeu réduit », « Technique »…), sinon on
  // laisse choisir plutôt que de deviner.
  useEffect(() => {
    if (!prefill?.categoryName) return;
    const match = categories.find(c => c.name.toLowerCase() === prefill.categoryName!.toLowerCase());
    if (match) setCategoryId(match.id);
  }, [categories, prefill?.categoryName]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([exercisesApi.getById(id), exercisePhasesApi.list(id)])
      .then(([ex, ph]) => {
        if (!ex) { setDenied(true); return; }
        const drafts = ph.map(toDraft);
        setExercise(ex);
        setName(ex.name);
        setCategoryId(ex.categoryId ?? '');
        setDeroulement(ex.deroulement ?? '');
        setObjectifs(ex.objectifs ?? '');
        setVideoUrl(ex.videoUrl ?? '');
        setPhases(drafts);
        setRemovedIds([]);
        // La colonne d'édition ne reste jamais vide quand il y a des phases : on ouvre la première.
        setEditingKey(drafts[0]?.key ?? null);
        setBaseline(snapshot({
          name: ex.name, categoryId: ex.categoryId ?? '', deroulement: ex.deroulement ?? '',
          objectifs: ex.objectifs ?? '', videoUrl: ex.videoUrl ?? '',
        }, drafts));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (exercise && selected && exercise.teamId !== selected.team.id) navigate('/exercices', { replace: true });
  }, [exercise, selected?.team.id]);

  const dirty = useMemo(
    () => snapshot({ name, categoryId, deroulement, objectifs, videoUrl }, phases) !== baseline,
    [name, categoryId, deroulement, objectifs, videoUrl, phases, baseline],
  );

  /* ── Garde-fou de sortie ─────────────────────────────────────────────────
     Un schéma représente plusieurs minutes de travail : rien ne doit pouvoir
     l'emporter en silence, ni un lien de la barre latérale, ni un onglet fermé. */

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !leaving.current && dirty && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function go(to: string) {
    leaving.current = true;
    navigate(to, { replace: isNew });
  }

  function plain(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim();
  }

  /* ── Brouillon de phases ─────────────────────────────────────────────────── */

  const editing = phases.find(p => p.key === editingKey) ?? null;
  const editingIndex = phases.findIndex(p => p.key === editingKey);

  function patchPhase(key: string, patch: Partial<DraftPhase>) {
    setPhases(prev => prev.map(p => (p.key === key ? { ...p, ...patch } : p)));
  }

  /**
   * Une phase neuve reprend les joueurs de la précédente, déjà déplacés là où ses dribbles,
   * coupes, écrans et hand-offs les envoient (voir `nextPhaseScene`). On dessine ainsi la suite
   * du mouvement, à partir de la situation qu'il a produite.
   */
  function addPhase() {
    const previous = phases[phases.length - 1];
    const scene: DiagramScene = previous ? nextPhaseScene(previous.scene) : createScene('half');
    const draft: DraftPhase = { key: newId(), title: '', text: '', scene };
    setPhases(prev => [...prev, draft]);
    setEditingKey(draft.key);
  }

  /** Duplique une phase telle quelle (mêmes éléments, mêmes flèches), insérée juste après —
   *  contrairement à `addPhase`, qui repart de la position produite par la phase précédente. */
  function duplicatePhase(key: string) {
    if (full) return;
    const index = phases.findIndex(p => p.key === key);
    if (index === -1) return;
    const source = phases[index];
    const draft: DraftPhase = { key: newId(), title: source.title, text: source.text, scene: cloneScene(source.scene) };
    setPhases(prev => {
      const next = [...prev];
      next.splice(index + 1, 0, draft);
      return next;
    });
    setEditingKey(draft.key);
  }

  function movePhase(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= phases.length) return;
    setPhases(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removePhase(key: string) {
    const index = phases.findIndex(p => p.key === key);
    const phase = phases[index];
    if (phase?.id) setRemovedIds(prev => [...prev, phase.id!]);
    const rest = phases.filter(p => p.key !== key);
    setPhases(rest);
    // On enchaîne sur la voisine plutôt que de laisser la colonne d'édition se vider.
    if (editingKey === key) setEditingKey(rest.length ? rest[Math.min(index, rest.length - 1)].key : null);
    setDelKey(null);
  }

  /* ── Enregistrement ──────────────────────────────────────────────────────── */

  const videoPlatform = videoUrl.trim() ? detectSocialPlatform(videoUrl) : null;
  const videoInvalid  = videoUrl.trim() !== '' && !videoPlatform;
  const backTo        = isNew ? (prefill?.returnTo ?? '/exercices') : `/exercices/${id}`;

  /**
   * Le nom et les phases sont travaillés dans n'importe quel ordre : ce qui manque est dit au
   * moment d'enregistrer, jamais par un bouton éteint sans explication.
   */
  function firstProblem(): string | null {
    if (!name.trim()) return "Donnez un nom à l'exercice avant d'enregistrer.";
    if (videoInvalid) return 'Le lien vidéo n\'est pas reconnu.';
    return null;
  }

  async function handleSave() {
    if (!selected || saving) return;

    const problem = firstProblem();
    if (problem) { setError(problem); return; }

    // Une phase sans schéma ni texte n'est pas une phase : mieux vaut le dire que l'enregistrer.
    const emptyAt = phases.findIndex(p => p.scene.elements.length === 0 && !plain(p.text));
    if (emptyAt !== -1) {
      setError(`La phase ${emptyAt + 1} est vide : ajoutez un schéma ou un texte, ou retirez-la.`);
      setEditingKey(phases[emptyAt].key);
      return;
    }

    setSaving(true);
    setError('');
    const header = {
      name:        name.trim(),
      deroulement: plain(deroulement) ? deroulement : '',
      objectifs:   plain(objectifs) ? objectifs : '',
      categoryId: categoryId || undefined,
      videoUrl:   videoUrl.trim(),
    };

    try {
      // Création et édition suivent le même chemin, à la première étape près.
      let exerciseId = id ?? createdId.current;
      if (!exerciseId) {
        const created = await exercisesApi.create({ ...header, teamId: selected.team.id });
        createdId.current = created.id;
        exerciseId = created.id;
        // Sans ce lien, la bibliothèque aurait bien l'exercice mais la séance continuerait de
        // l'ignorer, et une seconde promotion créerait un doublon.
        if (prefill) await sessionBlocksApi.update(prefill.sessionBlockId, { drillId: created.id });
      } else {
        await exercisesApi.update(exerciseId, header);
      }

      for (const removed of removedIds) await exercisePhasesApi.remove(removed);

      // Toutes les phases sont réécrites, sans chercher lesquelles ont bougé : elles sont huit
      // au plus, et un rang faux serait plus coûteux qu'une requête de trop. L'identifiant
      // rendu par une création est reporté dans le brouillon, pour qu'un nouvel essai après
      // échec ne duplique pas ce qui est déjà passé.
      for (const [position, phase] of phases.entries()) {
        const payload = { title: phase.title.trim(), text: plain(phase.text) ? phase.text : '', scene: phase.scene };
        if (phase.id) {
          await exercisePhasesApi.update(phase.id, { ...payload, position });
        } else {
          const created = await exercisePhasesApi.create(exerciseId, { ...payload, position });
          setPhases(prev => prev.map(p => (p.key === phase.key ? { ...p, id: created.id } : p)));
        }
      }

      go(prefill ? prefill.returnTo : `/exercices/${exerciseId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  }

  /* ── Rendu ───────────────────────────────────────────────────────────────── */

  if (loading || rolesLoading) return <div className="p-4 md:p-6"><Spinner centered /></div>;

  if (!canEditTeamData) return (
    <div className="p-4 md:p-6">
      <AccessRestricted message="Seuls les rôles Admin et Éditeur peuvent modifier la bibliothèque d'exercices." />
    </div>
  );

  if (denied) return (
    <div className="p-4 md:p-6">
      <AccessRestricted message="Cet exercice n'existe pas ou vous n'avez pas accès à l'équipe concernée." />
    </div>
  );

  const full     = phases.length >= MAX_EXERCISE_PHASES;
  const delPhase = phases.find(p => p.key === delKey) ?? null;

  return (
    <div className="p-4 md:p-6">
      {/* Retour + enregistrement global */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => go(backTo)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#F1F5F9')}
          onMouseLeave={e => (e.currentTarget.style.color = '#94A3B8')}>
          <ArrowLeft size={15} /> {isNew ? (prefill ? 'Séance' : 'Exercices') : exercise?.name}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirty && <span style={{ color: '#475569', fontSize: '0.75rem' }}>Modifications non enregistrées</span>}
          <button type="button" onClick={() => navigate(backTo)} disabled={saving}
            style={{ padding: '8px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 7, color: '#F1F5F9', fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
            Annuler
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: '0.82rem',
              backgroundColor: saving ? '#1E2229' : '#00E5A0',
              color: saving ? '#475569' : '#0D0F14',
              cursor: saving ? 'wait' : 'pointer',
            }}>
            {saving ? 'Enregistrement…' : isNew ? "Créer l'exercice" : 'Enregistrer'}
          </button>
        </div>
      </div>

      <h1 style={{ color: '#F1F5F9', margin: '0 0 16px' }}>{isNew ? 'Nouvel exercice' : "Modifier l'exercice"}</h1>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
          <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Description — trois lignes : identité, objectifs, vidéo */}
        <Card style={{ padding: 16 }}>
          <CardTitle icon={<FileText size={13} color="#00E5A0" />}>Description</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="flex flex-col sm:flex-row" style={{ gap: 12 }}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <label style={labelStyle}>Nom *</label>
                <input required type="text" placeholder="Nom de l'exercice…" value={name}
                  onChange={e => setName(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={labelStyle}>Catégorie</label>
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={inputStyle}>
                  <option value="">— Aucune —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Repris du bloc de séance qui a demandé cette création : les deux champs sont
                copiés une fois, puis vivent chacun leur vie — d'où le rappel ci-dessous. */}
            {prefill && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 6, padding: '8px 12px' }}>
                <Info size={13} style={{ color: '#60A5FA', flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: '#60A5FA', fontSize: '0.78rem' }}>
                  Déroulement et objectifs sont repris de la séance. Ils sont désormais indépendants :
                  les modifier ici ne changera pas le bloc de la séance, et inversement.
                </span>
              </div>
            )}

            {/* Les deux textes de l'exercice, côte à côte : ce sont exactement les deux
                champs que le bloc de séance pré-remplit à l'ajout. */}
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 14, alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={labelStyle}>Déroulement</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RichTextEditor value={deroulement} onChange={setDeroulement}
                    placeholder="Comment l'exercice se déroule…" minHeight={100} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={labelStyle}>Objectifs</label>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <RichTextEditor value={objectifs} onChange={setObjectifs}
                    placeholder="Ce que l'exercice doit développer…" minHeight={100} />
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Video size={12} color="#475569" /> Lien vidéo
                </span>
              </label>
              <div style={{ color: '#475569', fontSize: '0.68rem', marginBottom: 5 }}>Twitter/X, Facebook, Instagram, TikTok</div>
              <input type="url" placeholder="https://…" value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)} style={inputStyle} />
              {videoUrl.trim() && (
                videoPlatform
                  ? <div style={{ color: '#00E5A0', fontSize: '0.72rem', marginTop: 5 }}>Aperçu {SOCIAL_PLATFORM_LABELS[videoPlatform]} détecté</div>
                  : <div style={{ color: '#EF4444', fontSize: '0.72rem', marginTop: 5 }}>Lien non reconnu</div>
              )}
            </div>
          </div>
        </Card>

        {/* Phases — la séquence à gauche, la phase choisie à droite, dans une seule carte */}
        <Card style={{ padding: 16 }}>
          <CardTitle
            icon={<ListOrdered size={13} color="#00E5A0" />}
            info={`${phases.length}/${MAX_EXERCISE_PHASES}`}
          >
            Phases
          </CardTitle>

          <div className="flex flex-col xl:flex-row" style={{ gap: 16, alignItems: 'flex-start' }}>
            {/* Séquence — largeur fixe, elle n'a rien à gagner à s'étirer */}
            <div className="w-full xl:w-[340px]" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {phases.map((p, i) => {
                const active = p.key === editingKey;
                return (
                  <div key={p.key} onClick={() => setEditingKey(p.key)} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: 8, borderRadius: 8, cursor: 'pointer',
                    backgroundColor: active ? 'rgba(0,229,160,0.06)' : '#1A1E26',
                    border: `1px solid ${active ? 'rgba(0,229,160,0.35)' : '#2A2F3A'}`,
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', backgroundColor: 'rgba(0,229,160,0.12)', color: '#00E5A0',
                      fontFamily: 'JetBrains Mono, monospace', fontSize: '0.68rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>

                    {/* Gabarit fixe : toutes les lignes ont la même taille, demi-terrain ou pas. */}
                    <DiagramThumb scene={p.scene} radius={5} height={48} style={{ width: 72, maxWidth: 72 }} />

                    <div style={{ flex: '1 1 0', minWidth: 0 }}>
                      <div style={{ color: active ? '#F1F5F9' : '#CBD5E1', fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title || `Phase ${i + 1}`}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: 1 }}>
                        {p.scene.elements.length > 0
                          ? `${p.scene.elements.length} élément${p.scene.elements.length > 1 ? 's' : ''}`
                          : plain(p.text) ? 'Texte seul' : 'Vide'}
                      </div>
                    </div>

                    {/* Les commandes de rang et le retrait ne doivent pas changer la sélection. */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => movePhase(i, -1)} disabled={i === 0} title="Monter"
                        style={{ ...ghostBtn, padding: 4, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'not-allowed' : 'pointer' }}>
                        <ChevronUp size={12} />
                      </button>
                      <button type="button" onClick={() => movePhase(i, 1)} disabled={i === phases.length - 1} title="Descendre"
                        style={{ ...ghostBtn, padding: 4, opacity: i === phases.length - 1 ? 0.3 : 1, cursor: i === phases.length - 1 ? 'not-allowed' : 'pointer' }}>
                        <ChevronDown size={12} />
                      </button>
                      <button type="button" onClick={() => duplicatePhase(p.key)} disabled={full} title={full ? `Maximum de ${MAX_EXERCISE_PHASES} phases atteint.` : 'Dupliquer'}
                        style={{ ...ghostBtn, padding: 4, opacity: full ? 0.3 : 1, cursor: full ? 'not-allowed' : 'pointer' }}>
                        <Copy size={12} />
                      </button>
                      <button type="button" onClick={() => setDelKey(p.key)} title="Retirer"
                        style={{ ...ghostBtn, padding: 4, color: '#EF4444', borderColor: 'rgba(239,68,68,0.3)' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <AddButton
                label="Ajouter une phase"
                variant="dashed"
                disabled={full}
                onClick={addPhase}
                title={full ? `Maximum de ${MAX_EXERCISE_PHASES} phases atteint.` : undefined}
              />
            </div>

            {/* Bloc de la phase choisie — terrain élastique et centré, outils à droite, champs dessous */}
            <div style={{ flex: '1 1 0', minWidth: 0, width: '100%' }}>
              {editing ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 14,
                  padding: 14, borderRadius: 10, backgroundColor: '#1A1E26', border: '1px solid #2A2F3A',
                }}>
                  {/* Le titre s'écrit là où il se lit : un clic dessus ouvre le champ. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 30 }}>
                    <PencilRuler size={13} color="#00E5A0" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                      Phase {editingIndex + 1}
                    </span>
                    {titleKey === editing.key ? (
                      <input
                        autoFocus
                        type="text"
                        placeholder="Titre de la phase…"
                        value={editing.title}
                        maxLength={80}
                        onChange={e => patchPhase(editing.key, { title: e.target.value })}
                        onBlur={() => setTitleKey(null)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setTitleKey(null); }}
                        style={{ ...inputStyle, width: 'auto', flex: '1 1 200px', maxWidth: 320, padding: '5px 9px', fontSize: '0.8rem' }}
                      />
                    ) : (
                      <button type="button" onClick={() => setTitleKey(editing.key)}
                        title="Modifier le titre de la phase"
                        style={{
                          background: 'none', border: 'none', padding: '3px 6px', margin: '-3px 0 -3px -6px', borderRadius: 5,
                          color: editing.title ? '#CBD5E1' : '#475569', fontSize: '0.82rem',
                          fontStyle: editing.title ? 'normal' : 'italic', cursor: 'text',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#22262F'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
                        {editing.title || 'Ajouter un titre'}
                      </button>
                    )}
                  </div>

                  {/* `key` : l'éditeur est maître de sa scène, il doit repartir de zéro à chaque phase. */}
                  <DiagramEditor
                    key={editing.key}
                    initial={editing.scene}
                    onChange={scene => patchPhase(editing.key, { scene })}
                    disabled={saving}
                  />

                  <div>
                    <label style={labelStyle}>Texte</label>
                    <RichTextEditor value={editing.text} onChange={text => patchPhase(editing.key, { text })}
                      placeholder="Ce que font les joueurs sur cette phase…" minHeight={90} />
                  </div>
                </div>
              ) : (
                <DropzoneEmptyState label="Cliquer pour ajouter une phase" onClick={addPhase} style={{ minHeight: 300 }} />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Suppression d'une phase — du brouillon ; la base ne bouge qu'à l'enregistrement */}
      {delPhase && (
        <Modal maxWidth={380} overlayOpacity={0.75} style={{ padding: '24px' }} onClose={() => setDelKey(null)}>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Retirer cette phase ?</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px' }}>
            <strong style={{ color: '#F1F5F9' }}>{delPhase.title || `Phase ${phases.findIndex(p => p.key === delPhase.key) + 1}`}</strong> et son schéma quitteront l'exercice à l'enregistrement.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setDelKey(null)}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={() => removePhase(delPhase.key)} className="btn-danger"
              style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
              Retirer
            </button>
          </div>
        </Modal>
      )}

      {/* Sortie avec des modifications en attente */}
      {blocker.state === 'blocked' && (
        <Modal maxWidth={400} overlayOpacity={0.8} style={{ padding: '24px' }} onClose={() => blocker.reset()}>
          <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Quitter sans enregistrer ?</h3>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 16px' }}>
            Les modifications de cette page, phases comprises, seront perdues.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => blocker.reset()}
              style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
              Rester
            </button>
            <button onClick={() => blocker.proceed()} className="btn-danger"
              style={{ flex: 1, padding: '10px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
              Quitter
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
