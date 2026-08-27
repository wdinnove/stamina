import { Pencil, Check, RotateCcw, Bandage, Stethoscope, Pill } from 'lucide-react';
import { Modal } from './Modal';
import { severityConfig, typeLabels } from './MedicalCard';
import { daysBetween, isNoStopInjury } from '../utils/medical';
import { sanitizeHtml } from '../utils/sanitize';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull } from '../utils/playerName';
import type { MedicalRecord, Player } from '../data/types';
import { LAYER } from '../styles/layers';

const typeColors: Record<string, string> = {
  injury: '#EF4444', checkup: '#3B82F6', treatment: '#00E5A0',
};
const typeIconComponents = { injury: Bandage, checkup: Stethoscope, treatment: Pill };

export function MedicalRecordDetailModal({ record, player, onClose, onEdit, onCloseRecord, onReopen, canEdit = true }: {
  record: MedicalRecord;
  player?: Player;
  onClose: () => void;
  onEdit: () => void;
  /** Fourni pour une entrée active — tous types confondus */
  onCloseRecord?: () => void;
  /** Fourni pour une entrée clôturée : la déclôture la remet en cours */
  onReopen?: () => void;
  /** Faux = consultation seule : seul « Fermer » subsiste */
  canEdit?: boolean;
}) {
  const col = typeColors[record.type] ?? '#94A3B8';
  const sev = record.severity ? severityConfig[record.severity] : null;
  const TypeIcon = typeIconComponents[record.type];
  const totalDays = record.rtpDate ? daysBetween(record.date, record.rtpDate) : null;
  const noStop = isNoStopInjury(record);

  const details = ([
    { label: 'Joueur', value: player ? playerNameFull(player) : '—' },
    { label: 'Date',   value: `${fmtDate(record.date)} ${record.date.slice(0, 4)}` },
    { label: 'Statut', value: record.status === 'active' ? 'En cours' : 'Clôturé', color: record.status === 'active' ? '#F59E0B' : '#00E5A0' },
    ...(sev ? [{ label: 'Gravité', value: sev.label, color: sev.color }] : []),
    ...(record.location ? [{ label: 'Localisation', value: record.location }] : []),
    // Sans arrêt : « 0 jour » et une reprise le jour même se lisent mal, un seul bloc explicite suffit.
    ...(noStop ? [{ label: 'Arrêt', value: 'Sans arrêt — 0 jour', color: '#00E5A0' }] : [
      ...(record.daysAbsent != null ? [{ label: 'Jours blessés', value: `${record.daysAbsent} jour${record.daysAbsent > 1 ? 's' : ''}`, color: '#F59E0B' }] : []),
      ...(record.rtpDate ? [{ label: record.type === 'injury' ? 'Date de retour' : 'Date de fin', value: `${fmtDate(record.rtpDate)} ${record.rtpDate.slice(0, 4)}${totalDays ? ` · ${totalDays}j` : ''}` }] : []),
    ]),
    ...(record.resolvedDate ? [{ label: 'Clôturé le', value: `${fmtDate(record.resolvedDate)} ${record.resolvedDate.slice(0, 4)}`, color: '#00E5A0' }] : []),
  ] as { label: string; value: string; color?: string }[]);

  return (
    <Modal onClose={onClose} maxWidth={500} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
      {/* Header — plus de croix : la fermeture vit dans la barre d'actions, en bas. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: col + '1c', border: `1.5px solid ${col}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TypeIcon size={19} color={col} />
        </div>
        <div>
          <span style={{ color: col, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{typeLabels[record.type]}</span>
          <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.05rem', margin: '3px 0 0', lineHeight: 1.3 }}>{record.description}</p>
        </div>
      </div>

      {/* Grille de détails */}
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10, marginBottom: 14 }}>
        {details.map(({ label, value, color }) => (
          <div key={label} style={{ padding: '10px 12px', backgroundColor: '#1E2229', borderRadius: 6, borderLeft: `2px solid ${color ?? '#2A2F3A'}` }}>
            <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px', fontWeight: 600 }}>{label}</p>
            <p style={{ color: color ?? '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Traitement / Notes */}
      {record.treatment && (
        <div style={{ padding: '12px 14px', backgroundColor: '#1E2229', borderRadius: 6, marginBottom: 18 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 5px', fontWeight: 600 }}>
            {record.type === 'injury' ? 'Traitement & protocole' : 'Notes'}
          </p>
          <div className="rich-display" style={{ color: '#CBD5E1', fontSize: '0.84rem' }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(record.treatment) }} />
        </div>
      )}

      {/* Actions — « Fermer » referme la modale, « Clôturer »/« Rouvrir » agit sur l'entrée.
          Les deux mots se ressemblent, d'où la séparation nette : Fermer à gauche, en gris. */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
          Fermer
        </button>
        {canEdit && onCloseRecord && (
          <button
            onClick={onCloseRecord}
            style={{
              flex: 1, padding: '10px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
              color: '#00E5A0', cursor: 'pointer',
            }}>
            <Check size={13} /> Clôturer
          </button>
        )}
        {canEdit && onReopen && (
          <button
            onClick={onReopen}
            style={{
              flex: 1, padding: '10px', borderRadius: 6, fontSize: '0.85rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
              color: '#F59E0B', cursor: 'pointer',
            }}>
            <RotateCcw size={13} /> Rouvrir
          </button>
        )}
        {canEdit && (
          <button onClick={onEdit} style={{ flex: 1, padding: '10px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}>
            <Pencil size={13} /> Modifier
          </button>
        )}
      </div>
    </Modal>
  );
}
