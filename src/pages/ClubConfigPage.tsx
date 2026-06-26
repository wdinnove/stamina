import { useState, useEffect } from 'react';
import { Save, Building2 } from 'lucide-react';
import { configApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Organization } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

export default function ClubConfigPage() {
  const { orgId } = useTeamSeason();

  const [org,     setOrg]     = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  const [form, setForm] = useState({
    name: '', address: '', city: '', phone: '', email: '', website: '',
  });

  useEffect(() => {
    setLoading(true);
    configApi.getMyOrg()
      .then(o => {
        if (o) {
          setOrg(o);
          setForm({
            name:    o.name    ?? '',
            address: o.address ?? '',
            city:    o.city    ?? '',
            phone:   o.phone   ?? '',
            email:   o.email   ?? '',
            website: o.website ?? '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!org) return;
    setSaving(true);
    setMsg(null);
    try {
      await configApi.updateOrg(org.id, {
        name:    form.name,
        address: form.address || undefined,
        city:    form.city    || undefined,
        phone:   form.phone   || undefined,
        email:   form.email   || undefined,
        website: form.website || undefined,
      });
      setMsg({ ok: true, text: 'Club mis à jour.' });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-6" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', marginBottom: 8 }}>Configuration club</h1>
        {orgId && (
          <span style={{ color: '#475569', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{orgId}</span>
        )}
      </div>

      <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #2A2F3A' }}>
          <span style={{ color: '#00E5A0' }}><Building2 size={16} /></span>
          <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Informations du club</h3>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
            <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
              <div style={{ marginBottom: 14, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nom du club</label>
                <input style={inputStyle} value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Mon Club" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Adresse</label>
                <input style={inputStyle} value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="12 rue de la Paix" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Ville</label>
                <input style={inputStyle} value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Lyon" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Téléphone</label>
                <input style={inputStyle} value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+33 4 00 00 00 00" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" style={inputStyle} value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="contact@club.fr" />
              </div>
              <div style={{ marginBottom: 14, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Site web</label>
                <input style={inputStyle} value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                  placeholder="https://monclub.fr" />
              </div>
            </div>

            {msg && (
              <p style={{ color: msg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '4px 0 0' }}>{msg.text}</p>
            )}

            <button onClick={save} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#00E5A0', color: '#0A0C10', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, marginTop: 16 }}>
              <Save size={14} />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
