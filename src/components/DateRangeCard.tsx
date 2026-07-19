import { useState, useEffect, type ReactNode } from 'react';
import { Filter, SlidersHorizontal, X } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Modal } from './Modal';
import { FilterField, filterControlStyle } from './FilterField';

// ── Helpers ───────────────────────────────────────────────────────────────────
// Date locale (pas UTC, cf. toISOString) — sinon "aujourd'hui" saute au jour suivant/précédent
// selon l'heure locale par rapport à UTC, décalant tout calcul de plage qui en dépend
// (ex. filtre "45j" mal recalculé juste après minuit UTC).
export const isoToday  = () => new Date().toLocaleDateString('sv');
const isoOffset = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
};
const isoOffsetFrom = (dateStr: string, days: number) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('sv');
};

export type DatePreset = 7 | 21 | 45 | 90 | 'phase1' | 'phase2' | 'saison';
export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 7,        label: '7j'      },
  { value: 21,       label: '21j'     },
  { value: 45,       label: '45j'     },
  { value: 90,       label: '90j'     },
  { value: 'phase1', label: 'Phase 1' },
  { value: 'phase2', label: 'Phase 2' },
  { value: 'saison', label: 'Saison'  },
];

// Toutes les bornes "haute" sont relatives à refEnd (fin de saison si celle-ci est déjà passée,
// sinon aujourd'hui) — sans ça, sélectionner une saison passée puis "7j"/"Saison" calculait un
// intervalle ancré sur la vraie date du jour, hors de toute donnée de la saison consultée.
function computeRange(p: DatePreset, seasonStart?: string, seasonEnd?: string): [string, string] {
  const start  = seasonStart ?? isoOffset(365);
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  const today  = isoToday();
  const refEnd = seasonEnd && seasonEnd < today ? seasonEnd : today;
  if (p === 'saison') return [start, refEnd];
  if (p === 'phase1') return [start, `${startYear}-12-31`];               // Phase 1 : août à décembre
  if (p === 'phase2') return [`${startYear + 1}-01-01`, `${startYear + 1}-06-30`]; // Phase 2 : janvier à juin
  return [isoOffsetFrom(refEnd, p), refEnd];
}

// Phase de saison en cours, utilisée comme preset par défaut si aucun n'est précisé
function currentPhase(seasonStart?: string): 'phase1' | 'phase2' {
  const start = seasonStart ?? isoOffset(365);
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  return isoToday() <= `${startYear}-12-31` ? 'phase1' : 'phase2';
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDateRange(seasonStart?: string, defaultPreset?: DatePreset, seasonEnd?: string) {
  const [from,   setFrom]   = useState('');
  const [to,     setTo]     = useState(isoToday());
  const [preset, setPreset] = useState<DatePreset | null>(defaultPreset ?? 'phase1');

  useEffect(() => {
    if (!seasonStart) return;
    const dp = defaultPreset ?? currentPhase(seasonStart);
    const [f, t] = computeRange(dp, seasonStart, seasonEnd);
    setFrom(f);
    setTo(t);
    setPreset(dp);
  }, [seasonStart, seasonEnd]);

  const applyPreset = (p: DatePreset, seasonStartDate?: string, seasonEndDate?: string) => {
    setPreset(p);
    const [f, t] = computeRange(p, seasonStartDate ?? seasonStart, seasonEndDate ?? seasonEnd);
    setFrom(f);
    setTo(t);
  };

  const handleFrom = (v: string) => { setFrom(v); setPreset(null); };
  const handleTo   = (v: string) => { setTo(v);   setPreset(null); };

  return { from, to, preset, applyPreset, setFrom: handleFrom, setTo: handleTo };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface DateRangeCardProps {
  from:         string;
  to:           string;
  preset:       DatePreset | null;
  onPreset:     (p: DatePreset) => void;
  onFrom:       (v: string) => void;
  onTo:         (v: string) => void;
  style?:       React.CSSProperties;
  /** Champ(s) de filtre additionnel(s) — même style FilterField, affiché à côté de Période/Du/Au */
  extra?:       ReactNode;
}

const CUSTOM = 'custom';

const flatControlStyle: React.CSSProperties = { ...filterControlStyle, width: 'auto', flexShrink: 0 };

/** Trio préréglage + Du + Au, à plat (sans fieldset/légende) — même poids visuel que les autres
 * champs des onglets Comparer (par période : un par groupe ; par joueur : partagé par les 2 groupes),
 * pour que tous les containers de groupe aient la même hauteur. */
export function PeriodFields({ from, to, preset, onPreset, onFrom, onTo }: {
  from: string; to: string; preset: DatePreset | null;
  onPreset: (p: DatePreset) => void; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  const selectValue = preset === null ? CUSTOM : String(preset);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap', overflowX: 'auto' }}>
      <select value={selectValue} onChange={e => {
        if (e.target.value === CUSTOM) return;
        const found = DATE_PRESETS.find(p => String(p.value) === e.target.value);
        if (found) onPreset(found.value);
      }} style={flatControlStyle}>
        {DATE_PRESETS.map(p => <option key={String(p.value)} value={String(p.value)}>{p.label}</option>)}
        {preset === null && <option value={CUSTOM}>Personnalisé</option>}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>·</span>
        <input type="date" value={from} onChange={e => onFrom(e.target.value)} style={flatControlStyle} />
        <span style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>→</span>
        <input type="date" value={to} onChange={e => onTo(e.target.value)} style={flatControlStyle} />
      </div>
    </div>
  );
}

/** Contenu commun (select preset + inputs de dates) — utilisé dans la barre desktop et dans la modale mobile. */
function DateFilterControls({ from, to, preset, onPreset, onFrom, onTo, extra, layout }: DateRangeCardProps & { layout: 'row' | 'stacked' }) {
  const selectValue = preset === null ? CUSTOM : String(preset);
  const handlePresetSelect = (v: string) => {
    if (v === CUSTOM) return;
    const found = DATE_PRESETS.find(p => String(p.value) === v);
    if (found) onPreset(found.value);
  };

  const presetField = (
    <FilterField legend="Période">
      <select value={selectValue} onChange={e => handlePresetSelect(e.target.value)} style={filterControlStyle}>
        {DATE_PRESETS.map(p => <option key={String(p.value)} value={String(p.value)}>{p.label}</option>)}
        {preset === null && <option value={CUSTOM}>Personnalisé</option>}
      </select>
    </FilterField>
  );

  if (layout === 'stacked') {
    return (
      <div className="flex flex-col gap-3 w-full stacked-filters">
        {/* Un champ par ligne, chacun en pleine largeur — y compris `extra` et le préréglage,
            qui gardent sinon leur largeur fixe (130px) prévue pour un alignement en ligne. */}
        <style>{`.stacked-filters > fieldset { width: 100% !important; }`}</style>
        {extra}
        {presetField}
        <FilterField legend="Du"><input type="date" value={from} onChange={e => onFrom(e.target.value)} style={filterControlStyle} /></FilterField>
        <FilterField legend="Au"><input type="date" value={to}   onChange={e => onTo(e.target.value)}   style={filterControlStyle} /></FilterField>
      </div>
    );
  }
  return (
    <div className="flex items-center" style={{ gap: 10 }}>
      {extra}
      {presetField}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FilterField legend="Du"><input type="date" value={from} onChange={e => onFrom(e.target.value)} style={filterControlStyle} /></FilterField>
        <span style={{ color: '#475569', fontSize: '0.75rem' }}>→</span>
        <FilterField legend="Au"><input type="date" value={to}   onChange={e => onTo(e.target.value)}   style={filterControlStyle} /></FilterField>
      </div>
    </div>
  );
}

export function DateRangeCard({ from, to, preset, onPreset, onFrom, onTo, style, extra }: DateRangeCardProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Card style={{ marginBottom: 14, ...style }}>

      {/* ── Mobile : toute la card est cliquable → ouvre la modale (pas de résumé texte, juste
          l'icône qui indique qu'on peut ouvrir quelque chose) ── */}
      <div className="flex md:hidden" onClick={() => setMobileOpen(true)}
        style={{ alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={12} style={{ color: '#3B82F6' }} />
          <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtres</span>
        </div>
        <SlidersHorizontal size={15} style={{ color: '#64748B' }} />
      </div>

      {mobileOpen && (
        <Modal onClose={() => setMobileOpen(false)} closeOnBackdropClick maxWidth={340}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Filter size={14} style={{ color: '#3B82F6' }} />
                <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>Filtres</span>
              </div>
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <DateFilterControls from={from} to={to} preset={preset} onPreset={onPreset} onFrom={onFrom} onTo={onTo} extra={extra} layout="stacked" />
            <button onClick={() => setMobileOpen(false)} style={{
              width: '100%', padding: '10px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6,
              color: '#0D0F14', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
            }}>
              Valider
            </button>
          </div>
        </Modal>
      )}

      {/* ── Desktop : titre à gauche, champs à droite ── */}
      <div className="hidden md:block">
        <CardTitle icon={<Filter size={12} style={{ color: '#3B82F6' }} />} mb={0}
          right={<DateFilterControls from={from} to={to} preset={preset} onPreset={onPreset} onFrom={onFrom} onTo={onTo} extra={extra} layout="row" />}
        >Filtres</CardTitle>
      </div>

    </Card>
  );
}
