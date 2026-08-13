import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router';
import { X, Ambulance, Pill, Stethoscope } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { notify } from '../api/notifications';
import { Modal } from './Modal';
import { Card } from './Card';
import { InjuryRecordCard } from './InjuryRecordCard';
import { MedicalRecordDetailModal } from './MedicalRecordDetailModal';
import { MedicalRecordFormModal } from './MedicalRecordFormModal';
import { playerNameFull } from '../utils/playerName';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { MedicalRecord, Player } from '../data/types';
import { LAYER } from '../styles/layers';

const TODAY = new Date().toISOString().split('T')[0];
const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };

export interface PlayerMedicalViewHandle {
  openForm: () => void;
  openRecord: (record: MedicalRecord) => void;
}

export const PlayerMedicalView = forwardRef<PlayerMedicalViewHandle, { playerId: string; onUpdated?: () => void }>(({ playerId, onUpdated }, ref) => {
  const navigate = useNavigate();
  const { selected } = useTeamSeason();
  const teamId = selected?.team.id;
  const [records, setRecords]   = useState<MedicalRecord[]>([]);
  const [player, setPlayer]     = useState<Player | null>(null);
  const [version, setVersion]   = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | MedicalRecord['type']>('all');

  const [closeModal, setCloseModal] = useState<{ recordId: string; date: string; playerStatus: 'active' | 'limited' | 'injured' | 'unavailable' } | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);
  const [detailRecord, setDetailRecord] = useState<MedicalRecord | null>(null);

  const [showForm, setShowForm]         = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);

  useEffect(() => {
    if (!playerId) return;
    Promise.all([
      medicalApi.getByPlayer(playerId),
      playersApi.getById(playerId),
    ]).then(([recs, p]) => {
      setRecords(recs);
      setPlayer(p);
    });
  }, [playerId, version]);

  const openForm = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  useImperativeHandle(ref, () => ({ openForm, openRecord: setDetailRecord }));

  const openEdit = (record: MedicalRecord) => {
    setEditingRecord(record);
    setShowForm(true);
  };

  const refresh = () => {
    setVersion(v => v + 1);
    onUpdated?.();
  };

  const confirmClose = async () => {
    if (!closeModal) return;
    setCloseSaving(true);
    try {
      await medicalApi.update(closeModal.recordId, { status: 'resolved', resolvedDate: closeModal.date });
      if (player) await playersApi.setStatus(player, closeModal.playerStatus, teamId);
      notify(teamId, 'medical_resolved', `Blessure clôturée${player ? ` — ${playerNameFull(player)}` : ''}`, { entityType: 'player', entityId: playerId });
      setCloseModal(null);
      setVersion(v => v + 1);
      onUpdated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la clôture');
    } finally {
      setCloseSaving(false);
    }
  };

  const recInjuries   = records.filter(r => r.type === 'injury');
  const recTreatments = records.filter(r => r.type === 'treatment');
  const allCheckups   = records.filter(r => r.type === 'checkup');

  const typeTabs = [
    { key: 'all' as const,       label: 'Tout',         color: '#94A3B8', icon: null,        count: records.length },
    { key: 'injury' as const,    label: 'Blessures',    color: '#EF4444', icon: Ambulance,   count: recInjuries.length },
    { key: 'treatment' as const, label: 'Traitements',  color: '#00E5A0', icon: Pill,        count: recTreatments.length },
    { key: 'checkup' as const,   label: 'Bilans santé', color: '#3B82F6', icon: Stethoscope, count: allCheckups.length },
  ];
  const visibleRecords = (typeFilter === 'all' ? records : records.filter(r => r.type === typeFilter))
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return b.date.localeCompare(a.date);
    });

  return (
    <>
      {/* Filtre par type — timeline unique, plutôt que 3 colonnes qui laissent du vide quand une catégorie est peu remplie */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {typeTabs.map(t => {
          const active = typeFilter === t.key;
          return (
            <button key={t.key} onClick={() => setTypeFilter(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${active ? t.color : '#2A2F3A'}`,
                backgroundColor: active ? `${t.color}18` : '#161920',
                color: active ? t.color : '#94A3B8',
                fontSize: '0.8rem', fontWeight: active ? 700 : 500,
              }}>
              {t.icon && <t.icon size={13} />}
              {t.label}
              <span style={{ fontSize: '0.7rem', opacity: 0.75 }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {visibleRecords.length === 0 ? (
        <Card style={{ padding: '24px' }}>
          <p style={{ color: '#00E5A0', fontSize: '0.9rem', margin: 0, textAlign: 'center' }}>✓ Aucune entrée médicale enregistrée</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleRecords.map(record => (
            <InjuryRecordCard
              key={record.id}
              record={record}
              player={player ?? undefined}
              showAvatarColumn={false}
              onEdit={() => openEdit(record)}
              onClose={record.status === 'active' && record.type !== 'checkup'
                ? () => setCloseModal({ recordId: record.id, date: TODAY, playerStatus: 'active' })
                : undefined}
              onClick={() => setDetailRecord(record)}
              navigate={navigate}
            />
          ))}
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {detailRecord && (
        <MedicalRecordDetailModal
          record={detailRecord}
          player={player ?? undefined}
          onClose={() => setDetailRecord(null)}
          onEdit={() => { const r = detailRecord; setDetailRecord(null); openEdit(r); }}
          onCloseRecord={detailRecord.status === 'active' && detailRecord.type !== 'checkup'
            ? () => { const r = detailRecord; setDetailRecord(null); setCloseModal({ recordId: r.id, date: TODAY, playerStatus: 'active' }); }
            : undefined}
        />
      )}

      {/* ── CLOSE MODAL ── */}
      {closeModal && (
        <Modal onClose={() => setCloseModal(null)} maxWidth={360} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Clôturer l'entrée</h2>
              <button onClick={() => setCloseModal(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Date de fin</label>
              <input
                type="date"
                value={closeModal.date}
                onChange={e => setCloseModal({ ...closeModal, date: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Statut après retour</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
                  { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
                  { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
                  { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
                ] as const).map(({ val, label, color }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCloseModal({ ...closeModal, playerStatus: val })}
                    style={{
                      padding: '8px',
                      borderRadius: 6,
                      border: `1px solid ${closeModal.playerStatus === val ? color : '#2A2F3A'}`,
                      backgroundColor: closeModal.playerStatus === val ? color + '18' : 'transparent',
                      color: closeModal.playerStatus === val ? color : '#94A3B8',
                      cursor: 'pointer', fontSize: '0.8rem',
                      fontWeight: closeModal.playerStatus === val ? 700 : 400,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setCloseModal(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                Annuler
              </button>
              <button
                onClick={confirmClose}
                disabled={closeSaving || !closeModal.date}
                style={{ flex: 2, padding: '10px', borderRadius: 6, border: 'none', backgroundColor: closeSaving || !closeModal.date ? '#1E2229' : '#00E5A0', color: closeSaving || !closeModal.date ? '#475569' : '#0D0F14', cursor: closeSaving || !closeModal.date ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
              >
                {closeSaving ? 'Clôture…' : 'Confirmer'}
              </button>
            </div>
        </Modal>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <MedicalRecordFormModal
          players={player ? [player] : []}
          lockedPlayerId={playerId}
          record={editingRecord}
          onClose={() => setShowForm(false)}
          onSaved={refresh}
        />
      )}
    </>
  );
});
