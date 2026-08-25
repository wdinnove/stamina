import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, BarList,
  reportDec, FAINT, type Tone,
} from './ReportKit';
import { WELLNESS_DIMENSIONS, teamWellnessAvg, wellnessRawValue } from '../utils/wellness';
import type { WellnessEntry, Player } from '../data/types';

export interface PlayerWellnessSectionData {
  player: Player;
  /** Ses saisies sur la période, puis sur toute la saison. */
  entries: WellnessEntry[];
  seasonEntries: WellnessEntry[];
  /** Score moyen de l'équipe sur la même période — le repère. */
  teamAvg: number | null;
  /** Dimensions de l'équipe, déjà remises dans le sens « plus haut = mieux ». */
  teamDims: { key: string; value: number }[];
  /** Jours où le questionnaire a réellement circulé dans l'équipe — dénominateur du taux de réponse. */
  questionnaireDays: number;
}

const GOOD = '#00875F';
const MID  = '#B45309';
const BAD  = '#B91C1C';

function scorePrint(v: number): { color: string; tone: Tone; label: string } {
  if (v >= 7) return { color: GOOD, tone: 'good', label: 'Bon' };
  if (v >= 5) return { color: MID,  tone: 'warn', label: 'Moyen' };
  return { color: BAD, tone: 'bad', label: 'Dégradé' };
}

/** Moyenne simple d'une dimension sur les saisies d'un joueur, dans le sens « plus haut = mieux ». */
function dimAvg(entries: WellnessEntry[], key: string, inverted: boolean): number | null {
  if (entries.length === 0) return null;
  const sum = entries.reduce((s, e) => s + wellnessRawValue(Number(e[key as keyof WellnessEntry]), inverted), 0);
  return Math.round((sum / entries.length) * 10) / 10;
}

/**
 * Le bien-être d'UN joueur.
 *
 * La version d'équipe cherche les joueurs à surveiller ; celle-ci part du principe qu'on l'a déjà
 * trouvé et demande pourquoi. Elle expose donc ce qu'un bilan collectif écrase : ses six
 * dimensions face à celles du groupe, le fil de ses relevés dans le temps, et sa tendance sur la
 * seconde moitié de la période — un score moyen correct peut cacher une dégradation nette.
 */
export function ReportPlayerWellnessSection({ index, subject, data }: {
  index: number | string;
  subject: string;
  data: PlayerWellnessSectionData;
}) {
  const avg       = teamWellnessAvg(data.entries).value;
  const seasonAvg = teamWellnessAvg(data.seasonEntries).value;
  const vsSeason = avg !== null && seasonAvg !== null ? Math.round((avg - seasonAvg) * 10) / 10 : null;
  const vsTeam   = avg !== null && data.teamAvg !== null ? Math.round((avg - data.teamAvg) * 10) / 10 : null;

  const rate = data.questionnaireDays > 0
    ? Math.round((data.entries.length / data.questionnaireDays) * 100) : null;

  const teamByKey = new Map(data.teamDims.map(d => [d.key, d.value]));
  const dims = WELLNESS_DIMENSIONS
    .map(dim => ({
      key: dim.key,
      label: dim.shortLabel,
      value: dimAvg(data.entries, dim.key, dim.inverted) ?? 0,
      team: teamByKey.get(dim.key) ?? null,
    }))
    .sort((a, b) => a.value - b.value);

  // Tendance : première moitié de la période contre seconde. Une moyenne seule ne dit pas si le
  // joueur va mieux ou moins bien qu'au début.
  const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(sorted.length / 2);
  const firstHalf  = half > 0 ? teamWellnessAvg(sorted.slice(0, half)).value : null;
  const secondHalf = half > 0 ? teamWellnessAvg(sorted.slice(half)).value : null;
  const trend = firstHalf !== null && secondHalf !== null
    ? Math.round((secondHalf - firstHalf) * 10) / 10 : null;

  const lowDays = sorted.filter(e => Number(e.score) < 5).length;

  return (
    <>
      <SectionHeading index={index} label="Bien-être" subject={subject} />

      {data.entries.length === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucune saisie bien-être sur la période
          {data.questionnaireDays > 0 && <> alors que le questionnaire a circulé {data.questionnaireDays} jour{data.questionnaireDays > 1 ? 's' : ''}</>}
          {' '}— son ressenti n'a pas pu être suivi.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Son score moyen"
              value={reportDec(avg)}
              unit="/ 10"
              tone={avg !== null ? scorePrint(avg).tone : 'neutral'}
              hint={<>{avg !== null ? scorePrint(avg).label : '—'}{vsTeam !== null && <> · {signed(vsTeam)} vs équipe</>}</>}
            />
            <StatBlock
              label="Tendance sur la période"
              value={trend === null ? '—' : signed(trend)}
              unit={trend === null ? undefined : 'pt'}
              tone={trend === null ? 'neutral' : trend <= -0.5 ? 'bad' : trend >= 0.5 ? 'good' : 'neutral'}
              hint={trend === null ? 'pas assez de relevés' : 'seconde moitié vs première'}
            />
            <StatBlock
              label="Ses saisies"
              value={data.entries.length}
              tone={rate === null ? 'neutral' : rate >= 60 ? 'good' : rate >= 30 ? 'warn' : 'bad'}
              hint={rate === null ? 'sur la période' : `${rate} % des ${data.questionnaireDays} jours de questionnaire`}
            />
            <StatBlock
              label="Jours en zone dégradée"
              value={lowDays}
              tone={lowDays === 0 ? 'good' : lowDays >= 3 ? 'bad' : 'warn'}
              hint="relevés sous 5 / 10"
            />
          </StatRow>

          <div style={{ marginBottom: 18 }}>
            <BlockTitle>Ses dimensions, de la plus basse à la plus haute — repère : l'équipe</BlockTitle>
            <BarList
              max={10}
              items={dims.map(d => ({
                label: d.label,
                value: d.value,
                display: reportDec(d.value),
                color: scorePrint(d.value).color,
                note: d.team === null ? undefined : `éq. ${reportDec(d.team)}`,
              }))}
            />
          </div>

          <Findings items={playerWellnessFindings(data, avg, vsTeam, vsSeason, trend, rate, dims, lowDays)} />
        </>
      )}
    </>
  );
}

function signed(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${reportDec(Math.abs(v))}`;
}

export function playerWellnessFindings(
  data: PlayerWellnessSectionData,
  avg: number | null,
  vsTeam: number | null,
  vsSeason: number | null,
  trend: number | null,
  rate: number | null,
  dims: { label: string; value: number; team: number | null }[],
  lowDays: number,
): { tone: Tone; text: string }[] {
  if (data.entries.length === 0) {
    return [{ tone: 'warn', text: 'Aucune saisie bien-être sur la période.' }];
  }

  const out: { tone: Tone; text: string }[] = [];

  if (rate !== null && rate < 40) {
    out.push({
      tone: 'warn',
      text: `${data.entries.length} saisie${data.entries.length > 1 ? 's' : ''} seulement sur ${data.questionnaireDays} jours de questionnaire (${rate} %) : les moyennes ci-dessus reposent sur peu de relevés.`,
    });
  }

  const low = dims.filter(d => d.value < 5);
  if (low.length > 0) {
    out.push({
      tone: 'bad',
      text: `Dimension${low.length > 1 ? 's' : ''} en zone dégradée : ${low.map(d => `${d.label} (${reportDec(d.value)})`).join(', ')}.`,
    });
  }

  // Un écart net à l'équipe sur une dimension précise vaut mieux qu'un écart sur la moyenne :
  // il désigne le sujet de la conversation.
  const gaps = dims
    .filter(d => d.team !== null && d.value - (d.team as number) <= -1.5)
    .sort((a, b) => (a.value - (a.team as number)) - (b.value - (b.team as number)));
  if (gaps.length > 0 && out.length < 3) {
    const g = gaps[0];
    out.push({
      tone: 'warn',
      text: `${g.label} à ${reportDec(g.value)} contre ${reportDec(g.team as number)} pour le groupe : c'est là que son ressenti décroche le plus.`,
    });
  }

  if (trend !== null && Math.abs(trend) >= 0.5) {
    out.push({
      tone: trend < 0 ? 'warn' : 'good',
      text: trend < 0
        ? `Ressenti en baisse de ${reportDec(Math.abs(trend))} point sur la seconde moitié de la période.`
        : `Ressenti en hausse de ${reportDec(trend)} point sur la seconde moitié de la période.`,
    });
  }

  if (out.length < 2) {
    if (lowDays === 0 && avg !== null) {
      out.push({ tone: 'good', text: `Ressenti stable à ${reportDec(avg)} / 10, aucun relevé en zone dégradée sur la période.` });
    } else if (vsSeason !== null && Math.abs(vsSeason) >= 0.5) {
      out.push({
        tone: vsSeason < 0 ? 'warn' : 'good',
        text: `${signed(vsSeason)} point par rapport à sa propre moyenne de la saison.`,
      });
    } else if (vsTeam !== null) {
      out.push({
        tone: 'neutral',
        text: `Ressenti ${vsTeam >= 0 ? 'au-dessus' : 'en dessous'} de la moyenne du groupe de ${reportDec(Math.abs(vsTeam))} point.`,
      });
    }
  }

  return out.slice(0, 3);
}
