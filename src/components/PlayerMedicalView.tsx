import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router';
import { Ambulance, Pill, Stethoscope } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { Card } from './Card';
import { InjuryRecordCard } from './InjuryRecordCard';
import { MedicalRecordDetailModal } from './MedicalRecordDetailModal';
import { MedicalRecordFormModal } from './MedicalRecordFormModal';
import { MedicalRecordStatusModal } from './MedicalRecordStatusModal';
import type { MedicalStatusAction } from './MedicalRecordStatusModal';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { MedicalRecord, Player } from '../data/types';


export interface PlayerMedicalViewHandle {
  openForm: () => void;
  openRecord: (record: MedicalRecord) => void;
}

export const PlayerMedicalView = forwardRef<PlayerMedicalViewHandle, { playerId: string; onUpdated?: () => void }>(({ playerId, onUpdated }, ref) => {
  const navigate = useNavigate();
  const { selected, canEditTeamData } = useTeamSeason();
  const teamId = selected?.team.id;
  const [records, setRecords]   = useState<MedicalRecord[]>([]);
  const [player, setPlayer]     = useState<Player | null>(null);
  const [version, setVersion]   = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | MedicalRecord['type']>('all');

  const [statusAction, setStatusAction] = useState<{ action: MedicalStatusAction; record: MedicalRecord } | null>(null);
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
              onClose={canEditTeamData && record.status === 'active'
                ? () => setStatusAction({ action: 'close', record })
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
          canEdit={canEditTeamData}
          onCloseRecord={detailRecord.status === 'active'
            ? () => { const r = detailRecord; setDetailRecord(null); setStatusAction({ action: 'close', record: r }); }
            : undefined}
          onReopen={detailRecord.status === 'resolved'
            ? () => { const r = detailRecord; setDetailRecord(null); setStatusAction({ action: 'reopen', record: r }); }
            : undefined}
        />
      )}

      {/* ── CLOSE / REOPEN MODAL ── */}
      {statusAction && (
        <MedicalRecordStatusModal
          action={statusAction.action}
          record={statusAction.record}
          player={player ?? undefined}
          teamId={teamId}
          onCancel={() => setStatusAction(null)}
          onDone={refresh}
        />
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
