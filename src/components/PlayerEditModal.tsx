import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { playersApi } from '../api/players';
import { Modal } from './Modal';
import { PlayerAvatar } from './PlayerAvatar';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

const POSITIONS: Player['position'][] = ['Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot'];
const STATUSES: { value: Player['status']; label: string }[] = [
  { value: 'active',      label: 'Actif' },
  { value: 'injured',     label: 'Blessé' },
  { value: 'limited',     label: 'Limité' },
  { value: 'suspended',   label: 'Suspendu' },
  { value: 'unavailable', label: 'Indisponible' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

interface PlayerEditModalProps {
  player: Player;
  onClose: () => void;
  onSaved: (player: Player) => void;
}

export function PlayerEditModal({ player, onClose, onSaved }: PlayerEditModalProps) {
  const [form, setForm] = useState({
    firstName:   player.firstName,
    lastName:    player.lastName,
    number:      String(player.number),
    position:    player.position,
    status:      player.status,
    birthDate:   player.birthDate,
    nationality: player.nationality,
    hand:        player.hand,
    height:      player.height ? String(player.height) : '',
    weight:      player.weight ? String(player.weight) : '',
    contractEnd: player.contractEnd ?? '',
    email:       player.email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const [photoUrl, setPhotoUrl] = useState(player.photoUrl);
  const [photoUploading, setPhotoUploading] = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const url = await playersApi.uploadPhoto(player.id, file);
      setPhotoUrl(url);
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : 'Erreur upload photo');
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      await playersApi.update(player.id, {
        firstName:   form.firstName,
        lastName:    form.lastName,
        number:      parseInt(form.number),
        position:    form.position,
        status:      form.status,
        nationality: form.nationality || 'FR',
        birthDate:   form.birthDate,
        hand:        form.hand,
        height:      form.height ? parseInt(form.height) : undefined,
        weight:      form.weight ? parseInt(form.weight) : undefined,
        contractEnd: form.contractEnd || undefined,
        email:       form.email       || undefined,
      });
      onSaved({
        ...player,
        ...form,
        photoUrl,
        number:      parseInt(form.number),
        nationality: form.nationality || 'FR',
        height:      form.height ? parseInt(form.height) : undefined,
        weight:      form.weight ? parseInt(form.weight) : undefined,
        contractEnd: form.contractEnd || undefined,
        email:       form.email       || undefined,
      });
    } catch (err: unknown) {
      setErr(err instanceof Error ? err.message : 'Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={520} style={{ padding: 28 }} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0 }}>Modifier {playerNameFull(player)}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
      </div>
      {err && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
          <AlertCircle size={13} style={{ color: '#EF4444' }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{err}</span>
        </div>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
        <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} />
        <div style={{ position: 'relative' }}>
          <PlayerAvatar player={{ ...player, photoUrl }} size={72} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
            {photoUploading
              ? <div style={{ width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 600 }}>Changer</span>
            }
          </div>
        </div>
        <span style={{ color: '#475569', fontSize: '0.72rem' }}>
          {photoUploading ? 'Envoi…' : 'Photo de profil'}
        </span>
      </label>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom *</label>
            <input required value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom *</label>
            <input required value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date de naissance *</label>
            <input required type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>N° maillot *</label>
            <input required type="number" min={0} max={99} value={form.number}
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poste *</label>
            <select required value={form.position}
              onChange={e => setForm(f => ({ ...f, position: e.target.value as Player['position'] }))}
              style={{ ...inputStyle }}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Statut</label>
            <select value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Player['status'] }))}
              style={{ ...inputStyle }}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Main forte</label>
            <select value={form.hand}
              onChange={e => setForm(f => ({ ...f, hand: e.target.value as Player['hand'] }))}
              style={{ ...inputStyle }}>
              <option value="right">Droite</option>
              <option value="left">Gauche</option>
              <option value="both">Les deux</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nationalité</label>
            <input maxLength={2} placeholder="FR" value={form.nationality}
              onChange={e => setForm(f => ({ ...f, nationality: e.target.value.toUpperCase() }))} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Taille (cm)</label>
            <input type="number" min={140} max={230} value={form.height}
              onChange={e => setForm(f => ({ ...f, height: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Poids (kg)</label>
            <input type="number" min={40} max={150} value={form.weight}
              onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Fin de contrat</label>
            <input type="date" value={form.contractEnd}
              onChange={e => setForm(f => ({ ...f, contractEnd: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email du joueur</label>
          <input type="email" placeholder="joueur@example.com" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: 10, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" disabled={saving}
            style={{ flex: 1, padding: 10, backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
