import { Target, Video, ListOrdered, ClipboardList } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { DiagramThumb, sceneAspect } from './DiagramSceneView';
import { SocialVideoEmbed } from './SocialVideoEmbed';
import { EmptyState } from './EmptyState';
import { sanitizeHtml } from '../utils/sanitize';
import { detectSocialPlatform } from '../utils/socialVideo';
import type { Exercise, ExercisePhase } from '../data/types';

/**
 * La lecture d'un exercice : son déroulement, ses objectifs, sa séquence de phases, sa vidéo.
 * Servie telle quelle par la fiche exercice et par la séance — c'est le même exercice qu'on
 * lit, il n'y a aucune raison qu'il s'affiche différemment selon l'écran.
 *
 * Entièrement en lecture : tout se modifie sur la page d'édition, d'un seul enregistrement.
 */

const HTML_EMPTY = new Set(['', '<p></p>']);

function hasHtml(html?: string): boolean {
  return !!html && !HTML_EMPTY.has(html);
}

function RichHtml({ html }: { html: string }) {
  return (
    <div className="rich-display" style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.65 }}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  );
}

/* ── Déroulement et objectifs ─────────────────────────────────────────────── */

/** En lecture seule : les deux textes s'écrivent sur la page d'édition, avec le reste. */
function TextCard({ icon, title, html, empty }: {
  icon: React.ReactNode; title: string; html?: string; empty: string;
}) {
  return (
    <Card style={{ padding: 16 }}>
      <CardTitle icon={icon}>{title}</CardTitle>
      {hasHtml(html)
        ? <RichHtml html={html!} />
        : <span style={{ color: '#475569', fontSize: '0.85rem' }}>{empty}</span>}
    </Card>
  );
}

/* ── Phases ───────────────────────────────────────────────────────────────── */

/**
 * Les deux formats de terrain se lisent à la même **hauteur**, pas à la même largeur : le
 * demi-terrain est presque carré, le terrain entier deux fois plus large que haut. Plafonner la
 * largeur écraserait le second ; on plafonne donc la hauteur et la largeur suit le ratio.
 */
const SCHEMA_MAX_HEIGHT = 245;

function schemaMaxWidth(scene: ExercisePhase['scene']): number {
  return Math.round(SCHEMA_MAX_HEIGHT * sceneAspect(scene));
}

function PhaseBlock({ phase, rank }: { phase: ExercisePhase; rank: number }) {
  const drawn = phase.scene.elements.length > 0;
  const told  = hasHtml(phase.text);

  return (
    <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#1A1E26', border: '1px solid #2A2F3A' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{
          width: 22, height: 22, borderRadius: '50%', backgroundColor: 'rgba(0,229,160,0.12)', color: '#00E5A0',
          fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {rank + 1}
        </span>
        <span style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 600 }}>
          {phase.title || `Phase ${rank + 1}`}
        </span>
      </div>

      {/* Le texte reste à droite du schéma, et le schéma cède de la largeur quand la colonne se
          resserre — `flexShrink` à 1, là où une vignette est figée par défaut. Seul le téléphone
          les empile. */}
      <div className="flex flex-col sm:flex-row" style={{ gap: 14, alignItems: 'flex-start' }}>
        {/* La largeur vient de `DiagramThumb` (100 % du cadre) et se fait plafonner ici — une
            classe de largeur serait inerte, le style en ligne du composant gagnant sur elle. */}
        {drawn && <DiagramThumb scene={phase.scene} style={{ maxWidth: schemaMaxWidth(phase.scene), flexShrink: 1 }} />}
        {/* Le titre reste même sans texte : une phase sans description le dit, plutôt que de
            laisser un blanc dont on ne sait pas s'il est vide ou cassé. */}
        <div style={{ flex: '1 1 150px', minWidth: 0 }}>
          <div style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>Description</div>
          {told
            ? <RichHtml html={phase.text!} />
            : <span style={{ color: '#475569', fontSize: '0.85rem' }}>—</span>}
        </div>
      </div>
    </div>
  );
}

/**
 * La séquence de phases, seule. Exportée parce que la séance l'affiche en ligne sous une
 * séquence, sans le reste de la fiche : c'est le même exercice qu'on lit, il n'y a aucune
 * raison que ses schémas s'affichent différemment selon l'écran.
 *
 * Deux phases par ligne : 1 et 2, puis 3 et 4… Dès 1024 px — c'est le bloc lui-même qui
 * s'adapte à l'étroitesse en empilant son schéma et son texte (voir `PhaseBlock`).
 */
export function ExercisePhaseList({ phases }: { phases: ExercisePhase[] }) {
  if (phases.length === 0) return <EmptyState message="Aucune phase renseignée." />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14, alignItems: 'start' }}>
      {phases.map((p, i) => <PhaseBlock key={p.id} phase={p} rank={i} />)}
    </div>
  );
}

/* ── Vue ──────────────────────────────────────────────────────────────────── */

export function ExerciseView({ exercise, phases }: {
  exercise: Exercise;
  phases: ExercisePhase[];
}) {
  const videoPlatform = exercise.videoUrl ? detectSocialPlatform(exercise.videoUrl) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Les deux textes se lisent côte à côte, comme ils s'écrivent et comme ils se
          retrouvent dans le bloc de séance. */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16, alignItems: 'start' }}>
        <TextCard icon={<ClipboardList size={13} color="#00E5A0" />} title="Déroulement"
          html={exercise.deroulement} empty="Aucun déroulement." />
        <TextCard icon={<Target size={13} color="#00E5A0" />} title="Objectifs"
          html={exercise.objectifs} empty="Aucun objectif." />
      </div>

      <Card style={{ padding: 16 }}>
        <CardTitle
          icon={<ListOrdered size={13} color="#00E5A0" />}
          info={phases.length > 0 ? `${phases.length} phase${phases.length > 1 ? 's' : ''}` : undefined}
        >
          Phases
        </CardTitle>
        <ExercisePhaseList phases={phases} />
      </Card>

      {videoPlatform && (
        <Card style={{ padding: 16 }}>
          <CardTitle icon={<Video size={13} color="#00E5A0" />}>Vidéo</CardTitle>
          <SocialVideoEmbed url={exercise.videoUrl!} />
        </Card>
      )}
    </div>
  );
}
