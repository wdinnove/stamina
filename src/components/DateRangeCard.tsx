import { useState, useEffect } from 'react';
import { Card } from './Card';

// ── Helpers ───────────────────────────────────────────────────────────────────
export const isoToday  = () => new Date().toISOString().split('T')[0];
export const isoOffset = (days: number) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

export type DatePreset = 21 | 42 | 91 | 'saison';
export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 21,      label: '3 sem.'  },
  { value: 42,      label: '6 sem.'  },
  { value: 91,      label: '3 mois'  },
  { value: 'saison',label: 'Saison'  },
];

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDateRange(seasonStart?: string) {
  const [from,   setFrom]   = useState('');
  const [to,     setTo]     = useState(isoToday());
  const [preset, setPreset] = useState<DatePreset | null>('saison');

  useEffect(() => {
    if (!seasonStart) return;
    setFrom(seasonStart);
    setTo(isoToday());
    setPreset('saison');
  }, [seasonStart]);

  const applyPreset = (p: DatePreset, seasonStartDate?: string) => {
    setPreset(p);
    const today = isoToday();
    setTo(today);
    if (p === 'saison') {
      setFrom(seasonStartDate ?? seasonStart ?? isoOffset(365));
    } else {
      setFrom(isoOffset(p));
    }
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

      {/* ── Mobile : 2 lignes pleine largeur ── */}
      <div className="flex flex-col gap-2 md:hidden w-full">
        <div className="flex gap-1.5 w-full">
          {DATE_PRESETS.map(p => (
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
