import { useState, useEffect } from 'react';
import { Save, Sliders, Shield } from 'lucide-react';
import { teamsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { buildWeekTiers, DEFAULT_THRESHOLDS } from '../utils/weeklyLoad';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.75rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid #2A2F3A' }}>
        <span style={{ color: '#00E5A0' }}>{icon}</span>
        <h3 style={{ color: '#F1F5F9', margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SaveBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#00E5A0', color: '#0A0C10', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 16 }}>
      <Save size={14} />
      {loading ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  );
}

function ThresholdPreview({ lightMax, normalMax }: { lightMax: number; normalMax: number }) {
  const tiers = buildWeekTiers(lightMax, normalMax);
  const total = normalMax * 1.5;
  return (
    <div style={{ margin: '14px 0 4px' }}>
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {tiers.map((t, i) => {
          const prev  = i === 0 ? 0 : tiers[i - 1].max;
          const width = t.max === Infinity ? normalMax * 0.5 : t.max - prev;
          const pct   = (width / total) * 100;
          return (
            <div key={t.label} style={{ flex: `${pct} 0 0`, backgroundColor: t.bg, border: `1px solid ${t.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: t.color, fontSize: '0.62rem', fontWeight: 700 }}>{t.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#475569', fontSize: '0.65rem' }}>0 UA</span>
        <span style={{ color: '#00E5A080', fontSize: '0.65rem' }}>≤{lightMax} UA</span>
        <span style={{ color: '#3B82F680', fontSize: '0.65rem' }}>≤{normalMax} UA</span>
        <span style={{ color: '#EF444480', fontSize: '0.65rem' }}>{'>'} {normalMax} UA</span>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { selected, reload, thresholds } = useTeamSeason();

  // ── Team info state ──────────────────────────────────────────────────────
  const [teamForm, setTeamForm] = useState({ name: '', category: '', color: '#3B82F6', description: '' });
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Thresholds state ─────────────────────────────────────────────────────
  const [lightMax,  setLightMax]  = useState(DEFAULT_THRESHOLDS.lightMax);
  const [normalMax, setNormalMax] = useState(DEFAULT_THRESHOLDS.normalMax);
  const [thrSaving, setThrSaving] = useState(false);
  const [thrMsg,    setThrMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  // Sync form when selected team changes
  useEffect(() => {
    if (!selected) return;
    const t = selected.team;
    setTeamForm({ name: t.name, category: t.category, color: t.color, description: '' });
    setTeamMsg(null);
    // Load full team to get description
    teamsApi.getById(t.id).then(full => {
      if (full) setTeamForm(f => ({ ...f, description: (full as unknown as { description?: string }).description ?? '' }));
    });
  }, [selected?.team.id]);

  // Sync thresholds from context
  useEffect(() => {
    setLightMax(thresholds.lightMax);
    setNormalMax(thresholds.normalMax);
  }, [thresholds.lightMax, thresholds.normalMax]);

  async function saveTeam() {
    if (!selected) return;
    setTeamSaving(true);
    setTeamMsg(null);
    try {
      await teamsApi.update(selected.team.id, teamForm);
      setTeamMsg({ ok: true, text: 'Équipe mise à jour.' });
      reload();
    } catch (e) {
      setTeamMsg({ ok: false, text: String(e) });
    } finally {
      setTeamSaving(false);
    }
  }

  async function saveThresholds() {
    if (!selected) return;
    if (!Number.isInteger(lightMax) || !Number.isInteger(normalMax)) {
      setThrMsg({ ok: false, text: 'Les seuils doivent être des nombres entiers.' });
      return;
    }
    if (lightMax >= normalMax) {
      setThrMsg({ ok: false, text: 'Le seuil "légère" doit être strictement inférieur au seuil "normale".' });
      return;
    }
    setThrSaving(true);
    setThrMsg(null);
    try {
      await teamsApi.updateThresholds(selected.team.id, lightMax, normalMax);
      setThrMsg({ ok: true, text: 'Seuils enregistrés.' });
      reload();
    } catch (e) {
      setThrMsg({ ok: false, text: String(e) });
    } finally {
      setThrSaving(false);
    }
  }

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe dans la barre du haut.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Équipe</h1>
      </div>

      {/* Infos équipe */}
      <Section title="Informations de l'équipe" icon={<Shield size={16} />}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
          <Field label="Nom de l'équipe">
            <input style={inputStyle} value={teamForm.name}
              onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
              placeholder="NF2 Féminine" />
          </Field>
          <Field label="Catégorie / Division">
            <input style={inputStyle} value={teamForm.category}
              onChange={e => setTeamForm(f => ({ ...f, category: e.target.value }))}
              placeholder="NF2" />
          </Field>
          <Field label="Couleur de l'équipe">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={teamForm.color}
                onChange={e => setTeamForm(f => ({ ...f, color: e.target.value }))}
                style={{ width: 40, height: 36, border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, backgroundColor: '#1E2229', cursor: 'pointer' }} />
              <input style={{ ...inputStyle, flex: 1 }} value={teamForm.color}
                onChange={e => setTeamForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#3B82F6" />
            </div>
          </Field>
          <Field label="Description">
            <input style={inputStyle} value={teamForm.description}
              onChange={e => setTeamForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description optionnelle" />
          </Field>
        </div>
        {teamMsg && (
          <p style={{ color: teamMsg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{teamMsg.text}</p>
        )}
        <SaveBtn loading={teamSaving} onClick={saveTeam} />
      </Section>

      {/* Seuils de charge */}
      <Section title="Seuils de charge physique" icon={<Sliders size={16} />}>
        <p style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: 16, marginTop: 0 }}>
          Les seuils définissent les zones de charge hebdomadaire (RPE × minutes). Ils s'appliquent à toutes les vues de charge de cette équipe.
        </p>
        <ThresholdPreview lightMax={lightMax} normalMax={normalMax} />

        <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
          <div>
            <label style={{ ...labelStyle, color: '#00E5A0' }}>Légère — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={lightMax}
              onChange={e => setLightMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, width: 140, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone verte</p>
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#3B82F6' }}>Normale — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={normalMax}
              onChange={e => setNormalMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, width: 140, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone bleue</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 22 }}>
            <span style={{ color: '#EF444480', fontSize: '0.75rem', fontWeight: 700 }}>Surcharge</span>
            <span style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, monospace', fontSize: '1rem', fontWeight: 800 }}>{'>'} {normalMax} UA</span>
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>Au-dessus : zone rouge</p>
          </div>
        </div>

        {thrMsg && (
          <p style={{ color: thrMsg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{thrMsg.text}</p>
        )}
        <SaveBtn loading={thrSaving} onClick={saveThresholds} />
      </Section>
    </div>
  );
}
