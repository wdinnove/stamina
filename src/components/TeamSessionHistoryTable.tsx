import { useState } from 'react';
import type { TeamSessionRow, SessionType } from '../data/types';
import { rpeColor } from '../utils/rpe';

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

const DAY_ABBR = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
function fmtDateWithDay(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const [, mm, dd] = iso.split('-');
  return `${DAY_ABBR[d.getDay()]} ${Number(dd)}/${Number(mm)}`;
}
function getWeekMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toLocaleDateString('sv');
}

interface TeamSessionHistoryTableProps {
  rows:              TeamSessionRow[];
  sessionLoadNormal: number;
  title?:            string;
}

export function TeamSessionHistoryTable({
  rows, sessionLoadNormal, title = 'Historique séances',
}: TeamSessionHistoryTableProps) {
  const [view, setView] = useState<'session' | 'week'>('session');

  const uaT1 = Math.round(sessionLoadNormal / 3);
  const uaT2 = Math.round(sessionLoadNormal * 2 / 3);
  const uaCfg = (ua: number) => ua >= sessionLoadNormal
    ? { color: '#EF4444', label: 'Surcharge' }
    : ua >= uaT2 ? { color: '#F97316', label: 'Élevée'   }
    : ua >= uaT1 ? { color: '#EAB308', label: 'Soutenu'  }
    : { color: '#00E5A0', label: 'Normal' };

  const weekMap = new Map<string, {
    rpes: number[]; totalLoad: number; totalDur: number;
    totalPlayers: number; dates: string[]; count: number;
  }>();
  rows.forEach(s => {
    const k = getWeekMonday(s.date);
    if (!weekMap.has(k)) weekMap.set(k, { rpes: [], totalLoad: 0, totalDur: 0, totalPlayers: 0, dates: [], count: 0 });
    const w = weekMap.get(k)!;
    if (s.avg > 0) w.rpes.push(s.avg);
    w.totalLoad    += s.totalLoad;
    w.totalDur     += s.duration;
    w.totalPlayers += s.nbPlayers;
    w.count++;
    w.dates.push(s.date);
  });
  const weekRows = [...weekMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, { rpes, totalLoad, totalDur, totalPlayers, dates, count }]) => {
      const sorted     = [...dates].sort();
      const avgPlayers = Math.round(totalPlayers / count);
      return {
        dateFrom: sorted[0], dateTo: sorted[sorted.length - 1],
        avgRpe:   rpes.length ? Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10 : 0,
        avgUa:    avgPlayers > 0 ? Math.round(totalLoad / (totalPlayers / count)) : 0,
        totalDur, avgPlayers,
      };
    });

  const colgroup = (
    <colgroup>
      <col style={{ width: '20%' }} />
      <col /><col /><col /><col /><col /><col />
    </colgroup>
  );
  const thRow = (
    <tr style={{ backgroundColor: '#1A1E26' }}>
      {['Date', 'Type', 'Joueurs', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
        <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', whiteSpace: 'nowrap' }}>{h}</th>
      ))}
    </tr>
  );

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1E26' }}>
        <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>{title}</p>
        <div style={{ display: 'flex', gap: 2, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 4, padding: 2 }}>
          {(['session', 'week'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '2px 8px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: '0.68rem',
                backgroundColor: view === v ? '#2A2F3A' : 'transparent',
                color: view === v ? '#F1F5F9' : '#475569', transition: 'all 0.12s' }}>
              {v === 'session' ? 'Séance' : 'Semaine'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        {view === 'session' ? (
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            {colgroup}
            <thead>{thRow}</thead>
            <tbody>
              {rows.map(s => {
                const rpeC    = rpeColor(s.avg);
                const typeCfg = SESSION_TYPES[s.type as SessionType] ?? SESSION_TYPES.training;
                const avgUaS  = s.nbPlayers > 0 ? Math.round(s.totalLoad / s.nbPlayers) : 0;
                const cfg     = uaCfg(avgUaS);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                    <td style={{ padding: '8px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDateWithDay(s.date)}</td>
                    <td style={{ padding: '8px 14px' }}><span style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{typeCfg.label}</span></td>
                    <td style={{ padding: '8px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.nbPlayers}</td>
                    <td style={{ padding: '8px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{s.duration} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                    <td style={{ padding: '8px 14px' }}><span style={{ color: rpeC, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>{s.avg}</span></td>
                    <td style={{ padding: '8px 14px', color: cfg.color, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{avgUaS.toLocaleString('fr')}</td>
                    <td style={{ padding: '8px 14px' }}><span style={{ backgroundColor: cfg.color + '20', color: cfg.color, fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            {colgroup}
            <thead>{thRow}</thead>
            <tbody>
              {weekRows.map(w => {
                const rpeC  = rpeColor(w.avgRpe);
                const cfg   = uaCfg(w.avgUa);
                const dateLabel = w.dateFrom === w.dateTo
                  ? fmtDateWithDay(w.dateFrom)
                  : `${fmtDateWithDay(w.dateFrom)} → ${fmtDateWithDay(w.dateTo)}`;
                return (
                  <tr key={w.dateFrom} style={{ borderBottom: '1px solid #2A2F3A22' }}
                    onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                    onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                    <td style={{ padding: '8px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{dateLabel}</td>
                    <td style={{ padding: '8px 14px' }}><span style={{ backgroundColor: '#3B82F622', color: '#3B82F6', fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4 }}>Semaine</span></td>
                    <td style={{ padding: '8px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.avgPlayers}</td>
                    <td style={{ padding: '8px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.totalDur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                    <td style={{ padding: '8px 14px' }}><span style={{ color: rpeC, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }}>{w.avgRpe}</span></td>
                    <td style={{ padding: '8px 14px', color: cfg.color, fontWeight: 700, fontSize: '0.82rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.avgUa.toLocaleString('fr')}</td>
                    <td style={{ padding: '8px 14px' }}><span style={{ backgroundColor: cfg.color + '20', color: cfg.color, fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{cfg.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
