import { useState, useEffect } from 'react';
import { Card } from './Card';

// ── Helpers ───────────────────────────────────────────────────────────────────
export const isoToday  = () => new Date().toISOString().split('T')[0];
export const isoOffset = (days: number) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

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

function computeRange(p: DatePreset, seasonStart?: string): [string, string] {
  const start = seasonStart ?? isoOffset(365);
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  if (p === 'saison') return [start, isoToday()];
  if (p === 'phase1') return [start, `${startYear}-12-31`];               // Phase 1 : août à décembre
  if (p === 'phase2') return [`${startYear + 1}-01-01`, `${startYear + 1}-06-30`]; // Phase 2 : janvier à juin
  return [isoOffset(p), isoToday()];
}

// Phase de saison en cours, utilisée comme preset par défaut si aucun n'est précisé
function currentPhase(seasonStart?: string): 'phase1' | 'phase2' {
  const start = seasonStart ?? isoOffset(365);
  const startYear = new Date(start + 'T12:00:00').getFullYear();
  return isoToday() <= `${startYear}-12-31` ? 'phase1' : 'phase2';
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDateRange(seasonStart?: string, defaultPreset?: DatePreset) {
  const [from,   setFrom]   = useState('');
  const [to,     setTo]     = useState(isoToday());
  const [preset, setPreset] = useState<DatePreset | null>(defaultPreset ?? 'phase1');

  useEffect(() => {
    if (!seasonStart) return;
    const dp = defaultPreset ?? currentPhase(seasonStart);
    const [f, t] = computeRange(dp, seasonStart);
    setFrom(f);
    setTo(t);
    setPreset(dp);
  }, [seasonStart]);

  const applyPreset = (p: DatePreset, seasonStartDate?: string) => {
    setPreset(p);
    const [f, t] = computeRange(p, seasonStartDate ?? seasonStart);
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
}

const btnStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 5, border: '1px solid', cursor: 'pointer',
  borderColor: active ? '#00E5A0' : '#2A2F3A',
  backgroundColor: active ? '#00E5A018' : 'transparent',
  color: active ? '#00E5A0' : '#64748B',
  fontSize: '0.78rem', fontWeight: active ? 600 : 400,
});

const inputStyle: React.CSSProperties = {
  padding: '5px 8px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 5, color: '#F1F5F9', fontSize: '0.78rem', outline: 'none',
  colorScheme: 'dark', minWidth: 0,
};

export function DateRangeCard({ from, to, preset, onPreset, onFrom, onTo, style }: DateRangeCardProps) {
  return (
    <Card style={{ padding: '10px 14px', marginBottom: 14, ...style }}>

      {/* ── Mobile : 3 lignes pleine largeur (4 presets / 3 presets / 2 dates) ── */}
      <div className="flex flex-col gap-2 md:hidden w-full">
        <div className="flex gap-1.5 w-full">
          {DATE_PRESETS.slice(0, 4).map(p => (
            <button key={String(p.value)} onClick={() => onPreset(p.value)}
              className="flex-1" style={{ ...btnStyle(preset === p.value), padding: '5px 0' }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 w-full">
          {DATE_PRESETS.slice(4).map(p => (
            <button key={String(p.value)} onClick={() => onPreset(p.value)}
              className="flex-1" style={{ ...btnStyle(preset === p.value), padding: '5px 0' }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full">
          <input type="date" value={from} onChange={e => onFrom(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ color: '#475569', fontSize: '0.75rem', flexShrink: 0 }}>→</span>
          <input type="date" value={to}   onChange={e => onTo(e.target.value)}   style={{ ...inputStyle, flex: 1 }} />
        </div>
      </div>

      {/* ── Desktop : boutons groupés à gauche, dates à droite ── */}
      <div className="hidden md:flex md:items-center md:justify-between">
        <div className="flex items-center gap-1.5">
          {DATE_PRESETS.map(p => (
            <button key={String(p.value)} onClick={() => onPreset(p.value)} style={btnStyle(preset === p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={from} onChange={e => onFrom(e.target.value)} style={inputStyle} />
          <span style={{ color: '#475569', fontSize: '0.75rem' }}>→</span>
          <input type="date" value={to}   onChange={e => onTo(e.target.value)}   style={inputStyle} />
        </div>
      </div>

    </Card>
  );
}
