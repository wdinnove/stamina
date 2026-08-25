import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, DataTable, BarList, SplitRow, Tag,
  reportInt, reportDec, MUTED, FAINT, SOFT, LINE, type Tone, type Column,
} from './ReportKit';
import { getWeekTier } from '../utils/weeklyLoad';
import { fmtDateShort } from '../utils/dateFormat';
import type { TeamAverage } from '../utils/teamAverage';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';

/** Ce que la section attend — volontairement plat : le gabarit ne va pas chercher ses données. */
export interface RpeSectionData {
  /** Charge hebdomadaire moyenne de la période, en UA. */
  avgWeeklyLoad: number;
  /** Charge hebdo moyenne sur toute la saison, pour situer la période. */
  seasonAvgWeeklyLoad: number | null;
  rpeAvg: TeamAverage;
  seasonRpeAvg: number | null;
  sessions: number;
  totalLoad: number;
  weeks: { week: string; load: number }[];
  acwr: number | null;
  freshness: number | null;
  players: { name: string; nbSessions: number; avgRpe: number; totalLoad: number }[];
}

/**
 * Palette d'impression des paliers de charge de l'app (Normale / Soutenue / Élevée / Surcharge).
 * Les couleurs écran sont pensées sur fond sombre : reprises telles quelles sur du blanc, le
 * jaune et le vert deviennent illisibles.
 */
const TIER_PRINT: Record<string, { color: string; tone: Tone }> = {
  'Normale':   { color: '#00875F', tone: 'good'    },
  'Soutenue':  { color: '#B45309', tone: 'warn'    },
  'Élevée':    { color: '#C2410C', tone: 'warn'    },
  'Surcharge': { color: '#B91C1C', tone: 'bad'     },
};

function tierPrint(label: string) {
  return TIER_PRINT[label] ?? { color: MUTED, tone: 'neutral' as Tone };
}

/**
 * La section « charge d'entraînement » d'un rapport.
 *
 * Elle ne rejoue pas l'écran RPE : elle retient ce qu'un staff doit pouvoir lire en une page —
 * le niveau de charge de la période et sa comparaison à la saison, le rythme semaine par semaine,
 * les joueurs aux extrêmes, et les constats écrits qui en découlent.
 */
export function ReportRpeSection({ index, data, thresholds }: {
  index: number | string;
  data: RpeSectionData;
  thresholds: LoadThresholds;
}) {
  const tier = getWeekTier(data.avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax);
  const overloadWeeks = data.weeks.filter(w => w.load >= thresholds.normalMax).length;

  const loadDelta = data.seasonAvgWeeklyLoad !== null && data.seasonAvgWeeklyLoad > 0
    ? Math.round(data.avgWeeklyLoad - data.seasonAvgWeeklyLoad) : null;
  const rpeDelta = data.seasonRpeAvg !== null && data.rpeAvg.value !== null
    ? Math.round((data.rpeAvg.value - data.seasonRpeAvg) * 10) / 10 : null;

  const byLoad = [...data.players].sort((a, b) => b.totalLoad - a.totalLoad);
  const mostLoaded  = byLoad.slice(0, 5);
  const leastLoaded = byLoad.slice(-5).reverse();

  const playerCols: Column<RpeSectionData['players'][number]>[] = [
    { key: 'name', label: 'Joueur', render: p => <span style={{ fontWeight: 600 }}>{p.name}</span> },
    { key: 'n',    label: 'Séa.',   align: 'right', width: 38, render: p => <span style={{ color: MUTED }}>{p.nbSessions}</span> },
    { key: 'rpe',  label: 'RPE',    align: 'right', width: 40, render: p => <span style={{ fontWeight: 700 }}>{reportDec(p.avgRpe)}</span> },
    { key: 'load', label: 'Charge', align: 'right', width: 62, render: p => <span style={{ fontWeight: 700 }}>{reportInt(p.totalLoad)}</span> },
  ];

  return (
    <>
      <SectionHeading index={index} label="Charge d'entraînement (RPE)" subject="Équipe"
        hint="Charge d'une séance = RPE ressenti × durée, en unités arbitraires (UA). Moyennes ramenées à l'effectif présent." />

      <StatRow>
        <StatBlock
          label="Charge hebdo moyenne"
          value={data.avgWeeklyLoad > 0 ? reportInt(data.avgWeeklyLoad) : '—'}
          unit="UA"
          tone={tierPrint(tier.label).tone}
          hint={<>{tier.label}{loadDelta !== null && <> · {signed(loadDelta)} UA vs saison</>}</>}
        />
        <StatBlock
          label="RPE moyen ressenti"
          value={reportDec(data.rpeAvg.value)}
          unit="/ 10"
          hint={<>{data.rpeAvg.players} joueur{data.rpeAvg.players > 1 ? 's' : ''}{rpeDelta !== null && <> · {signed(rpeDelta, true)} vs saison</>}</>}
        />
        <StatBlock
          label="Séances avec RPE"
          value={data.sessions}
          hint={<>{reportInt(data.totalLoad)} UA cumulées</>}
        />
        <StatBlock
          label="Semaines en surcharge"
          value={<>{overloadWeeks}<span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {data.weeks.length}</span></>}
          tone={overloadWeeks > 0 ? 'bad' : 'good'}
          hint={`À partir de ${reportInt(thresholds.normalMax)} UA/sem.`}
        />
      </StatRow>

      <div style={{ marginBottom: 18 }}>
        <BlockTitle>Rythme semaine par semaine</BlockTitle>
        {data.weeks.length === 0 ? (
          <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: 'italic' }}>Aucune semaine avec charge saisie.</p>
        ) : (
          <BarList
            max={Math.max(thresholds.normalMax, ...data.weeks.map(w => w.load))}
            items={data.weeks.map(w => {
              const t = getWeekTier(w.load, thresholds.lightMax, thresholds.normalMax);
              return {
                label: `sem. ${fmtDateShort(w.week)}`,
                value: w.load,
                display: reportInt(w.load),
                color: tierPrint(t.label).color,
                note: t.label.toLowerCase(),
              };
            })}
            cap={10}
          />
        )}
      </div>

      {(data.acwr !== null || data.freshness !== null) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18,
          padding: '9px 12px', backgroundColor: SOFT, border: `1px solid ${LINE}`, borderRadius: 4,
        }}>
          <BlockTitle style={{ margin: 0 }}>Suivi de charge</BlockTitle>
          {data.acwr !== null && (
            <Tag
              label={`Charge récente / habituelle · ${reportDec(data.acwr, '—')}`}
              color={data.acwr > 1.5 || data.acwr < 0.8 ? '#B45309' : '#00875F'}
            />
          )}
          {data.freshness !== null && (
            <Tag
              label={`Fraîcheur · ${signed(data.freshness, true)}`}
              color={data.freshness < -20 ? '#B91C1C' : '#00875F'}
            />
          )}
          <span style={{ fontSize: 9.5, color: FAINT }}>Valeurs à ce jour, pas sur la période.</span>
        </div>
      )}

      <SplitRow
        left={<>
          <BlockTitle>Joueurs les plus chargés</BlockTitle>
          <DataTable columns={playerCols} rows={mostLoaded} />
        </>}
        right={<>
          <BlockTitle>Joueurs les moins chargés</BlockTitle>
          <DataTable columns={playerCols} rows={leastLoaded} />
        </>}
      />

      <div style={{ marginTop: 18 }}>
        <Findings items={rpeFindings(data, thresholds, overloadWeeks, loadDelta)} />
      </div>
    </>
  );
}

function signed(v: number, decimal = false): string {
  const abs = decimal ? reportDec(Math.abs(v)) : reportInt(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${abs}`;
}

/**
 * Les constats écrits de la section. C'est le cœur du rapport : traduire les chiffres en
 * observations qu'un lecteur non technique peut reprendre telles quelles.
 */
export function rpeFindings(
  data: RpeSectionData,
  thresholds: LoadThresholds,
  overloadWeeks: number,
  loadDelta: number | null,
): { tone: Tone; text: string }[] {
  if (data.sessions === 0) {
    return [{ tone: 'warn', text: "Aucune séance avec RPE saisi sur la période : la charge d'entraînement n'a pas pu être suivie." }];
  }

  const out: { tone: Tone; text: string }[] = [];

  if (overloadWeeks > 0) {
    out.push({
      tone: 'bad',
      text: `${overloadWeeks} semaine${overloadWeeks > 1 ? 's' : ''} en surcharge (≥ ${reportInt(thresholds.normalMax)} UA) — à recouper avec les blessures et le bien-être sur les mêmes semaines.`,
    });
  } else {
    out.push({ tone: 'good', text: 'Aucune semaine en surcharge sur la période.' });
  }

  if (loadDelta !== null && Math.abs(loadDelta) >= 200) {
    out.push({
      tone: loadDelta > 0 ? 'warn' : 'neutral',
      text: loadDelta > 0
        ? `Charge hebdomadaire supérieure de ${reportInt(loadDelta)} UA à la moyenne de la saison.`
        : `Charge hebdomadaire inférieure de ${reportInt(Math.abs(loadDelta))} UA à la moyenne de la saison.`,
    });
  }

  // Un écart d'assiduité fausse toute lecture d'une moyenne d'équipe : il vaut d'être signalé.
  if (data.players.length >= 2) {
    const counts = data.players.map(p => p.nbSessions);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    if (max - min >= 5) {
      out.push({
        tone: 'warn',
        text: `Assiduité très inégale : de ${min} à ${max} séances selon les joueurs — les moyennes d'équipe sont à lire avec prudence.`,
      });
    }
  }

  if (data.acwr !== null && (data.acwr > 1.5 || data.acwr < 0.8)) {
    out.push({
      tone: 'warn',
      text: data.acwr > 1.5
        ? `Rapport charge récente / habituelle à ${reportDec(data.acwr)} : montée de charge rapide, à surveiller.`
        : `Rapport charge récente / habituelle à ${reportDec(data.acwr)} : charge en retrait par rapport aux semaines précédentes.`,
    });
  }

  return out.slice(0, 4);
}
