import { ClipboardList, ListOrdered } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { DiagramThumb, sceneAspect } from './DiagramSceneView';
import { EmptyState } from './EmptyState';
import { sanitizeHtml } from '../utils/sanitize';
import type { TacticalSystem, TacticalSystemPhase } from '../data/types';

/**
 * La lecture d'un système : sa description, sa séquence de phases. Servie telle quelle par la
 * fiche système et, potentiellement, par d'autres écrans qui viendraient à l'afficher en ligne.
 *
 * Entièrement en lecture : tout se modifie sur la page d'édition, d'un seul enregistrement.
 * Mirroir de `ExerciseView`, réduit : un système n'a ni déroulement/objectifs séparés, ni vidéo.
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

/* ── Phases ───────────────────────────────────────────────────────────────── */

const SCHEMA_MAX_HEIGHT = 245;

function schemaMaxWidth(scene: TacticalSystemPhase['scene']): number {
  return Math.round(SCHEMA_MAX_HEIGHT * sceneAspect(scene));
}

function PhaseBlock({ phase, rank }: { phase: TacticalSystemPhase; rank: number }) {
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

      <div className="flex flex-col sm:flex-row" style={{ gap: 14, alignItems: 'flex-start' }}>
        {drawn && <DiagramThumb scene={phase.scene} style={{ maxWidth: schemaMaxWidth(phase.scene), flexShrink: 1 }} />}
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

/** La séquence de phases, seule — même logique de mise en page que `ExercisePhaseList`. */
export function TacticalSystemPhaseList({ phases }: { phases: TacticalSystemPhase[] }) {
  if (phases.length === 0) return <EmptyState message="Aucune phase renseignée." />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14, alignItems: 'start' }}>
      {phases.map((p, i) => <PhaseBlock key={p.id} phase={p} rank={i} />)}
    </div>
  );
}

/* ── Vue ──────────────────────────────────────────────────────────────────── */

export function TacticalSystemView({ system, phases }: {
  system: TacticalSystem;
  phases: TacticalSystemPhase[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <CardTitle icon={<ClipboardList size={13} color="#00E5A0" />}>Description</CardTitle>
        {hasHtml(system.description)
          ? <RichHtml html={system.description!} />
          : <span style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune description.</span>}
      </Card>

      <Card style={{ padding: 16 }}>
        <CardTitle
          icon={<ListOrdered size={13} color="#00E5A0" />}
          info={phases.length > 0 ? `${phases.length} phase${phases.length > 1 ? 's' : ''}` : undefined}
        >
          Phases
        </CardTitle>
        <TacticalSystemPhaseList phases={phases} />
      </Card>
    </div>
  );
}
