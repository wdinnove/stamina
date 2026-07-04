import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { medicalApi } from '../api/medical';
import { playersApi } from '../api/players';
import { notifyOrg } from '../api/notifications';
import RichTextEditor from './RichTextEditor';
import { EmptyState } from './EmptyState';
import { MedCard, typeLabels, typeColors, typeIcons, severityConfig, fmtDate, daysBetween, rtpDaysLeft } from './MedicalCard';
import type { MedicalRecord, Player } from '../data/types';

const TODAY = new Date().toISOString().split('T')[0];
const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' };

export function PlayerMedicalView({ playerId, onUpdated }: { playerId: string; onUpdated?: () => void }) {
  const [records, setRecords]   = useState<MedicalRecord[]>([]);
  const [player, setPlayer]     = useState<Player | null>(null);
  const [version, setVersion]   = useState(0);
  const [recordView, setRecordView] = useState<'date' | 'section'>('date');
  const [detailRecord, setDetailRecord] = useState<MedicalRecord | null>(null);

  const [closeModal, setCloseModal] = useState<{ recordId: string; date: string; playerStatus: 'active' | 'limited' | 'injured' | 'unavailable' } | null>(null);
  const [closeSaving, setCloseSaving] = useState(false);

  const [showForm, setShowForm]         = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [formType, setFormType]         = useState<MedicalRecord['type']>('injury');
  const [fDate, setFDate]               = useState(TODAY);
  const [fDesc, setFDesc]               = useState('');
  const [fSeverity, setFSeverity]       = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [fDays, setFDays]               = useState('');
  const [fTreatment, setFTreatment]     = useState('');
  const [fRtpDate, setFRtpDate]         = useState('');
  const [fPlayerStatus, setFPlayerStatus] = useState<'active' | 'limited' | 'injured' | 'unavailable'>('injured');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);

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
    setFDate(TODAY); setFDesc(''); setFSeverity('mild');
    setFDays(''); setFTreatment(''); setFRtpDate('');
    setFormType('injury');
    setFPlayerStatus('injured');
    setSaveError(null);
    setShowForm(true);
  };

  const openEdit = (record: MedicalRecord) => {
    setEditingRecord(record);
    setFormType(record.type);
    setFDate(record.date);
    setFDesc(record.description);
    setFSeverity(record.severity ?? 'mild');
    setFDays('');
    setFTreatment(record.treatment ?? '');
    setFRtpDate(record.rtpDate ?? '');
    setFPlayerStatus(player?.status ?? (record.type === 'injury' ? 'injured' : 'active'));
    setSaveError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fDesc) { setSaveError('La description est requise.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        playerId,
        date:        fDate,
        type:        formType,
        description: fDesc,
        location:    undefined,
        severity:    formType === 'injury' ? fSeverity : undefined,
        daysAbsent:  formType === 'injury' && fDays ? Number(fDays) : undefined,
        treatment:   editingRecord ? (fTreatment || null) : (fTreatment || undefined),
        rtpDate:     formType === 'injury' && fRtpDate ? fRtpDate : undefined,
      };
      if (editingRecord) {
        await medicalApi.update(editingRecord.id, payload);
        notifyOrg('medical_updated', `${typeLabels[formType] ?? formType} modifié${player ? ` — ${player.firstName} ${player.lastName}` : ''}`, undefined, 'player', playerId);
      } else {
        await medicalApi.create({ ...payload, status: 'active' });
        let notifBody: string | undefined;
        if (formType === 'injury') {
          const parts: string[] = [severityConfig[fSeverity].label];
          if (fDays) parts.push(`${fDays}j d'absence`);
          if (fDesc) parts.push(fDesc);
          notifBody = parts.join(' · ');
        } else {
          notifBody = fDesc || undefined;
        }
        notifyOrg('medical_added', `${typeLabels[formType] ?? formType}${player ? ` — ${player.firstName} ${player.lastName}` : ''}`, notifBody, 'player', playerId);
      }
      if (formType === 'injury' || formType === 'treatment') {
        await playersApi.update(playerId, { status: fPlayerStatus });
      }
      setShowForm(false);
      setVersion(v => v + 1);
      onUpdated?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const confirmClose = async () => {
    if (!closeModal) return;
    setCloseSaving(true);
    try {
      await medicalApi.update(closeModal.recordId, { status: 'resolved', resolvedDate: closeModal.date });
      await playersApi.update(playerId, { status: closeModal.playerStatus });
      notifyOrg('medical_resolved', `Blessure clôturée${player ? ` — ${player.firstName} ${player.lastName}` : ''}`, undefined, 'player', playerId);
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

  return (
    <>
      {/* Header : sous-onglets + bouton nouvelle entrée */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
          {([
            { id: 'date'    as const, label: 'Par date' },
            { id: 'section' as const, label: 'Par type'  },
          ]).map(v => (
            <button key={v.id} onClick={() => setRecordView(v.id)}
              style={{ padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.8rem', backgroundColor: recordView === v.id ? '#1E2229' : 'transparent', color: recordView === v.id ? '#F1F5F9' : '#94A3B8', whiteSpace: 'nowrap' }}>
              {v.label}
            </button>
          ))}
        </div>
        <button onClick={openForm} style={{ padding: '7px 13px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={13} /><span className="hidden sm:inline">Nouvelle entrée</span>
        </button>
      </div>

      {/* ── Vue par date ── */}
      {recordView === 'date' && (() => {
        const allSorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: allSorted.length > 0 ? 14 : 0 }}>
              <h4 style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 700 }}>
                Tous les dossiers
              </h4>
              {allSorted.length > 0 && (
                <span style={{ color: '#94A3B8', fontWeight: 700, fontSize: '0.78rem', backgroundColor: '#2A2F3A', padding: '2px 8px', borderRadius: 3 }}>
                  {allSorted.length}
                </span>
              )}
            </div>
            {allSorted.length === 0
              ? <EmptyState message="Aucune entrée médicale." size="sm" />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {allSorted.map(record => {
                    const isActive = record.status === 'active';
                    const days = record.rtpDate
                      ? (isActive ? rtpDaysLeft(record.rtpDate) : daysBetween(record.date, record.rtpDate))
                      : null;
                    const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                    const daysLabel = days !== null && days > 0
                      ? (isActive ? `${rtpLabel} J+${days}` : `${days}j`)
                      : null;
                    return (
                      <MedCard
                        key={record.id}
                        record={record}
                        daysLabel={daysLabel}
                        daysColor={isActive && days !== null && days <= 3 ? '#00E5A0' : isActive ? '#F59E0B' : '#475569'}
                        onEdit={() => openEdit(record)}
                        onDetail={() => setDetailRecord(record)}
                        onClose={isActive && record.type !== 'checkup'
                          ? () => setCloseModal({ recordId: record.id, date: TODAY, playerStatus: 'active' })
                          : undefined}
                        showTypeBadge
                      />
                    );
                  })}
                </div>
              )
            }
          </div>
        );
      })()}

      {/* ── 3 sections : Blessures / Traitements / Bilans ── */}
      {recordView === 'section' && ([
        { key: 'injury',    title: 'Blessures',    color: '#EF4444', records: recInjuries,   emptyMsg: 'Aucune blessure enregistrée.'  },
        { key: 'treatment', title: 'Traitements',  color: '#00E5A0', records: recTreatments, emptyMsg: 'Aucun traitement enregistré.' },
        { key: 'checkup',   title: 'Bilans santé', color: '#3B82F6', records: allCheckups,   emptyMsg: 'Aucun bilan enregistré.'     },
      ]).map((section, si) => (
        <div key={section.key} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 20px', marginBottom: si < 2 ? 12 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: section.records.length > 0 ? 14 : 0 }}>
            <h4 style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 700, flex: 1 }}>
              {section.title}
            </h4>
            {section.records.length > 0 && (
              <span style={{ color: section.color, fontWeight: 700, fontSize: '0.78rem', backgroundColor: section.color + '18', padding: '2px 8px', borderRadius: 3 }}>
                {section.records.length}
              </span>
            )}
          </div>
          {section.records.length === 0
            ? <EmptyState message={section.emptyMsg} size="sm" />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...section.records]
                  .sort((a, b) => {
                    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
                    return b.date.localeCompare(a.date);
                  })
                  .map(record => {
                    const isActive = record.status === 'active';
                    const days = record.rtpDate
                      ? (isActive ? rtpDaysLeft(record.rtpDate) : daysBetween(record.date, record.rtpDate))
                      : null;
                    const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                    const daysLabel = days !== null && days > 0
                      ? (isActive ? `${rtpLabel} J+${days}` : `${days}j`)
                      : null;
                    return (
                      <MedCard
                        key={record.id}
                        record={record}
                        daysLabel={daysLabel}
                        daysColor={isActive && days !== null && days <= 3 ? '#00E5A0' : isActive ? '#F59E0B' : '#475569'}
                        onEdit={() => openEdit(record)}
                        onDetail={() => setDetailRecord(record)}
                        onClose={isActive && record.type !== 'checkup'
                          ? () => setCloseModal({ recordId: record.id, date: TODAY, playerStatus: 'active' })
                          : undefined}
                      />
                    );
                  })
                }
              </div>
            )
          }
        </div>
      ))}

      {/* ── DETAIL MODAL ── */}
      {detailRecord && (() => {
        const sev = detailRecord.severity ? severityConfig[detailRecord.severity] : null;
        const col = typeColors[detailRecord.type] ?? '#94A3B8';
        const totalDays = detailRecord.rtpDate ? daysBetween(detailRecord.date, detailRecord.rtpDate) : null;
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 480, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', backgroundColor: col + '20', border: `1px solid ${col}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                    {typeIcons[detailRecord.type]}
                  </div>
                  <div>
                    <span style={{ color: col, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{typeLabels[detailRecord.type]}</span>
                    <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem', margin: '2px 0 0' }}>{detailRecord.description}</p>
                  </div>
                </div>
                <button onClick={() => setDetailRecord(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4, flexShrink: 0 }}><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10, marginBottom: 14 }}>
                {([
                  { label: 'Date',   value: `${fmtDate(detailRecord.date)} ${detailRecord.date.slice(0, 4)}` },
                  { label: 'Statut', value: detailRecord.status === 'active' ? 'En cours' : 'Clôturé', color: detailRecord.status === 'active' ? '#F59E0B' : '#00E5A0' },
                  ...(sev ? [{ label: 'Gravité', value: sev.label, color: sev.color }] : []),
                  ...(detailRecord.location ? [{ label: 'Localisation', value: detailRecord.location }] : []),
                  ...(detailRecord.daysAbsent != null ? [{ label: "Jours d'absence", value: `${detailRecord.daysAbsent} jour${detailRecord.daysAbsent > 1 ? 's' : ''}`, color: '#F59E0B' }] : []),
                  ...(detailRecord.rtpDate ? [{ label: detailRecord.type === 'injury' ? 'Date de retour' : 'Date de fin', value: `${fmtDate(detailRecord.rtpDate)} ${detailRecord.rtpDate.slice(0, 4)}${totalDays ? ` · ${totalDays}j` : ''}` }] : []),
                  ...(detailRecord.resolvedDate ? [{ label: 'Clôturé le', value: `${fmtDate(detailRecord.resolvedDate)} ${detailRecord.resolvedDate.slice(0, 4)}`, color: '#00E5A0' }] : []),
                ] as { label: string; value: string; color?: string }[]).map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '10px 12px', backgroundColor: '#1E2229', borderRadius: 6 }}>
                    <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px', fontWeight: 600 }}>{label}</p>
                    <p style={{ color: color ?? '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
              {detailRecord.treatment && (
                <div style={{ padding: '12px 14px', backgroundColor: '#1E2229', borderRadius: 6, marginBottom: 14 }}>
                  <p style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 5px', fontWeight: 600 }}>
                    {detailRecord.type === 'injury' ? 'Traitement & protocole' : 'Notes'}
                  </p>
                  <div className="rich-display" style={{ color: '#CBD5E1', fontSize: '0.84rem' }} dangerouslySetInnerHTML={{ __html: detailRecord.treatment }} />
                </div>
              )}
              <button onClick={() => setDetailRecord(null)}
                style={{ width: '100%', padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                Fermer
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── CLOSE MODAL ── */}
      {closeModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 360, padding: '24px' }}>
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
          </div>
        </div>
      )}

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <style>{`@media (max-width: 539px) { .med-form-days-rtp { grid-template-columns: 1fr !important; } }`}</style>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            <div className="px-4 sm:px-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 14, borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {editingRecord ? 'Modifier l\'entrée médicale' : 'Nouvelle entrée médicale'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
            </div>

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

              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} style={inputStyle} />
              </div>

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

              {formType === 'injury' && (
                <>
                  <div>
                    <label style={labelStyle}>Gravité</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([
                        { val: 'mild'     as const, label: 'Léger',  color: '#F59E0B' },
                        { val: 'moderate' as const, label: 'Modéré', color: '#fb923c' },
                        { val: 'severe'   as const, label: 'Grave',  color: '#EF4444' },
                      ]).map(({ val, label, color }) => (
                        <button type="button" key={val} onClick={() => setFSeverity(val)} style={{
                          flex: 1, padding: '9px 0', borderRadius: 6,
                          border: `1px solid ${fSeverity === val ? color : '#2A2F3A'}`,
                          backgroundColor: fSeverity === val ? color + '20' : 'transparent',
                          color: fSeverity === val ? color : '#475569',
                          cursor: 'pointer', fontSize: '0.8rem', fontWeight: fSeverity === val ? 700 : 400,
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="med-form-days-rtp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Jours d'absence estimés</label>
                      <input
                        type="number" min="0" value={fDays}
                        onChange={e => {
                          setFDays(e.target.value);
                          if (e.target.value && fDate) {
                            const base = new Date(fDate + 'T00:00:00');
                            base.setDate(base.getDate() + Number(e.target.value));
                            setFRtpDate(base.toISOString().split('T')[0]);
                          }
                        }}
                        placeholder="0" style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Date de retour <span style={{ color: '#475569', fontWeight: 400 }}>— optionnel</span></label>
                      <input type="date" value={fRtpDate} onChange={e => setFRtpDate(e.target.value)} style={inputStyle} />
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

              {(formType === 'injury' || formType === 'treatment') && (
                <div>
                  <label style={labelStyle}>Statut du joueur</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {([
                      { val: 'active'      as const, label: 'Actif',        color: '#00E5A0' },
                      { val: 'limited'     as const, label: 'Limité',       color: '#F59E0B' },
                      { val: 'injured'     as const, label: 'Blessé',       color: '#EF4444' },
                      { val: 'unavailable' as const, label: 'Indisponible', color: '#6B7280' },
                    ] as const).map(({ val, label, color }) => (
                      <button key={val} type="button" onClick={() => setFPlayerStatus(val)} style={{
                        padding: '8px 0', borderRadius: 6,
                        border: `1px solid ${fPlayerStatus === val ? color : '#2A2F3A'}`,
                        backgroundColor: fPlayerStatus === val ? color + '18' : 'transparent',
                        color: fPlayerStatus === val ? color : '#94A3B8',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: fPlayerStatus === val ? 700 : 400,
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              )}

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

              {saveError && (
                <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', color: '#EF4444', fontSize: '0.82rem' }}>
                  {saveError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving || !fDesc} style={{
                  flex: 2, padding: '10px', borderRadius: 6, border: 'none',
                  backgroundColor: saving || !fDesc ? '#1E2229' : '#00E5A0',
                  color: saving || !fDesc ? '#475569' : '#0D0F14',
                  cursor: saving || !fDesc ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: '0.88rem',
                }}>
                  {saving ? 'Enregistrement…' : editingRecord ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
