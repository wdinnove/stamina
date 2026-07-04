import { Pencil } from 'lucide-react';
import type { MedicalRecord } from '../data/types';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export const severityConfig = {
  mild:     { label: 'Léger',  color: '#F59E0B' },
  moderate: { label: 'Modéré', color: '#fb923c' },
  severe:   { label: 'Grave',  color: '#EF4444' },
};

export const typeLabels: Record<string, string> = {
  injury: 'Blessure', checkup: 'Bilan santé', treatment: 'Traitement',
};

export const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};

export const typeIcons: Record<string, string> = {
  injury: '🚑', checkup: '🩺', treatment: '💊',
};

export function daysBetween(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00');
  const end   = new Date(to   + 'T00:00:00');
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function rtpDaysLeft(rtpDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rtp   = new Date(rtpDate + 'T00:00:00');
  return Math.ceil((rtp.getTime() - today.getTime()) / 86400000);
}

export function MedCard({
  record, daysLabel, daysColor,
  onEdit, onClose, onDetail, showTypeBadge,
}: {
  record: MedicalRecord;
  daysLabel: string | null;
  daysColor: string;
  onEdit: () => void;
  onClose?: () => void;
  onDetail?: () => void;
  showTypeBadge?: boolean;
}) {
  const col = typeColors[record.type] ?? '#94A3B8';
  const sev = record.severity ? severityConfig[record.severity] : null;
  const isResolved = record.status === 'resolved';
  const badgeLabel = record.type === 'checkup'
    ? 'Bilan santé'
    : isResolved ? 'Clôturé' : 'En cours';
  const badgeColor = record.type === 'checkup'
    ? '#3B82F6'
    : isResolved ? '#475569' : col;

  return (
    <div
      onClick={onDetail}
      style={{ backgroundColor: '#1E2229', border: `1px solid ${!isResolved && record.type !== 'checkup' ? col + '55' : '#2A2F3A'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: onDetail ? 'pointer' : 'default' }}
    >
      <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: col + '20', border: `1px solid ${col}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.88rem', flexShrink: 0 }}>
        {typeIcons[record.type]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          {showTypeBadge && (
            <span style={{ color: col, fontSize: '0.65rem', fontWeight: 700, backgroundColor: col + '18', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
              {typeLabels[record.type]}
            </span>
          )}
          <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.87rem', lineHeight: 1.3 }}>
            {record.description}
          </span>
          {record.type !== 'checkup' && (
            <span style={{ color: badgeColor, fontSize: '0.65rem', fontWeight: 700, backgroundColor: badgeColor + '18', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
              {badgeLabel}
            </span>
          )}
          {sev && (
            <span style={{ color: sev.color, fontSize: '0.65rem', fontWeight: 600, backgroundColor: sev.color + '18', padding: '2px 6px', borderRadius: 3, flexShrink: 0 }}>
              {sev.label}
            </span>
          )}
        </div>
        <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>
          {fmtDate(record.date)}{daysLabel ? <span style={{ color: daysColor }}>{` · ${daysLabel}`}</span> : null}
        </p>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 4, color: '#475569', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}
      >
        <Pencil size={10} /> Modifier
      </button>
    </div>
  );
}
