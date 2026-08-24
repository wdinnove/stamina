import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, DataTable, Tag,
  reportDec, MUTED, FAINT, type Tone, type Column,
} from './ReportKit';
import type { Objective, ObjectiveComparator } from '../data/types';

/** Un objectif déjà évalué sur la période — l'évaluation appartient à l'appelant, pas au gabarit. */
export interface EvaluatedObjective {
  objective: Objective;
  /** Libellé lisible de l'indicateur visé. */
  label: string;
  unit: string;
  /** Valeur atteinte sur la période, `null` si l'indicateur n'est pas mesurable ici. */
  value: number | null;
  met: boolean | null;
}

export interface ObjectivesSectionData {
  objectives: EvaluatedObjective[];
}

const COMPARATOR_SIGN: Record<ObjectiveComparator, string> = { gte: '≥', lte: '≤', eq: '=' };

const IMPORTANCE_PRINT: Record<string, { label: string; color: string }> = {
  major:  { label: 'Majeur', color: '#B91C1C' },
  normal: { label: 'Normal', color: '#475569' },
  minor:  { label: 'Mineur', color: '#94A3B8' },
};

const MET  = '#00875F';
const MISS = '#B91C1C';

/**
 * La section « objectifs » d'un rapport : chaque objectif fixé, la cible, ce qui a réellement été
 * atteint sur la période, et le verdict.
 *
 * Les objectifs non mesurables sur la période (aucun match, indicateur hors domaine) sont
 * affichés comme tels plutôt que comptés en échec — un objectif qu'on n'a pas pu mesurer n'est
 * pas un objectif manqué.
 */
export function ReportObjectivesSection({ index, data }: { index: number; data: ObjectivesSectionData }) {
  const active = data.objectives.filter(o => o.objective.active);
  const measured = active.filter(o => o.met !== null);
  const met    = measured.filter(o => o.met === true).length;
  const missed = measured.filter(o => o.met === false).length;
  const rate = measured.length > 0 ? Math.round((met / measured.length) * 100) : null;

  const cols: Column<EvaluatedObjective>[] = [
    { key: 'label', label: 'Objectif', render: o => <span style={{ fontWeight: 600 }}>{o.label}</span> },
    { key: 'imp', label: 'Priorité', width: 62, render: o => {
      const i = IMPORTANCE_PRINT[o.objective.importance] ?? IMPORTANCE_PRINT.normal;
      return <Tag label={i.label} color={i.color} />;
    } },
    { key: 'target', label: 'Cible', align: 'right', width: 68, render: o => (
      <span style={{ color: MUTED }}>
        {COMPARATOR_SIGN[o.objective.comparator]} {reportDec(o.objective.thresholdValue)}{o.unit ? ` ${o.unit}` : ''}
      </span>
    ) },
    { key: 'value', label: 'Atteint', align: 'right', width: 68, render: o => (
      o.value === null
        ? <span style={{ color: FAINT }}>—</span>
        : <span style={{ fontWeight: 700, color: o.met === null ? MUTED : o.met ? MET : MISS }}>
            {reportDec(o.value)}{o.unit ? ` ${o.unit}` : ''}
          </span>
    ) },
    { key: 'verdict', label: 'Statut', width: 76, render: o => (
      o.met === null
        ? <Tag label="Non mesuré" color="#94A3B8" />
        : o.met ? <Tag label="Atteint" color={MET} /> : <Tag label="Manqué" color={MISS} />
    ) },
  ];

  return (
    <>
      <SectionHeading index={index} label="Objectifs"
        hint="Objectifs actifs, évalués sur la période du rapport. Un objectif sans donnée mesurable sur la période est signalé comme non mesuré, pas comme manqué." />

      {active.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucun objectif actif sur la période.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Objectifs suivis"
              value={active.length}
              hint={`${measured.length} mesurable${measured.length > 1 ? 's' : ''} sur la période`}
            />
            <StatBlock
              label="Atteints"
              value={met}
              tone={met > 0 ? 'good' : 'neutral'}
              hint={rate !== null ? `${rate} % des objectifs mesurés` : 'aucun objectif mesurable'}
            />
            <StatBlock
              label="Manqués"
              value={missed}
              tone={missed > 0 ? 'bad' : 'good'}
              hint={missed > 0 ? 'à revoir avec le groupe' : 'aucun objectif manqué'}
            />
            <StatBlock
              label="Taux d'atteinte"
              value={rate === null ? '—' : `${rate}`}
              unit={rate === null ? undefined : '%'}
              tone={rate === null ? 'neutral' : rate >= 70 ? 'good' : rate >= 40 ? 'warn' : 'bad'}
              hint="sur les objectifs mesurés"
            />
          </StatRow>

          <div style={{ marginBottom: 20 }}>
            <BlockTitle>Détail des objectifs</BlockTitle>
            <DataTable columns={cols} rows={orderObjectives(active)} cap={12} />
          </div>

          <Findings items={objectivesFindings(active, met, missed, rate)} />
        </>
      )}
    </>
  );
}

/** Les manqués d'abord, puis par priorité : un rapport met en avant ce qui appelle une décision. */
function orderObjectives(list: EvaluatedObjective[]): EvaluatedObjective[] {
  const importanceRank = { major: 0, normal: 1, minor: 2 } as const;
  const metRank = (o: EvaluatedObjective) => (o.met === false ? 0 : o.met === true ? 1 : 2);
  return [...list].sort((a, b) =>
    metRank(a) - metRank(b) ||
    importanceRank[a.objective.importance] - importanceRank[b.objective.importance]);
}

export function objectivesFindings(
  active: EvaluatedObjective[],
  met: number,
  missed: number,
  rate: number | null,
): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];

  if (rate === null) {
    return [{ tone: 'warn', text: "Aucun objectif n'a pu être mesuré sur la période — faute de matchs ou de données sur les indicateurs visés." }];
  }

  out.push({
    tone: rate >= 70 ? 'good' : rate >= 40 ? 'warn' : 'bad',
    text: `${met} objectif${met > 1 ? 's' : ''} atteint${met > 1 ? 's' : ''} sur ${met + missed} mesuré${met + missed > 1 ? 's' : ''}, soit ${rate} %.`,
  });

  const majorsMissed = active.filter(o => o.met === false && o.objective.importance === 'major');
  if (majorsMissed.length > 0) {
    out.push({
      tone: 'bad',
      text: `Objectif${majorsMissed.length > 1 ? 's' : ''} majeur${majorsMissed.length > 1 ? 's' : ''} manqué${majorsMissed.length > 1 ? 's' : ''} : ${majorsMissed.map(o => o.label).join(', ')}.`,
    });
  }

  const unmeasured = active.filter(o => o.met === null);
  if (unmeasured.length > 0) {
    out.push({
      tone: 'neutral',
      text: `${unmeasured.length} objectif${unmeasured.length > 1 ? 's' : ''} sans donnée mesurable sur cette période.`,
    });
  }

  // Les quasi-atteints valent d'être signalés : ils orientent l'effort de la période suivante.
  const near = active.filter(o =>
    o.met === false && o.value !== null && o.objective.thresholdValue !== 0 &&
    Math.abs(o.value - o.objective.thresholdValue) / Math.abs(o.objective.thresholdValue) <= 0.1);
  if (near.length > 0) {
    out.push({
      tone: 'warn',
      text: `${near.length} objectif${near.length > 1 ? 's' : ''} manqué${near.length > 1 ? 's' : ''} de peu (moins de 10 % d'écart à la cible).`,
    });
  }

  return out.slice(0, 4);
}
