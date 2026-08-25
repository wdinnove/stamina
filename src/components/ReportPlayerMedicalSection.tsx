import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings,
  reportInt, reportDate, reportDateNum, MUTED, FAINT, SOFT, LINE, INK, type Tone,
} from './ReportKit';
import { playerStatusLabel } from './PlayerHero';
import { sumInjuryDays, rtpDaysLeft } from '../utils/medical';
import type { MedicalRecord, Player } from '../data/types';

export interface PlayerMedicalSectionData {
  player: Player;
  /** Ses entrées médicales sur la période. */
  records: MedicalRecord[];
  /** Ses blessures encore ouvertes à ce jour, quelle que soit leur date de survenue. */
  ongoing: MedicalRecord[];
  /** Toutes ses entrées de la saison — sert à repérer les récidives, invisibles sur une période courte. */
  seasonRecords: MedicalRecord[];
}

const SEVERITY_PRINT: Record<string, { label: string; color: string }> = {
  mild:     { label: 'Léger',  color: '#B45309' },
  moderate: { label: 'Modéré', color: '#C2410C' },
  severe:   { label: 'Grave',  color: '#B91C1C' },
};

const STATUS_PRINT: Record<string, { color: string; tone: Tone }> = {
  active:      { color: '#00875F', tone: 'good' },
  injured:     { color: '#B91C1C', tone: 'bad'  },
  limited:     { color: '#B45309', tone: 'warn' },
  suspended:   { color: '#6D28D9', tone: 'warn' },
  unavailable: { color: '#475569', tone: 'bad'  },
};

/**
 * Le suivi médical d'UN joueur.
 *
 * Le bloc d'équipe compte des indisponibles ; celui-ci raconte un parcours. Deux choses n'existent
 * qu'ici : sa disponibilité à la date du rapport avec sa date de retour, et la récidive — une même
 * zone touchée plusieurs fois dans la saison, que le décompte collectif noie forcément.
 */
export function ReportPlayerMedicalSection({ index, subject, data }: {
  index: number | string;
  subject: string;
  data: PlayerMedicalSectionData;
}) {
  const injuries = data.records.filter(r => r.type === 'injury');
  const periodDays = sumInjuryDays(injuries);
  const seasonInjuries = data.seasonRecords.filter(r => r.type === 'injury');
  const seasonDays = sumInjuryDays(seasonInjuries);

  const status = STATUS_PRINT[data.player.status] ?? { color: MUTED, tone: 'neutral' as Tone };
  const severe = injuries.filter(r => r.severity === 'severe').length;

  // Récidive : une même zone touchée plusieurs fois dans la saison.
  const byLocation = new Map<string, number>();
  for (const r of seasonInjuries) {
    if (!r.location) continue;
    byLocation.set(r.location, (byLocation.get(r.location) ?? 0) + 1);
  }
  const recurring = [...byLocation.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <SectionHeading index={index} label="Médical" subject={subject} />

      <StatRow>
        <StatBlock
          label="Statut à ce jour"
          value={<span style={{ fontSize: 17 }}>{playerStatusLabel[data.player.status]}</span>}
          tone={status.tone}
          hint={data.ongoing.length > 0 ? `${data.ongoing.length} blessure${data.ongoing.length > 1 ? 's' : ''} en cours` : 'aucune blessure ouverte'}
        />
        <StatBlock
          label="Blessures sur la période"
          value={injuries.length}
          tone={injuries.length === 0 ? 'good' : severe > 0 ? 'bad' : 'warn'}
          hint={severe > 0 ? `dont ${severe} grave${severe > 1 ? 's' : ''}` : 'aucune grave'}
        />
        <StatBlock
          label="Jours d'indisponibilité"
          value={reportInt(periodDays.days)}
          hint={periodDays.undated > 0
            ? `${periodDays.undated} blessure${periodDays.undated > 1 ? 's' : ''} sans date de fin, hors total`
            : 'cumulés sur la période'}
        />
        <StatBlock
          label="Sur toute la saison"
          value={reportInt(seasonDays.days)}
          unit="j"
          tone={seasonDays.days >= 30 ? 'bad' : seasonDays.days > 0 ? 'warn' : 'good'}
          hint={`${seasonInjuries.length} blessure${seasonInjuries.length > 1 ? 's' : ''} au total`}
        />
      </StatRow>

      {data.ongoing.length > 0 && (
        <div style={{ marginBottom: 13 }}>
          <BlockTitle>Blessures en cours à ce jour</BlockTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.ongoing.slice(0, 3).map(r => <OngoingCard key={r.id} record={r} />)}
          </div>
          {data.ongoing.length > 3 && (
            <p style={{ margin: '6px 0 0', fontSize: 9.5, color: FAINT, fontStyle: 'italic' }}>
              + {data.ongoing.length - 3} autre{data.ongoing.length - 3 > 1 ? 's' : ''} non détaillée{data.ongoing.length - 3 > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      <Findings items={playerMedicalFindings(data, injuries, severe, periodDays.days, seasonDays.days, recurring)} />
    </>
  );
}

/** Une blessure ouverte, mise en avant : c'est l'information que le staff cherche en premier. */
function OngoingCard({ record }: { record: MedicalRecord }) {
  const left = record.rtpDate ? rtpDaysLeft(record.rtpDate) : null;
  const sev = record.severity ? SEVERITY_PRINT[record.severity] : undefined;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '8px 11px', backgroundColor: SOFT, border: `1px solid ${LINE}`,
      borderLeft: `3px solid ${sev?.color ?? '#B91C1C'}`, borderRadius: '0 4px 4px 0',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: INK }}>
          {record.location ? `${record.location} · ` : ''}{record.description}
        </p>
        <p style={{ margin: '3px 0 0', fontSize: 10, color: MUTED }}>
          Depuis le {reportDate(record.date)}
          {sev && <> · {sev.label}</>}
          {record.treatment && <> · {record.treatment}</>}
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 9, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>
          Retour prévu
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700 }}>
          {record.rtpDate ? reportDateNum(record.rtpDate) : <span style={{ color: FAINT, fontWeight: 400 }}>non daté</span>}
        </p>
        {left !== null && (
          <p style={{ margin: '1px 0 0', fontSize: 9.5, color: MUTED }}>
            {left > 0 ? `dans ${left} jour${left > 1 ? 's' : ''}` : 'échéance dépassée'}
          </p>
        )}
      </div>
    </div>
  );
}

export function playerMedicalFindings(
  data: PlayerMedicalSectionData,
  injuries: MedicalRecord[],
  severe: number,
  periodDays: number,
  seasonDays: number,
  recurring: [string, number][],
): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];

  if (data.player.status !== 'active') {
    const next = data.ongoing.find(r => r.rtpDate);
    out.push({
      tone: 'bad',
      text: `Indisponible ou limité à la date du rapport${next?.rtpDate ? ` — retour prévu le ${reportDate(next.rtpDate)}` : ', sans date de retour renseignée'}.`,
    });
  } else if (injuries.length === 0) {
    out.push({ tone: 'good', text: 'Disponible, aucune blessure enregistrée sur la période.' });
  }

  if (injuries.length > 0) {
    out.push({
      tone: severe > 0 ? 'bad' : 'warn',
      text: `${injuries.length} blessure${injuries.length > 1 ? 's' : ''} sur la période${severe > 0 ? `, dont ${severe} grave${severe > 1 ? 's' : ''}` : ''} — ${reportInt(periodDays)} jour${periodDays > 1 ? 's' : ''} d'indisponibilité.`,
    });
  }

  if (recurring.length > 0) {
    out.push({
      tone: 'bad',
      text: `Récidive sur ${recurring.map(([loc, n]) => `${loc} (${n} fois)`).join(', ')} cette saison : à traiter comme un problème de fond, pas comme des incidents isolés.`,
    });
  }

  if (seasonDays >= 30 && out.length < 4) {
    out.push({
      tone: 'warn',
      text: `${reportInt(seasonDays)} jours d'indisponibilité cumulés depuis le début de la saison.`,
    });
  }

  const undated = data.ongoing.filter(r => !r.rtpDate);
  if (undated.length > 0 && out.length < 4) {
    out.push({
      tone: 'warn',
      text: `${undated.length} blessure${undated.length > 1 ? 's' : ''} en cours sans date de retour : sa disponibilité reste impossible à planifier.`,
    });
  }

  return out.slice(0, 3);
}
