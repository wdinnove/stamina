import { Bandage, Stethoscope, Pill, ChevronRight, CheckCircle2 } from 'lucide-react';
import { PlayerAvatar } from './PlayerAvatar';
import { StatusBadge } from './StatusBadge';
import { Badge } from './Badge';
import { isNoStopInjury } from '../utils/medical';
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

/**
 * « Clôturer » posé directement sur une card cliquable : `stopPropagation` obligatoire, sinon le
 * clic remonte à la card et ouvre la modale de détail par-dessus la confirmation.
 */
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClose(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap',
        padding: '6px 11px', fontSize: '0.75rem', fontWeight: 600,
        backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
        borderRadius: 4, color: '#00E5A0', cursor: 'pointer',
      }}
    >
      <CheckCircle2 size={12} /> Clôturer
    </button>
  );
}

function reprisEstimeeDisplay(rtpDate: string | undefined): { label: string; color: string } | null {
  if (!rtpDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rtp   = new Date(rtpDate + 'T00:00:00');
  const days  = Math.ceil((rtp.getTime() - today.getTime()) / 86400000);
  return { label: fmtDateLong(rtpDate), color: days <= 3 ? '#00E5A0' : '#F59E0B' };
}

/**
 * Une entrée médicale, partout où elle s'affiche en liste : historique d'une joueuse et infirmerie.
 *
 * Une seule mise en page pour les deux — celle, aérée, de l'historique joueur. L'infirmerie en
 * portait une seconde, plus dense (photo en colonne, boutons Modifier/Clôturer empilés), pour un
 * besoin qui se résume à ajouter QUI est concernée : il suffisait d'un bloc d'identité optionnel
 * sur celle-ci (cf. `showPlayerIdentity`) plutôt que de faire évoluer deux gabarits en parallèle
 * pour un même objet. La branche « boutons sans modale » a suivi : les deux appelants passent
 * toujours `onClick`, elle n'était jamais atteinte.
 */
export function InjuryRecordCard({ record, player, onClose, navigate, showPlayerIdentity, onClick }: {
  record: MedicalRecord;
  player?: Player;
  onClose?: () => void;
  navigate: (path: string) => void;
  /** Ajoute photo, nom et statut de la joueuse en tête de card — pour les listes qui mélangent
   *  l'effectif (infirmerie). Inutile sur l'historique d'une joueuse : on sait déjà de qui il s'agit. */
  showPlayerIdentity?: boolean;
  /** La card devient cliquable et ouvre une modale de détail — modifier y vit ; « Clôturer » reste
   *  sur la card, c'est le geste courant sur une entrée active. */
  onClick?: () => void;
}) {
  const col = typeColors[record.type] ?? '#94A3B8';
  const sev = record.severity ? severityConfig[record.severity] : null;
  const TypeIcon = typeIconComponents[record.type];
  const reprise = reprisEstimeeDisplay(record.rtpDate);
  // Sans arrêt : afficher « Reprise le : <même jour> » n'a pas de sens, on l'annonce comme tel.
  const noStop = isNoStopInjury(record);
  const identity = showPlayerIdentity && player;

  const goToPlayer = (e: React.MouseEvent) => {
    if (!player) return;
    e.stopPropagation();
    navigate(`/performance-individuelle/${player.id}/vue-ensemble`);
  };

  return (
    <div onClick={onClick} style={{
      // La bordure reflète le TYPE d'entrée (rouge/vert/bleu), jamais le statut courant de la
      // joueuse : sur une liste mélangée, c'est ce qui distingue une blessure d'un traitement au
      // premier coup d'œil — le statut a déjà sa propre pastille.
      backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${col}`, borderRadius: 8,
      padding: '16px 18px', cursor: onClick ? 'pointer' : 'default', display: 'flex', gap: 14, alignItems: 'center',
    }}>
      {identity ? (
        <div onClick={goToPlayer} style={{ cursor: 'pointer', flexShrink: 0 }}>
          <PlayerAvatar player={player} size={38} />
        </div>
      ) : (
        <div style={{
          width: 38, height: 38, borderRadius: '50%', backgroundColor: col + '20', border: `1px solid ${col}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <TypeIcon size={17} color={col} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {identity && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span onClick={goToPlayer} style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>
              {playerNameFull(player)}
            </span>
            <StatusBadge status={player.status} size="sm" />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ color: '#F1F5F9', fontSize: '1rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{record.description}</p>
          {sev && <Badge color={sev.color} bg={sev.color + '18'} label={sev.label} size="md" style={{ flexShrink: 0 }} />}
        </div>

        <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ color: '#64748B', fontSize: '0.78rem' }}>{typeLabels[record.type]} le : {fmtDateLong(record.date)}</span>
          {record.type !== 'checkup' && (
            <span style={{ color: noStop ? '#00E5A0' : reprise ? reprise.color : '#475569', fontSize: '0.78rem', fontWeight: noStop || reprise ? 700 : 500 }}>
              {noStop
                ? 'Sans arrêt — 0 jour'
                : reprise
                  ? `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : ${reprise.label}`
                  : `${record.type === 'treatment' ? 'Fin' : 'Reprise'} le : non renseigné`}
            </span>
          )}
        </div>
      </div>

      {onClick && onClose && <CloseButton onClose={onClose} />}
      {onClick && <ChevronRight size={16} style={{ color: '#475569', flexShrink: 0 }} />}
    </div>
  );
}
