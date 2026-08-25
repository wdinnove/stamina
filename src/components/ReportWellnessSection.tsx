import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, BarList, DataTable, SplitRow,
  reportDec, reportInt, MUTED, FAINT, type Tone, type Column,
} from './ReportKit';
import { WELLNESS_DIMENSIONS, teamWellnessAvg, wellnessRawValue } from '../utils/wellness';
import type { WellnessEntry } from '../data/types';

/** Ce que la section attend — le gabarit ne va pas chercher ses données. */
export interface WellnessSectionData {
  /** Saisies de la période, tous joueurs confondus. */
  entries: WellnessEntry[];
  /** Saisies de toute la saison, pour situer la période. */
  seasonEntries: WellnessEntry[];
  /** Effectif suivi, pour juger le taux de participation. */
  rosterSize: number;
  /** Moyenne par joueur sur la période, déjà calculée par l'appelant. */
  players: { name: string; score: number; entries: number; worstDim?: string }[];
}

/** Le ressenti se lit toujours dans le même sens : 10 = au mieux, 0 = au pire. */
const GOOD = '#00875F';
const MID  = '#B45309';
const BAD  = '#B91C1C';

function scorePrint(v: number): { color: string; tone: Tone; label: string } {
  if (v >= 7) return { color: GOOD, tone: 'good', label: 'Bon' };
  if (v >= 5) return { color: MID,  tone: 'warn', label: 'Moyen' };
  return { color: BAD, tone: 'bad', label: 'Dégradé' };
}

/**
 * La section « bien-être » d'un rapport.
 *
 * Le point de vigilance de ce domaine, c'est la participation : une moyenne calculée sur trois
 * réponses ne dit rien de l'équipe. Le taux de réponse est donc traité comme un chiffre clé à
 * part entière, pas comme une note de bas de page.
 */
export function ReportWellnessSection({ index, data }: { index: number | string; data: WellnessSectionData }) {
  const avg       = teamWellnessAvg(data.entries);
  const seasonAvg = teamWellnessAvg(data.seasonEntries);
  const delta = avg.value !== null && seasonAvg.value !== null
    ? Math.round((avg.value - seasonAvg.value) * 10) / 10 : null;

  // Le questionnaire ne circule pas tous les jours : rapporter les saisies au nombre de jours de
  // la période donnerait un taux catastrophique et faux. La référence, ce sont les jours où au
  // moins un joueur a répondu — ces jours-là, quelle part de l'effectif a rempli ?
  const activeDays = new Set(data.entries.map(e => e.date)).size;
  const expected = data.rosterSize * activeDays;
  const rate = expected > 0 ? Math.round((data.entries.length / expected) * 100) : 0;

  // Chaque dimension est remise dans le sens « plus haut = mieux » avant d'être moyennée :
  // sans ça, une fatigue élevée s'afficherait comme un bon score.
  const dims = WELLNESS_DIMENSIONS.map(dim => {
    const felt = teamWellnessAvg(
      data.entries.map(e => ({ ...e, [dim.key]: wellnessRawValue(Number(e[dim.key]), dim.inverted) })),
      dim.key,
    );
    return { key: dim.key, label: dim.shortLabel, value: felt.value ?? 0 };
  }).sort((a, b) => a.value - b.value);

  const worstPlayers = [...data.players].sort((a, b) => a.score - b.score).slice(0, 6);

  const playerCols: Column<WellnessSectionData['players'][number]>[] = [
    { key: 'name', label: 'Joueur', render: p => <span style={{ fontWeight: 600 }}>{p.name}</span> },
    { key: 'n',    label: 'Saisies', align: 'right', width: 50, render: p => <span style={{ color: MUTED }}>{p.entries}</span> },
    { key: 'score', label: 'Score', align: 'right', width: 46,
      render: p => <span style={{ fontWeight: 700, color: scorePrint(p.score).color }}>{reportDec(p.score)}</span> },
    { key: 'dim', label: 'Point faible', width: 84,
      render: p => <span style={{ color: MUTED, fontSize: 10 }}>{p.worstDim ?? '—'}</span> },
  ];

  return (
    <>
      <SectionHeading index={index} label="Bien-être" subject="Équipe"
        hint="Ressenti déclaré par les joueurs, sur 10. Toutes les dimensions sont ramenées dans le même sens : plus le score est haut, mieux c'est." />

      {data.entries.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucune saisie bien-être sur la période — le suivi n'a pas pu être exploité.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Score moyen d'équipe"
              value={reportDec(avg.value)}
              unit="/ 10"
              tone={avg.value !== null ? scorePrint(avg.value).tone : 'neutral'}
              hint={<>{avg.value !== null ? scorePrint(avg.value).label : '—'}{delta !== null && <> · {delta > 0 ? '+' : delta < 0 ? '−' : ''}{reportDec(Math.abs(delta))} vs saison</>}</>}
            />
            <StatBlock
              label="Taux de réponse"
              value={`${rate}`}
              unit="%"
              tone={rate >= 60 ? 'good' : rate >= 30 ? 'warn' : 'bad'}
              hint={`${reportInt(data.entries.length)} saisies sur ${activeDays} jour${activeDays > 1 ? 's' : ''} de questionnaire`}
            />
            <StatBlock
              label="Joueurs ayant répondu"
              value={avg.players}
              hint={`sur ${data.rosterSize} de l'effectif`}
            />
            <StatBlock
              label="Dimension la plus basse"
              value={<span style={{ fontSize: 17 }}>{dims[0]?.label ?? '—'}</span>}
              tone={dims[0] && dims[0].value < 5 ? 'bad' : 'neutral'}
              hint={dims[0] ? `${reportDec(dims[0].value)} / 10 en moyenne` : undefined}
            />
          </StatRow>

          <div style={{ marginBottom: 20 }}>
            <BlockTitle>Détail par dimension — de la plus basse à la plus haute</BlockTitle>
            <BarList
              max={10}
              items={dims.map(d => ({
                label: d.label,
                value: d.value,
                display: reportDec(d.value),
                color: scorePrint(d.value).color,
                note: scorePrint(d.value).label.toLowerCase(),
              }))}
            />
          </div>

          <SplitRow
            left={<>
              <BlockTitle>Joueurs au ressenti le plus bas</BlockTitle>
              <DataTable columns={playerCols} rows={worstPlayers} />
            </>}
            right={<>
              <BlockTitle>Lecture</BlockTitle>
              <p style={{ margin: 0, fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
                Un score sous 5 sur une dimension signale un ressenti dégradé qui mérite une
                conversation, pas un diagnostic. À recouper avec la charge d'entraînement de la
                même période et avec le suivi médical.
              </p>
              <p style={{ margin: '10px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.5 }}>
                Un taux de réponse faible rend la moyenne d'équipe peu représentative : elle ne
                reflète alors que les joueurs qui répondent, souvent toujours les mêmes.
              </p>
            </>}
          />

          <div style={{ marginTop: 20 }}>
            <Findings items={wellnessFindings(data, avg.value, delta, rate, dims)} />
          </div>
        </>
      )}
    </>
  );
}

export function wellnessFindings(
  data: WellnessSectionData,
  avg: number | null,
  delta: number | null,
  rate: number,
  dims: { label: string; value: number }[],
): { tone: Tone; text: string }[] {
  if (data.entries.length === 0) {
    return [{ tone: 'warn', text: 'Aucune saisie bien-être sur la période.' }];
  }

  const out: { tone: Tone; text: string }[] = [];

  if (rate < 30) {
    out.push({ tone: 'bad', text: `Taux de réponse de ${rate} % de l'effectif les jours de questionnaire : trop faible pour tirer une conclusion d'équipe des scores ci-dessus.` });
  } else if (rate < 60) {
    out.push({ tone: 'warn', text: `Taux de réponse de ${rate} % de l'effectif les jours de questionnaire : les moyennes ne couvrent qu'une partie du groupe.` });
  } else {
    out.push({ tone: 'good', text: `Taux de réponse de ${rate} % de l'effectif les jours de questionnaire : le suivi est représentatif.` });
  }

  const low = dims.filter(d => d.value < 5);
  if (low.length > 0) {
    out.push({
      tone: 'bad',
      text: `Dimension${low.length > 1 ? 's' : ''} en zone dégradée : ${low.map(d => `${d.label} (${reportDec(d.value)})`).join(', ')}.`,
    });
  }

  if (delta !== null && Math.abs(delta) >= 0.5) {
    out.push({
      tone: delta < 0 ? 'warn' : 'good',
      text: delta < 0
        ? `Ressenti en baisse de ${reportDec(Math.abs(delta))} point par rapport à la moyenne de la saison.`
        : `Ressenti en hausse de ${reportDec(delta)} point par rapport à la moyenne de la saison.`,
    });
  }

  const alarming = data.players.filter(p => p.score < 5 && p.entries >= 2);
  if (alarming.length > 0) {
    out.push({
      tone: 'warn',
      text: `${alarming.length} joueur${alarming.length > 1 ? 's' : ''} sous 5/10 en moyenne sur la période : ${alarming.slice(0, 3).map(p => p.name).join(', ')}${alarming.length > 3 ? '…' : ''}.`,
    });
  }

  if (avg !== null && out.length < 2) {
    out.push({ tone: 'neutral', text: `Score moyen d'équipe à ${reportDec(avg)} / 10 sur la période.` });
  }

  return out.slice(0, 4);
}
