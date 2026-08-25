import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, BarList,
  reportInt, reportDec, MUTED, FAINT, type Tone,
} from './ReportKit';
import { getWeekTier } from '../utils/weeklyLoad';
import { fmtDateShort } from '../utils/dateFormat';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';
import type { Player } from '../data/types';

export interface PlayerRpeSectionData {
  player: Player;
  /** Charge hebdomadaire moyenne du joueur sur la période, sur ses semaines actives. */
  avgWeeklyLoad: number | null;
  /** La même, sur toute la saison — pour situer la période dans son année. */
  seasonAvgWeeklyLoad: number | null;
  /** Charge hebdo moyenne de l'équipe sur la même période — le repère collectif. */
  teamAvgWeeklyLoad: number | null;
  avgRpe: number | null;
  seasonAvgRpe: number | null;
  teamAvgRpe: number | null;
  /** Séances où le joueur a saisi son RPE, et séances de l'équipe sur la période. */
  sessions: number;
  teamSessions: number;
  totalLoad: number;
  weeks: { week: string; load: number; sessions: number }[];
  /** Rapport charge récente / habituelle et fraîcheur, à ce jour (tout l'historique). */
  acwr: number | null;
  freshness: number | null;
}

const TIER_PRINT: Record<string, { color: string; tone: Tone }> = {
  'Normale':   { color: '#00875F', tone: 'good' },
  'Soutenue':  { color: '#B45309', tone: 'warn' },
  'Élevée':    { color: '#C2410C', tone: 'warn' },
  'Surcharge': { color: '#B91C1C', tone: 'bad'  },
};

function tierPrint(label: string) {
  return TIER_PRINT[label] ?? { color: MUTED, tone: 'neutral' as Tone };
}

/** Sur une longue période, seules les dernières semaines informent — la troncature est annoncée
 *  dans le titre du bloc plutôt que silencieuse. */
const WEEKS_CAP = 6;

function signed(v: number, decimal = false): string {
  const abs = decimal ? reportDec(Math.abs(v)) : reportInt(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${abs}`;
}

/**
 * La charge d'entraînement d'UN joueur.
 *
 * Le bloc d'équipe répond à « comment le groupe encaisse-t-il ? » ; celui-ci répond à une autre
 * question : « ce joueur-là a-t-il absorbé plus ou moins que les autres, et l'a-t-il ressenti
 * pareil ? ». D'où deux angles absents de la version collective — la comparaison systématique à la
 * moyenne du groupe sur la même période, et l'assiduité, sans laquelle une charge basse peut
 * vouloir dire « ménagé » comme « absent ».
 */
export function ReportPlayerRpeSection({ index, subject, data, thresholds }: {
  index: number | string;
  /** Le nom du joueur — une page peut enchaîner plusieurs sections, chacune doit se situer. */
  subject: string;
  data: PlayerRpeSectionData;
  thresholds: LoadThresholds;
}) {
  const load = data.avgWeeklyLoad ?? 0;
  const tier = getWeekTier(load, thresholds.lightMax, thresholds.normalMax);
  const overloadWeeks = data.weeks.filter(w => w.load >= thresholds.normalMax).length;

  const loadVsTeam = data.avgWeeklyLoad !== null && data.teamAvgWeeklyLoad !== null
    ? Math.round(data.avgWeeklyLoad - data.teamAvgWeeklyLoad) : null;
  const rpeVsTeam = data.avgRpe !== null && data.teamAvgRpe !== null
    ? Math.round((data.avgRpe - data.teamAvgRpe) * 10) / 10 : null;
  const attendance = data.teamSessions > 0 ? Math.round((data.sessions / data.teamSessions) * 100) : null;

  return (
    <>
      <SectionHeading index={index} label="Charge d'entraînement (RPE)" subject={subject} />

      {data.sessions === 0 ? (
        <p style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic' }}>
          Aucun RPE saisi sur la période — la charge de ce joueur n'a pas pu être suivie
          {data.teamSessions > 0 && <> alors que l'équipe a tenu {data.teamSessions} séance{data.teamSessions > 1 ? 's' : ''}</>}.
        </p>
      ) : (
        <>
          <StatRow>
            <StatBlock
              label="Charge hebdo moyenne"
              value={data.avgWeeklyLoad === null ? '—' : reportInt(data.avgWeeklyLoad)}
              unit="UA"
              tone={tierPrint(tier.label).tone}
              hint={<>{tier.label}{loadVsTeam !== null && <> · {signed(loadVsTeam)} UA vs équipe</>}</>}
            />
            <StatBlock
              label="RPE moyen ressenti"
              value={reportDec(data.avgRpe)}
              unit="/ 10"
              hint={<>sur {data.sessions} séance{data.sessions > 1 ? 's' : ''}{rpeVsTeam !== null && <> · {signed(rpeVsTeam, true)} vs équipe</>}</>}
            />
            <StatBlock
              label="Assiduité RPE"
              value={<>{data.sessions}<span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {data.teamSessions}</span></>}
              tone={attendance === null ? 'neutral' : attendance >= 80 ? 'good' : attendance >= 50 ? 'warn' : 'bad'}
              hint={attendance === null ? 'séances de l’équipe' : `${attendance} % des séances de l'équipe`}
            />
            <StatBlock
              label="Semaines en surcharge"
              value={<>{overloadWeeks}<span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {data.weeks.length}</span></>}
              tone={overloadWeeks > 0 ? 'bad' : 'good'}
              hint={`À partir de ${reportInt(thresholds.normalMax)} UA/sem.`}
            />
          </StatRow>

          <div style={{ marginBottom: 14 }}>
            <BlockTitle>
              Rythme semaine par semaine
              {data.weeks.length > WEEKS_CAP && ` — les ${WEEKS_CAP} dernières sur ${data.weeks.length}`}
            </BlockTitle>
            {data.weeks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: 'italic' }}>Aucune semaine active sur la période.</p>
            ) : (
              <BarList
                max={Math.max(thresholds.normalMax, ...data.weeks.map(w => w.load))}
                // Les dernières semaines d'abord : sur une longue période, c'est la fin qui informe.
                items={data.weeks.slice(-WEEKS_CAP).map(w => {
                  const t = getWeekTier(w.load, thresholds.lightMax, thresholds.normalMax);
                  return {
                    label: `sem. ${fmtDateShort(w.week)}`,
                    value: w.load,
                    display: reportInt(w.load),
                    color: tierPrint(t.label).color,
                    note: `${w.sessions} séa.`,
                  };
                })}
              />
            )}
          </div>


          <Findings items={playerRpeFindings(data, thresholds, tier.label, overloadWeeks, loadVsTeam, rpeVsTeam, attendance)} />
        </>
      )}
    </>
  );
}

export function playerRpeFindings(
  data: PlayerRpeSectionData,
  thresholds: LoadThresholds,
  tierLabel: string,
  overloadWeeks: number,
  loadVsTeam: number | null,
  rpeVsTeam: number | null,
  attendance: number | null,
): { tone: Tone; text: string }[] {
  if (data.sessions === 0) {
    return [{ tone: 'warn', text: 'Aucun RPE saisi sur la période : aucune conclusion possible sur sa charge.' }];
  }

  const out: { tone: Tone; text: string }[] = [];

  if (overloadWeeks > 0) {
    out.push({
      tone: 'bad',
      text: `${overloadWeeks} semaine${overloadWeeks > 1 ? 's' : ''} au-dessus de ${reportInt(thresholds.normalMax)} UA — à recouper avec son bien-être et son suivi médical sur les mêmes semaines.`,
    });
  } else {
    out.push({ tone: 'good', text: `Charge hebdomadaire en zone « ${tierLabel.toLowerCase()} » sur toute la période, sans semaine de surcharge.` });
  }

  if (attendance !== null && attendance < 60) {
    out.push({
      tone: 'warn',
      text: `Présent sur ${data.sessions} des ${data.teamSessions} séances de l'équipe (${attendance} %) : sa charge est basse d'abord parce qu'il s'entraîne moins, pas parce que les séances sont légères.`,
    });
  } else if (loadVsTeam !== null && Math.abs(loadVsTeam) >= 300) {
    out.push({
      tone: loadVsTeam > 0 ? 'warn' : 'neutral',
      text: loadVsTeam > 0
        ? `Absorbe ${reportInt(loadVsTeam)} UA de plus par semaine que la moyenne du groupe.`
        : `Absorbe ${reportInt(Math.abs(loadVsTeam))} UA de moins par semaine que la moyenne du groupe.`,
    });
  }

  // Ressentir plus dur que les autres à charge comparable est le signal individuel le plus utile.
  if (rpeVsTeam !== null && Math.abs(rpeVsTeam) >= 0.8) {
    const harder = rpeVsTeam > 0;
    const sameLoad = loadVsTeam !== null && Math.abs(loadVsTeam) < 300;
    out.push({
      tone: harder ? 'warn' : 'neutral',
      text: harder
        ? `Ressent les séances ${reportDec(rpeVsTeam)} point plus dures que la moyenne${sameLoad ? ' pour une charge pourtant comparable' : ''} — à interroger avec lui.`
        : `Ressent les séances ${reportDec(Math.abs(rpeVsTeam))} point plus faciles que la moyenne${sameLoad ? ' à charge comparable' : ''}.`,
    });
  }

  if (data.acwr !== null && (data.acwr > 1.5 || data.acwr < 0.8)) {
    out.push({
      tone: 'warn',
      text: data.acwr > 1.5
        ? `Charge récente à ${reportDec(data.acwr)}× sa charge habituelle : montée rapide, à surveiller.`
        : `Charge récente à ${reportDec(data.acwr)}× sa charge habituelle : en retrait par rapport à ses semaines précédentes.`,
    });
  }

  return out.slice(0, 3);
}
