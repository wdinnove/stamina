import { useState, useEffect } from 'react';
import { Save, Sliders, Shield, TrendingUp } from 'lucide-react';
import { teamsApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { StatThresholds } from '../contexts/TeamSeasonContext';
import { buildWeekTiers, DEFAULT_THRESHOLDS } from '../utils/weeklyLoad';
import { Card, CardTitle } from '../components';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

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
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#00E5A0', color: '#0A0C10', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.82rem', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
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
        <span style={{ color: '#F9731680', fontSize: '0.65rem' }}>≤{Math.round(normalMax / 2)} UA</span>
        <span style={{ color: '#EF444480', fontSize: '0.65rem' }}>≤{normalMax} UA</span>
        <span style={{ color: '#EF444480', fontSize: '0.65rem' }}>{'>'} {normalMax} UA</span>
      </div>
    </div>
  );
}

const DEFAULT_STAT: StatThresholds = {
  evalTOrange: 0, evalTBlue: 5, evalTGreen: 10,
  ortgTAmber: 60, ortgTGreen: 90,
  drtgTAmber: 100, drtgTRed: 115,
};

function StatColorPreview({ t }: { t: StatThresholds }) {
  const evalZones = [
    { label: `< ${t.evalTOrange}`, color: '#EF4444', bg: '#EF444418' },
    { label: `${t.evalTOrange}–${t.evalTBlue}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `${t.evalTBlue}–${t.evalTGreen}`, color: '#3B82F6', bg: '#3B82F618' },
    { label: `≥ ${t.evalTGreen}`, color: '#00E5A0', bg: '#00E5A018' },
  ];
  const ortgZones = [
    { label: `< ${t.ortgTAmber}`, color: '#EF4444', bg: '#EF444418' },
    { label: `${t.ortgTAmber}–${t.ortgTGreen}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `> ${t.ortgTGreen}`, color: '#00E5A0', bg: '#00E5A018' },
  ];
  const drtgZones = [
    { label: `< ${t.drtgTAmber}`, color: '#00E5A0', bg: '#00E5A018' },
    { label: `${t.drtgTAmber}–${t.drtgTRed}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `≥ ${t.drtgTRed}`, color: '#EF4444', bg: '#EF444418' },
  ];
  const ZoneBar = ({ zones }: { zones: { label: string; color: string; bg: string }[] }) => (
    <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 6 }}>
      {zones.map(z => (
        <div key={z.label} style={{ flex: 1, backgroundColor: z.bg, border: `1px solid ${z.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: z.color, fontSize: '0.6rem', fontWeight: 700 }}>{z.label}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>Éval</div>
      <ZoneBar zones={evalZones} />
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>ORtg</div>
          <ZoneBar zones={ortgZones} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>DRtg</div>
          <ZoneBar zones={drtgZones} />
        </div>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const { selected, reload, thresholds, statThresholds } = useTeamSeason();

  const [teamForm, setTeamForm] = useState({ name: '', category: '', color: '#3B82F6', description: '' });
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [lightMax,  setLightMax]  = useState(DEFAULT_THRESHOLDS.lightMax);
  const [normalMax, setNormalMax] = useState(DEFAULT_THRESHOLDS.normalMax);
  const [thrSaving, setThrSaving] = useState(false);
  const [thrMsg,    setThrMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const [stat, setStat] = useState<StatThresholds>(DEFAULT_STAT);
  const [statSaving, setStatSaving] = useState(false);
  const [statMsg, setStatMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const t = selected.team;
    setTeamForm({ name: t.name, category: t.category, color: t.color, description: '' });
    setTeamMsg(null);
    teamsApi.getById(t.id).then(full => {
      if (full) setTeamForm(f => ({ ...f, description: (full as unknown as { description?: string }).description ?? '' }));
    });
  }, [selected?.team.id]);

  useEffect(() => {
    setLightMax(thresholds.lightMax);
    setNormalMax(thresholds.normalMax);
  }, [thresholds.lightMax, thresholds.normalMax]);

  useEffect(() => {
    setStat({ ...statThresholds });
  }, [selected?.team.id]);

  async function saveTeam() {
    if (!selected) return;
    setTeamSaving(true); setTeamMsg(null);
    try {
      await teamsApi.update(selected.team.id, teamForm);
      setTeamMsg({ ok: true, text: 'Équipe mise à jour.' });
      reload();
    } catch (e) {
      setTeamMsg({ ok: false, text: String(e) });
    } finally { setTeamSaving(false); }
  }

  async function saveStatThresholds() {
    if (!selected) return;
    if (stat.evalTOrange >= stat.evalTBlue || stat.evalTBlue >= stat.evalTGreen) {
      setStatMsg({ ok: false, text: 'Les seuils éval doivent être croissants : rouge < orange < bleu < vert.' }); return;
    }
    if (stat.ortgTAmber >= stat.ortgTGreen) {
      setStatMsg({ ok: false, text: 'Le seuil ORtg amber doit être inférieur au seuil vert.' }); return;
    }
    if (stat.drtgTAmber >= stat.drtgTRed) {
      setStatMsg({ ok: false, text: 'Le seuil DRtg amber doit être inférieur au seuil rouge.' }); return;
    }
    setStatSaving(true); setStatMsg(null);
    try {
      await teamsApi.updateStatThresholds(selected.team.id, stat);
      setStatMsg({ ok: true, text: 'Seuils enregistrés.' });
      reload();
    } catch (e) {
      setStatMsg({ ok: false, text: String(e) });
    } finally { setStatSaving(false); }
  }

  async function saveThresholds() {
    if (!selected) return;
    if (!Number.isInteger(lightMax) || !Number.isInteger(normalMax)) {
      setThrMsg({ ok: false, text: 'Les seuils doivent être des nombres entiers.' }); return;
    }
    if (lightMax >= normalMax) {
      setThrMsg({ ok: false, text: 'Le seuil "légère" doit être strictement inférieur au seuil "normale".' }); return;
    }
    setThrSaving(true); setThrMsg(null);
    try {
      await teamsApi.updateThresholds(selected.team.id, lightMax, normalMax);
      setThrMsg({ ok: true, text: 'Seuils enregistrés.' });
      reload();
    } catch (e) {
      setThrMsg({ ok: false, text: String(e) });
    } finally { setThrSaving(false); }
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
      <Card style={{ padding: '20px 24px', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Shield size={14} color="#00E5A0" />}>Informations de l'équipe</CardTitle>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SaveBtn loading={teamSaving} onClick={saveTeam} />
        </div>
      </Card>

      {/* Seuils de charge */}
      <Card style={{ padding: '20px 24px', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Sliders size={14} color="#F59E0B" />}>Seuils de charge physique</CardTitle>
        </div>
        <p style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: 16, marginTop: 0 }}>
          Les seuils définissent les zones de charge hebdomadaire (RPE × minutes). Ils s'appliquent à toutes les vues de charge de cette équipe.
        </p>
        <ThresholdPreview lightMax={lightMax} normalMax={normalMax} />

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, marginTop: 20 }}>
          <div>
            <label style={{ ...labelStyle, color: '#00E5A0' }}>Légère — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={lightMax}
              onChange={e => setLightMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone verte</p>
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#3B82F6' }}>Normale — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={normalMax}
              onChange={e => setNormalMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone bleue</p>
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#EF4444' }}>Surcharge</label>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#EF4444' }}>
              {'>'} {normalMax} UA
            </div>
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>Au-dessus : zone rouge</p>
          </div>
        </div>

        {thrMsg && (
          <p style={{ color: thrMsg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{thrMsg.text}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SaveBtn loading={thrSaving} onClick={saveThresholds} />
        </div>
      </Card>

      {/* Seuils statistiques */}
      <Card style={{ padding: '20px 24px', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<TrendingUp size={14} color="#3B82F6" />}>Seuils statistiques</CardTitle>
        </div>
        <p style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: 16, marginTop: 0 }}>
          Ces seuils définissent les couleurs des colonnes Éval, ORtg et DRtg dans l'analyse collective.
        </p>
        <StatColorPreview t={stat} />

        {/* Éval */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Éval</div>
          <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#F59E0B' }}>Min orange</label>
              <input type="number" step={0.5} value={stat.evalTOrange}
                onChange={e => setStat(s => ({ ...s, evalTOrange: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : rouge</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#3B82F6' }}>Min bleu</label>
              <input type="number" step={0.5} value={stat.evalTBlue}
                onChange={e => setStat(s => ({ ...s, evalTBlue: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : orange</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Min vert</label>
              <input type="number" step={0.5} value={stat.evalTGreen}
                onChange={e => setStat(s => ({ ...s, evalTGreen: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : bleu</p>
            </div>
          </div>
        </div>

        {/* ORtg */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>ORtg</div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#F59E0B' }}>Min amber</label>
              <input type="number" step={1} value={stat.ortgTAmber}
                onChange={e => setStat(s => ({ ...s, ortgTAmber: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : rouge</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Min vert</label>
              <input type="number" step={1} value={stat.ortgTGreen}
                onChange={e => setStat(s => ({ ...s, ortgTGreen: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : amber</p>
            </div>
          </div>
        </div>

        {/* DRtg */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>DRtg</div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Max vert</label>
              <input type="number" step={1} value={stat.drtgTAmber}
                onChange={e => setStat(s => ({ ...s, drtgTAmber: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : vert</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#EF4444' }}>Min rouge</label>
              <input type="number" step={1} value={stat.drtgTRed}
                onChange={e => setStat(s => ({ ...s, drtgTRed: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : amber</p>
            </div>
          </div>
        </div>

        {statMsg && (
          <p style={{ color: statMsg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '8px 0 0' }}>{statMsg.text}</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SaveBtn loading={statSaving} onClick={saveStatThresholds} />
        </div>
      </Card>
    </div>
  );
}
