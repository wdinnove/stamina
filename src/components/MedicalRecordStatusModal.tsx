import { useState } from 'react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { notify } from '../api/notifications';
import { Modal } from './Modal';
import { playerNameFull } from '../utils/playerName';
import type { MedicalRecord, Player, PlayerStatus } from '../data/types';
import { LAYER } from '../styles/layers';

const TODAY = new Date().toISOString().split('T')[0];

const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };

/** Libellés accordés par type — « Blessure clôturée » mais « Traitement clôturé ». Les trois
 *  copies de cette modale annonçaient « Blessure clôturée » même pour un traitement ou un bilan. */
const TYPE_WORDING: Record<MedicalRecord['type'], { closed: string; reopened: string; noun: string }> = {
  injury:    { closed: 'Blessure clôturée',   reopened: 'Blessure rouverte',   noun: 'la blessure' },
  checkup:   { closed: 'Bilan clôturé',       reopened: 'Bilan rouvert',       noun: 'le bilan' },
  treatment: { closed: 'Traitement clôturé',  reopened: 'Traitement rouvert',  noun: 'le traitement' },
};

const PLAYER_STATUSES = [
  { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
  { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
  { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
  { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
];

export type MedicalStatusAction = 'close' | 'reopen';

export interface MedicalRecordStatusModalProps {
  /** 'close' = clôturer (date de fin + statut joueur) · 'reopen' = remettre en cours */
  action: MedicalStatusAction;
  record: MedicalRecord;
  /** Joueur concerné — nécessaire pour écrire son statut à la clôture */
  player?: Player;
  teamId?: string;
  onCancel: () => void;
  /** Écriture réussie — au parent de rafraîchir ses données */
  onDone: () => void;
}

/**
 * Clôture et déclôture d'une entrée médicale, pour les trois types.
 *
 * Une seule modale pour les deux sens, et un seul endroit pour la règle métier : la page Médicale,
 * l'historique joueur et la vue équipe en portaient trois copies identiques — trois handlers, trois
 * modales, trois notifications à corriger pour un même changement.
 *
 * Clôture : `resolved_date` est la date RÉELLE de fin (pas forcément aujourd'hui), et le statut du
 * joueur repart à ce qu'on choisit — actif par défaut, c'est le cas courant du retour.
 * Déclôture : l'entrée seule repasse en cours. Le statut du joueur n'est PAS touché — rouvrir un
 * dossier est un geste de correction, il n'a pas à décider de la disponibilité du joueur.
 */
export function MedicalRecordStatusModal({ action, record, player, teamId, onCancel, onDone }: MedicalRecordStatusModalProps) {
  const [date, setDate]               = useState(record.resolvedDate ?? TODAY);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('active');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const wording = TYPE_WORDING[record.type];
  const closing = action === 'close';

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const playerName = player ? playerNameFull(player) : undefined;
      if (closing) {
        await medicalApi.update(record.id, { status: 'resolved', resolvedDate: date });
        if (player) await playersApi.setStatus(player, playerStatus, teamId);
        notify(teamId, 'medical_resolved', `${wording.closed}${playerName ? ` — ${playerName}` : ''}`, { entityType: 'player', entityId: record.playerId });
      } else {
        await medicalApi.update(record.id, { status: 'active', resolvedDate: null });
        notify(teamId, 'medical_updated', `${wording.reopened}${playerName ? ` — ${playerName}` : ''}`, { entityType: 'player', entityId: record.playerId });
      }
      onDone();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erreur lors de la ${closing ? 'clôture' : 'déclôture'}`);
    } finally {
      setSaving(false);
    }
  };

  const disabled = saving || (closing && !date);

  return (
    <Modal onClose={onCancel} maxWidth={360} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
      <h2 style={{ color: '#F1F5F9', margin: '0 0 20px', fontSize: '1rem', fontWeight: 700 }}>
        {closing ? 'Clôturer l\'entrée' : 'Rouvrir l\'entrée'}
      </h2>

      {closing ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Date de fin</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Statut après retour</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PLAYER_STATUSES.map(({ val, label, color }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPlayerStatus(val)}
                  style={{
                    padding: '8px',
                    borderRadius: 6,
                    border: `1px solid ${playerStatus === val ? color : '#2A2F3A'}`,
                    backgroundColor: playerStatus === val ? color + '18' : 'transparent',
                    color: playerStatus === val ? color : '#94A3B8',
                    cursor: 'pointer', fontSize: '0.8rem',
                    fontWeight: playerStatus === val ? 700 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px' }}>
          {`Remettre ${wording.noun} en cours ?`} La date de clôture est effacée
          {player ? `, et le statut de ${playerNameFull(player)} n'est pas modifié.` : '.'}
        </p>
      )}

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem', marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
          Annuler
        </button>
        <button
          onClick={confirm}
          disabled={disabled}
          style={{
            flex: 2, padding: '10px', borderRadius: 6, border: 'none',
            backgroundColor: disabled ? '#1E2229' : (closing ? '#00E5A0' : '#F59E0B'),
            color: disabled ? '#475569' : '#0D0F14',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.88rem',
          }}>
          {saving ? (closing ? 'Clôture…' : 'Réouverture…') : (closing ? 'Confirmer' : 'Rouvrir')}
        </button>
      </div>
    </Modal>
  );
}
