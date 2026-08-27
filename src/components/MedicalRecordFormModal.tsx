import { useState } from 'react';
import { X } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { notify } from '../api/notifications';
import RichTextEditor from './RichTextEditor';
import { Modal } from './Modal';
import { PlayerSelect } from './PlayerSelect';
import { severityConfig, typeLabels } from './MedicalCard';
import { daysBetween, isNoStopInjury } from '../utils/medical';
import { playerNameFull } from '../utils/playerName';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { MedicalRecord, Player, PlayerStatus } from '../data/types';

const TODAY = new Date().toISOString().split('T')[0];

const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };
const offStyle: React.CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

/** Jours d'arrêt à préremplir : la valeur saisie si elle existe, sinon celle qu'implique la date de retour. */
function initialDays(r?: MedicalRecord | null): string {
  if (!r || r.type !== 'injury') return '';
  if (r.daysAbsent != null) return String(r.daysAbsent);
  if (r.rtpDate) return String(daysBetween(r.date, r.rtpDate));
  return '';
}

export interface MedicalRecordFormModalProps {
  /** Effectif dans lequel choisir le joueur — doit contenir le joueur concerné (mise à jour de son statut) */
  players: Player[];
  /** Joueur imposé : masque le sélecteur (historique d'un joueur) */
  lockedPlayerId?: string;
  /** Joueur présélectionné à l'ouverture, sélecteur visible (vue équipe) */
  defaultPlayerId?: string;
  /** Entrée à modifier — absent/`null` = création */
  record?: MedicalRecord | null;
  onClose: () => void;
  /** Enregistrement réussi — au parent de rafraîchir ses données */
  onSaved: () => void;
}

/**
 * Formulaire d'entrée médicale (blessure / bilan / traitement), création et édition — partagé par la
 * page Médicale, la vue équipe et l'historique joueur, qui en portaient trois copies divergentes.
 *
 * Cas « sans arrêt » : une blessure sans indisponibilité (0 jour). Elle est enregistrée avec
 * `daysAbsent = 0` et `rtpDate = date` — les deux marqueurs que lit `isNoStopInjury` — et le joueur
 * passe LIMITÉ, pas actif : il joue, mais quelque chose le gêne et doit rester sous les yeux du
 * staff. L'entrée reste EN COURS jusqu'à une clôture manuelle : « sans arrêt » décrit l'absence
 * d'indisponibilité, pas un dossier réglé. C'est la clôture qui remet le joueur actif.
 *
 * Cas « bilan de santé » : un constat daté, pas un dossier à suivre — il naît donc clôturé,
 * quitte à être rouvert ensuite depuis la fiche détail.
 */
export function MedicalRecordFormModal({ players, lockedPlayerId, defaultPlayerId, record, onClose, onSaved }: MedicalRecordFormModalProps) {
  const { selected } = useTeamSeason();
  const teamId = selected?.team.id;
  const editing = record ?? null;
  const showPlayerSelect = !lockedPlayerId;
  const wasNoStop = !!editing && isNoStopInjury(editing);

  const [formType, setFormType]   = useState<MedicalRecord['type']>(editing?.type ?? 'injury');
  const [fPlayerId, setFPlayerId] = useState(lockedPlayerId ?? editing?.playerId ?? defaultPlayerId ?? players[0]?.id ?? '');
  const [fDate, setFDate]         = useState(editing?.date ?? TODAY);
  const [fDesc, setFDesc]         = useState(editing?.description ?? '');
  const [fSeverity, setFSeverity] = useState<'mild' | 'moderate' | 'severe'>(editing?.severity ?? 'mild');
  const [fDays, setFDays]         = useState(initialDays(editing));
  const [fTreatment, setFTreatment] = useState(editing?.treatment ?? '');
  const [fRtpDate, setFRtpDate]   = useState(editing?.rtpDate ?? '');
  const [fNoStop, setFNoStop]     = useState(wasNoStop);
  const [fPlayerStatus, setFPlayerStatus] = useState<PlayerStatus>(() => {
    const current = players.find(p => p.id === (lockedPlayerId ?? editing?.playerId));
    if (editing) return current?.status ?? (editing.type === 'injury' ? 'injured' : 'active');
    // Création : blessé par défaut. Cocher « sans arrêt » bascule sur limité (cf. toggleNoStop).
    return 'injured';
  });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const noStop = formType === 'injury' && fNoStop;

  const toggleNoStop = (on: boolean) => {
    setFNoStop(on);
    if (on) {
      setFDays('0');
      setFRtpDate(fDate);
      setFPlayerStatus('limited');
    } else {
      setFDays('');
      setFRtpDate('');
      setFPlayerStatus('injured');
    }
  };

  const changeDate = (value: string) => {
    setFDate(value);
    // Sans arrêt, la reprise suit toujours la date de la blessure.
    if (noStop) setFRtpDate(value);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fPlayerId || !fDesc) {
      setSaveError(showPlayerSelect ? 'Le joueur et la description sont requis.' : 'La description est requise.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        playerId:    fPlayerId,
        date:        fDate,
        type:        formType,
        description: fDesc,
        location:    undefined,
        severity:    formType === 'injury' ? fSeverity : undefined,
        daysAbsent:  formType === 'injury'
          ? (noStop ? 0 : (fDays !== '' ? Number(fDays) : undefined))
          : undefined,
        treatment:   editing ? (fTreatment || null) : (fTreatment || undefined),
        rtpDate:     formType === 'checkup'
          ? undefined
          : (noStop ? fDate : (fRtpDate || undefined)),
      };

      const player = players.find(p => p.id === fPlayerId);
      const playerName = player ? playerNameFull(player) : undefined;
      const typeLabel = typeLabels[formType] ?? formType;

      if (editing) {
        // Le statut de l'entrée ne se pilote QUE depuis la clôture/déclôture : cocher ou décocher
        // « sans arrêt » décrit la blessure, ça ne referme ni ne rouvre le dossier.
        await medicalApi.update(editing.id, payload);
        notify(teamId, 'medical_updated', `${typeLabel} modifié${playerName ? ` — ${playerName}` : ''}`, { entityType: 'player', entityId: fPlayerId });
      } else {
        await medicalApi.create({
          ...payload,
          ...(formType === 'checkup'
            ? { status: 'resolved' as const, resolvedDate: fDate }
            : { status: 'active' as const }),
        });
        let notifBody: string | undefined;
        if (formType === 'injury') {
          const parts: string[] = [severityConfig[fSeverity].label];
          parts.push(noStop ? 'sans arrêt' : fDays ? `${fDays}j blessé` : '');
          if (fDesc) parts.push(fDesc);
          notifBody = parts.filter(Boolean).join(' · ');
        } else {
          notifBody = fDesc || undefined;
        }
        notify(teamId, 'medical_added', `${typeLabel}${playerName ? ` — ${playerName}` : ''}`, { body: notifBody, entityType: 'player', entityId: fPlayerId });
      }

      if ((formType === 'injury' || formType === 'treatment') && player) {
        await playersApi.setStatus(player, fPlayerStatus, teamId);
      }
      onSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth={560} maxHeight="85vh">
      <style>{`
        @media (max-width: 539px) {
          .med-form-player-date { grid-template-columns: 1fr !important; }
          .med-form-days-rtp    { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header */}
      <div className="px-4 sm:px-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
          {editing ? 'Modifier l\'entrée médicale' : 'Nouvelle entrée médicale'}
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
      </div>

      {/* Type selector */}
      <div className="px-4 sm:px-6" style={{ paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {([
            { t: 'injury'    as const, icon: '🔴', label: 'Blessure',    color: '#EF4444' },
            { t: 'checkup'   as const, icon: '🩺', label: 'Bilan santé', color: '#3B82F6' },
            { t: 'treatment' as const, icon: '💊', label: 'Traitement',  color: '#00E5A0' },
          ]).map(({ t, icon, label, color }) => (
            <button key={t} type="button" onClick={() => setFormType(t)} style={{
              padding: '12px 8px', borderRadius: 8,
              border: `1px solid ${formType === t ? color : '#2A2F3A'}`,
              cursor: 'pointer',
              backgroundColor: formType === t ? color + '14' : 'transparent',
              color: formType === t ? color : '#94A3B8',
              fontSize: '0.8rem', fontWeight: formType === t ? 700 : 400,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            }}>
              <span style={{ fontSize: '1.3rem' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <form className="px-4 sm:px-6" style={{ paddingTop: 18, paddingBottom: 18, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleSave}>

        {/* Joueur + Date */}
        {showPlayerSelect ? (
          <div className="med-form-player-date" style={{ display: 'grid', gridTemplateColumns: '1fr 148px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Joueur</label>
              <PlayerSelect players={players} value={fPlayerId} onChange={setFPlayerId} style={{ minWidth: 0 }} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={fDate} onChange={e => changeDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={fDate} onChange={e => changeDate(e.target.value)} style={inputStyle} />
          </div>
        )}

        {/* Description */}
        <div>
          <label style={labelStyle}>
            {formType === 'injury' ? 'Diagnostic *' : formType === 'checkup' ? 'Objet du bilan *' : 'Traitement *'}
          </label>
          <input
            type="text" value={fDesc} onChange={e => setFDesc(e.target.value)} required
            placeholder={
              formType === 'injury'    ? 'Ex : Entorse cheville droite grade II' :
              formType === 'checkup'   ? 'Ex : Bilan de mi-saison' :
                                        'Ex : Séance kiné — travail proprioception'
            }
            style={inputStyle}
          />
        </div>

        {/* Injury fields */}
        {formType === 'injury' && (
          <>
            {/* Gravité */}
            <div>
              <label style={labelStyle}>Gravité</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { val: 'mild'     as const, label: 'Léger',  color: '#F59E0B' },
                  { val: 'moderate' as const, label: 'Modéré', color: '#fb923c' },
                  { val: 'severe'   as const, label: 'Grave',  color: '#EF4444' },
                ]).map(({ val, label, color }) => (
                  <button type="button" key={val} onClick={() => setFSeverity(val)} style={{
                    flex: 1, padding: '9px 0',
                    borderRadius: 6, border: `1px solid ${fSeverity === val ? color : '#2A2F3A'}`,
                    backgroundColor: fSeverity === val ? color + '20' : 'transparent',
                    color: fSeverity === val ? color : '#475569',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: fSeverity === val ? 700 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Sans arrêt */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
              backgroundColor: fNoStop ? 'rgba(0,229,160,0.06)' : '#1E2229',
              border: `1px solid ${fNoStop ? 'rgba(0,229,160,0.35)' : '#2A2F3A'}`,
              borderRadius: 6, cursor: 'pointer',
            }}>
              <input
                type="checkbox" checked={fNoStop} onChange={e => toggleNoStop(e.target.checked)}
                style={{ accentColor: '#00E5A0', width: 15, height: 15, marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
              />
              <span>
                <span style={{ display: 'block', color: fNoStop ? '#00E5A0' : '#F1F5F9', fontSize: '0.84rem', fontWeight: 600 }}>
                  Sans arrêt
                </span>
                <span style={{ display: 'block', color: '#64748B', fontSize: '0.74rem', marginTop: 2 }}>
                  0 jour d'arrêt — le joueur reste disponible, l'entrée reste en cours jusqu'à sa clôture
                </span>
              </span>
            </label>

            {/* Jours absence + Date de retour */}
            <div className="med-form-days-rtp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ ...labelStyle, ...(fNoStop ? { opacity: 0.5 } : null) }}>Jours blessés (estimés)</label>
                <input
                  type="number" min="0" value={fDays} disabled={fNoStop}
                  onChange={e => {
                    setFDays(e.target.value);
                    if (e.target.value && fDate) {
                      const base = new Date(fDate + 'T00:00:00');
                      base.setDate(base.getDate() + Number(e.target.value));
                      setFRtpDate(base.toISOString().split('T')[0]);
                    }
                  }}
                  placeholder="0" style={{ ...inputStyle, ...(fNoStop ? offStyle : null) }}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, ...(fNoStop ? { opacity: 0.5 } : null) }}>
                  Date de retour <span style={{ color: '#475569', fontWeight: 400 }}>— optionnel</span>
                </label>
                <input
                  type="date" value={fRtpDate} disabled={fNoStop}
                  onChange={e => {
                    setFRtpDate(e.target.value);
                    if (e.target.value && fDate) {
                      setFDays(String(daysBetween(fDate, e.target.value)));
                    }
                  }}
                  style={{ ...inputStyle, ...(fNoStop ? offStyle : null) }}
                />
              </div>
            </div>
          </>
        )}

        {formType === 'treatment' && (
          <div>
            <label style={labelStyle}>Date de fin <span style={{ color: '#475569', fontWeight: 400 }}>— optionnel</span></label>
            <input type="date" value={fRtpDate} onChange={e => setFRtpDate(e.target.value)} style={inputStyle} />
          </div>
        )}

        {/* Statut du joueur — blessure et traitement */}
        {(formType === 'injury' || formType === 'treatment') && (
          <div>
            <label style={labelStyle}>
              Statut du joueur
              {noStop && <span style={{ color: '#475569', fontWeight: 400 }}> — limité par défaut, la blessure n'entraîne pas d'arrêt</span>}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {([
                { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
                { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
                { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
                { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
              ] as const).map(({ val, label, color }) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFPlayerStatus(val)}
                  style={{
                    padding: '8px 0',
                    borderRadius: 6,
                    border: `1px solid ${fPlayerStatus === val ? color : '#2A2F3A'}`,
                    backgroundColor: fPlayerStatus === val ? color + '18' : 'transparent',
                    color: fPlayerStatus === val ? color : '#94A3B8',
                    fontSize: '0.78rem',
                    fontWeight: fPlayerStatus === val ? 700 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes / Traitement */}
        <div>
          <label style={labelStyle}>
            {formType === 'injury' ? 'Traitement & protocole' : 'Notes'}
          </label>
          <RichTextEditor
            value={fTreatment}
            onChange={setFTreatment}
            placeholder={
              formType === 'injury'  ? 'Ex : Glace 3×20min/j, repos strict 48h, rééducation kiné…' :
              formType === 'checkup' ? 'Observations, recommandations…' :
                                      'Détails du traitement, fréquence, observations…'
            }
            minHeight={76}
          />
        </div>

        {/* Erreur */}
        {saveError && (
          <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
            {saveError}
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
            Annuler
          </button>
          <button type="submit" disabled={saving || !fDesc} style={{
            flex: 2, padding: '10px', borderRadius: 6, border: 'none',
            backgroundColor: saving || !fDesc ? '#1E2229' : '#00E5A0',
            color: saving || !fDesc ? '#475569' : '#0D0F14',
            cursor: saving || !fDesc ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: '0.88rem',
          }}>
            {saving ? 'Enregistrement…' : editing ? 'Modifier' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
