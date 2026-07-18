import { Pencil, Bandage, Stethoscope, Pill, ChevronRight } from 'lucide-react';
import { PlayerAvatar } from './PlayerAvatar';
import { StatusBadge } from './StatusBadge';
import { Badge } from './Badge';
import { statusConfig } from '../data/config';
import { playerNameFull } from '../utils/playerName';
import type { MedicalRecord, Player } from '../data/types';

const MONTHS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

const severityConfig = {
  mild:     { label: 'Léger',  color: '#F59E0B' },
  moderate: { label: 'Modéré', color: '#fb923c' },
  severe:   { label: 'Grave',  color: '#EF4444' },
};

const typeLabels: Record<string, string> = {
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

export function InjuryRecordCard({ record, player, onEdit, onClose, navigate, showAvatarColumn = true, onClick }: {
  record: MedicalRecord;
  player?: Player;
  onEdit: () => void;
  onClose?: () => void;
  navigate: (path: string) => void;
  showAvatarColumn?: boolean;
  /** Si fourni, la card devient cliquable et ouvre une modale de détail — les boutons Modifier/Clôturer disparaissent de la card (ils vivent alors dans la modale). */
  onClick?: () => void;
}) {
  const col = typeColors[record.type] ?? '#94A3B8';
  const sev = record.severity ? severityConfig[record.severity] : null;
  const TypeIcon = typeIconComponents[record.type];
  const airy = !showAvatarColumn;
  // Sans colonne avatar (historique médical d'un joueur), la couleur reflète toujours le type de
  // l'entrée (rouge/vert/bleu), pas le statut courant du joueur — évite la confusion vue en pratique.
  const statusColor = airy ? col : (player ? statusConfig[player.status].color : col);
  const reprise = reprisEstimeeDisplay(record.rtpDate);

  if (airy) {
    return (
      <div onClick={onClick} style={{
        backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${statusColor}`, borderRadius: 8,
        padding: '16px 18px', cursor: onClick ? 'pointer' : 'default', display: 'flex', gap: 14, alignItems: 'center',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', backgroundColor: statusColor + '20', border: `1px solid ${statusColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TypeIcon size={17} color={statusColor} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ color: '#F1F5F9', fontSize: '1rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{record.description}</p>
            {sev && <Badge color={sev.color} bg={sev.color + '18'} label={sev.label} size="md" style={{ flexShrink: 0 }} />}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ color: '#64748B', fontSize: '0.78rem' }}>{typeLabels[record.type]} le : {fmtDateLong(record.date)}</span>
            {record.type !== 'checkup' && (
              <span style={{ color: reprise ? reprise.color : '#475569', fontSize: '0.78rem', fontWeight: reprise ? 700 : 500 }}>
                {reprise
                  ? `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : ${reprise.label}`
                  : `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : non renseigné`}
              </span>
            )}
          </div>
        </div>
        {onClick && <ChevronRight size={16} style={{ color: '#475569', flexShrink: 0 }} />}
      </div>
    );
  }

  const dateLines = (
    <>
      {/* date de création */}
      <div style={{ color: '#64748B', fontSize: '0.7rem' }}>{typeLabels[record.type]} le : {fmtDateLong(record.date)}</div>

      {/* reprise estimée (injury/treatment uniquement) */}
      {record.type !== 'checkup' && (
        <div style={{ color: reprise ? reprise.color : '#475569', fontSize: '0.7rem', fontWeight: reprise ? 700 : 500 }}>
          {reprise
            ? `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : ${reprise.label}`
            : `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : non renseigné`}
        </div>
      )}
    </>
  );

  return (
    <div onClick={onClick} style={{
      backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${statusColor}`, borderRadius: 8,
      padding: '10px 12px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>

        {player ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0, width: 60 }}>
            <div onClick={e => { e.stopPropagation(); navigate(`/performance-individuelle/${player.id}/vue-ensemble`); }} style={{ cursor: 'pointer' }}>
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
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 1 : nom */}
          {player && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span onClick={e => { e.stopPropagation(); navigate(`/performance-individuelle/${player.id}/vue-ensemble`); }} style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                {playerNameFull(player)}
              </span>
            </div>
          )}

          {/* 2 : nom de la blessure + gravité */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0 0', flexWrap: 'wrap' }}>
            <p style={{ color: '#CBD5E1', fontSize: '0.85rem', fontWeight: 500, margin: 0, lineHeight: 1.3 }}>{record.description}</p>
            {sev && (
              <Badge color={sev.color} bg={sev.color + '18'} label={sev.label} size="sm" style={{ fontSize: '0.66rem', padding: '1px 6px', flexShrink: 0 }} />
            )}
          </div>

          {/* dates — restent sous la description quand la card garde ses boutons d'action */}
          {!onClick && <div style={{ margin: '3px 0 0', display: 'flex', flexDirection: 'column', gap: 2 }}>{dateLines}</div>}
        </div>

        {onClick && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, textAlign: 'right' }}>
            {dateLines}
          </div>
        )}

        {!onClick && (
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
        )}
      </div>
    </div>
  );
}
