import { Pencil, Bandage, Stethoscope, Pill } from 'lucide-react';
import { PlayerAvatar } from './PlayerAvatar';
import { StatusBadge } from './StatusBadge';
import { statusConfig } from '../data/config';
import type { MedicalRecord, Player } from '../data/types';

const MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

export const severityConfig = {
  mild:     { label: 'Léger',  color: '#F59E0B' },
  moderate: { label: 'Modéré', color: '#fb923c' },
  severe:   { label: 'Grave',  color: '#EF4444' },
};

export const typeLabels: Record<string, string> = {
  injury: 'Blessure', checkup: 'Bilan santé', treatment: 'Traitement',
};

const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};

const typeIconComponents = {
  injury: Bandage, checkup: Stethoscope, treatment: Pill,
};

function reprisEstimeeDisplay(rtpDate: string | undefined): { label: string; color: string } | null {
  if (!rtpDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rtp   = new Date(rtpDate + 'T00:00:00');
  const days  = Math.ceil((rtp.getTime() - today.getTime()) / 86400000);
  return { label: fmtDateLong(rtpDate), color: days <= 3 ? '#00E5A0' : '#F59E0B' };
}

export function InjuryRecordCard({ record, player, onEdit, onClose, navigate, showAvatarColumn = true }: {
  record: MedicalRecord;
  player?: Player;
  onEdit: () => void;
  onClose?: () => void;
  navigate: (path: string) => void;
  showAvatarColumn?: boolean;
}) {
  const col = typeColors[record.type] ?? '#94A3B8';
  const sev = record.severity ? severityConfig[record.severity] : null;
  const TypeIcon = typeIconComponents[record.type];
  const statusColor = player ? statusConfig[player.status].color : col;
  const reprise = reprisEstimeeDisplay(record.rtpDate);

  return (
    <div style={{ backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${statusColor}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

        {showAvatarColumn && (player ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 60 }}>
            <div onClick={() => navigate(`/players/${player.id}`)} style={{ cursor: 'pointer' }}>
              <PlayerAvatar player={player} size={32} />
            </div>
            <div style={{ transform: 'scale(0.8)' }}>
              <StatusBadge status={player.status} size="sm" />
            </div>
          </div>
        ) : (
          <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: statusColor + '20', border: `1px solid ${statusColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TypeIcon size={14} color={statusColor} />
          </div>
        ))}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 1 : nom */}
          {showAvatarColumn && player && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span onClick={() => navigate(`/players/${player.id}`)} style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                {player.firstName} {player.lastName}
              </span>
            </div>
          )}

          {/* 2 : nom de la blessure + gravité */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0 0', flexWrap: 'wrap' }}>
            <p style={{ color: '#CBD5E1', fontSize: '0.85rem', fontWeight: 500, margin: 0, lineHeight: 1.3 }}>{record.description}</p>
            {sev && (
              <span style={{ color: sev.color, fontSize: '0.66rem', fontWeight: 700, backgroundColor: sev.color + '18', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>{sev.label}</span>
            )}
          </div>

          {/* 3 : date de création */}
          <div style={{ color: '#64748B', fontSize: '0.7rem', margin: '3px 0 0' }}>{typeLabels[record.type]} le : {fmtDateLong(record.date)}</div>

          {/* 4 : reprise estimée (injury/treatment uniquement) */}
          {record.type !== 'checkup' && (
            <div style={{ color: reprise ? reprise.color : '#475569', fontSize: '0.7rem', fontWeight: reprise ? 700 : 500, margin: '2px 0 0' }}>
              {reprise
                ? `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : ${reprise.label}`
                : `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : non renseigné`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button onClick={onEdit} style={{ padding: '3px 8px', backgroundColor: 'rgba(148,163,184,0.1)', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Pencil size={10} /> Modifier
          </button>
          {onClose && (
            <button onClick={onClose} style={{ padding: '3px 8px', backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 4, color: '#00E5A0', cursor: 'pointer', fontSize: '0.68rem' }}>
              Clôturer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
