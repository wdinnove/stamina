import {
  SectionHeading, BlockTitle, StatBlock, StatRow, Findings, DataTable, Tag,
  reportInt, reportDate, reportDateNum, MUTED, FAINT, type Tone, type Column,
} from './ReportKit';
import { sumInjuryDays, injuryDays, rtpDaysLeft } from '../utils/medical';
import type { MedicalRecord, Player } from '../data/types';

/** Une entrée médicale rattachée à son joueur — le rapport nomme toujours la personne. */
export interface MedicalEvent {
  record: MedicalRecord;
  playerName: string;
}

export interface MedicalSectionData {
  /** Entrées survenues sur la période. */
  events: MedicalEvent[];
  /** Blessures encore ouvertes à ce jour, quelle que soit leur date de survenue. */
  ongoing: MedicalEvent[];
  /** Effectif et sa disponibilité à ce jour. */
  roster: Player[];
}

const SEVERITY_PRINT: Record<string, { label: string; color: string }> = {
  mild:     { label: 'Léger',  color: '#B45309' },
  moderate: { label: 'Modéré', color: '#C2410C' },
  severe:   { label: 'Grave',  color: '#B91C1C' },
};

const TYPE_LABEL: Record<string, string> = {
  injury: 'Blessure', checkup: 'Bilan', treatment: 'Traitement',
};

const STATUS_PRINT: Record<string, { label: string; color: string }> = {
  active:      { label: 'Actif',       color: '#00875F' },
  injured:     { label: 'Blessé',      color: '#B91C1C' },
  limited:     { label: 'Limité',      color: '#B45309' },
  suspended:   { label: 'Suspendu',    color: '#6D28D9' },
  unavailable: { label: 'Indisponible', color: '#475569' },
};

/**
 * La section « médical » d'un rapport.
 *
 * Deux temporalités cohabitent et ne doivent pas être confondues : ce qui s'est passé PENDANT la
 * période (blessures survenues, jours perdus) et l'état de l'effectif À CE JOUR (qui est
 * disponible pour le prochain match). Le gabarit les sépare explicitement.
 */
export function ReportMedicalSection({ index, data }: { index: number | string; data: MedicalSectionData }) {
  const injuries = data.events.filter(e => e.record.type === 'injury');
  const total = sumInjuryDays(injuries.map(e => e.record));

  const available   = data.roster.filter(p => p.status === 'active').length;
  const unavailable = data.roster.filter(p => p.status === 'injured' || p.status === 'unavailable').length;
  const limited     = data.roster.filter(p => p.status === 'limited').length;

  const severe = injuries.filter(e => e.record.severity === 'severe').length;

  const eventCols: Column<MedicalEvent>[] = [
    { key: 'date', label: 'Date', width: 68, render: e => <span style={{ color: MUTED }}>{reportDateNum(e.record.date)}</span> },
    { key: 'player', label: 'Joueur', render: e => <span style={{ fontWeight: 600 }}>{e.playerName}</span> },
    { key: 'type', label: 'Type', width: 66, render: e => <span style={{ color: MUTED }}>{TYPE_LABEL[e.record.type] ?? e.record.type}</span> },
    { key: 'what', label: 'Description', render: e => (
      <span>{e.record.location ? <strong>{e.record.location} · </strong> : null}{e.record.description}</span>
    ) },
    { key: 'sev', label: 'Gravité', width: 60, render: e => {
      const s = e.record.severity ? SEVERITY_PRINT[e.record.severity] : undefined;
      return s ? <Tag label={s.label} color={s.color} /> : <span style={{ color: FAINT }}>—</span>;
    } },
    { key: 'days', label: 'Jours', align: 'right', width: 44, render: e => {
      const d = injuryDays(e.record);
      return <span style={{ fontWeight: 700 }}>{d === null ? '—' : d}</span>;
    } },
  ];

  const ongoingCols: Column<MedicalEvent>[] = [
    { key: 'player', label: 'Joueur', render: e => <span style={{ fontWeight: 600 }}>{e.playerName}</span> },
    { key: 'what', label: 'Nature', render: e => (
      <span>{e.record.location ? <strong>{e.record.location} · </strong> : null}{e.record.description}</span>
    ) },
    { key: 'since', label: 'Depuis', width: 68, render: e => <span style={{ color: MUTED }}>{reportDateNum(e.record.date)}</span> },
    { key: 'rtp', label: 'Retour prévu', width: 104, render: e => {
      if (!e.record.rtpDate) return <span style={{ color: FAINT }}>non daté</span>;
      const left = rtpDaysLeft(e.record.rtpDate);
      return (
        <span>
          {reportDateNum(e.record.rtpDate)}
          <span style={{ color: MUTED, fontSize: 9.5 }}> {left > 0 ? `(J−${left})` : '(dépassé)'}</span>
        </span>
      );
    } },
  ];

  return (
    <>
      <SectionHeading index={index} label="Médical" subject="Équipe"
        hint="Événements survenus pendant la période, et disponibilité de l'effectif à la date d'établissement du rapport." />

      <StatRow>
        <StatBlock
          label="Effectif disponible"
          value={<>{available}<span style={{ fontSize: 14, color: MUTED, fontWeight: 600 }}> / {data.roster.length}</span></>}
          tone={unavailable === 0 ? 'good' : unavailable > 2 ? 'bad' : 'warn'}
          hint={`${unavailable} indisponible${unavailable > 1 ? 's' : ''} · ${limited} limité${limited > 1 ? 's' : ''}`}
        />
        <StatBlock
          label="Blessures sur la période"
          value={injuries.length}
          tone={injuries.length === 0 ? 'good' : severe > 0 ? 'bad' : 'warn'}
          hint={severe > 0 ? `dont ${severe} grave${severe > 1 ? 's' : ''}` : 'aucune grave'}
        />
        <StatBlock
          label="Jours d'indisponibilité"
          value={reportInt(total.days)}
          hint={total.undated > 0 ? `${total.undated} blessure${total.undated > 1 ? 's' : ''} sans date de fin, hors total` : 'cumulés sur la période'}
        />
        <StatBlock
          label="Blessures en cours"
          value={data.ongoing.length}
          tone={data.ongoing.length === 0 ? 'good' : 'warn'}
          hint="non clôturées à ce jour"
        />
      </StatRow>

      <div style={{ marginBottom: 20 }}>
        <BlockTitle>Blessures en cours à ce jour</BlockTitle>
        <DataTable columns={ongoingCols} rows={data.ongoing} cap={6}
          emptyLabel="Aucune blessure en cours — effectif au complet côté médical." />
      </div>

      <div style={{ marginBottom: 20 }}>
        <BlockTitle>Événements de la période</BlockTitle>
        <DataTable columns={eventCols} rows={data.events} cap={8}
          emptyLabel="Aucun événement médical enregistré sur la période." />
      </div>

      <div style={{ marginBottom: 20 }}>
        <BlockTitle>Effectif indisponible ou limité</BlockTitle>
        <UnavailableList roster={data.roster} />
      </div>

      <Findings items={medicalFindings(data, injuries.length, severe, total.days, unavailable)} />
    </>
  );
}

/** La liste nominative de ceux qui ne sont pas pleinement disponibles — l'info la plus attendue. */
function UnavailableList({ roster }: { roster: Player[] }) {
  const flagged = roster.filter(p => p.status !== 'active');
  if (flagged.length === 0) {
    return <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: 'italic' }}>Tout l'effectif est déclaré actif.</p>;
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {flagged.map(p => {
        const s = STATUS_PRINT[p.status] ?? { label: p.status, color: MUTED };
        return <Tag key={p.id} label={`${p.lastName.toUpperCase()} ${p.firstName} · ${s.label}`} color={s.color} />;
      })}
    </div>
  );
}

export function medicalFindings(
  data: MedicalSectionData,
  injuries: number,
  severe: number,
  daysLost: number,
  unavailable: number,
): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];

  if (injuries === 0) {
    out.push({ tone: 'good', text: 'Aucune blessure enregistrée sur la période.' });
  } else {
    out.push({
      tone: severe > 0 ? 'bad' : 'warn',
      text: `${injuries} blessure${injuries > 1 ? 's' : ''} sur la période${severe > 0 ? `, dont ${severe} grave${severe > 1 ? 's' : ''}` : ''} — ${reportInt(daysLost)} jour${daysLost > 1 ? 's' : ''} d'indisponibilité cumulés.`,
    });
  }

  if (unavailable > 0) {
    out.push({
      tone: unavailable > 2 ? 'bad' : 'warn',
      text: `${unavailable} joueur${unavailable > 1 ? 's' : ''} indisponible${unavailable > 1 ? 's' : ''} à la date du rapport.`,
    });
  }

  const rtpSoon = data.ongoing.filter(e => e.record.rtpDate && rtpDaysLeft(e.record.rtpDate) > 0 && rtpDaysLeft(e.record.rtpDate) <= 14);
  if (rtpSoon.length > 0) {
    out.push({
      tone: 'good',
      text: `${rtpSoon.length} retour${rtpSoon.length > 1 ? 's' : ''} prévu${rtpSoon.length > 1 ? 's' : ''} sous 14 jours : ${rtpSoon.map(e => e.playerName).join(', ')}.`,
    });
  }

  const undated = data.ongoing.filter(e => !e.record.rtpDate);
  if (undated.length > 0) {
    out.push({
      tone: 'warn',
      text: `${undated.length} blessure${undated.length > 1 ? 's' : ''} en cours sans date de retour renseignée : la planification de l'effectif reste incertaine.`,
    });
  }

  return out.slice(0, 4);
}
